// Static check (PHASE-1.md section 11): every simctl / adb / emulator /
// avdmanager invocation in tools/ and test/ goes through `timed()` from
// test/rig/sh.mjs. The only exception is the emulator daemon itself, which is
// started inside `emulatorWatchdog` (tools/devices.mjs) and killed when it has
// not booted within its deadline.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** A device binary named as a command (string start) or through its path constant. */
const DEVICE = /['"`](?:xcrun|adb|emulator|avdmanager)\b|\bsimctl\b|\b(?:ADB|EMULATOR|AVDMANAGER)\b/;
/** A process start or the timed wrapper. */
const CALL = /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork|timed)\s*\(/;
const RAW = /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(/;
const FUNC = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/;

/**
 * Lines that start a device tool without a timeout.
 * @param {{file: string, text: string}[]} sources
 * @returns {{file: string, line: number, text: string}[]}
 */
export function untimedDeviceCalls(sources) {
  /** @type {{file: string, line: number, text: string}[]} */
  const bad = [];
  for (const { file, text } of sources) {
    let fn = '';
    text.split('\n').forEach((l, k) => {
      const f = FUNC.exec(l);
      if (f) fn = f[1];
      if (/^\s*(?:\/\/|\*|\/\*)/.test(l)) return;
      // A regex .exec() is not a process start.
      const code = l.replace(/\.\s*exec\s*\(/g, '(');
      if (!DEVICE.test(code) || !CALL.test(code)) return;
      const raw = RAW.test(code);
      if (raw && fn === 'emulatorWatchdog') return;
      if (raw) bad.push({ file, line: k + 1, text: l.trim() });
    });
  }
  return bad;
}

/**
 * Source files (.js, .mjs) under the given directories.
 * @param {string} root @param {string[]} dirs
 */
export function sourcesUnder(root, dirs) {
  /** @type {{file: string, text: string}[]} */
  const out = [];
  /** @param {string} d */
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n.startsWith('.')) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(?:m?js)$/.test(n)) out.push({ file: relative(root, p), text: readFileSync(p, 'utf8') });
    }
  };
  for (const d of dirs) walk(join(root, d));
  return out;
}
