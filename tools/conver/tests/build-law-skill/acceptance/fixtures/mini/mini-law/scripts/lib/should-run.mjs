import { matchUnits } from './units.mjs';

export function shouldRun({ paths, profile, map }) {
  if (!profile?.profiles?.rust) return { run: false, reason: 'not-rust', units: [] };
  const matched = matchUnits(paths, map);
  if (matched.units.length === 0) return { run: false, reason: 'docs-only', units: [] };
  return { run: true, reason: 'interface-change', units: matched.units.map((unit) => unit.id) };
}

export function detectUnledgered({ ledger, changed, map }) {
  const known = new Set(ledger ?? []);
  return (changed ?? []).filter((path) => !known.has(path) && matchUnits([path], map).units.length > 0);
}
