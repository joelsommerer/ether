import { VERSION } from './version.js';

/**
 * Public read-only API of the document (see docs/SPEC.md once written).
 * Phase 1 shell: only the engine version exists so far.
 * @typedef {{readonly version: string}} WebDoc
 */

/** @type {WebDoc} */
const webdoc = Object.freeze({ version: VERSION });

Object.defineProperty(window, 'webdoc', { value: webdoc, enumerable: true });
