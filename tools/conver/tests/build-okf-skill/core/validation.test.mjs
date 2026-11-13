// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * C008 — conformance, lint, and profile are separate verdicts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { validateConformance } from '../../../.claude/scripts/amend-rfc-up/okf-core/validation/conformance.mjs';
import { lintBundle } from '../../../.claude/scripts/amend-rfc-up/okf-core/validation/lint.mjs';
import { checkProfile } from '../../../.claude/scripts/amend-rfc-up/okf-core/validation/profile.mjs';
import { createBasicBundle, createLintBundle } from '../lib/fixture-v2.mjs';

test('C008: a broken link, unknown type, unknown key, and missing index pass conformance', async () => {
  const fixture = createLintBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    assert.deepEqual(validateConformance(bundle), []);
  } finally {
    fixture.cleanup();
  }
});

test('C008: lint reports the quality findings that conformance allows', async () => {
  const fixture = createLintBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const codes = lintBundle(bundle, { now: new Date('2026-11-13T00:00:00Z') }).map((finding) => finding.code);
    assert.ok(codes.includes('LINK_BROKEN'));
    assert.ok(codes.includes('UNKNOWN_TYPE'));
    assert.ok(codes.includes('STALE_CONCEPT'));
    assert.ok(codes.includes('SOURCE_ID_MISMATCH'));
  } finally {
    fixture.cleanup();
  }
});

test('C008: profile fails a missing required concept and a deprecated context member', async () => {
  const fixture = createBasicBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const findings = checkProfile(bundle, { requiredConcepts: ['rules/rest', 'rules/missing'] });
    assert.ok(findings.some((finding) => finding.code === 'MISSING_REQUIRED_CONCEPT'));
    const deprecated = checkProfile(bundle, { requiredConcepts: ['identity/id'], allowDeprecated: false });
    assert.ok(deprecated.some((finding) => finding.code === 'DEPRECATED_PRESENTED'));
  } finally {
    fixture.cleanup();
  }
});
