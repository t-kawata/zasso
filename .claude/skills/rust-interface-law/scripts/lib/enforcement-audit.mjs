// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
/**
 * Audit every surface that names the law knowledge layer.
 *
 * The audit is read-only. It proves that no stale private-format phrase
 * survives and that the gate/attest mechanism is still named where the
 * pipeline depends on it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const STALE_PATTERNS = [
  [/Never read\s+`?okf\/`?\s+directly/i, 'NEVER_READ_OKF'],
  [/okf\/source\.md/i, 'OKF_SOURCE_MD'],
  [/okf\/source\.baseline\.md/i, 'OKF_SOURCE_BASELINE'],
  [/okf\/nodes/i, 'OKF_NODES'],
  [/spec_version:\s*0\.3\.2/i, 'KEY_VALUE_LOG'],
];

const SURFACES = [
  '.claude/commands/build-law-skill.md',
  '.claude/commands/build-okf-skill.md',
  '.claude/commands/start-ticket.md',
  '.claude/commands/review-ticket.md',
  '.claude/commands/resolve-ticket.md',
  'CLAUDE.md',
  '.claude/CLAUDE.md',
  '.claude/skills/rust-interface-law/SKILL.md',
  '.claude/skills/rust-interface-law/DESIGN.md',
  '.claude/skills/rust-interface-law/IMPLEMENTATION-LEFTOVERS.md',
  '.claude/skills/rust-interface-law/install.js',
  '.claude/scripts/amend-rfc-up/verify-law-skill.mjs',
  '.claude/scripts/amend-rfc-up/law-verify/checks.json',
];

const GATE_ATTEST_REQUIRED = new Set([
  '.claude/commands/build-law-skill.md',
  '.claude/commands/start-ticket.md',
  '.claude/commands/review-ticket.md',
  '.claude/commands/resolve-ticket.md',
  'CLAUDE.md',
  '.claude/CLAUDE.md',
  '.claude/skills/rust-interface-law/SKILL.md',
]);

export function auditEnforcementSurfaces({ root }) {
  const surfaces = [];
  const findings = [];
  for (const relativePath of SURFACES) {
    const absolute = join(root, relativePath);
    if (!existsSync(absolute)) {
      findings.push({ code: 'SURFACE_MISSING', file: relativePath });
      continue;
    }
    const text = readFileSync(absolute, 'utf8');
    const stale = STALE_PATTERNS.filter(([pattern]) => pattern.test(text)).map(([, code]) => code);
    for (const code of stale) findings.push({ code: 'STALE_OKF_PHRASE', file: relativePath, detail: code });
    const gateAttestPreserved = !GATE_ATTEST_REQUIRED.has(relativePath)
      || (/\bgate\b/.test(text) && /\battest\b/i.test(text));
    if (!gateAttestPreserved) findings.push({ code: 'GATE_ATTEST_REMOVED', file: relativePath });
    surfaces.push({ file: relativePath, stale, gateAttestPreserved });
  }
  return { surfaces, findings };
}
