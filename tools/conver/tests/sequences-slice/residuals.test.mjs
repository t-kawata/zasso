// PX-255 @verifies C005
// The ten class names that no manifest owns are a gap in the upstream data, not a bug in
// this code, so the only thing this code can be held to is that it disposes of every one
// of them. The disposition is therefore total by construction, and a name that resolves
// nowhere lands in the unaccounted bucket rather than disappearing.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DECLARED_RESIDUAL_CLASS_NAMES,
  disposeUnmatchedClassNames,
} from '../../.claude/scripts/sequences-slice/lib/residuals.mjs';
import {
  liveShapedClaims,
  liveShapedTerms,
  termsCarryingAClassNameOnlyInProse,
} from './fixtures/synthetic-workspace.mjs';

const claimNames = () => liveShapedClaims().map((claim) => claim.canonical_name);
const termCanonicalNames = () => liveShapedTerms().map((term) => term.canonical_name);

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C005 the declared residuals are the ten names the operations actually name', () => {
  assert.deepEqual([...DECLARED_RESIDUAL_CLASS_NAMES], [
    'CitationCertificate', 'CommunityCertificate', 'ForumGenesis', 'GenesisCertificate',
    'OriginLot', 'ReciprocalCertificate', 'RootEntry', 'RootEntryCertificate',
    'SeedAllocationRegistry', 'StorageAuditResponse',
  ]);
  assert.ok(Object.isFrozen(DECLARED_RESIDUAL_CLASS_NAMES));
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C005 the claim table and the term index are the shapes the measurement recorded', () => {
  assert.equal(claimNames().length, 88);
  assert.equal(new Set(claimNames()).size, 88);
  assert.equal(termCanonicalNames().length, 777);
  assert.equal(new Set(termCanonicalNames()).size, 17);
  assert.ok(DECLARED_RESIDUAL_CLASS_NAMES.every((name) => !claimNames().includes(name)));
  assert.ok(DECLARED_RESIDUAL_CLASS_NAMES.every((name) => !termCanonicalNames().includes(name)));
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C005 no unmatched name resolves, so all ten are declared residuals', () => {
  const disposed = disposeUnmatchedClassNames([...DECLARED_RESIDUAL_CLASS_NAMES], {
    claimNames: claimNames(),
    termNames: termCanonicalNames(),
  });
  assert.deepEqual(disposed.resolvedThroughClaims, []);
  assert.deepEqual(disposed.resolvedThroughTerms, []);
  assert.deepEqual([...disposed.declaredResiduals].sort(), [...DECLARED_RESIDUAL_CLASS_NAMES].sort());
  assert.deepEqual(disposed.unaccounted, []);
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C005 the claims branch is live rather than dead code', () => {
  const disposed = disposeUnmatchedClassNames([...DECLARED_RESIDUAL_CLASS_NAMES], {
    claimNames: [...claimNames(), 'RootEntry'],
    termNames: termCanonicalNames(),
  });
  assert.deepEqual(disposed.resolvedThroughClaims, ['RootEntry']);
  assert.equal(disposed.declaredResiduals.length, 9);
  assert.deepEqual(disposed.unaccounted, []);
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C005 a name that resolves nowhere and is not declared residual is left unaccounted', () => {
  const disposed = disposeUnmatchedClassNames(['NoSuchObject'], { claimNames: [], termNames: [] });
  assert.deepEqual(disposed.unaccounted, ['NoSuchObject']);
  assert.deepEqual(disposed.declaredResiduals, []);
});

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C005 a class name appearing only inside term prose does not resolve through terms', () => {
  const proseTerms = termsCarryingAClassNameOnlyInProse();
  assert.ok(proseTerms.some((term) => JSON.stringify(term).includes('CommunityCertificate')));
  const disposed = disposeUnmatchedClassNames(['CommunityCertificate'], {
    claimNames: [],
    termNames: proseTerms.map((term) => term.canonical_name),
  });
  assert.deepEqual(disposed.resolvedThroughTerms, []);
  assert.deepEqual(disposed.declaredResiduals, ['CommunityCertificate']);
  assert.deepEqual(disposed.unaccounted, []);
});
