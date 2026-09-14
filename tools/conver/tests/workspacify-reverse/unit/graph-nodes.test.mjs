// @verifies C001
// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
/**
 * The graph node set is read from the origin spec, in the shape T3 judges.
 *
 * C001's invariant is what these tests hold: the node set is read from a document
 * the chain produced rather than invented, and an anchor that cannot be read is
 * reported rather than replaced with an empty one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { buildGraphNodes } from '../helpers/graph-nodes.mjs';
import { FIXTURE_SOURCE_FILES } from '../../workspacify-tree/reverse/helpers/reverse-fixture.mjs';
import { assertGrounding } from '../../../.claude/scripts/workspacify-tree/lib/structure-parity.mjs';

/** A throwaway directory for one origin spec, so nothing is written into the project. */
// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
function withSpec(document, body) {
  const root = mkdtempSync(join(tmpdir(), 'wsp-p24-10-graph-'));
  const specPath = join(root, 'ORIGIN-LONG-SPEC.json');
  writeFileSync(specPath, typeof document === 'string' ? document : JSON.stringify(document, null, 2));
  try {
    return body(specPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** A claim grounded in one file, in the shape the analysis run publishes. */
// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
function claimGrounding(file, claimId = 'clm-1') {
  return { claim_id: claimId, evidence: [{ evidence_mode: 'source_static', source_span: { file, line: 5 } }] };
}

/** A throwaway measured tree holding one file per path, so T3 can resolve against it. */
// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
function writeMeasuredTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'wsp-p24-10-measured-'));
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), '// measured\n');
  }
  return root;
}

test('UT: every node carries the file it is grounded in, in the shape readGraphNodes accepts', () => {
  const document = { claims: [claimGrounding('src/lib.rs', 'clm-a'), claimGrounding('src/api/mod.rs', 'clm-b')] };

  withSpec(document, (specPath) => {
    const nodes = buildGraphNodes({ specPath });

    assert.equal(nodes.length, 2);
    // The reader keeps exactly these two fields, so a node carrying more would be
    // advertising information the gate never sees.
    for (const node of nodes) {
      assert.deepEqual(Object.keys(node).sort(), ['file', 'id']);
      assert.equal(typeof node.file, 'string');
    }
    assert.deepEqual(
      nodes.map((node) => node.file),
      ['src/api/mod.rs', 'src/lib.rs'],
      'the node order is the files sorted, so the same origin spec yields the same list',
    );
  });
});

test('UT: two claims resting on one file are one node, because the anchor is the file', () => {
  const document = { claims: [claimGrounding('src/lib.rs', 'clm-a'), claimGrounding('src/lib.rs', 'clm-b')] };

  withSpec(document, (specPath) => {
    const nodes = buildGraphNodes({ specPath });

    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].file, 'src/lib.rs');
  });
});

test('UT: an evidence record naming no file contributes no node rather than an ungrounded one', () => {
  const document = {
    claims: [
      claimGrounding('src/lib.rs'),
      { claim_id: 'clm-no-anchor', evidence: [{ evidence_mode: 'source_static' }] },
      { claim_id: 'clm-blank', evidence: [{ source_span: { file: '   ' } }] },
      { claim_id: 'clm-no-evidence' },
    ],
  };

  withSpec(document, (specPath) => {
    const nodes = buildGraphNodes({ specPath });

    assert.deepEqual(nodes.map((node) => node.file), ['src/lib.rs']);
  });
});

test('UT: the node set T3 judges resolves against the measured tree, so the gate passes on it', () => {
  // The anchors are written to disk, because T3 resolves each file and asks whether
  // it exists: a node list that only looks grounded would pass this assertion
  // without proving anything the gate does.
  const document = { claims: FIXTURE_SOURCE_FILES.map((file, index) => claimGrounding(file, `clm-${index}`)) };

  withSpec(document, (specPath) => {
    const measuredRoot = writeMeasuredTree(FIXTURE_SOURCE_FILES);
    try {
      const nodes = buildGraphNodes({ specPath });
      const record = assertGrounding({
        nodes,
        resolveFilePath: (file) => join(measuredRoot, file),
      });

      assert.equal(record.status, 'PASS');
      assert.equal(record.counts.nodes, FIXTURE_SOURCE_FILES.length);
      assert.equal(record.counts.unresolvable, 0);
    } finally {
      rmSync(measuredRoot, { recursive: true, force: true });
    }
  });
});

test('UT: a node anchored in a file the measured tree does not hold fails T3 by id', () => {
  const document = { claims: [claimGrounding('src/lib.rs'), claimGrounding('src/absent.rs')] };

  withSpec(document, (specPath) => {
    const measuredRoot = writeMeasuredTree(['src/lib.rs']);
    try {
      const record = assertGrounding({
        nodes: buildGraphNodes({ specPath }),
        resolveFilePath: (file) => join(measuredRoot, file),
      });

      assert.equal(record.status, 'FAIL');
      assert.equal(record.counts.unresolvable, 1);
      assert.match(record.reasons.join(' '), /src\/absent\.rs/);
    } finally {
      rmSync(measuredRoot, { recursive: true, force: true });
    }
  });
});

test('UT: an origin spec that cannot be read is refused rather than read as an empty node set', () => {
  const root = mkdtempSync(join(tmpdir(), 'wsp-p24-10-graph-'));
  try {
    assert.throws(() => buildGraphNodes({ specPath: join(root, 'no-such-spec.json') }), /ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
