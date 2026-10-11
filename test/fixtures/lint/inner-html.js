// Deliberately forbidden: tools/lint.mjs must reject this file.
/** @param {HTMLElement} el @param {string} x */
export function render(el, x) {
  el.innerHTML = x;
}
