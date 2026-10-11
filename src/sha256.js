// SHA-256 (FIPS 180-4) over the UTF-8 encoding of a string. Synchronous,
// pure and dependency-free: event ids and state hashes (docs/SPEC.md §5).
// The code is written compactly on purpose: identifiers are never shortened
// by the minifier and the core has a 7 KB budget (E1-003).

// Round constants K (cube roots of the first 64 primes) and initial hash value
// H0 (square roots of the first 8 primes): 2^32 times the fractional part,
// truncated to a 32-bit word when stored in the Int32Array (FIPS 180-4
// §4.2.2, §5.3.3). Every scaled root lies more than 1e-4 away from an integer
// (test/unit/sha256.test.js), so a last-bit difference between engines'
// Math.sqrt/Math.cbrt cannot change a constant.
const K = new Int32Array(64), H0 = new Int32Array(8), W = new Int32Array(64);
for (let p = 2, n = 0, d; n < 64; p++) {
  for (d = 2; p % d; d++);
  if (d == p) {
    if (n < 8) H0[n] = Math.sqrt(p) % 1 * 2 ** 32;
    K[n++] = Math.cbrt(p) % 1 * 2 ** 32;
  }
}
/** @type {TextEncoder | undefined} created on first use */
let enc;

/**
 * SHA-256 of the UTF-8 bytes of `s` (lone surrogates encode as U+FFFD, as
 * TextEncoder does; canonical JSON never contains them).
 * Locals: m message bytes, l its length, n padded length (message, 0x80, zero
 * padding, 64-bit big-endian bit length: a multiple of 64), u padded bytes,
 * v their view, h hash state, a-z working variables.
 * @param {string} s
 * @returns {string} 64 lowercase hex digits
 */
export function sha256(s) {
  const m = (enc ??= new TextEncoder()).encode(s), l = m.length, n = (l + 72) & -64, u = new Uint8Array(n), v = new DataView(u.buffer), h = H0.slice();
  u.set(m);
  u[l] = 128;
  v.setUint32(n - 8, l / 2 ** 29);
  v.setUint32(n - 4, l << 3);
  for (let i = 0; i < n; i += 64) {
    // Plain locals: destructuring the Int32Array costs about two thirds of the speed.
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], z = h[7];
    for (let t = 0, x, y, t1; t < 64; t++) {
      // Message schedule word t, then round t.
      W[t] = t < 16 ? v.getInt32(i + 4 * t) : (x = W[t - 15], y = W[t - 2],
        ((x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ x >>> 3) + ((y >>> 17 | y << 15) ^ (y >>> 19 | y << 13) ^ y >>> 10) + W[t - 7] + W[t - 16]);
      t1 = z + ((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)) + (e & f ^ ~e & g) + K[t] + W[t] | 0;
      z = g;
      g = f;
      f = e;
      e = d + t1 | 0;
      d = c;
      c = b;
      b = a;
      a = t1 + ((a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10)) + (a & c ^ a & d ^ c & d) | 0;
    }
    [a, b, c, d, e, f, g, z].map((x, k) => h[k] += x);
  }
  return Array.from(h, x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
