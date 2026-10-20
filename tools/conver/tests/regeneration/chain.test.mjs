import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { verifyChain } from '../../.claude/scripts/regeneration/lib/chain.mjs';
import {
  ALLOCATE_FILE_NAME,
  ARTIFACT_FILE_NAME,
  TREE_FILE_NAME,
  listDesignFiles,
  materializeChainWorkspace,
} from './helpers/chain-fixture.mjs';

// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.

/** Every failing code the chain produced. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function failingCodes(result) {
  return result.links.filter((link) => !link.ok).map((link) => link.code);
}

/** Read and write one JSON file under the fixture root. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function editJson(root, fileName, edit) {
  const path = join(root, fileName);
  const value = JSON.parse(readFileSync(path, 'utf8'));
  edit(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// @verifies C001
test('a consistent chain verifies every link', () => {
  const workspace = materializeChainWorkspace();
  try {
    const result = verifyChain(workspace.root);
    assert.equal(result.declared, true);
    assert.equal(result.ok, true);
    assert.deepEqual(result.links.filter((link) => !link.ok), []);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('changed spec bytes report SPEC_DIGEST_MISMATCH', () => {
  const workspace = materializeChainWorkspace();
  try {
    writeFileSync(join(workspace.root, 'spec.md'), '# changed\n');
    assert.ok(failingCodes(verifyChain(workspace.root)).includes('SPEC_DIGEST_MISMATCH'));
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a tampered tree manifest reports TREE_SELF_HASH_MISMATCH', () => {
  const workspace = materializeChainWorkspace();
  try {
    editJson(workspace.root, TREE_FILE_NAME, (manifest) => { manifest.status = 'FAIL'; });
    assert.ok(failingCodes(verifyChain(workspace.root)).includes('TREE_SELF_HASH_MISMATCH'));
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('an allocate tree link that differs reports TREE_LINK_MISMATCH', () => {
  const workspace = materializeChainWorkspace();
  try {
    editJson(workspace.root, ALLOCATE_FILE_NAME, (manifest) => { manifest.input_tree_manifest.hash = '0'.repeat(64); });
    assert.ok(failingCodes(verifyChain(workspace.root)).includes('TREE_LINK_MISMATCH'));
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('an allocate spec link that differs reports SPEC_LINK_MISMATCH', () => {
  const workspace = materializeChainWorkspace();
  try {
    editJson(workspace.root, ALLOCATE_FILE_NAME, (manifest) => { manifest.input_tree_manifest.spec.sha256 = '0'.repeat(64); });
    assert.ok(failingCodes(verifyChain(workspace.root)).includes('SPEC_LINK_MISMATCH'));
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a tampered allocate manifest reports ALLOCATE_SELF_HASH_MISMATCH', () => {
  const workspace = materializeChainWorkspace();
  try {
    editJson(workspace.root, ALLOCATE_FILE_NAME, (manifest) => { manifest.status = 'FAIL'; });
    assert.ok(failingCodes(verifyChain(workspace.root)).includes('ALLOCATE_SELF_HASH_MISMATCH'));
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a tampered artifact spec hash reports ARTIFACT_SPEC_MISMATCH', () => {
  const workspace = materializeChainWorkspace();
  try {
    editJson(workspace.root, ARTIFACT_FILE_NAME, (artifact) => { artifact.spec.sha256 = '0'.repeat(64); });
    assert.ok(failingCodes(verifyChain(workspace.root)).includes('ARTIFACT_SPEC_MISMATCH'));
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a tampered seed reports SEED_DIGEST_MISMATCH', () => {
  const workspace = materializeChainWorkspace();
  try {
    writeFileSync(join(workspace.root, 'crates/alpha/RFC-SEED.md'), '# changed seed\n');
    assert.ok(failingCodes(verifyChain(workspace.root)).includes('SEED_DIGEST_MISMATCH'));
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a view that names another package reports VIEW_LINK_MISMATCH', () => {
  const workspace = materializeChainWorkspace();
  try {
    writeFileSync(join(workspace.root, 'crates/alpha/SEQUENCES.json'), `${JSON.stringify({ packageId: 'pkg-9999', ownedOperationUnits: [] })}\n`);
    assert.ok(failingCodes(verifyChain(workspace.root)).includes('VIEW_LINK_MISMATCH'));
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a missing artifact reports ARTIFACT_MISSING', () => {
  const workspace = materializeChainWorkspace();
  try {
    rmSync(join(workspace.root, ARTIFACT_FILE_NAME));
    assert.ok(failingCodes(verifyChain(workspace.root)).includes('ARTIFACT_MISSING'));
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a workspace without chain fields is declared false and not treated as verified', () => {
  const workspace = materializeChainWorkspace();
  try {
    editJson(workspace.root, TREE_FILE_NAME, (manifest) => { delete manifest.input.source_hash; });
    const result = verifyChain(workspace.root);
    assert.equal(result.declared, false);
    assert.equal(result.ok, false);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('the chain names every design file it read', () => {
  const workspace = materializeChainWorkspace();
  try {
    const result = verifyChain(workspace.root);
    assert.ok(result.links.length >= 8);
    assert.ok(listDesignFiles(workspace.root).includes('crates/alpha/RFC.md'));
  } finally {
    workspace.remove();
  }
});
