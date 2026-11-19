// [::TICKET::] PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-452 --for-spec --no-implementation-order`.
// [::TICKET::] PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-451 --for-spec --no-implementation-order`.
/**
 * residue-registry.test.cjs — stable, deduplicated, lifecycle-tracked residue.
 * @verifies C003
 * @verifies C003/precondition
 * @verifies C003/postcondition
 * @verifies C003/invariant
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  residueId,
  registerResidue,
  reconcileResidues,
  validateResidue,
  validateRegistry,
  scanReadmeResidues,
  detectOverDetection,
} = require('../../.claude/scripts/crystalize-readme/residue-registry.js');

const valid = {
  level: 'package',
  layer: 'interface',
  element: 'account.add',
  evidence: [{ kind: 'interface-gap', ref: 'src/lib.rs:10' }],
  reinforcement: { design: 'Implement add', acceptance: 'Add a test' },
};

describe('C003 — structured residue lifecycle', () => {
  it('assigns a stable id from level, layer, element, and scope', () => {
    assert.equal(residueId(valid), residueId({ ...valid }));
    assert.match(residueId(valid), /^RSD-[0-9a-f]{12}$/);
  });

  it('rejects evidence-free or reinforcement-free residue', () => {
    assert.throws(() => validateResidue({ ...valid, evidence: [] }), /evidence/);
    assert.throws(() => validateResidue({ ...valid, reinforcement: { design: '', acceptance: '' } }), /reinforcement/);
  });

  it('marks the same residue persisting and merges section ids', () => {
    const first = registerResidue({ ...valid, sectionIds: ['H1'] }, []);
    const second = registerResidue({ ...valid, sectionIds: ['H2'] }, first.registry);
    assert.equal(second.record.state, 'persisting');
    assert.deepEqual(second.record.sectionIds.sort(), ['H1', 'H2']);
    assert.equal(second.registry.length, 1);
  });

  it('marks a completed section resolved and does not resurrect it', () => {
    const first = registerResidue({ ...valid, sectionIds: ['H1'] }, []);
    const resolved = reconcileResidues(first.registry, [{ id: 'H1', state: 'complete' }]);
    assert.equal(resolved.registry[0].state, 'resolved');

    const again = reconcileResidues(resolved.registry, [{ id: 'H1', state: 'complete' }]);
    assert.equal(again.registry[0].state, 'resolved');
  });

  it('keeps a residue persisting while its section is still residue', () => {
    const first = registerResidue({ ...valid, sectionIds: ['H1'] }, []);
    const reconciled = reconcileResidues(first.registry, [{ id: 'H1', state: 'residue' }]);
    assert.equal(reconciled.registry[0].state, 'persisting');
  });
});

describe('C005 — structured residue cross-check against README', () => {
  const linked = '## A\n\n<::README-RESIDUE::>\n<!-- crystalize-residue: id=RSD-aaaaaaaaaaaa level=package layer=interface element=account.add -->\nEvidence\n';

  it('reads the invisible marker and finds prose-only residues', () => {
    assert.deepEqual(scanReadmeResidues(linked).markers.map((marker) => marker.id), ['RSD-aaaaaaaaaaaa']);
    assert.deepEqual(scanReadmeResidues(linked).proseSections, []);
    const prose = '## A\n\n<::README-RESIDUE::>\nProse only.\n';
    assert.deepEqual(scanReadmeResidues(prose).proseSections, ['A']);
  });

  it('rejects a README marker with no registry record, a registry id with no marker, and a resolved marker', () => {
    const record = {
      id: 'RSD-aaaaaaaaaaaa', level: 'package', layer: 'interface', element: 'account.add',
      evidence: [{ kind: 'interface-gap', ref: 'src/lib.rs:10' }],
      reinforcement: { design: 'Implement add', acceptance: 'Add a test' },
      state: 'persisting', sectionIds: ['A'],
    };
    const unregistered = validateRegistry([], linked);
    assert.equal(unregistered.ok, false);
    assert.match(unregistered.errors.join(' '), /unregistered residue in README/);

    const missingMarker = validateRegistry([record], '## A\n\nComplete prose.\n');
    assert.equal(missingMarker.ok, false);
    assert.match(missingMarker.errors.join(' '), /no README marker/);

    const resolved = validateRegistry([{ ...record, state: 'resolved' }], linked);
    assert.equal(resolved.ok, false);
    assert.match(resolved.errors.join(' '), /resolved residue still appears/);

    const matched = validateRegistry([record], linked);
    assert.equal(matched.ok, true, matched.errors.join('; '));
  });

  it('reports a prose-only residue as a missing registry record', () => {
    const prose = '## A\n\n<::README-RESIDUE::>\nProse only.\n';
    const verdict = validateRegistry([], prose);
    assert.equal(verdict.ok, false);
    assert.match(verdict.errors.join(' '), /prose residue has no registry record: A/);
  });
});

describe('C008 — POSSIBLE_OVER_DETECTION advisory', () => {
  const registry = Array.from({ length: 4 }, (_, index) => ({
    id: `RSD-00000000000${index}`, state: 'new',
  }));
  const sections = new Array(10).fill({ state: 'residue' });

  it('fires only when evidence is unchanged and the threshold is exceeded', () => {
    const same = detectOverDetection({ registry, sections, evidenceDigest: 'd1', previousEvidenceDigest: 'd1' });
    assert.equal(same.advisory, 'POSSIBLE_OVER_DETECTION');
    assert.equal(same.newCount, 4);
    assert.equal(detectOverDetection({ registry, sections, evidenceDigest: 'd2', previousEvidenceDigest: 'd1' }).advisory, null);
    assert.equal(detectOverDetection({ registry: registry.slice(0, 3), sections, evidenceDigest: 'd1', previousEvidenceDigest: 'd1' }).advisory, null);
    assert.equal(detectOverDetection({ registry, sections, evidenceDigest: 'd1', previousEvidenceDigest: null }).advisory, null);
  });
});
