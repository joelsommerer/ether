// Every simctl / adb / emulator / avdmanager call of the rig goes through
// `timed` (PHASE-1.md section 11: every device call has a timeout). The unit
// test test/unit/rig-timeouts.test.js greps tools/ and test/ to enforce it.

import { spawnSync } from 'node:child_process';

/**
 * Runs a command synchronously and kills it (SIGKILL) after `seconds`.
 * @param {number} seconds
 * @param {string} cmd
 * @param {string[]} args
 * @param {{input?: string, env?: Record<string, string | undefined>}} [opts]
 * @returns {{status: number | null, output: string, stdout: string, timedOut: boolean}}
 */
export function timed(seconds, cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: seconds * 1000,
    killSignal: 'SIGKILL',
    input: opts.input,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  const timedOut = /** @type {any} */ (r.error)?.code === 'ETIMEDOUT';
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    output: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}`.trim(),
    timedOut,
  };
}
