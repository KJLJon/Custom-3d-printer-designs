/**
 * design-registry.js
 *
 * Master list of all available designs.
 * To add a new design: import its config and add it to the array.
 * The viewer, index page, and exporter all pull from this list.
 */

import basketballJersey from '../designs/basketball-jersey/config.js';

// ── Add new designs here ────────────────────────────────────────────────────
export const designs = [
  basketballJersey,
];
