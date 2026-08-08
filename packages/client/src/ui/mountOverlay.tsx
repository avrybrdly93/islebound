import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import App from '@ui/App';

/**
 * Mount the React overlay into the container `index.html` declares (BL-003).
 *
 * **`StrictMode` is on, and it is on now rather than later on purpose.** It
 * double-invokes effects in development, which is how a subscription that never
 * unsubscribes announces itself. This overlay will grow subscriptions to sim
 * events (`04` §6), and the cheapest moment to have that check running is
 * before the first one is written.
 *
 * The overlay's `pointer-events: none` lives in the stylesheet, not here, so
 * that a screen which needs to be clickable re-enables it on its own element
 * (`pointer-events: auto`) rather than by mutating a global. That is the whole
 * mechanism behind "the overlay does not intercept canvas input": the default
 * is transparent-to-input, and interactivity is opt-in per element.
 *
 * @param elementId The overlay container's `id`.
 */
export function mountOverlay(elementId: string): Root {
  const container = document.getElementById(elementId);
  if (container === null) {
    throw new Error(
      `mountOverlay: no element with id "${elementId}". index.html and the ` +
        'bootstrap in main.ts have to agree on the id.',
    );
  }

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  return root;
}
