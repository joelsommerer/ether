/* A block comment
   spanning lines */
// A line comment
const s1 = '// not a comment';
const s2 = "/* nor this */";
const s3 = `// inside a template /* too */`;
const re = /\/\/x/;          // regex containing "//"
const s4 = 'a' + /* inline */ 'b' + // trailing
  'c';
const s5 = "it's \"quoted\" \\ and \
continued";
JSON.stringify([s1, s2, s3, re.source, re.test('//x'), s4, s5]);
