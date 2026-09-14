// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
// P22-11 @verifies C003
// T6 and the six-gate runner. The mode is decided by the input; reverse
// provenance is added in reverse mode and is deliberately absent in forward
// mode, where its absence is the normal state rather than a failure. The
// forward vocabulary — including the meaning of COMPLETE — is not redefined.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  REVERSE_GATE_IDS,
  REVERSE_PROVENANCE_FIELD,
  TREE_MODES,
  addReverseProvenance,
  assertProvenanceRecorded,
  computeSidecarBundleHash,
  digestSidecarFiles,
  renderReverseReport,
  resolveTreeMode,
  runReverseGates,
  summarizeReverseGates,
} from '../../../.claude/scripts/workspacify-tree/lib/reverse-mode.mjs';
import { GATE_STATUS } from '../../../.claude/scripts/workspacify-tree/lib/errors.mjs';
import { assembleManifest, computeSelfHash, renderManifestText } from '../../../.claude/scripts/workspacify-tree/lib/render.mjs';
import { agreeingReverseInput, withSidecars } from './helpers/reverse-fixture.mjs';

// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
test('the mode is decided by the input, and an absent mode field means forward', () => {
  assert.equal(resolveTreeMode({ mode: 'reverse' }), TREE_MODES.REVERSE);
  assert.equal(resolveTreeMode({}), TREE_MODES.FORWARD);
  assert.equal(resolveTreeMode(undefined), TREE_MODES.FORWARD);
  assert.equal(resolveTreeMode({ mode: 'sideways' }), TREE_MODES.FORWARD);
  assert.equal(TREE_MODES.FORWARD, 'forward');
  assert.equal(TREE_MODES.REVERSE, 'reverse');
});

test('the gate identifiers are named constants, so report, tests and design cannot disagree', () => {
  assert.deepEqual(Object.values(REVERSE_GATE_IDS), ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
  assert.equal(REVERSE_PROVENANCE_FIELD, 'reverse_provenance');
});

test('T6 adds reverse provenance in reverse mode and leaves forward mode untouched', () => {
  const sections = { status: 'COMPLETE', run: {}, input: {} };
  const reverseSections = addReverseProvenance(sections, {
    mode: TREE_MODES.REVERSE,
    sidecarBundleHash: 'a'.repeat(64),
    counts: { claims: 3, residuals: 1 },
  });
  assert.equal(reverseSections[REVERSE_PROVENANCE_FIELD].sidecar_bundle_hash, 'a'.repeat(64));
  assert.equal(reverseSections[REVERSE_PROVENANCE_FIELD].counts.claims, 3);
  assert.equal(reverseSections.status, 'COMPLETE', 'adding provenance does not change the status vocabulary');

  const forwardSections = addReverseProvenance(sections, { mode: TREE_MODES.FORWARD });
  assert.equal(forwardSections, sections, 'forward mode returns the very same object, so nothing can drift');
  assert.equal(REVERSE_PROVENANCE_FIELD in forwardSections, false);
});

test('T6 does not fire in forward mode, where the absent field is the normal state', () => {
  const record = assertProvenanceRecorded({
    mode: TREE_MODES.FORWARD,
    reverseProvenance: undefined,
    sidecarFiles: [],
  });
  assert.equal(record.gateId, 'T6');
  assert.equal(record.status, 'PASS');
  assert.equal(record.counts.mode, 'forward');
  assert.equal(record.counts.reverse_provenance, 0);
  assert.match(record.reasons.join('\n'), /forward/i);
});

test('T6 fails when the run is in reverse mode and no provenance was recorded', () => {
  const record = assertProvenanceRecorded({
    mode: TREE_MODES.REVERSE,
    reverseProvenance: undefined,
    sidecarFiles: [],
  });
  assert.equal(record.status, 'FAIL');
  assert.match(record.reasons.join('\n'), /reverse_provenance/);
});

test('T6 fails when the recorded bundle hash cannot be resolved against the sidecars', () => {
  withSidecars((sidecarFiles) => {
    const record = assertProvenanceRecorded({
      mode: TREE_MODES.REVERSE,
      reverseProvenance: { sidecar_bundle_hash: 'b'.repeat(64), counts: { sidecars: 1 } },
      sidecarFiles,
    });
    assert.equal(record.status, 'FAIL');
    assert.deepEqual(record.unresolvable, ['b'.repeat(64)]);
    assert.match(record.reasons.join('\n'), /resolve/i);
  });
});

test('T6 passes when the recorded bundle hash resolves against the sidecars on disk', () => {
  withSidecars((sidecarFiles) => {
    const bundleHash = computeSidecarBundleHash(digestSidecarFiles(sidecarFiles));
    const record = assertProvenanceRecorded({
      mode: TREE_MODES.REVERSE,
      reverseProvenance: { sidecar_bundle_hash: bundleHash, counts: { sidecars: 1 } },
      sidecarFiles,
    });
    assert.equal(record.status, 'PASS');
    assert.deepEqual(record.unresolvable, []);
    assert.equal(record.counts.sidecars, 1);
  });
});

test('T6 fails when reverse mode supplies no sidecar to resolve against', () => {
  const record = assertProvenanceRecorded({
    mode: TREE_MODES.REVERSE,
    reverseProvenance: { sidecar_bundle_hash: 'c'.repeat(64), counts: { sidecars: 0 } },
    sidecarFiles: [],
  });
  assert.equal(record.status, 'FAIL');
  assert.match(record.reasons.join('\n'), /sidecar/i);
});

test('the bundle hash is deterministic over the sidecar set and changes when the set changes', () => {
  withSidecars((sidecarFiles) => {
    const first = computeSidecarBundleHash(digestSidecarFiles(sidecarFiles));
    const second = computeSidecarBundleHash(digestSidecarFiles(sidecarFiles));
    assert.equal(first, second);
    assert.equal(first.length, 64);
    const different = computeSidecarBundleHash(digestSidecarFiles([]));
    assert.notEqual(first, different, 'an empty bundle must not hash like a populated one');
  });
});

test('digesting a sidecar that is not on disk names the missing file', () => {
  assert.throws(
    () => digestSidecarFiles([{ name: 'GONE.json', path: '/nonexistent/workspacify-tree/GONE.json' }]),
    /GONE\.json/,
  );
});

test('the six gates always answer in T1 to T6 order with an explicit verdict', () => {
  withSidecars((sidecarFiles) => {
    const input = agreeingReverseInput({
      sidecarFiles,
      reverseProvenance: {
        sidecar_bundle_hash: computeSidecarBundleHash(digestSidecarFiles(sidecarFiles)),
        counts: { sidecars: 1 },
      },
    });
    const records = runReverseGates(input);
    assert.deepEqual(
      records.map((record) => record.gateId),
      [REVERSE_GATE_IDS.T1, REVERSE_GATE_IDS.T2, REVERSE_GATE_IDS.T3, REVERSE_GATE_IDS.T4, REVERSE_GATE_IDS.T5, REVERSE_GATE_IDS.T6],
    );
    for (const record of records) {
      assert.ok(
        record.status === GATE_STATUS.PASS || record.status === GATE_STATUS.FAIL,
        `${record.gateId} must state a verdict, not a mood`,
      );
      assert.ok(record.reasons.length > 0, `${record.gateId} must explain itself`);
    }
    assert.ok(records.every((record) => record.status === GATE_STATUS.PASS), 'the agreeing input passes all six');
  });
});

test('one failing gate stops the run from being complete without hiding the others', () => {
  withSidecars((sidecarFiles) => {
    const input = agreeingReverseInput({
      sidecarFiles,
      reverseProvenance: {
        sidecar_bundle_hash: computeSidecarBundleHash(digestSidecarFiles(sidecarFiles)),
        counts: { sidecars: 1 },
      },
      measured: { directories: ['src', 'src/audio'], sourceFiles: ['src/lib.rs'], edges: [] },
    });
    const summary = summarizeReverseGates(runReverseGates(input));
    assert.equal(summary.status, GATE_STATUS.FAIL);
    assert.equal(summary.records.length, 6, 'a failing run still reports every gate');
    // T1 sees the extra directory and T5 sees that the delta does not record it.
    // A run that reported only the first of those would hide half the repair.
    assert.deepEqual(summary.failing, ['T1', 'T5']);
  });
});

test('COMPLETE keeps its forward meaning: schema, gates and publication discipline, nothing more', () => {
  withSidecars((sidecarFiles) => {
    const input = agreeingReverseInput({
      sidecarFiles,
      reverseProvenance: {
        sidecar_bundle_hash: computeSidecarBundleHash(digestSidecarFiles(sidecarFiles)),
        counts: { sidecars: 1 },
      },
    });
    const summary = summarizeReverseGates(runReverseGates(input));
    assert.equal(summary.status, GATE_STATUS.COMPLETE);
    assert.equal(GATE_STATUS.COMPLETE, 'COMPLETE', 'the status vocabulary is not redefined');
    assert.equal(summary.records.some((record) => record.status === GATE_STATUS.REVIEW_REQUIRED), false);
  });
});

test('the reverse manifest carries reverse_provenance and the self-hash covers it', () => {
  const sections = { run: { generator: 'workspacify-tree' }, input: {}, workspace: {} };
  const forwardManifest = assembleManifest(sections);
  const forwardHash = forwardManifest.integrity.manifest_hash;
  assert.equal(computeSelfHash(forwardManifest), forwardHash);
  assert.equal(REVERSE_PROVENANCE_FIELD in forwardManifest, false);
  assert.equal(forwardManifest.integrity.canonicalization, 'workspacify-tree-json-v1');

  const reverseManifest = assembleManifest(
    addReverseProvenance(sections, {
      mode: TREE_MODES.REVERSE,
      sidecarBundleHash: 'd'.repeat(64),
      counts: { sidecars: 1 },
    }),
  );
  assert.notEqual(reverseManifest.integrity.manifest_hash, forwardHash);
  assert.equal(computeSelfHash(reverseManifest), reverseManifest.integrity.manifest_hash);
  assert.equal(reverseManifest.integrity.canonicalization, 'workspacify-tree-json-v1', 'the normalisation is untouched');
  assert.match(renderManifestText(reverseManifest), /reverse_provenance/, 'the field is inside the hashed text');
});

test('the reverse report is Markdown the operator can read, naming each gate and its verdict', () => {
  withSidecars((sidecarFiles) => {
    const input = agreeingReverseInput({
      sidecarFiles,
      reverseProvenance: {
        sidecar_bundle_hash: computeSidecarBundleHash(digestSidecarFiles(sidecarFiles)),
        counts: { sidecars: 1 },
      },
    });
    const report = renderReverseReport(runReverseGates(input));
    assert.equal(typeof report, 'string');
    for (const gateId of Object.values(REVERSE_GATE_IDS)) {
      assert.match(report, new RegExp(`\\b${gateId}\\b`), `${gateId} must appear in the report`);
    }
    assert.match(report, /#/, 'the report is Markdown with headings');
    assert.doesNotMatch(report, /"gateId"/, 'the report is not a JSON dump');
  });
});

test('the manifest schema still accepts a reverse manifest', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../../.claude/scripts/workspacify-tree/schemas/workspacify-tree-manifest.schema.json', import.meta.url), 'utf8'),
  );
  assert.equal(schema.additionalProperties, undefined, 'the schema does not forbid the added field');
  assert.ok(!schema.required.includes(REVERSE_PROVENANCE_FIELD), 'the field must not become required in forward mode');
});
