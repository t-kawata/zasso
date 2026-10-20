// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
/**
 * The workspace root contract.
 *
 * The current directory, or the single argument when one is given, is the root itself.
 * A directory that happens to sit below a workspace must not be upgraded to that parent:
 * judging a different workspace than the one the caller named is the failure this contract
 * exists to prevent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCommand } from '../../.claude/scripts/smooth-sequences/run.mjs';
import {
  TREE_MANIFEST_FILE_NAME,
  materializeSmoothWorkspace,
  minimalV3Artifact,
} from './helpers/workspace-fixture.mjs';

const QUIET = Object.freeze({ stdout: () => {}, stderr: () => {} });
const RUN_DIRECTORY = 'smooth-sequences';

/** Run the detector with `directory` as the process working directory. */
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
function runFrom(directory, argv = []) {
  const previousDirectory = process.cwd();
  process.chdir(directory);
  try {
    return runCommand(argv, QUIET);
  } finally {
    process.chdir(previousDirectory);
  }
}

test('with no argument the current directory is the workspace root', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const result = runFrom(workspace.root);
    assert.equal(result.exitCode, 0);
    assert.ok(existsSync(join(workspace.root, RUN_DIRECTORY, 'SMOOTH-SEQUENCES.json')));
  } finally {
    workspace.remove();
  }
});

test('with no argument a subdirectory is not upgraded to an ancestor workspace', () => {
  const workspace = materializeSmoothWorkspace();
  const child = join(workspace.root, 'nested');
  mkdirSync(child);
  try {
    const result = runFrom(child);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
    assert.equal(existsSync(join(workspace.root, RUN_DIRECTORY)), false);
  } finally {
    workspace.remove();
  }
});

test('an explicit root is checked directly instead of searching its ancestors', () => {
  const workspace = materializeSmoothWorkspace();
  const child = join(workspace.root, 'nested');
  mkdirSync(child);
  writeFileSync(join(child, TREE_MANIFEST_FILE_NAME), '{}');
  try {
    const result = runCommand([child], QUIET);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
  } finally {
    workspace.remove();
  }
});

test('a directory that is not a workspace root exits 2 and writes no report', () => {
  const directory = mkdtempSync(join(tmpdir(), 'smooth-sequences-not-a-root-'));
  try {
    const result = runCommand([directory], QUIET);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a root with no sequences artifact exits 2 and writes no report', () => {
  const workspace = materializeSmoothWorkspace();
  unlinkSync(workspace.artifactPath);
  try {
    const result = runCommand([workspace.root], QUIET);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
    assert.equal(existsSync(join(workspace.root, RUN_DIRECTORY)), false);
  } finally {
    workspace.remove();
  }
});

test('a root with two sequences artifacts exits 2 and writes no report', () => {
  const workspace = materializeSmoothWorkspace();
  writeFileSync(join(workspace.root, 'second-sequences.json'), JSON.stringify(minimalV3Artifact()));
  try {
    const result = runCommand([workspace.root], QUIET);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report, null);
    assert.equal(existsSync(join(workspace.root, RUN_DIRECTORY)), false);
  } finally {
    workspace.remove();
  }
});

test('an artifact path is resolved to its containing root', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const result = runCommand([workspace.artifactPath], QUIET);
    assert.equal(result.exitCode, 0);
    assert.ok(result.report);
  } finally {
    workspace.remove();
  }
});
