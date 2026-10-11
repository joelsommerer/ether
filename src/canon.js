// Canonical JSON (docs/SPEC.md §4): the one byte sequence that is hashed and
// stored for a value. Keys sorted by UTF-16 code units, no whitespace, safe
// integers only, "<" and U+2028/U+2029 escaped, lone surrogates rejected.
// Also home of the small helpers shared by model.js and ledger.js.

export const int = Number.isSafeInteger;

/** @param {unknown} v @returns {v is Record<string, any>} */
export const isObj = v => !!v && typeof v == 'object' && !Array.isArray(v);

/**
 * Throws an error code (a plain string; docs/SPEC.md §11).
 * @param {string} code
 * @returns {never}
 */
export const fail = code => {
  throw code;
};

/**
 * Canonical JSON text of `v`. Throws the code "canon" for values outside the
 * canonical subset (non-integer or unsafe numbers, undefined, functions,
 * symbols, bigint, strings with lone surrogates).
 * @param {unknown} v
 * @returns {string}
 */
export function canon(v) {
  if (v === null || typeof v == 'boolean' || int(v)) return String(v);
  // In a /u regex a valid pair is one code point, so \p{Cs} only matches lone surrogates.
  if (typeof v == 'string' && !/\p{Cs}/u.test(v)) return JSON.stringify(v).replace(/[<\u2028\u2029]/g, c => '\\u' + (c == '<' ? '003c' : c.charCodeAt(0).toString(16)));
  if (Array.isArray(v)) return `[${Array.from(v, canon)}]`;
  return isObj(v) ? `{${Object.keys(v).sort().map(k => `${canon(k)}:${canon(v[k])}`)}}` : fail('canon');
}
