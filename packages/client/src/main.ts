import { createLogger, type LogRecord } from '@core/Logger';
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

/**
 * The application logger (BL-010). Constructed here because this is the only
 * place that may decide a console exists — `core/Logger.ts` takes its sink
 * rather than choosing one, and its ring is what `30` §8 attaches to a crash
 * report, so it is built in production too.
 *
 * `minLevel` folds to the string literal `'info'` in a production build, so
 * the level comparison that drops a `debug` there costs nothing and needs no
 * separate switch.
 */
const log = createLogger({
  minLevel: import.meta.env.DEV ? 'trace' : 'info',
  sink: consoleSink,
  now: () => Date.now(),
});

/** Writes a record to the browser console at its matching severity. */
function consoleSink(entry: LogRecord): void {
  const where = entry.tag === '' ? '' : `[${entry.tag}] `;
  const line = `${where}${entry.message}`;
  if (entry.level === 'error') console.error(line, entry.data ?? '');
  else if (entry.level === 'warn') console.warn(line, entry.data ?? '');
  else console.log(line, entry.data ?? '');
}

const canvasHandle = attachCanvas(CANVAS_ID);
const overlayRoot = mountOverlay(OVERLAY_ID);

/*
 * BL-010 criterion 2. These are real boot diagnostics — the drawing-buffer
 * size and the pixel ratio are the two numbers every "why does it look
 * blurry" question starts from — and they are development-only, so they sit
 * inside a guard the bundler folds away.
 *
 * `import.meta.env.DEV` is `false` in a production build, so Rollup drops the
 * whole block including these message literals. That is exactly the shape the
 * `import.meta.hot` block below already uses, and it is what
 * `tools/check-debug-stripping.test.ts` reads: that file parses the message
 * literals out of THIS block and requires them present in a development
 * bundle and absent from a production one. Deleting the block does not make
 * that test pass — it fails with "no dev-only log call found", because a grep
 * over a bundle that never contained a debug call proves nothing.
 */
if (import.meta.env.DEV) {
  const boot = log.tag('boot');
  boot.debug('canvas attached to drawing buffer', {
    width: canvasHandle.canvas.width,
    height: canvasHandle.canvas.height,
    devicePixelRatio: window.devicePixelRatio,
  });
  boot.debug('react overlay mounted', { element: OVERLAY_ID });
}

log.info('client booted');

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
