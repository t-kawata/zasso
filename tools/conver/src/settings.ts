// settings.ts — build-time constants.
//
// scripts/build-conver.mjs replaces __CONVER_VERSION__ with the version it
// prepared from VERSION.json. tsc output (the unit tests) has no such define,
// so the fallback keeps the module loadable; the shipped bundle never uses it.
declare const __CONVER_VERSION__: string | undefined;

export const VERSION =
  typeof __CONVER_VERSION__ === "string" ? __CONVER_VERSION__ : "v0.0.0";
