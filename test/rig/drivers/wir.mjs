// Web Inspector remote protocol client for Safari on the iOS simulator
// "Ether iPhone 17 Pro" (piece E1-002, ADR 0004). Node built-ins only.
//
// The simulator's webinspectord listens on a unix socket of its launchd_sim
// (`lsof -aUc launchd_s`, the one whose command line names the Ether UDID).
// Messages are binary property lists, each prefixed with its length (uint32
// big-endian): {__selector, __argument}. The page itself speaks the JSON
// Web Inspector protocol, wrapped in Target.sendMessageToTarget.
//
// Unlike safaridriver, an inspector connection does not put Safari into
// automation mode, so real touches and key presses from XCUITest reach the
// page while the rig evaluates scripts in it.

import { connect } from 'node:net';
import { randomUUID } from 'node:crypto';
import { timed } from '../sh.mjs';

// ---- binary property lists (bplist00) ------------------------------------------

/**
 * Encodes null, booleans, integers, doubles, strings, Buffers, arrays and
 * plain objects as a binary property list.
 * @param {unknown} root
 */
export function bplistEncode(root) {
  /** @type {({a: number[]} | {k: number[], v: number[]} | {p: unknown})[]} */
  const objs = [];
  /** @param {unknown} v @returns {number} */
  const add = (v) => {
    const i = objs.length;
    objs.push({ p: null });
    if (Array.isArray(v)) objs[i] = { a: v.map(add) };
    else if (v && typeof v === 'object' && !Buffer.isBuffer(v)) {
      const o = /** @type {Record<string, unknown>} */ (v);
      const ks = Object.keys(o).filter((k) => o[k] !== undefined);
      const k = ks.map(add);
      objs[i] = { k, v: ks.map((key) => add(o[key])) };
    } else objs[i] = { p: v };
    return i;
  };
  add(root);
  const refSize = objs.length < 256 ? 1 : objs.length < 65536 ? 2 : 4;
  /** @param {number} n */
  const ref = (n) => { const b = Buffer.alloc(refSize); b.writeUIntBE(n, 0, refSize); return b; };
  /** @param {number} n */
  const int = (n) => {
    if (n >= 0 && n < 256) return Buffer.from([0x10, n]);
    if (n >= 0 && n < 65536) { const b = Buffer.alloc(3); b[0] = 0x11; b.writeUInt16BE(n, 1); return b; }
    if (n >= 0 && n < 2 ** 32) { const b = Buffer.alloc(5); b[0] = 0x12; b.writeUInt32BE(n, 1); return b; }
    const b = Buffer.alloc(9); b[0] = 0x13; b.writeBigInt64BE(BigInt(n), 1); return b;
  };
  /** @param {number} marker @param {number} n */
  const head = (marker, n) => (n < 15 ? Buffer.from([marker | n]) : Buffer.concat([Buffer.from([marker | 15]), int(n)]));
  const parts = [Buffer.from('bplist00')];
  let off = 8;
  /** @type {number[]} */
  const offsets = [];
  for (const o of objs) {
    let b;
    if ('a' in o) b = Buffer.concat([head(0xa0, o.a.length), ...o.a.map(ref)]);
    else if ('k' in o) b = Buffer.concat([head(0xd0, o.k.length), ...o.k.map(ref), ...o.v.map(ref)]);
    else {
      const v = o.p;
      if (v === null || v === undefined) b = Buffer.from([0x00]);
      else if (v === false) b = Buffer.from([0x08]);
      else if (v === true) b = Buffer.from([0x09]);
      else if (typeof v === 'number' && Number.isInteger(v)) b = int(v);
      else if (typeof v === 'number') { b = Buffer.alloc(9); b[0] = 0x23; b.writeDoubleBE(v, 1); }
      else if (Buffer.isBuffer(v)) b = Buffer.concat([head(0x40, v.length), v]);
      else if (typeof v === 'string' && /^[\x00-\x7f]*$/.test(v)) b = Buffer.concat([head(0x50, v.length), Buffer.from(v, 'latin1')]);
      else if (typeof v === 'string') {
        const u = Buffer.from(v, 'utf16le').swap16();
        b = Buffer.concat([head(0x60, u.length / 2), u]);
      } else throw new Error(`bplist: cannot encode ${typeof v}`);
    }
    offsets.push(off);
    off += b.length;
    parts.push(b);
  }
  const table = Buffer.alloc(offsets.length * 4);
  offsets.forEach((o, i) => table.writeUInt32BE(o, i * 4));
  const trailer = Buffer.alloc(32);
  trailer[6] = 4;
  trailer[7] = refSize;
  trailer.writeBigUInt64BE(BigInt(objs.length), 8);
  trailer.writeBigUInt64BE(0n, 16);
  trailer.writeBigUInt64BE(BigInt(off), 24);
  return Buffer.concat([...parts, table, trailer]);
}

/**
 * Decodes a binary property list (the subset webinspectord sends).
 * @param {Buffer} buf
 * @returns {any}
 */
export function bplistDecode(buf) {
  if (buf.toString('latin1', 0, 8) !== 'bplist00') throw new Error('bplist: bad header');
  const t = buf.subarray(buf.length - 32);
  const offSize = t[6];
  const refSize = t[7];
  const n = Number(t.readBigUInt64BE(8));
  const top = Number(t.readBigUInt64BE(16));
  const tableOff = Number(t.readBigUInt64BE(24));
  /** @param {number} pos @param {number} size */
  const uint = (pos, size) => { let v = 0; for (let i = 0; i < size; i++) v = v * 256 + buf[pos + i]; return v; };
  const offsets = Array.from({ length: n }, (_, i) => uint(tableOff + i * offSize, offSize));
  /** @param {number} idx @param {number} depth @returns {any} */
  const obj = (idx, depth) => {
    if (depth > 64) throw new Error('bplist: nesting too deep');
    let p = offsets[idx];
    const m = buf[p];
    const hi = m >> 4;
    const lo = m & 15;
    const count = () => {
      if (lo !== 15) { p += 1; return lo; }
      const sz = 1 << (buf[p + 1] & 15);
      const v = uint(p + 2, sz);
      p += 2 + sz;
      return v;
    };
    switch (hi) {
      case 0x0: return lo === 9 ? true : lo === 8 ? false : null;
      case 0x1: return lo === 3 ? Number(buf.readBigInt64BE(p + 1)) : uint(p + 1, 1 << lo);
      case 0x2: return lo === 3 ? buf.readDoubleBE(p + 1) : buf.readFloatBE(p + 1);
      case 0x3: return buf.readDoubleBE(p + 1);
      case 0x4: { const c = count(); return Buffer.from(buf.subarray(p, p + c)); }
      case 0x5: { const c = count(); return buf.toString('latin1', p, p + c); }
      case 0x6: { const c = count(); return Buffer.from(buf.subarray(p, p + c * 2)).swap16().toString('utf16le'); }
      case 0x8: return uint(p + 1, lo + 1);
      case 0xa: { const c = count(); return Array.from({ length: c }, (_, i) => obj(uint(p + i * refSize, refSize), depth + 1)); }
      case 0xd: {
        const c = count();
        /** @type {Record<string, any>} */
        const o = {};
        for (let i = 0; i < c; i++) o[obj(uint(p + i * refSize, refSize), depth + 1)] = obj(uint(p + (c + i) * refSize, refSize), depth + 1);
        return o;
      }
      default: throw new Error(`bplist: unsupported marker 0x${m.toString(16)}`);
    }
  };
  return obj(top, 0);
}

// ---- socket discovery ------------------------------------------------------------

/**
 * Path of the webinspectord socket of one simulator (by UDID). Only that
 * device's launchd_sim is used; other booted simulators are not touched.
 * @param {string} udid
 */
export function inspectorSocket(udid) {
  const r = timed(20, 'lsof', ['-aUc', 'launchd_s', '-Fpn']);
  /** @type {Record<string, string>} */
  const byPid = {};
  let pid = '';
  for (const l of r.stdout.split('\n')) {
    if (l.startsWith('p')) pid = l.slice(1);
    else if (l.startsWith('n') && l.endsWith('/com.apple.webinspectord_sim.socket')) byPid[pid] = l.slice(1);
  }
  for (const [p, path] of Object.entries(byPid)) {
    const c = timed(10, 'ps', ['-p', p, '-o', 'command=']).stdout;
    if (c.includes(`/Devices/${udid}/`)) return path;
  }
  throw new Error(`no webinspectord socket for simulator ${udid} (is it booted?)`);
}

// ---- client --------------------------------------------------------------------------

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One inspector connection to one Safari page (tab) of the simulator.
 * Script evaluation follows the page across navigations (provisional targets).
 */
export class InspectorPage {
  /**
   * @param {string} socketPath
   * @param {{commandMs?: number}} [opt]
   */
  constructor(socketPath, opt = {}) {
    this.socketPath = socketPath;
    this.commandMs = opt.commandMs ?? 40_000;
    this.conn = randomUUID().toUpperCase();
    this.sender = randomUUID().toUpperCase();
    /** @type {import('node:net').Socket | null} */
    this.sock = null;
    this.acc = Buffer.alloc(0);
    /** @type {((m: any) => void)[]} */
    this.listeners = [];
    /** @type {Map<number, {resolve: (v: any) => void, reject: (e: Error) => void, target: string}>} */
    this.pending = new Map();
    this.nextId = 1;
    /** @type {string | null} */
    this.target = null;
    /** @type {string | null} */
    this.app = null;
    /** @type {number | null} */
    this.pageId = null;
    /** @type {Buffer[]} */
    this.chunks = [];
    this.evals = 0;
  }

  async open() {
    const sock = connect(this.socketPath);
    this.sock = sock;
    await new Promise((resolve, reject) => {
      sock.once('connect', () => resolve(undefined));
      sock.once('error', reject);
    });
    sock.on('error', () => undefined);
    sock.on('data', (d) => this.onData(d));
    sock.on('close', () => {
      for (const p of this.pending.values()) p.reject(new Error('inspector: connection closed'));
      this.pending.clear();
    });
    this.send('_rpc_reportIdentifier:', { WIRConnectionIdentifierKey: this.conn });
  }

  /** @param {Buffer} d */
  onData(d) {
    this.acc = Buffer.concat([this.acc, d]);
    while (this.acc.length >= 4) {
      const n = this.acc.readUInt32BE(0);
      if (this.acc.length < 4 + n) break;
      const msg = bplistDecode(this.acc.subarray(4, 4 + n));
      this.acc = this.acc.subarray(4 + n);
      this.onMessage(msg);
    }
  }

  /** @param {any} m */
  onMessage(m) {
    for (const l of [...this.listeners]) l(m);
    if (m.__selector !== '_rpc_applicationSentData:') return;
    const a = m.__argument ?? {};
    if (a.WIRDestinationKey !== this.sender) return;
    const type = a.WIRMessageDataTypeKey;
    this.chunks.push(Buffer.isBuffer(a.WIRMessageDataKey) ? a.WIRMessageDataKey : Buffer.from(String(a.WIRMessageDataKey)));
    if (type === 'WIRMessageDataTypeChunk') return;
    const raw = Buffer.concat(this.chunks).toString('utf8');
    this.chunks = [];
    let j;
    try { j = JSON.parse(raw); } catch { return; }
    this.onProtocol(j);
  }

  /** @param {any} j a top-level protocol message of the page connection */
  onProtocol(j) {
    if (j.method === 'Target.targetCreated') {
      const info = j.params?.targetInfo ?? {};
      if (info.type === 'page' && !info.isProvisional) this.target = info.targetId;
    } else if (j.method === 'Target.didCommitProvisionalTarget') {
      const old = j.params?.oldTargetId;
      this.target = j.params?.newTargetId ?? this.target;
      this.failTarget(old, 'navigated away');
    } else if (j.method === 'Target.targetDestroyed') {
      if (j.params?.targetId === this.target) this.target = null;
      this.failTarget(j.params?.targetId, 'target destroyed');
    } else if (j.method === 'Target.dispatchMessageFromTarget') {
      let inner;
      try { inner = JSON.parse(j.params?.message ?? ''); } catch { return; }
      const p = typeof inner.id === 'number' ? this.pending.get(inner.id) : undefined;
      if (!p) return;
      this.pending.delete(inner.id);
      if (inner.error) p.reject(new Error(`inspector: ${inner.error.message ?? JSON.stringify(inner.error)}`));
      else p.resolve(inner.result);
    }
  }

  /** @param {string | undefined} target @param {string} why */
  failTarget(target, why) {
    if (!target) return;
    for (const [id, p] of this.pending) {
      if (p.target !== target) continue;
      this.pending.delete(id);
      p.reject(new Error(`inspector: ${why}`));
    }
  }

  /** @param {string} selector @param {Record<string, unknown>} arg */
  send(selector, arg) {
    const b = bplistEncode({ __selector: selector, __argument: arg });
    const h = Buffer.alloc(4);
    h.writeUInt32BE(b.length);
    this.sock?.write(Buffer.concat([h, b]));
  }

  /**
   * Waits for a raw message matching `pred`.
   * @param {(m: any) => boolean} pred @param {number} ms @param {string} what
   */
  waitFor(pred, ms, what) {
    return new Promise((resolve, reject) => {
      /** @param {any} m */
      const l = (m) => {
        if (!pred(m)) return;
        clearTimeout(timer);
        this.listeners.splice(this.listeners.indexOf(l), 1);
        resolve(m);
      };
      const timer = setTimeout(() => {
        this.listeners.splice(this.listeners.indexOf(l), 1);
        reject(new Error(`inspector: no ${what} within ${ms / 1000} s`));
      }, ms);
      this.listeners.push(l);
    });
  }

  /**
   * Attaches to the Safari page whose URL contains `token`.
   * @param {string} bundleId @param {string} token @param {number} [ms]
   */
  async attach(bundleId, token, ms = 60_000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const apps = this.waitFor((m) => m.__selector === '_rpc_reportConnectedApplicationList:', 5000, 'application list');
      this.send('_rpc_getConnectedApplications:', { WIRConnectionIdentifierKey: this.conn });
      const list = (await apps.catch(() => null))?.__argument?.WIRApplicationDictionaryKey ?? {};
      const app = Object.values(list).find((a) => /** @type {any} */ (a).WIRApplicationBundleIdentifierKey === bundleId);
      if (app) {
        const appId = /** @type {any} */ (app).WIRApplicationIdentifierKey;
        const listing = this.waitFor((m) => m.__selector === '_rpc_applicationSentListing:' && m.__argument?.WIRApplicationIdentifierKey === appId, 5000, 'page listing');
        this.send('_rpc_forwardGetListing:', { WIRConnectionIdentifierKey: this.conn, WIRApplicationIdentifierKey: appId });
        const pages = Object.values((await listing.catch(() => null))?.__argument?.WIRListingKey ?? {});
        const page = /** @type {any} */ (pages.find((p) => String(/** @type {any} */ (p).WIRURLKey ?? '').includes(token)));
        if (page) {
          this.app = appId;
          this.pageId = page.WIRPageIdentifierKey;
          const created = this.waitFor(() => this.target !== null, 10_000, 'page target');
          this.send('_rpc_forwardSocketSetup:', { ...this.base(), WIRAutomaticallyPause: false });
          await created;
          return;
        }
      }
      await sleep(500);
    }
    throw new Error(`inspector: no ${bundleId} page with "${token}" within ${ms / 1000} s`);
  }

  base() {
    return { WIRConnectionIdentifierKey: this.conn, WIRApplicationIdentifierKey: this.app, WIRPageIdentifierKey: this.pageId, WIRSenderKey: this.sender };
  }

  /**
   * Sends one protocol command to the current page target.
   * @param {string} method @param {Record<string, unknown>} params @param {number} [ms]
   */
  async command(method, params, ms = this.commandMs) {
    const t0 = Date.now();
    while (!this.target) {
      if (Date.now() - t0 > ms) throw new Error('inspector: no page target');
      await sleep(50);
    }
    const target = this.target;
    const id = this.nextId++;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    const done = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, target });
      timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`inspector: no answer within ${ms / 1000} s for ${method}`));
      }, ms);
    });
    const message = JSON.stringify({ id, method, params });
    this.send('_rpc_forwardSocketData:', { ...this.base(), WIRSocketDataKey: Buffer.from(JSON.stringify({ id, method: 'Target.sendMessageToTarget', params: { targetId: target, message } })) });
    try {
      return await done;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Evaluates an expression or statement list and returns its value (by value).
   * @param {string} expression @param {number} [ms]
   */
  async evaluate(expression, ms) {
    const r = await this.command('Runtime.evaluate', { expression, returnByValue: true }, ms);
    if (r?.wasThrown) throw new Error(`script threw: ${r.result?.description ?? JSON.stringify(r.result?.value)}`);
    return r?.result?.value;
  }

  /**
   * Evaluates an expression and awaits its value if it is a promise. WebKit's
   * Runtime.evaluate has no awaitPromise, so the value is wrapped in a promise
   * and awaited with Runtime.awaitPromise.
   * @param {string} expression @param {number} [ms]
   */
  async evaluateAsync(expression, ms) {
    const p = await this.command('Runtime.evaluate', { expression: `Promise.resolve(${expression}\n)`, objectGroup: 'rig', returnByValue: false }, ms);
    if (p?.wasThrown) throw new Error(`script threw: ${p.result?.description ?? JSON.stringify(p.result?.value)}`);
    const id = p?.result?.objectId;
    if (!id) throw new Error('inspector: evaluation returned no promise');
    const r = await this.command('Runtime.awaitPromise', { promiseObjectId: id, returnByValue: true }, ms);
    if (++this.evals % 100 === 0) await this.command('Runtime.releaseObjectGroup', { objectGroup: 'rig' }, ms).catch(() => undefined);
    if (r?.wasThrown) throw new Error(`script threw: ${r.result?.description ?? JSON.stringify(r.result?.value)}`);
    return r?.result?.value;
  }

  close() {
    if (this.app && this.pageId !== null) this.send('_rpc_forwardDidClose:', this.base());
    this.sock?.end();
    this.sock?.destroy();
  }
}
