/** Run-wide tuning constants. */


export const MAX_WAVES = 5;

/** Largest simulation step; longer frames are split into several steps */
export const MAX_STEP_SECONDS = 0.02;

/** Longest frame simulated in full (beyond this, e.g. after a tab switch, time is dropped) */
export const MAX_FRAME_SECONDS = 0.1;

export const PREP_SECONDS = 15;
