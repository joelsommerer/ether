// Opens a driver for one of the five targets (PHASE-1.md D7) and tears it
// down again. Mobile targets bring their device up through tools/devices.mjs
// and shut it down afterwards if this process booted it.

import { androidChrome, androidDown, androidSerial, androidUnforward, androidUp, etherSims, iosDown, iosUp } from '../../tools/devices.mjs';
import { androidDriver, desktopDriver } from './drivers/playwright.mjs';
import { iosDriver } from './drivers/ios.mjs';
import { iosDriver as iosWebDriver } from './drivers/webdriver.mjs';

export const DESKTOP = ['chromium', 'firefox', 'webkit'];
export const MOBILE = ['ios-safari', 'android-chrome'];
export const ALL = [...DESKTOP, ...MOBILE];
const CDP_PORT = Number(process.env.ETHER_CDP_PORT ?? 9333);

/** @param {string} spec all|desktop|mobile|t1,t2 */
export function parseTargets(spec) {
  if (spec === 'all') return ALL;
  if (spec === 'desktop') return DESKTOP;
  if (spec === 'mobile') return MOBILE;
  const list = spec.split(',').map((s) => s.trim()).filter(Boolean);
  for (const t of list) if (!ALL.includes(t)) throw new Error(`unknown target ${t}`);
  return list;
}

/**
 * @param {string} target
 * @param {{port: number, base: string}} server
 * @param {{keepDevices?: boolean}} [opt]
 * @returns {Promise<{driver: any, close: () => Promise<void>, notes: string[]}>}
 */
export async function openTarget(target, server, opt = {}) {
  if (DESKTOP.includes(target)) {
    const driver = await desktopDriver(/** @type {'chromium'|'firefox'|'webkit'} */ (target));
    return { driver, notes: [], close: () => driver.close() };
  }
  if (target === 'ios-safari') {
    const wasBooted = etherSims()[0]?.state === 'Booted';
    iosUp();
    let driver;
    try {
      // ETHER_IOS_DRIVER=webdriver selects the safaridriver client, whose key
      // input inserts no text (ADR 0004); kept to reproduce that finding.
      driver = process.env.ETHER_IOS_DRIVER === 'webdriver' ? await iosWebDriver() : await iosDriver(server);
    } catch (e) {
      if (!wasBooted && !opt.keepDevices) iosDown();
      throw e;
    }
    return {
      driver,
      notes: [wasBooted ? 'simulator was already booted' : 'simulator booted by the rig'],
      close: async () => {
        await driver.close();
        if (!wasBooted && !opt.keepDevices) iosDown();
      },
    };
  }
  if (target === 'android-chrome') {
    const wasRunning = !!androidSerial();
    await androidUp();
    let driver;
    try {
      await androidChrome(CDP_PORT, server.port);
      driver = await androidDriver(CDP_PORT);
    } catch (e) {
      androidUnforward(CDP_PORT, server.port);
      if (!wasRunning && !opt.keepDevices) await androidDown();
      throw e;
    }
    return {
      driver,
      notes: [wasRunning ? 'emulator was already running' : 'emulator started by the rig'],
      close: async () => {
        await driver.close();
        androidUnforward(CDP_PORT, server.port);
        if (!wasRunning && !opt.keepDevices) await androidDown();
      },
    };
  }
  throw new Error(`unknown target ${target}`);
}
