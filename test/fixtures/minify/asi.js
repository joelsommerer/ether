// ASI-sensitive line breaks must survive minification.
const out = [];
function ret() {
  return
  42;
}
out.push(String(ret()));
function retObj() {
  return {
    v: 1,
  };
}
out.push(retObj().v);
let a = 1;
let b = a
++b;
out.push(a, b);
const c = 1
-1;
out.push(c);
const d = [1, 2]
[1];
out.push(String(d));
let n = 0;
outer: for (let i = 0; i < 3; i++) {
  for (let j = 0; j < 3; j++) {
    n++;
    continue
    outer;
  }
}
out.push(n);
const fn = function () { return 'f'; }
const e = (fn)();
out.push(e);
let t = 3
t
--
t;
out.push(t);
var y = 2
var z = y
/2/1;
out.push(z);
JSON.stringify(out);
