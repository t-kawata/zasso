// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C011
/**
 * OKF check contract and report closure.
 *
 * checks.json is the single source of the check set. The verifier never keeps a
 * second list.
 */

import fs from 'node:fs';
import { createHash } from 'node:crypto';

const CONTRACT = JSON.parse(fs.readFileSync(new URL('./checks.json', import.meta.url), 'utf8'));

export const CHECK_SET_VERSION = CONTRACT.check_set_version;
export const CHECK_CONTRACT = Object.freeze(CONTRACT.checks ?? []);
export const VERIFIER_CHECKS = Object.freeze(CHECK_CONTRACT.map((check) => check.name));

export function resolveMode({ mode, sourceRoot }) {
  if (mode === 'dev' || mode === 'installed') return mode;
  return sourceRoot ? 'dev' : 'installed';
}

export function requiredChecks(mode) {
  return CHECK_CONTRACT.filter((check) => check.mode === 'both' || check.mode === mode).map((check) => check.name);
}

export function notRun(check) {
  return {
    status: 'not_run',
    evidence: `${check.mode}-only check; ${check.mode === 'installed' ? 'installed' : 'dev'} mode does not run it`,
    codes: [],
  };
}

export function closureSha256({ mode, checks }) {
  return createHash('sha256').update(JSON.stringify({
    mode,
    check_set_version: CHECK_SET_VERSION,
    checks: CHECK_CONTRACT.map((check) => [check.name, checks[check.name]?.status ?? 'not_run']),
  })).digest('hex');
}
