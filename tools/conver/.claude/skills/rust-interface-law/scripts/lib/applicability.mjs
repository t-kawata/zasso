import { matchGlob } from './units.mjs';

/**
 * Evaluate the shipped applicability record against changed paths and units.
 *
 * The record is the single source of truth: a missing role or a narrowed role
 * list changes the result without editing this file.
 */
export function evaluateApplicability({ record, paths = [], units = [], includeShared = false }) {
  const applies = record?.applies ?? {};
  const patterns = applies.paths ?? [];
  const roles = applies.roles ?? [];
  const sharedRoles = applies.sharedRoles ?? [];
  const activeRoles = includeShared ? [...roles, ...sharedRoles] : roles;
  const pathMatched = paths.some((path) => patterns.some((pattern) => matchGlob(pattern, path)));

  if (!pathMatched) return { applies: false, matched: [], applicable: [] };

  if (applies.discovery === 'workspace-units') {
    const matched = units.filter((unit) =>
      (unit.paths ?? []).some((pattern) => paths.some((path) => matchGlob(pattern, path))));
    const applicable = activeRoles.length > 0
      ? matched.filter((unit) => activeRoles.includes(unit.role))
      : matched;
    return { applies: applicable.length > 0, matched, applicable };
  }

  const matched = [{ id: 'path', role: 'path', paths }];
  return { applies: true, matched, applicable: matched };
}
