// Token boundaries that would merge without a space.
let a = 5, b = 3, n = 2;
const out = [];
out.push(a - -b, a + +b, a - --b, a + ++b, a+ +b);
out.push(1 .toFixed(1), 1..toFixed(1), .5 + 1e-3 - 1, 0x1F, 10n.toString(), 1_000);
out.push(a < !b, n-- > 0, n);
out.push(true ? .5 : 1);
out.push(typeof 'x', void 0 === undefined, 'k' in { k: 1 });
const o = { a: { b: null } };
out.push(o?.a?.b ?? 'nullish', o.a?.['b']);
out.push(((x, ...r) => x + r.length)(1, 2, 3));
out.push(a ** 2, a >>> 1, a >> 1, a << 1, a & 1 | 2 ^ 3, ~a, !!a);
class K { #p = 7; static s = 1; get p() { return #p in this ? this.#p : 0; } }
out.push(new K().p, K.s);
async function* gen() { yield 1; yield* [2]; }
out.push(typeof gen);
JSON.stringify(out);
