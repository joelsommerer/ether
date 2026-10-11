// Template literals with nested ${} and braces inside substitutions.
const c = 'C', e = 'E';
const deep = `a${`b${c + `d${e}`}`}f`;
const braces = `x${ { k: '}' }.k }y${ (() => { return '{'; })() }z`;
const multi = `line 1
  line 2 with    spaces ${ [1, 2].map((n) => `<${n}>`).join('') }
end`;
const tag = (/** @type {TemplateStringsArray} */ s, /** @type {any[]} */ ...v) => s.raw.join('|') + v.join(',');
const tagged = tag`p${1}q${`r${2}`}s`;
const empty = `${''}${``}`;
const dollar = `$ {not} \${escaped} $${c}`;
JSON.stringify([deep, braces, multi, tagged, empty, dollar]);
