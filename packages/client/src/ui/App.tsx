/**
 * The React overlay root (BL-003).
 *
 * `05_CODEBASE_STRUCTURE.md` §2 describes this file as "overlay root, routes
 * between screens". There are no screens yet — the HUD is BL-013 and later, and
 * the screens are Phase 2+ — so it renders nothing. It exists at this point so
 * the DOM overlay, its pointer-events behaviour and its HMR boundary are real
 * and verified before anything is asked to live inside it.
 *
 * **It renders `null`, not an empty fragment with a wrapper div.** The overlay
 * container in `index.html` is already the positioned, `pointer-events: none`
 * box; a second wrapper here would be a place for a future screen to
 * accidentally re-enable pointer events for everything.
 */
export default function App(): null {
  return null;
}
