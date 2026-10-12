// Measurement-rig recorder (piece E1-002). A classic script, idempotent:
// loaded by bench/oracle/native.html and bench/stubs/broken.html with a
// <script> tag, and injected by the rig into the ProseMirror example and into
// our document. It never edits the document on its own; it only resets the
// starting content, places the selection on request and records what the
// browser did.
//
// window.__rig:
//   subject()            'native' | 'stub' | 'pm' | 'ours'
//   reset(blocks)        starting content [{t: 'p'|'h1'|'h2'|'h3'|'li', s, m?}]; caret at the end,
//                        returned as {ok, at: [b, o]}
//   select(spec)         {anchor: [b, o], focus?} or {anchorPath, anchorOffset, focusPath?, focusOffset?}
//   point(spec)          client coordinates for {x, y} (relative to the root) or {at: [b, o]}
//   snapshot()           blocks, selection, events since the last snapshot, ...
//   peek()               event names since the last snapshot (not consumed)
//
// Text model of a block: its text in document order, <br> = "\n" except a
// <br> that is the last node of the block (placeholder). Offsets are UTF-16
// code units. Marks: one digit per code unit, bit 1 = bold (b/strong),
// bit 2 = italic (i/em), trailing "0" removed (same encoding as src/model.js).
(function () {
  'use strict';
  /** @type {any} */
  const W = window;
  if (W.__rig) return;

  /** @type {any[]} */
  let log = [];
  let composing = false;
  /** @type {string[]} */
  const errors = [];
  let mutationCount = 0;
  /** @type {MutationObserver | null} */
  let observer = null;
  /** @type {Element | null} */
  let observed = null;

  for (const type of ['beforeinput', 'input']) {
    document.addEventListener(type, (ev) => {
      const e = /** @type {InputEvent} */ (ev);
      log.push({ e: type, it: e.inputType, d: e.data ?? null, c: e.cancelable, comp: e.isComposing });
    }, true);
  }
  for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) {
    document.addEventListener(type, (ev) => {
      if (type === 'compositionstart') composing = true;
      if (type === 'compositionend') composing = false;
      log.push({ e: type, d: /** @type {CompositionEvent} */ (ev).data ?? null });
    }, true);
  }
  for (const type of ['paste', 'copy', 'cut', 'dragstart', 'drop']) {
    document.addEventListener(type, () => log.push({ e: type }), true);
  }
  W.addEventListener('error', (/** @type {ErrorEvent} */ e) => errors.push(String(e.message)));
  W.addEventListener('unhandledrejection', (/** @type {PromiseRejectionEvent} */ e) => errors.push(String(e.reason)));

  function subject() {
    if (W.view && W.PM && W.view.state && W.view.dom) return 'pm';
    if (W.webdoc) return 'ours';
    return document.documentElement.dataset.subject || 'native';
  }

  /** @returns {HTMLElement | null} */
  function root() {
    if (subject() === 'pm') return W.view.dom;
    return document.querySelector('[contenteditable]:not([contenteditable="false"])');
  }

  // ---- DOM text model -------------------------------------------------------

  const BLOCK_TAGS = /^(P|DIV|H[1-6]|LI|PRE|BLOCKQUOTE|UL|OL)$/;
  /** @param {Element} el */
  function typeOf(el) {
    const t = el.tagName;
    if (t === 'LI') return el.parentElement && el.parentElement.tagName === 'OL' ? 'oli' : 'li';
    if (/^H[1-6]$/.test(t)) return t.toLowerCase();
    return ({ P: 'p', DIV: 'div', PRE: 'pre', BLOCKQUOTE: 'quote' })[t] || t.toLowerCase();
  }

  /**
   * Top-level blocks of a root: elements, list items, or runs of inline nodes
   * directly in the root ("anon").
   * @param {Element} r
   * @returns {{nodes: Node[], t: string}[]}
   */
  function domBlocks(r) {
    /** @type {{nodes: Node[], t: string}[]} */
    const out = [];
    /** @type {{nodes: Node[], t: string} | null} */
    let anon = null;
    for (const n of Array.from(r.childNodes)) {
      if (n.nodeType === 1 && /^(UL|OL)$/.test(/** @type {Element} */ (n).tagName)) {
        anon = null;
        for (const li of Array.from(/** @type {Element} */ (n).children)) out.push({ nodes: [li], t: typeOf(li) });
        continue;
      }
      if (n.nodeType === 1 && BLOCK_TAGS.test(/** @type {Element} */ (n).tagName)) {
        anon = null;
        out.push({ nodes: [n], t: typeOf(/** @type {Element} */ (n)) });
        continue;
      }
      if (n.nodeType !== 1 && n.nodeType !== 3) continue;
      if (!anon) {
        anon = { nodes: [], t: 'anon' };
        out.push(anon);
      }
      anon.nodes.push(n);
    }
    return out;
  }

  /**
   * Marks bit set of a text node (ancestors up to the block).
   * @param {Node} n @param {Node} stop
   */
  function markBits(n, stop) {
    let m = 0;
    for (let p = n.parentNode; p && p !== stop; p = p.parentNode) {
      if (p.nodeType !== 1) continue;
      const t = /** @type {Element} */ (p).tagName;
      if (t === 'B' || t === 'STRONG') m |= 1;
      else if (t === 'I' || t === 'EM') m |= 2;
      else if (t === 'SPAN') {
        const st = /** @type {HTMLElement} */ (p).style;
        if (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) m |= 1;
        if (st.fontStyle === 'italic') m |= 2;
      }
    }
    return m;
  }

  /**
   * Text pieces of a block in document order.
   * @param {{nodes: Node[]}} b
   * @param {Node} stop
   */
  function pieces(b, stop) {
    /** @type {{node: Node, start: number, len: number, m: number}[]} */
    const out = [];
    let pos = 0;
    let started = false;
    /** @param {Node} n */
    const walk = (n) => {
      if (n.nodeType === 3) {
        const len = /** @type {Text} */ (n).data.length;
        out.push({ node: n, start: pos, len, m: markBits(n, stop) });
        pos += len;
        if (len) started = true;
        return;
      }
      if (n.nodeType !== 1) return;
      const el = /** @type {Element} */ (n);
      if (el.tagName === 'BR') {
        out.push({ node: n, start: pos, len: 1, m: 0 });
        pos += 1;
        started = true;
        return;
      }
      // A nested block inside a block starts a new line (recorded as "\n").
      if (started && BLOCK_TAGS.test(el.tagName) && el.tagName !== 'UL' && el.tagName !== 'OL') {
        out.push({ node: n, start: pos, len: 1, m: -1 });
        pos += 1;
      }
      for (const c of Array.from(el.childNodes)) walk(c);
    };
    for (const n of b.nodes) {
      if (n.nodeType === 3) walk(n);
      else for (const c of Array.from(n.childNodes)) walk(c);
    }
    // Trailing <br> placeholder carries no text.
    const last = out[out.length - 1];
    if (last && last.node.nodeType === 1 && /** @type {Element} */ (last.node).tagName === 'BR') last.len = 0;
    return out;
  }

  /** @param {{node: Node, start: number, len: number, m: number}[]} ps */
  function textOf(ps) {
    let s = '';
    let m = '';
    for (const p of ps) {
      if (p.node.nodeType === 3) {
        s += /** @type {Text} */ (p.node).data;
        m += String(p.m).repeat(p.len);
      } else if (p.len) {
        s += '\n';
        m += '0';
      }
    }
    return { s, m: m.replace(/0+$/, '') };
  }

  /**
   * Maps a DOM boundary point to [block, offset] (null when outside root).
   * @param {Element} r @param {{nodes: Node[], t: string}[]} bs @param {Node} node @param {number} offset
   * @returns {[number, number] | null}
   */
  function mapPoint(r, bs, node, offset) {
    if (!r.contains(node) || !bs.length) return null;
    const probe = document.createRange();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      const range = document.createRange();
      range.setStartBefore(b.nodes[0]);
      range.setEndAfter(b.nodes[b.nodes.length - 1]);
      const cmp = range.comparePoint(node, offset);
      if (cmp < 0) return [i, 0];
      if (cmp > 0) continue;
      const ps = pieces(b, b.nodes.length === 1 && b.nodes[0].nodeType === 1 ? b.nodes[0] : r);
      const own = ps.find((p) => p.node === node && p.node.nodeType === 3);
      if (own) return [i, own.start + Math.min(offset, own.len)];
      probe.setStart(node, offset);
      probe.collapse(true);
      for (const p of ps) {
        if (probe.comparePoint(p.node, 0) >= 0) return [i, p.start];
      }
      return [i, textOf(ps).s.length];
    }
    return [bs.length - 1, textOf(pieces(bs[bs.length - 1], r)).s.length];
  }

  /**
   * DOM point for [block, offset]; clamps both, never splits a surrogate pair.
   * @param {Element} r @param {number} b @param {number} o
   * @returns {[Node, number]}
   */
  function domPoint(r, b, o) {
    const bs = domBlocks(r);
    if (!bs.length) return [r, 0];
    const blk = bs[Math.min(b, bs.length - 1)];
    const stop = blk.nodes.length === 1 && blk.nodes[0].nodeType === 1 ? blk.nodes[0] : r;
    const ps = pieces(blk, stop);
    const s = textOf(ps).s;
    let off = Math.max(0, Math.min(o, s.length));
    if (off > 0 && off < s.length && (s.charCodeAt(off - 1) & 0xfc00) === 0xd800 && (s.charCodeAt(off) & 0xfc00) === 0xdc00) off--;
    for (const p of ps) {
      if (p.node.nodeType === 3 && off >= p.start && off <= p.start + p.len) return [p.node, off - p.start];
      if (p.node.nodeType === 1 && off === p.start) {
        const parent = /** @type {Node} */ (p.node.parentNode);
        return [parent, Array.prototype.indexOf.call(parent.childNodes, p.node)];
      }
    }
    if (blk.nodes.length === 1 && blk.nodes[0].nodeType === 1) {
      const el = /** @type {Element} */ (blk.nodes[0]);
      const br = el.lastChild && el.lastChild.nodeType === 1 && /** @type {Element} */ (el.lastChild).tagName === 'BR';
      return [el, br ? el.childNodes.length - 1 : el.childNodes.length];
    }
    const last = blk.nodes[blk.nodes.length - 1];
    return [r, Array.prototype.indexOf.call(r.childNodes, last) + 1];
  }

  /** @param {Node} n @param {Element} r child-index path from r */
  function pathOf(n, r) {
    /** @type {number[]} */
    const p = [];
    for (let c = n; c && c !== r; c = /** @type {Node} */ (c.parentNode)) {
      if (!c.parentNode) return null;
      p.unshift(Array.prototype.indexOf.call(c.parentNode.childNodes, c));
    }
    return p;
  }

  /** @param {Element} r @param {number[]} path */
  function nodeAt(r, path) {
    /** @type {Node} */
    let n = r;
    for (const k of path) {
      const c = n.childNodes[Math.min(k, n.childNodes.length - 1)];
      if (!c) break;
      n = c;
    }
    return n;
  }

  /** Structure summary of a root: tag tree without text (for diagnosis). @param {Node} n */
  function shape(n) {
    if (n.nodeType === 3) return '#';
    if (n.nodeType !== 1) return '';
    const el = /** @type {Element} */ (n);
    const kids = Array.from(el.childNodes).map(shape).filter(Boolean);
    return el.tagName.toLowerCase() + (kids.length ? '(' + kids.join(',') + ')' : '');
  }

  function domSnapshot() {
    const r = root();
    if (!r) return { blocks: [], sel: null, shape: null };
    const bs = domBlocks(r);
    const blocks = bs.map((b) => {
      const ps = pieces(b, b.nodes.length === 1 && b.nodes[0].nodeType === 1 ? b.nodes[0] : r);
      const t = textOf(ps);
      return { t: b.t, s: t.s, m: t.m };
    });
    const ws = getSelection();
    /** @type {any} */
    let sel = null;
    if (ws && ws.rangeCount && ws.anchorNode && ws.focusNode) {
      // Browsers can report an offset beyond the node's length (WebKit after
      // some undos); it is clamped for mapping and flagged in the record.
      const len = (/** @type {Node} */ n) => (n.nodeType === 3 ? /** @type {Text} */ (n).data.length : n.childNodes.length);
      const ao = Math.min(ws.anchorOffset, len(ws.anchorNode));
      const fo = Math.min(ws.focusOffset, len(ws.focusNode));
      const a = mapPoint(r, bs, ws.anchorNode, ao);
      const f = mapPoint(r, bs, ws.focusNode, fo);
      sel = a && f ? { a, f } : { outside: true };
      if (ao !== ws.anchorOffset || fo !== ws.focusOffset) {
        sel.invalidOffset = { anchor: [ws.anchorOffset, len(ws.anchorNode)], focus: [ws.focusOffset, len(ws.focusNode)] };
      }
    }
    return { blocks, sel, shape: Array.from(r.childNodes).map(shape).join(',') };
  }

  // ---- ProseMirror model ------------------------------------------------------

  /** @returns {{node: any, pos: number, t: string}[]} */
  function pmBlocks() {
    /** @type {{node: any, pos: number, t: string}[]} */
    const out = [];
    W.view.state.doc.descendants((/** @type {any} */ node, /** @type {number} */ pos, /** @type {any} */ parent, /** @type {number} */ _i) => {
      if (!node.isTextblock) return true;
      let t = node.type.name === 'heading' ? 'h' + node.attrs.level : node.type.name === 'code_block' ? 'pre' : 'p';
      if (t === 'p' && parent && parent.type.name === 'list_item') {
        const $p = W.view.state.doc.resolve(pos);
        const list = $p.depth >= 2 ? $p.node($p.depth - 1) : null;
        t = list && list.type.name === 'ordered_list' ? 'oli' : 'li';
      } else if (t === 'p' && parent && parent.type.name === 'blockquote') t = 'quote';
      out.push({ node, pos, t });
      return false;
    });
    return out;
  }

  /** @param {any} node */
  function pmText(node) {
    let s = '';
    let m = '';
    node.forEach((/** @type {any} */ c) => {
      if (c.isText) {
        let bits = 0;
        for (const mk of c.marks) {
          if (mk.type.name === 'strong') bits |= 1;
          if (mk.type.name === 'em') bits |= 2;
        }
        s += c.text;
        m += String(bits).repeat(c.text.length);
      } else {
        s += c.type.name === 'hard_break' ? '\n' : '￼';
        m += '0';
      }
    });
    return { s, m: m.replace(/0+$/, '') };
  }

  /** @param {number} pos @returns {[number, number] | null} */
  function pmMap(pos) {
    const bs = pmBlocks();
    for (let i = 0; i < bs.length; i++) {
      const start = bs[i].pos + 1;
      const end = start + bs[i].node.content.size;
      if (pos >= start && pos <= end) return [i, pos - start];
      if (pos < start) return [i, 0];
    }
    return bs.length ? [bs.length - 1, bs[bs.length - 1].node.content.size] : null;
  }

  /** @param {number} b @param {number} o */
  function pmPos(b, o) {
    const bs = pmBlocks();
    const blk = bs[Math.min(b, bs.length - 1)];
    const s = pmText(blk.node).s;
    let off = Math.max(0, Math.min(o, s.length));
    if (off > 0 && off < s.length && (s.charCodeAt(off - 1) & 0xfc00) === 0xd800 && (s.charCodeAt(off) & 0xfc00) === 0xdc00) off--;
    return blk.pos + 1 + off;
  }

  function pmSnapshot() {
    const st = W.view.state;
    const blocks = pmBlocks().map((b) => ({ t: b.t, ...pmText(b.node) }));
    const s = st.selection;
    const a = pmMap(s.anchor);
    const f = pmMap(s.head);
    return {
      blocks,
      sel: a && f ? { a, f, kind: s instanceof W.PM.state.TextSelection ? 'text' : s.constructor && s.jsonID ? s.jsonID : 'other' } : null,
      doc: st.doc.toJSON(),
      undoDepth: W.PM.history.undoDepth(st),
      redoDepth: W.PM.history.redoDepth(st),
      storedMarks: st.storedMarks ? st.storedMarks.map((/** @type {any} */ mk) => mk.type.name) : null,
    };
  }

  // ---- reset / select / point ------------------------------------------------

  /**
   * Appends text with marks digits as b/i elements.
   * @param {Element} el @param {string} s @param {string} m
   */
  function appendMarked(el, s, m) {
    let k = 0;
    while (k < s.length) {
      const bits = Number(m[k] || 0);
      let e = k + 1;
      while (e < s.length && Number(m[e] || 0) === bits) e++;
      /** @type {Node} */
      let node = document.createTextNode(s.slice(k, e));
      if (bits & 2) { const i = document.createElement('i'); i.appendChild(node); node = i; }
      if (bits & 1) { const b = document.createElement('b'); b.appendChild(node); node = b; }
      el.appendChild(node);
      k = e;
    }
  }

  /** @param {{t: string, s: string, m?: string}[]} init */
  function reset(init) {
    log = [];
    composing = false;
    const sub = subject();
    if (sub === 'pm') {
      const schema = W.view.state.schema;
      /** @param {{s: string, m?: string}} b */
      const inline = (b) => {
        /** @type {any[]} */
        const out = [];
        let k = 0;
        const m = b.m || '';
        while (k < b.s.length) {
          const bits = Number(m[k] || 0);
          let e = k + 1;
          while (e < b.s.length && Number(m[e] || 0) === bits) e++;
          const marks = [];
          if (bits & 2) marks.push({ type: 'em' });
          if (bits & 1) marks.push({ type: 'strong' });
          out.push(marks.length ? { type: 'text', text: b.s.slice(k, e), marks } : { type: 'text', text: b.s.slice(k, e) });
          k = e;
        }
        return out;
      };
      /** @type {any[]} */
      const content = [];
      for (const b of init) {
        const para = { type: 'paragraph', content: inline(b) };
        if (b.t === 'li') {
          const last = content[content.length - 1];
          const item = { type: 'list_item', content: [para] };
          if (last && last.type === 'bullet_list') last.content.push(item);
          else content.push({ type: 'bullet_list', content: [item] });
        } else if (/^h[1-6]$/.test(b.t)) content.push({ type: 'heading', attrs: { level: Number(b.t[1]) }, content: inline(b) });
        else content.push(para);
      }
      const doc = W.PM.model.Node.fromJSON(schema, { type: 'doc', content });
      const state = W.PM.state.EditorState.create({ doc, plugins: W.view.state.plugins });
      W.view.updateState(state);
      W.view.focus();
      const end = W.PM.state.Selection.atEnd(W.view.state.doc);
      W.view.dispatch(W.view.state.tr.setSelection(end));
      log = [];
      return { ok: true, at: pmMap(end.from) };
    }
    const r = root();
    if (!r) return { ok: false, reason: 'no editable surface' };
    if (sub === 'ours') return { ok: false, reason: 'our document has no way to load a starting content yet' };
    while (r.firstChild) r.removeChild(r.firstChild);
    /** @type {Element | null} */
    let list = null;
    for (const b of init) {
      const tag = b.t === 'li' ? 'li' : b.t;
      const el = document.createElement(tag);
      if (b.s) appendMarked(el, b.s, b.m || '');
      else el.appendChild(document.createElement('br'));
      if (b.t === 'li') {
        if (!list) { list = document.createElement('ul'); r.appendChild(list); }
        list.appendChild(el);
      } else {
        list = null;
        r.appendChild(el);
      }
    }
    r.focus();
    const bs = domBlocks(r);
    const [n, o] = domPoint(r, bs.length - 1, Infinity);
    /** @type {Selection} */ (getSelection()).setBaseAndExtent(n, o, n, o);
    watch();
    log = [];
    return { ok: true, at: mapPoint(r, bs, n, o) };
  }

  /** @param {any} spec */
  function select(spec) {
    const r = root();
    if (!r) return { ok: false, reason: 'no editable surface' };
    const ws = /** @type {Selection} */ (getSelection());
    if (subject() === 'pm' && spec.anchor) {
      const a = pmPos(spec.anchor[0], spec.anchor[1]);
      const f = spec.focus ? pmPos(spec.focus[0], spec.focus[1]) : a;
      W.view.focus();
      W.view.dispatch(W.view.state.tr.setSelection(W.PM.state.TextSelection.create(W.view.state.doc, a, f)));
      return { ok: true };
    }
    if (document.activeElement !== r) r.focus();
    if (spec.anchor) {
      const [an, ao] = domPoint(r, spec.anchor[0], spec.anchor[1]);
      const [fn, fo] = spec.focus ? domPoint(r, spec.focus[0], spec.focus[1]) : [an, ao];
      ws.setBaseAndExtent(an, ao, fn, fo);
      return { ok: true };
    }
    const an = nodeAt(r, spec.anchorPath);
    const fn = spec.focusPath ? nodeAt(r, spec.focusPath) : an;
    const len = (/** @type {Node} */ n) => (n.nodeType === 3 ? /** @type {Text} */ (n).data.length : n.childNodes.length);
    ws.setBaseAndExtent(an, Math.min(spec.anchorOffset, len(an)), fn, Math.min(spec.focusPath ? spec.focusOffset : spec.anchorOffset, len(fn)));
    return { ok: true };
  }

  /**
   * Client coordinates for a pointer step; scrolls the page first when the
   * point lies outside the viewport (drivers reject targets out of bounds).
   * @param {any} spec
   */
  function point(spec) {
    const p = rawPoint(spec);
    if (!p) return p;
    if (p.y < 0 || p.y > innerHeight || p.x < 0 || p.x > innerWidth) {
      scrollBy(0, p.y - innerHeight / 2);
      return rawPoint(spec);
    }
    return p;
  }

  /** @param {any} spec */
  function rawPoint(spec) {
    const r = root();
    if (!r) return null;
    const box = r.getBoundingClientRect();
    if ('x' in spec) return { x: box.left + spec.x, y: box.top + spec.y };
    /** @type {[Node, number]} */
    let p;
    if (subject() === 'pm') {
      const pos = pmPos(spec.at[0], spec.at[1]);
      const c = W.view.coordsAtPos(pos);
      return { x: c.left, y: (c.top + c.bottom) / 2 };
    }
    p = domPoint(r, spec.at[0], spec.at[1]);
    const range = document.createRange();
    range.setStart(p[0], p[1]);
    range.collapse(true);
    let rect = range.getClientRects()[0];
    if (!rect) {
      const el = p[0].nodeType === 1 ? /** @type {Element} */ (p[0]) : /** @type {Element} */ (p[0].parentNode);
      rect = el.getBoundingClientRect();
    }
    return { x: rect.left, y: rect.top + rect.height / 2 };
  }

  function watch() {
    const r = root();
    if (!r || r === observed) return;
    if (observer) observer.disconnect();
    observer = new MutationObserver((ms) => { mutationCount += ms.length; });
    observer.observe(r, { subtree: true, childList: true, characterData: true, attributes: true });
    observed = r;
  }

  function api() {
    const d = W.webdoc;
    if (!d) return null;
    /** @type {Record<string, any>} */
    const out = { version: d.version, has: {} };
    for (const k of ['state', 'hash', 'ledger', 'selection', 'toHTML']) {
      out.has[k] = typeof d[k] === 'function';
      if (!out.has[k]) continue;
      try {
        out[k === 'toHTML' ? 'html' : k] = d[k]();
      } catch (e) {
        out[k + 'Error'] = String(e);
      }
    }
    return out;
  }

  function ghost() {
    const g = document.querySelector('[inert]');
    if (!g) return null;
    const bs = domBlocks(g);
    return {
      html: g.outerHTML,
      blocks: bs.map((b) => ({ t: b.t, ...textOf(pieces(b, b.nodes.length === 1 && b.nodes[0].nodeType === 1 ? b.nodes[0] : g)) })),
    };
  }

  function snapshot() {
    const sub = subject();
    /** @type {Record<string, any>} */
    const out = sub === 'pm' ? pmSnapshot() : domSnapshot();
    out.subject = sub;
    out.events = log;
    out.composing = composing;
    out.errors = errors.slice();
    out.focused = !!root() && document.activeElement === root();
    if (sub === 'ours') {
      watch();
      out.api = api();
      out.ghost = ghost();
      out.mutations = mutationCount;
      out.guard = null;
    }
    log = [];
    mutationCount = 0;
    return out;
  }

  /** @param {number[]} path @param {number} offset DOM-path helper for scenario authors */
  function pathPoint(path, offset) {
    const r = root();
    if (!r) return null;
    const n = nodeAt(r, path);
    const bs = domBlocks(r);
    return { path: pathOf(n, r), at: mapPoint(r, bs, n, offset) };
  }

  if (subject() === 'ours') watch();
  /** Event names recorded since the last snapshot, without consuming them. */
  const peek = () => log.map((e) => e.e);

  W.__rig = Object.freeze({ version: 1, subject, reset, select, point, snapshot, pathPoint, peek });
})();
