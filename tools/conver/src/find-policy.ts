// find-policy.ts — the find-round default shared by CLI parsing and the loop.
//
// The CLI supplies this value on every run, so a copy kept in cli.ts would
// silently win over the loop's fallback the moment the two drifted. One
// definition keeps the documented default and the executed default the same.
/** Default maximum find executions in one package. */
export const MAX_FIND_ROUNDS = 5;
