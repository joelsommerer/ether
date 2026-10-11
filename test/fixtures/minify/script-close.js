// "</script>" and "<!--" inside strings must not end an inline <script>.
const a = '</script>';
const b = "</SCRIPT><script>";
const c = `</script ${'x'}>`;
const d = '<!-- not a comment -->';
const r = /<\/script>/i;
JSON.stringify([a, b, c, d, r.test(a), r.test(b), a.length, c.length]);
