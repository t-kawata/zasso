// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { ROLE_VALUES } from './constants.mjs';
import { failRevision } from './errors.mjs';

const NORMATIVE_PATTERN = /\b(?:MUST(?:\s+NOT)?|SHALL(?:\s+NOT)?|REQUIRED|PROHIBITED|NEVER|SHOULD(?:\s+NOT)?)\b|必須|禁止|しなければならない/;

export function classifyDocumentRole({ skillName, adapter, text, explicitRole = null }) {
  if (explicitRole) return explicitRole;
  if (adapter === 'law') return isNormative(text) ? 'law-revision' : 'NO_NORMATIVE_CHANGE';
  if (adapter === 'okf') return 'okf-reference';
  return 'unclear';
}

export function assertRole({ role, adapter }) {
  if (!ROLE_VALUES.includes(role)) {
    failRevision('REVISION_ROLE_INVALID', `unknown document role: ${role}`, { target: role });
  }
  if (role === 'mixed') {
    failRevision('UPDATE_ROLE_MIXED_UNSUPPORTED', 'a mixed law/OKF update must run as two invocations', { target: role });
  }
  const allowed = adapter === 'law'
    ? new Set(['law-revision', 'build-source', 'unclear'])
    : new Set(['okf-reference', 'okf-update', 'build-source', 'unclear']);
  if (!allowed.has(role)) {
    failRevision('UPDATE_ROLE_MISMATCH', `role ${role} does not match adapter ${adapter}`, { target: role });
  }
  return true;
}

export function isNormative(text) {
  return NORMATIVE_PATTERN.test(String(text ?? ''));
}
