// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// @verifies C003
// C003 precondition: The 466 rule ids of the prior bundle
// C003 postcondition: Every prior id still resolves after regeneration
// C003 invariant: The set difference prior minus rebuilt is empty
/**
 * The rebuild must not trade package coverage for rule loss.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planRuleUniverse } from '../../../.claude/skills/rust-interface-law/scripts/lib/rule-alias.mjs';
import { parseExpertPackage } from '../../../.claude/skills/rust-interface-law/scripts/lib/expert-package.mjs';
import { parseRuleRegistry } from '../../../.claude/skills/rust-interface-law/scripts/generate-law-bundle.mjs';

const PACKAGE = join(process.cwd(), 'docs/archive/IMPLEMENTATION-SPEC/EXPERT-REVIEW-PACKAGE.md');
const PRIOR = parseRuleRegistry(readFileSync(
  join(process.cwd(), 'docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md'),
  'utf8',
)).map((row) => row.id);
const ALIASES = {
  aliases: {
    'INV-01': { target: 'IF-02', reason: 'adapter does not implement business rules' },
    'INV-02': { target: 'IF-01', reason: 'adapter calls the operation' },
    'INV-03': { target: 'OPS-07', reason: 'authorization runs inside the operation' },
    'INV-04': { target: 'ARC-03', reason: 'core and operation carry no transport dependency' },
    'INV-05': { target: 'CONF-42', reason: 'SSO addition keeps existing contracts' },
    'INV-07': { target: 'AUTH-08', reason: 'one interface audience per token' },
    'INV-08': { target: 'OPS-06', reason: 'no side effect before authorization' },
  },
};

test('C003: all prior registry ids survive', () => {
  const tree = parseExpertPackage(readFileSync(PACKAGE, 'utf8'));
  const universe = planRuleUniverse({ priorIds: PRIOR, packageRuleIds: tree.ruleRows.map((row) => row.id), aliases: ALIASES });
  assert.equal(universe.missingPrior.length, 0);
  assert.deepEqual(universe.missingPrior, []);
});

test('C003: the 27 package-only ids are added once', () => {
  const tree = parseExpertPackage(readFileSync(PACKAGE, 'utf8'));
  const universe = planRuleUniverse({ priorIds: PRIOR, packageRuleIds: tree.ruleRows.map((row) => row.id), aliases: ALIASES });
  assert.equal(universe.added.length, 20);
  assert.equal(universe.canonicalIds.length, 486);
  assert.ok(universe.added.includes('FREE-01'));
  assert.ok(universe.added.includes('VER-06'));
  assert.ok(universe.added.includes('INV-06'));
  assert.equal(universe.added.includes('INV-08'), false, 'INV-08 aliases OPS-06');
});

test('C003: the 36 bundle-only ids are still present', () => {
  const tree = parseExpertPackage(readFileSync(PACKAGE, 'utf8'));
  const universe = planRuleUniverse({ priorIds: PRIOR, packageRuleIds: tree.ruleRows.map((row) => row.id), aliases: ALIASES });
  for (const id of ['REST-19', 'WS-33', 'CLI-15', 'GRPC-20', 'MCP-22', 'A2A-25', 'IMP-01']) {
    assert.ok(universe.canonicalIds.includes(id), id);
  }
});
