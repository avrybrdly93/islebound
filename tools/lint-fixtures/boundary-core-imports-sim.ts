// FIXTURE — deliberately violates the 04 §5 import-direction table
// (boundaries/element-types): core may import nothing. Checked with an
// overridden filename so it is treated as living under
// packages/client/src/core/. Linted only by tools/check-lint-rules.mjs.
import { SIM_SCAFFOLD } from '../sim/_scaffold';

export const echoed = SIM_SCAFFOLD;
