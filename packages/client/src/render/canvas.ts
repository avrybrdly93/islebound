/**
 * The game canvas and its resize handling (BL-003).
 *
 * There is deliberately no three.js here. `08_THREEJS_ARCHITECTURE.md` §9 owns
 * the `WebGLRenderer` and that is BL-011; this module owns the one thing the
 * renderer will need from the DOM and nothing else — a canvas whose drawing
 * buffer matches its on-screen size at the current device pixel ratio.
 */

/**
 * Upper bound on the device pixel ratio the drawing buffer is sized for.
 *
 * A 3× phone or a 2× retina panel at 1080p asks for 4–9× the fragment work of
 * a 1× buffer for a difference most people cannot see on a moving 3D scene, and
 * `28_PERFORMANCE_OPTIMIZATION.md`'s budget is 10.5 ms of GPU at 1080p. `08`
 * §9 already caps the renderer at `Math.min(devicePixelRatio, capabilities.maxPixelRatio)`
 * with a note that integrated GPUs get 1.5; this is the same cap, applied to
 * the buffer itself so the two cannot disagree.
 *
 * It is a constant here rather than a capability query because capability
 * detection is BL-012. When that lands, this becomes its default rather than
 * its answer.
 */
export const MAX_PIXEL_RATIO = 2;

/** A drawing-buffer size in physical pixels. */
export interface DrawingBufferSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The drawing-buffer size for a CSS box at a given device pixel ratio.
 *
 * Pure, and exported separately from {@link resizeCanvasToDisplaySize}, because
 * every interesting case here is arithmetic that a DOM-driven test would have
 * to stage an entire browser to reach: a fractional ratio, a ratio above the
 * cap, a zero-height box during layout, a non-finite ratio from a headless
 * environment.
 *
 * **Rounding is `Math.round`, and the floor of 1 is not paranoia.** A CSS box
 * of `800.5 × 600.5` at ratio 1.25 is `1000.625 × 750.625` physical pixels; a
 * buffer has to be an integer, and rounding rather than flooring keeps the
 * error under half a pixel instead of up to a whole one. The floor matters
 * because a canvas is legally `0 × 0` while its container is still laying out,
 * and a zero-sized drawing buffer makes `getContext('webgl2')` return a context
 * that fails its first draw — a confusing failure a long way from its cause.
 */
export function computeDrawingBufferSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  maxPixelRatio: number = MAX_PIXEL_RATIO,
): DrawingBufferSize {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const capped = Math.min(ratio, maxPixelRatio);
  return {
    width: Math.max(1, Math.round(cssWidth * capped)),
    height: Math.max(1, Math.round(cssHeight * capped)),
  };
}

/**
 * Size `canvas`'s drawing buffer to its current CSS box, and report whether
 * anything changed.
 *
 * The return value is what makes this callable every frame: assigning to
 * `canvas.width` resets the entire drawing buffer even when the value is
 * unchanged, so a caller that writes unconditionally clears the screen once per
 * frame. Callers act on `true` and ignore `false`.
 *
 * CSS size comes from `getBoundingClientRect`, not `clientWidth`, because the
 * former is fractional. The layout box of a canvas in a flex or grid container
 * is very often not an integer, and reading the rounded value would make the
 * buffer disagree with the box by up to a pixel — visible as a shimmering edge
 * on a full-window canvas.
 */
export function resizeCanvasToDisplaySize(
  canvas: HTMLCanvasElement,
  devicePixelRatio: number,
  maxPixelRatio: number = MAX_PIXEL_RATIO,
): boolean {
  const rect = canvas.getBoundingClientRect();
  const size = computeDrawingBufferSize(rect.width, rect.height, devicePixelRatio, maxPixelRatio);
  if (canvas.width === size.width && canvas.height === size.height) return false;
  canvas.width = size.width;
  canvas.height = size.height;
  return true;
}

/** A running canvas, and the way to stop watching it. */
export interface CanvasHandle {
  readonly canvas: HTMLCanvasElement;
  /** Detach every listener. Idempotent. */
  dispose(): void;
}

/**
 * Find the canvas `index.html` declares and keep its drawing buffer in step
 * with its on-screen size.
 *
 * **Two listeners, not one, and the second is the one that gets forgotten.** A
 * `ResizeObserver` catches the element's box changing, which covers window
 * resizes and layout changes. It does *not* fire when the device pixel ratio
 * changes and the box does not — dragging the window between a retina and a
 * non-retina display, or the user changing the browser zoom. The documented way
 * to observe that is a `matchMedia('(resolution: Xdppx)')` query, which
 * resolves only for the *current* ratio, so the listener has to be re-armed
 * against the new ratio each time it fires. Hence {@link watchPixelRatio}.
 *
 * @param elementId The canvas element's `id`.
 */
export function attachCanvas(elementId: string): CanvasHandle {
  const element = document.getElementById(elementId);
  if (!(element instanceof HTMLCanvasElement)) {
    throw new Error(
      `attachCanvas: expected #${elementId} to be a <canvas>, found ` +
        `${element === null ? 'nothing' : element.tagName.toLowerCase()}. ` +
        'index.html and the bootstrap in main.ts have to agree on the id.',
    );
  }

  const sync = (): void => {
    resizeCanvasToDisplaySize(element, window.devicePixelRatio);
  };

  const observer = new ResizeObserver(sync);
  observer.observe(element);
  const stopWatchingPixelRatio = watchPixelRatio(sync);
  sync();

  let disposed = false;
  return {
    canvas: element,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      stopWatchingPixelRatio();
    },
  };
}

/**
 * Call `onChange` whenever `window.devicePixelRatio` changes, and return a
 * function that stops watching.
 *
 * `matchMedia('(resolution: 2dppx)')` matches only while the ratio *is* 2, so
 * one query cannot watch for arbitrary future changes: each time it flips, the
 * next query has to be built from the new ratio. The recursion is bounded by
 * how often a human drags a window between monitors, and each generation
 * replaces the last rather than accumulating.
 */
function watchPixelRatio(onChange: () => void): () => void {
  let query: MediaQueryList | null = null;
  let disposed = false;

  const arm = (): void => {
    if (disposed) return;
    query = window.matchMedia(`(resolution: ${String(window.devicePixelRatio)}dppx)`);
    query.addEventListener('change', handle, { once: true });
  };

  const handle = (): void => {
    onChange();
    arm();
  };

  arm();
  return (): void => {
    disposed = true;
    query?.removeEventListener('change', handle);
    query = null;
  };
}
