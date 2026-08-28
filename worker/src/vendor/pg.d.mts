// Types for the esbuild-bundled node-postgres in pg.mjs (see `npm run bundle:pg`).
import type * as pgTypes from "pg";
declare const pg: { Client: typeof pgTypes.Client; Pool: typeof pgTypes.Pool };
export default pg;
