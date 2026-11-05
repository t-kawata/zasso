// The progress title gains " v<version>" only when the git toplevel of the
// directory the script runs in holds a VERSION.json with a usable version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  readVersionSuffix,
  run,
} from '../../.claude/scripts/conver/draw-progress-gif.js';
import { writeWorkspace } from './fixtures.mjs';

const MAX_BUFFER = 64 * 1024 * 1024;

/** Run one git command that the fixture setup relies on, failing loudly if it does. */
function initializeGitRepository(directory) {
  const result = spawnSync('git', ['init', '-q'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

/** A fresh git repository whose VERSION.json holds the given document, or none. */
function createGitRepository(versionDocument) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-version-'));
  initializeGitRepository(root);
  if (versionDocument !== undefined) {
    const contents = typeof versionDocument === 'string'
      ? versionDocument
      : JSON.stringify(versionDocument);
    fs.writeFileSync(path.join(root, 'VERSION.json'), contents);
  }
  return root;
}

/** The options run() receives from parseArgs, with no browser and no source scan. */
function runOptions(overrides = {}) {
  return {
    open: false,
    dryRun: false,
    sourceScan: false,
    frames: 20,
    fps: 10,
    speedMs: null,
    scale: 1,
    maxBytes: 300 * 1024 * 1024,
    snapshotDir: null,
    ...overrides,
  };
}

test('readVersionSuffix returns an empty suffix when VERSION.json is absent', () => {
  const root = createGitRepository();

  assert.equal(readVersionSuffix(root), '');
});

test('readVersionSuffix appends the version parsed from VERSION.json', () => {
  const root = createGitRepository({ version: '0.0.355' });

  assert.equal(readVersionSuffix(root), ' v0.0.355');
});

test('readVersionSuffix returns an empty suffix when VERSION.json is not valid JSON', () => {
  const root = createGitRepository('{ "version": ');

  assert.equal(readVersionSuffix(root), '');
});

test('readVersionSuffix returns an empty suffix without a usable version string', () => {
  const documents = [{}, { version: 355 }, { version: null }, { version: '' }, [1, 2]];

  for (const document of documents) {
    const root = createGitRepository(document);
    assert.equal(readVersionSuffix(root), '', JSON.stringify(document));
  }
});

test('readVersionSuffix resolves VERSION.json at the git toplevel from a subdirectory', () => {
  const root = createGitRepository({ version: '1.2.3' });
  const nested = path.join(root, 'nested', 'deeper');
  fs.mkdirSync(nested, { recursive: true });

  assert.equal(readVersionSuffix(nested), ' v1.2.3');
});

test('readVersionSuffix returns an empty suffix outside a git repository', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-no-git-'));

  assert.equal(readVersionSuffix(root), '');
});

test('run carries the version into the rendered title and the model title name', async () => {
  const versionRoot = createGitRepository({ version: '1.2.3' });
  const workspace = writeWorkspace({
    packages: [{ id: 'pkg-1', name: 'pkg-1', path: 'pkg-1' }],
  });
  const emptyConfig = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-empty-config-'));
  const previousCwd = process.cwd();
  const previousConfig = process.env.CLAUDE_CONFIG_DIR;
  let result;
  try {
    process.chdir(versionRoot);
    process.env.CLAUDE_CONFIG_DIR = emptyConfig;
    result = await run(workspace, runOptions());
  } finally {
    process.chdir(previousCwd);
    if (previousConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previousConfig;
  }

  const html = fs.readFileSync(result.output.html, 'utf8');
  const title = `PROGRESS: ${path.basename(workspace)} v1.2.3`;
  // The serialized model drives the per-frame usage titles, so the version must
  // live in titleName and not only in the static <title> element.
  assert.ok(html.includes(`"titleName":"${path.basename(workspace)} v1.2.3"`));
  assert.ok(html.includes(title), `missing title: ${title}`);
});
