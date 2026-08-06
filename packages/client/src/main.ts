import { CONTENT_MODULE } from '@content/_scaffold';
import { CORE_MODULE } from '@core/_scaffold';
import { RENDER_MODULE } from '@render/_scaffold';
import { SIM_MODULE } from '@sim/_scaffold';
import { UI_MODULE } from '@ui/_scaffold';

// Scaffold-only entry point (BL-001): proves the five path aliases resolve
// through both tsc and Vite. BL-003 replaces this with the real bootstrap
// (canvas, resize handling, React overlay root).
console.log('Halcyon Isle scaffold booted', {
  CORE_MODULE,
  SIM_MODULE,
  RENDER_MODULE,
  UI_MODULE,
  CONTENT_MODULE,
});
