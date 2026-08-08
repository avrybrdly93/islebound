import { attachCanvas } from '@render/canvas';
import { mountOverlay } from '@ui/mountOverlay';
import '@ui/styles/base.css';

/**
 * Entry point (BL-003).
 *
 * `05_CODEBASE_STRUCTURE.md` §2 describes this file as "entry: bootstraps Game,
 * mounts React root". There is no `Game.ts` yet — the composition root arrives
 * with the loop (BL-008) and the renderer (BL-011) — so today this is the app
 * shell and nothing more: a canvas that stays the right size, and an empty
 * React overlay above it.
 *
 * The ids are string literals in exactly two places, here and `index.html`, and
 * both helpers throw with a message naming the id when they disagree.
 */
const CANVAS_ID = 'game-canvas';
const OVERLAY_ID = 'ui-overlay';

const canvasHandle = attachCanvas(CANVAS_ID);
const overlayRoot = mountOverlay(OVERLAY_ID);

/*
 * Vite's HMR replaces this module's *exports* without reloading the page, but
 * the DOM side effects above — a ResizeObserver, a media-query listener, a
 * React root — outlive the module instance that created them. Without this
 * teardown an edit to this file leaves the previous generation's observers
 * attached and a second React root fighting for the same container, which
 * shows up as an overlay that renders twice and a canvas that resizes twice
 * per frame. `import.meta.hot` is undefined in a production build and the
 * whole block is dropped.
 */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    canvasHandle.dispose();
    overlayRoot.unmount();
  });
}
