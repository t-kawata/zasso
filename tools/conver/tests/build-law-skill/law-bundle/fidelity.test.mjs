// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// @verifies C004
// C004 precondition: A sampled package section with normative text T
// C004 postcondition: The mapped concept body contains T verbatim
// C004 invariant: No paraphrase is substituted for normative text
/**
 * Section bodies keep the package text; appended navigation must not replace it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseExpertPackage } from '../../../.claude/skills/rust-interface-law/scripts/lib/expert-package.mjs';
import { loadBundle } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { conceptBody } from '../../../.claude/scripts/amend-rfc-up/okf-core/context/assemble.mjs';
import { assertBodyFidelity } from '../../../.claude/skills/rust-interface-law/scripts/lib/coverage-ledger.mjs';

const PACKAGE = join(process.cwd(), 'docs/archive/IMPLEMENTATION-SPEC/EXPERT-REVIEW-PACKAGE.md');
const BUNDLE = join(process.cwd(), '.claude/skills/rust-interface-law/okf');

test('C004: the REST section concept contains the package text verbatim', async () => {
  const tree = parseExpertPackage(readFileSync(PACKAGE, 'utf8'));
  const section = tree.headings.find((entry) => entry.path === 'part-iii-6/6-http-rules');
  assert.ok(section, 'part-iii-6/6-http-rules');
  const bundle = await loadBundle(BUNDLE);
  const concept = bundle.byId.get(`sources/${section.path}`);
  assert.ok(concept, 'sources/part-iii-6/6-http-rules');
  assertBodyFidelity(section, conceptBody(concept));
});

test('C004: a paraphrase fails fidelity', async () => {
  const tree = parseExpertPackage(readFileSync(PACKAGE, 'utf8'));
  const section = tree.headings.find((entry) => entry.path === 'part-iii-6/6-http-rules');
  const bundle = await loadBundle(BUNDLE);
  const concept = bundle.byId.get(`sources/${section.path}`);
  const tampered = { ...section, text: 'Authorization is required.' };
  assert.throws(
    () => assertBodyFidelity(tampered, conceptBody(concept)),
    (error) => error.code === 'FIDELITY_MISMATCH',
  );
});

test('C004: a sampled Part III section is not empty', async () => {
  const tree = parseExpertPackage(readFileSync(PACKAGE, 'utf8'));
  const bundle = await loadBundle(BUNDLE);
  for (const path of ['part-iii-4/4-operation-contract', 'part-iii-12/1-conformance-matrix']) {
    const section = tree.headings.find((entry) => entry.path === path);
    if (!section) continue;
    const concept = bundle.byId.get(`sources/${path}`);
    assert.ok(concept, path);
    assert.ok(conceptBody(concept).trim().length > 0, path);
  }
});
