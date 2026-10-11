// Regular expressions vs division. The completion value is compared.
let a = 10; const b = 2, g = 5;
const out = [];
out.push(a / b / g);            // division chain
out.push(a /b/ g);              // looks like a regex, is division
out.push(/=/.test('='));        // regex starting with "="
out.push(a /= 2, a);            // division assignment
function f(x) {
  return /[/\]]+/.test(x);      // "/" and "]" inside a class
}
out.push(f('/]'), f('x'));
if (true) /x/g.test('x') && out.push('regex after if-paren');
const arr = [8];
out.push(arr[0] / 2 / 2);       // division after "]"
out.push((9) / 3);              // division after ")"
let i = 6;
i++ / 2;
out.push(i++ / 2);              // division after "++"
out.push(typeof /re/);          // regex after keyword
out.push(/a/ instanceof RegExp);// regex followed by a keyword
out.push('ab'.replace(/b/g, 'c') + 'd'.split(/(?:)/u).length);
out.push(/\/\*not a comment\*\//.source);
const o = { k: 4 };
out.push({ k: 8 }.k / 2 / 2);
out.push(`${o.k / 2}`);
x: for (const v of [1]) { out.push(v / 1); break x; }
JSON.stringify(out);
