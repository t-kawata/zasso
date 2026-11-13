import { readFileSync } from 'node:fs';
import { parseToml } from './toml.mjs';

export function loadProfile(path) {
  return parseToml(readFileSync(path, 'utf8'));
}

export function loadWorkspaceMap(path) {
  const document = parseToml(readFileSync(path, 'utf8'));
  return { units: document.unit ?? [] };
}

export function matchUnits(paths, map) {
  const units = [];
  const unmapped = [];

  for (const path of paths) {
    const matched = (map.units ?? []).filter((unit) =>
      (unit.paths ?? []).some((pattern) => matchGlob(pattern, path)));
    if (matched.length === 0) unmapped.push(path);
    for (const unit of matched) {
      if (!units.some((existing) => existing.id === unit.id)) units.push(unit);
    }
  }

  return { units, unmapped };
}

export function matchGlob(pattern, path) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp('^' + escaped + '$').test(path);
}
