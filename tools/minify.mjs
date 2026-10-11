// Conservative JavaScript and CSS minifier (Node built-ins only).
//
// The JavaScript minifier tokenizes the source (strings, template literals with
// nested ${}, regular expressions vs division, comments, numbers, punctuators)
// and re-emits the tokens with the least whitespace that keeps the token stream
// and the automatic-semicolon-insertion behaviour identical. It never renames,
// reorders or rewrites code. The only content change is inside string, template
// and regular-expression tokens: "</script" becomes "<\/script" and "<!--"
// becomes "<\!--", so the output can be inlined into an HTML <script> element.
//
// Known limits (documented in docs/adr/0001-toolchain.md):
// - "/" after "}" is read as a regex unless the brace closed an object literal,
//   and after ")" only when the parenthesis belonged to if/while/for/with.
// - String.raw over a template containing "</script" sees "<\/script".
// - HTML-like comments ("<!--" / "-->" as comments) in the source are not
//   supported; the linter and the build reject them.

const LINE_TERMINATOR = /[\n\r\u2028\u2029]/;
const WHITESPACE = /[\t\v\f \u00a0\ufeff\n\r\u2028\u2029\u1680\u2000-\u200a\u202f\u205f\u3000]/;
const ID_START = /[A-Za-z_$\u0080-\uffff\\#]/;
const ID_PART = /[\w$\u0080-\uffff\\]/;
const NUMBER = /^(?:0[xXoObB][\da-fA-F_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?n?)/;

// Longest punctuators first.
const PUNCTUATORS = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=',
  '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**',
  '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%',
  '&', '|', '^', '!', '~', '?', ':', '=', '.', '@',
];

// After these keywords an expression (and therefore a regex) may follow.
const REGEX_AFTER_WORD = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await', 'extends',
]);

// Keywords that can never be the last token of a statement or expression.
const NON_ENDING_WORDS = new Set([
  'typeof', 'void', 'delete', 'new', 'in', 'instanceof', 'else', 'do', 'case',
  'var', 'const', 'function', 'class', 'extends', 'throw', 'if', 'for',
  'while', 'switch', 'try', 'catch', 'finally', 'import', 'export', 'with',
]);

// Punctuators after which "{" opens an object literal (an expression).
const EXPRESSION_BEFORE_BRACE = new Set([
  '(', '[', ',', ':', '=', '?', '!', '~', '+', '-', '*', '/', '%', '&', '|',
  '^', '<', '>', '<=', '>=', '==', '!=', '===', '!==', '&&', '||', '??',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**=', '<<=', '>>=',
  '>>>=', '&&=', '||=', '??=', '**', '<<', '>>', '>>>', '...', '?.',
]);

/**
 * @typedef {'word'|'number'|'string'|'template'|'regex'|'punct'} TokenType
 * @typedef {{type: TokenType, value: string, nl: boolean,
 *   templateStart?: boolean, templateEnd?: boolean}} Token
 */

/**
 * Splits JavaScript source into tokens. `nl` marks a token that was preceded
 * by a line terminator (in whitespace or inside a block comment).
 * @param {string} src
 * @returns {Token[]}
 */
export function tokenize(src) {
  /** @type {Token[]} */
  const tokens = [];
  /** @type {('brace'|'object'|'template')[]} */
  const braces = [];
  /** @type {boolean[]} paren opened by if/while/for/with */
  const parens = [];
  let i = 0;
  let nl = false;
  // Regex allowed after the previous significant token?
  let regexOk = true;

  /** @param {Token} t @param {boolean} nextRegexOk */
  const push = (t, nextRegexOk) => {
    tokens.push(t);
    nl = false;
    regexOk = nextRegexOk;
  };

  const fail = (/** @type {string} */ msg) => {
    const line = src.slice(0, i).split('\n').length;
    throw new SyntaxError(`minify: ${msg} at line ${line}`);
  };

  // Scans template characters from i (just after "`" or "}") up to the next
  // "${" or closing "`". Returns true if the template ended.
  const scanTemplate = () => {
    for (;;) {
      if (i >= src.length) fail('unterminated template literal');
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; return true; }
      if (c === '$' && src[i + 1] === '{') { i += 2; return false; }
      i++;
    }
  };

  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];

    if (WHITESPACE.test(c)) {
      if (LINE_TERMINATOR.test(c)) nl = true;
      i++;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < src.length && !LINE_TERMINATOR.test(src[i])) i++;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) fail('unterminated comment');
      if (LINE_TERMINATOR.test(src.slice(i, end))) nl = true;
      i = end + 2;
      continue;
    }
    if (c === '<' && src.startsWith('<!--', i)) fail('HTML-like comment "<!--" is not supported');

    const start = i;
    const hadNl = nl;

    if (c === '"' || c === "'") {
      i++;
      while (src[i] !== c) {
        if (i >= src.length || src[i] === '\n' || src[i] === '\r') fail('unterminated string');
        i += src[i] === '\\' ? (src[i + 1] === '\r' && src[i + 2] === '\n' ? 3 : 2) : 1;
      }
      i++;
      push({ type: 'string', value: src.slice(start, i), nl: hadNl }, false);
      continue;
    }

    if (c === '`') {
      i++;
      const ended = scanTemplate();
      if (!ended) braces.push('template');
      push({ type: 'template', value: src.slice(start, i), nl: hadNl, templateStart: true, templateEnd: ended }, !ended);
      continue;
    }

    if (c === '}' && braces[braces.length - 1] === 'template') {
      braces.pop();
      i++;
      const ended = scanTemplate();
      if (!ended) braces.push('template');
      push({ type: 'template', value: src.slice(start, i), nl: hadNl, templateStart: false, templateEnd: ended }, !ended);
      continue;
    }

    if (c === '/' && regexOk) {
      i++;
      let inClass = false;
      for (;;) {
        const r = src[i];
        if (i >= src.length || r === '\n' || r === '\r') fail('unterminated regular expression');
        if (r === '\\') { i += 2; continue; }
        if (r === '[') inClass = true;
        else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) break;
        i++;
      }
      i++;
      while (i < src.length && ID_PART.test(src[i])) i++;
      push({ type: 'regex', value: src.slice(start, i), nl: hadNl }, false);
      continue;
    }

    if (/\d/.test(c) || (c === '.' && n !== undefined && /\d/.test(n))) {
      const m = NUMBER.exec(src.slice(i, i + 400));
      if (!m) fail('bad number');
      i += /** @type {RegExpExecArray} */ (m)[0].length;
      push({ type: 'number', value: src.slice(start, i), nl: hadNl }, false);
      continue;
    }

    if (ID_START.test(c)) {
      i++;
      while (i < src.length && ID_PART.test(src[i]) && !WHITESPACE.test(src[i])) {
        if (src[i] === '\\') {
          i += src[i + 2] === '{' ? src.indexOf('}', i) - i + 1 : 6;
        } else i++;
      }
      const word = src.slice(start, i);
      push({ type: 'word', value: word, nl: hadNl }, REGEX_AFTER_WORD.has(word));
      continue;
    }

    const p = PUNCTUATORS.find((x) => src.startsWith(x, i));
    if (!p || (p === '?.' && /\d/.test(src[i + 2] ?? ''))) {
      if (c === '?') { i++; push({ type: 'punct', value: '?', nl: hadNl }, true); continue; }
      fail(`unexpected character ${JSON.stringify(c)}`);
    }
    const punct = /** @type {string} */ (p);
    i += punct.length;
    let nextRegexOk = true;
    if (punct === '{') {
      const prev = tokens[tokens.length - 1];
      const isObject = prev !== undefined && (
        (prev.type === 'punct' && EXPRESSION_BEFORE_BRACE.has(prev.value)) ||
        (prev.type === 'word' && (prev.value === 'return' || prev.value === 'case' || prev.value === 'typeof' || prev.value === 'yield' || prev.value === 'await')) ||
        (prev.type === 'template' && !prev.templateEnd));
      braces.push(isObject ? 'object' : 'brace');
    } else if (punct === '}') {
      nextRegexOk = braces.pop() !== 'object';
    } else if (punct === '(') {
      const prev = tokens[tokens.length - 1];
      parens.push(prev !== undefined && prev.type === 'word' && /^(?:if|while|for|with)$/.test(prev.value));
    } else if (punct === ')') {
      nextRegexOk = parens.pop() === true;
    } else if (punct === ']' || punct === '++' || punct === '--') {
      nextRegexOk = false;
    }
    push({ type: 'punct', value: punct, nl: hadNl }, nextRegexOk);
  }
  if (braces.length) fail('unbalanced braces');
  return tokens;
}

/** @param {string} ch */
const wordish = (ch) => ch !== undefined && ID_PART.test(ch);

/** @param {Token} t */
function canEnd(t) {
  switch (t.type) {
    case 'word': return !NON_ENDING_WORDS.has(t.value);
    case 'number': case 'string': case 'regex': return true;
    case 'template': return Boolean(t.templateEnd);
    default: return t.value === ')' || t.value === ']' || t.value === '}' || t.value === '++' || t.value === '--';
  }
}

/** @param {Token} t */
function canStart(t) {
  switch (t.type) {
    case 'word': case 'number': case 'string': case 'regex': return true;
    case 'template': return Boolean(t.templateStart);
    default: return ['(', '[', '{', '+', '-', '!', '~', '++', '--'].includes(t.value);
  }
}

/**
 * Whitespace needed between two adjacent tokens so that they lex the same.
 * @param {Token} a
 * @param {Token} b
 */
function separator(a, b) {
  if (b.nl && canEnd(a) && canStart(b)) return '\n';
  const last = a.value[a.value.length - 1];
  const first = b.value[0];
  if (wordish(last) && wordish(first)) return ' ';
  if (a.type === 'regex' && wordish(first)) return ' ';
  if (a.type === 'number' && first === '.') return ' ';
  if ((last === '+' || last === '-' || last === '/') && first === last) return ' ';
  if (last === '/' && first === '*') return ' ';
  if (last === '<' && first === '!') return ' ';
  if (a.value === '--' && first === '>') return ' ';
  if (last === '?' && first === '.') return ' ';
  return '';
}

/**
 * Makes a string/template/regex token safe for inlining in an HTML <script>.
 * @param {Token} t
 */
function htmlSafe(t) {
  if (t.type !== 'string' && t.type !== 'template' && t.type !== 'regex') return t.value;
  return t.value.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

/**
 * Minifies JavaScript: removes comments and redundant whitespace only.
 * @param {string} src
 * @returns {string}
 */
export function minifyJs(src) {
  const tokens = tokenize(src);
  let out = '';
  for (let k = 0; k < tokens.length; k++) {
    if (k > 0) out += separator(tokens[k - 1], tokens[k]);
    out += htmlSafe(tokens[k]);
  }
  return out;
}

/**
 * Minifies CSS conservatively: removes comments, collapses whitespace, drops
 * whitespace around "{", "}", ";", "," and after ":" inside blocks. Strings are
 * kept verbatim.
 * @param {string} src
 * @returns {string}
 */
export function minifyCss(src) {
  let out = '';
  let depth = 0;
  let pendingSpace = false;
  let i = 0;
  const tight = '{};,';
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new SyntaxError('minifyCss: unterminated comment');
      i = end + 2;
      pendingSpace = true;
      continue;
    }
    if (/\s/.test(c)) { pendingSpace = true; i++; continue; }
    const prev = out[out.length - 1];
    if (pendingSpace && out.length > 0 && !tight.includes(c) && !tight.includes(prev) && !(prev === ':' && depth > 0)) out += ' ';
    pendingSpace = false;
    if (c === '"' || c === "'") {
      const start = i++;
      while (src[i] !== c) {
        if (i >= src.length) throw new SyntaxError('minifyCss: unterminated string');
        i += src[i] === '\\' ? 2 : 1;
      }
      i++;
      out += src.slice(start, i);
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') depth--;
    out += c;
    i++;
  }
  return out;
}
