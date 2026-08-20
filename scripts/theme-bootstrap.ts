/**
 * Writes the theme bootstrap to `public/theme.js`.
 *
 * Generated rather than hand-maintained so it cannot drift from the storage
 * key and shape the store actually uses.
 */
import { THEME_BOOTSTRAP_SOURCE } from "../src/stores/preferences.ts";

const target = new URL("../public/theme.js", import.meta.url);
await Bun.write(target, `${THEME_BOOTSTRAP_SOURCE}\n`);
console.log(`wrote ${target.pathname}`);
