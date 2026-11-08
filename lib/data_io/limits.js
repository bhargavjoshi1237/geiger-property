// Import limits shared by the wizard and the server (PLAT-03): rows per staging call (well under the 4.5 MB body limit) and per job.
export const STAGE_CHUNK = 500;
export const MAX_ROWS_PER_IMPORT = 20000;
