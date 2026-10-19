// Area modules, applied in order after the playground portfolio is loaded. Each
// exports apply(ctx): add rows to new tables, patch the sandbox rows it owns.
import * as people from "./people.mjs";
import * as maintenance from "./maintenance.mjs";
import * as accounting from "./accounting.mjs";
import * as workspace from "./workspace.mjs";

export const AREAS = [people, maintenance, accounting, workspace];
