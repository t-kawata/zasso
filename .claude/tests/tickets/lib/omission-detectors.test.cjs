#!/usr/bin/env node
'use strict';

// @verifies C006

/**
 * Unit tests for artifact state in omission-detectors.js.
 *
 * The rfc family resolves to RFC.md and the spec family may resolve to a markdown
 * SPEC.md. Both are prose artifacts, so readability must mean "the file can be
 * read", not "the file parses as JSON". Without that distinction every present
 * markdown RFC is ARTIFACT_UNREADABLE and the detection gate can never measure
 * the surface. All fixtures are synthetic temporary trees.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { artifactStatus, artifactState } = require('../../../scripts/tickets/lib/omission-detectors');

/** Build a package directory with the artifacts a real package carries. */
// [::TICKET::] PX-414 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-414 --for-spec --no-implementation-order`.
function createPackageFixture({ rfcContent = '# RFC\n\nProse, not JSON.\n', graphContent = '{"nodes":[],"edges":[]}' } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'omission-detectors-'));
  fs.writeFileSync(path.join(cwd, 'Tickets.json'), '{"phases":[]}', 'utf8');
  fs.writeFileSync(path.join(cwd, 'RFC-GRAPH.json'), graphContent, 'utf8');
  fs.writeFileSync(path.join(cwd, 'RFC-Dirs-Tree.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(cwd, 'SEQUENCES.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(cwd, 'RFC-FORMULAS.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(cwd, 'RFC.md'), rfcContent, 'utf8');
  fs.mkdirSync(path.join(cwd, 'specs'));
  return cwd;
}

describe('artifactStatus', () => {
  test('reports a markdown RFC as present, not unreadable', () => {
    const cwd = createPackageFixture();
    const status = artifactStatus({ cwd });

    assert.strictEqual(status.families.rfc.state, 'present');
    assert.strictEqual(status.families.rfc.reason, null);
  });

  test('still reports a malformed JSON graph as unreadable', () => {
    const cwd = createPackageFixture({ graphContent: '{ not json' });
    const status = artifactStatus({ cwd });

    assert.strictEqual(status.families['graph-node'].state, 'unreadable');
    assert.strictEqual(status.families['graph-node'].reason, 'ARTIFACT_UNREADABLE');
  });

  test('reports an absent RFC as absent', () => {
    const cwd = createPackageFixture();
    fs.unlinkSync(path.join(cwd, 'RFC.md'));
    const status = artifactStatus({ cwd });

    assert.strictEqual(status.families.rfc.state, 'absent');
    assert.strictEqual(status.families.rfc.reason, 'ARTIFACT_MISSING');
  });
});

describe('artifactState', () => {
  test('treats a directory as present without parsing it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-dir-'));

    assert.deepStrictEqual(artifactState(dir, { directory: true }), {
      state: 'present',
      path: dir,
      reason: null,
    });
  });

  test('parses a JSON artifact regardless of extension case', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-json-'));
    const file = path.join(dir, 'SIDECAR.JSON');
    fs.writeFileSync(file, '{"ok":true}', 'utf8');

    assert.deepStrictEqual(artifactState(file), { state: 'present', path: file, reason: null });
  });
});
