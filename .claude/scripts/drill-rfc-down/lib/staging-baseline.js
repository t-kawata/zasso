// PX-365 @verifies C003
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The digest recorded at stage time and compared at approve time. */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
export function digestFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** The baseline record beside a staging copy. */
export function baselinePathOf(stagingPath) {
  return `${stagingPath}.baseline.json`;
}

/** @param {string} stagingPath */
export function readStagingBaseline(stagingPath) {
  const baselinePath = baselinePathOf(stagingPath);
  if (!existsSync(baselinePath)) return null;
  try {
    return JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {string} stagingPath @param {string} realPath @param {object} extras */
export function writeStagingBaseline(stagingPath, realPath, extras = {}) {
  const baseline = {
    sourcePath: realPath,
    digest: digestFile(realPath),
    stagedAt: new Date().toISOString(),
    ...extras,
  };
  mkdirSync(dirname(stagingPath), { recursive: true });
  writeFileSync(baselinePathOf(stagingPath), JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  return baseline;
}

/** Resume a matching staging copy, or discard it and copy the real artifact. */
export function prepareStaging(realPath, stagingPath, extras = {}, options = {}) {
  const existing = readStagingBaseline(stagingPath);
  const valid = typeof options.isValid === 'function' ? options.isValid(stagingPath) : true;
  if (existsSync(stagingPath) && existing !== null && existing.digest === digestFile(realPath) && valid) {
    return { resumed: true, discarded: false, baseline: existing };
  }
  const discarded = existsSync(stagingPath);
  if (discarded) rmSync(stagingPath, { force: true });
  copyFileSync(realPath, stagingPath);
  return { resumed: false, discarded, baseline: writeStagingBaseline(stagingPath, realPath, extras) };
}

/** Compare the real artifact with the digest recorded at stage time. */
export function assertStagingBaseline(stagingPath, realPath) {
  const baseline = readStagingBaseline(stagingPath);
  if (baseline === null) {
    return {
      ok: false,
      code: 'STALE_STAGING_BASELINE',
      message: `the staging copy ${stagingPath} carries no baseline record`,
      action: `re-stage with the current ${realPath}, re-apply the intended delta, then approve`,
    };
  }
  const current = digestFile(realPath);
  if (baseline.digest !== current) {
    return {
      ok: false,
      code: 'STALE_STAGING_BASELINE',
      message: `${realPath} changed since staging (${baseline.digest} -> ${current})`,
      action: `discard the stale staging, re-stage from the current ${realPath}, re-apply the intended delta, then approve`,
    };
  }
  return { ok: true, baseline };
}
