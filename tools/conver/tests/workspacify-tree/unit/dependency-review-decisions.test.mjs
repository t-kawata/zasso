// [::TICKET::] PX-200 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-200 --for-spec --no-implementation-order`.
// PX-200 @verifies C002 C003 C004
// Every review candidate must be decided by the AI in this session, and the published
// graph must match the decision. Nothing is handed back to a human.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDependencyReviewForDecisions, validateDependencyReviews, REVIEW_DECISIONS } from '../../../.claude/scripts/workspacify-tree/lib/dependency-review.mjs';
import { settlePulseCandidates } from '../helpers/settle-pulse.mjs';

const RUN = fileURLToPath(new URL('../../../.claude/scripts/workspacify-tree/run.mjs', import.meta.url));

const CANDIDATES = [{ id: 'review-000001', kind: 'unnecessary_serialization', packages: ['pkg-a', 'pkg-b'], edge_ref: 'pkg-b->pkg-a', observation: 'x.', evidence_refs: ['pkg-b->pkg-a'] }];
const EDGES = [{ from: 'pkg-b', to: 'pkg-a' }];

function review(overrides = {}) {
  return { candidate_id: 'review-000001', decision: 'keep', rationale: 'the edge carries the record the consumer needs', alternatives: ['replace the edge with a port'], ...overrides };
}

test('C002 the decision vocabulary is closed and every candidate needs one decision', () => {
  assert.deepEqual([...REVIEW_DECISIONS].sort(), ['keep', 'merge', 'replace_with_port', 'residual', 'split'].sort());
  assert.equal(validateDependencyReviews({ candidates: CANDIDATES, reviews: [review()], normalEdges: EDGES, boundaries: [] }).ok, true);

  const missing = validateDependencyReviews({ candidates: CANDIDATES, reviews: [], normalEdges: EDGES, boundaries: [] });
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((message) => message.includes('review-000001')), JSON.stringify(missing.errors));

  const unknown = validateDependencyReviews({ candidates: CANDIDATES, reviews: [review({ decision: 'maybe' })], normalEdges: EDGES, boundaries: [] });
  assert.ok(unknown.errors.some((message) => message.includes('decision')), JSON.stringify(unknown.errors));

  const noRationale = validateDependencyReviews({ candidates: CANDIDATES, reviews: [review({ rationale: '' })], normalEdges: EDGES, boundaries: [] });
  assert.ok(noRationale.errors.some((message) => message.includes('rationale')));

  const noAlternatives = validateDependencyReviews({ candidates: CANDIDATES, reviews: [review({ alternatives: [] })], normalEdges: EDGES, boundaries: [] });
  assert.ok(noAlternatives.errors.some((message) => message.includes('alternatives')));

  const residual = validateDependencyReviews({ candidates: CANDIDATES, reviews: [review({ decision: 'residual' })], normalEdges: [], boundaries: [] });
  assert.ok(residual.errors.some((message) => message.includes('why_unresolved')));
});

test('C002 a decision that contradicts the published graph is refused', () => {
  const stillDeclared = validateDependencyReviews({ candidates: CANDIDATES, reviews: [review({ decision: 'replace_with_port' })], normalEdges: EDGES, boundaries: [] });
  assert.equal(stillDeclared.ok, false);
  assert.ok(stillDeclared.errors.some((message) => message.includes('pkg-b->pkg-a')), JSON.stringify(stillDeclared.errors));

  const boundaryDeclared = validateDependencyReviews({
    candidates: CANDIDATES,
    reviews: [review({ decision: 'replace_with_port' })],
    normalEdges: [],
    boundaries: [{ consumer_package: 'pkg-b', provider_package: 'pkg-a' }],
  });
  assert.equal(boundaryDeclared.ok, false);

  const keptButAbsent = validateDependencyReviews({ candidates: CANDIDATES, reviews: [review()], normalEdges: [], boundaries: [] });
  assert.ok(keptButAbsent.errors.some((message) => message.includes('not declared')));

  const mergedButSeparate = validateDependencyReviews({
    candidates: [{ ...CANDIDATES[0], kind: 'under_split_pair' }],
    reviews: [review({ decision: 'merge' })],
    normalEdges: EDGES,
    boundaries: [],
  });
  assert.ok(mergedButSeparate.errors.some((message) => message.includes('still separate')));
});

test('C003 the CLI publishes the review set and merges its residuals into the hand-off', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-200-'));
  try {
    const specPath = join(dir, 'spec.md');
    writeFileSync(specPath, '# S\n\n## Object Catalog\n\n| object | kind |\n|--------|------|\n| RuleRecord | record |\n');
    // A forbidden edge that declares an alternative is one review candidate the
    // published graph cannot dismiss: the detour it names is already available.
    const decisions = {
      workspace: [
        { id: 'pkg-rules', name: 'rules', path: 'crates/protocol/rules', layer: 'protocol', kind: 'production-library', responsibilities: ['owns records'], seed_required: true, owns: { objects: ['obj-000001'], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] } },
        { id: 'pkg-testkit', name: 'testkit', path: 'crates/conformance/testkit', layer: 'conformance', kind: 'test-support', responsibilities: ['conformance sink'], seed_required: true, owns: { objects: [], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] } },
      ],
      tree: [{ name: 'crates', path: 'crates', kind: 'dir', children: [{ name: 'protocol', path: 'crates/protocol', kind: 'dir', children: [{ name: 'rules', path: 'crates/protocol/rules', kind: 'dir', children: [] }] }, { name: 'conformance', path: 'crates/conformance', kind: 'dir', children: [{ name: 'testkit', path: 'crates/conformance/testkit', kind: 'dir', children: [] }] }] }],
      ownership: [{ objectId: 'obj-000001', packageId: 'pkg-rules' }],
      dependencies: [{ from: 'pkg-rules', to: 'pkg-testkit', kind: 'forbidden', reasonCode: 'forbidden-layer', reason: 'protocol must not reach conformance directly', alternative: 'port-injection' }],
      boundaries: [],
      adapters: { ports: [], databasePolicy: { applicable: false } },
      approvals: [],
      semantic_review: { status: 'APPROVED', statement: 'rules owns the record; testkit is the conformance sink', approver: 'test' },
    };
    const review_ = buildDependencyReviewForDecisions(decisions, [{ inventory_ref: 'obj-000001', canonical_name: 'obj-000001', category: 'object', owner_package: 'pkg-rules' }]);
    assert.equal(review_.candidates.length, 1, JSON.stringify(review_.candidates));
    const settled = {
      ...decisions,
      dependency_reviews: review_.candidates.map((candidate) => ({
        candidate_id: candidate.id, decision: 'residual', rationale: 'the boundary choice needs the canonical grill',
        alternatives: ['keep the package as one directory'], why_unresolved: 'ownership of the rule is unresolved',
      })),
    };
    const decisionsPath = join(dir, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(settlePulseCandidates({ specPath, decisions: settled })));

    const result = spawnSync(process.execPath, [RUN, 'finalize', `--spec=${specPath}`, `--decisions=${decisionsPath}`], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const manifest = JSON.parse(readFileSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
    assert.equal(manifest.stage2_handoff.dependency_reviews.length, review_.candidates.length);
    assert.equal(manifest.stage2_handoff.dependency_reviews[0].decision, 'residual');
    assert.equal(manifest.final_audit.dependency_review_count, 0);
    assert.equal(manifest.final_audit.unresolved_review_count, 1);
    // Both residual sources reach the hand-off: the pulse questions and the review ones.
    assert.ok(manifest.stage2_handoff.residual_questions.length > review_.candidates.length);

    // An undecided candidate stops the run and names the candidate.
    const undecidedPath = join(dir, 'undecided.json');
    writeFileSync(undecidedPath, JSON.stringify(settlePulseCandidates({ specPath, decisions: { ...settled, dependency_reviews: [] } })));
    const blocked = spawnSync(process.execPath, [RUN, 'finalize', `--spec=${specPath}`, `--decisions=${undecidedPath}`], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(blocked.status, 0);
    assert.ok((blocked.stdout + blocked.stderr).includes(review_.candidates[0].id), blocked.stdout + blocked.stderr);
    assert.ok((blocked.stdout + blocked.stderr).includes('no recorded decision'), blocked.stdout + blocked.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C004 the command document states the review step and its decision vocabulary', () => {
  const doc = readFileSync('.claude/commands/workspacify-tree.md', 'utf8');
  assert.match(doc, /dependency_reviews/);
  for (const anchor of ['replace_with_port', 'merge', 'split', 'residual']) {
    assert.ok(doc.includes(anchor), `the document must name the ${anchor} decision`);
  }
  assert.match(doc, /Step 3[\s\S]{0,1200}dependency_reviews/);
});
