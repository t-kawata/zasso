// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
// @verifies C005
// C005 precondition: A built okf skill is verified with source/coverage.json present, absent, or nonzero.
// C005 postcondition: Zero yields machine_verified; absent yields COVERAGE_MISSING; nonzero yields COVERAGE_GAP.
// C005 invariant: Coverage is proven from the written ledger, not inferred from the inventory alone.
/**
 * PX-429 — the coverage check must read the source coverage ledger.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCoverage } from '../../../.claude/scripts/amend-rfc-up/okf-verify/checks-artifact.mjs';
import { buildMiniSkillV2 } from '../lib/fixture-v2.mjs';

// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
function ledgerPath(skill) {
  return join(skill.skillDir, 'source/coverage.json');
}

test('C005: a zero-unmapped ledger is machine verified', async () => {
  const skill = await buildMiniSkillV2();
  try {
    const result = await checkCoverage({ skillPath: skill.skillDir });
    assert.equal(result.status, 'machine_verified', JSON.stringify(result));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('C005: a nonzero unmapped line is COVERAGE_GAP', async () => {
  const skill = await buildMiniSkillV2();
  try {
    const ledger = JSON.parse(readFileSync(ledgerPath(skill), 'utf8'));
    ledger.counts.unmappedLines = 1;
    writeFileSync(ledgerPath(skill), JSON.stringify(ledger));
    const result = await checkCoverage({ skillPath: skill.skillDir });
    assert.ok(result.codes.includes('COVERAGE_GAP'), JSON.stringify(result));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('C005: a missing ledger is COVERAGE_MISSING', async () => {
  const skill = await buildMiniSkillV2();
  try {
    rmSync(ledgerPath(skill));
    const result = await checkCoverage({ skillPath: skill.skillDir });
    assert.ok(result.codes.includes('COVERAGE_MISSING'), JSON.stringify(result));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('C005: an unknown schema is COVERAGE_SCHEMA', async () => {
  const skill = await buildMiniSkillV2();
  try {
    const ledger = JSON.parse(readFileSync(ledgerPath(skill), 'utf8'));
    ledger.schema = 'okf-source-coverage/v0';
    writeFileSync(ledgerPath(skill), JSON.stringify(ledger));
    const result = await checkCoverage({ skillPath: skill.skillDir });
    assert.ok(result.codes.includes('COVERAGE_SCHEMA'), JSON.stringify(result));
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});
