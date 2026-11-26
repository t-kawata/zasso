// PX-454 @verifies C005
/**
 * The forward workspacify-tree surface.
 *
 * The specification is fixed at SYSTEM-DESIGN.md in the workspace root. The
 * command takes no specification argument; the decisions document remains
 * derived rather than selected. Reverse mode keeps its own surface.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  RESERVED_DECISIONS_FILE_NAME,
  RESERVED_ROOT_NAME,
  RESERVED_TREE_SUBDIRECTORY,
  reservedTreeDecisionsPath,
} from '../../../.claude/scripts/workspacify-tree/lib/reserved-root.mjs';
import { normalizeTextBytes } from '../../../.claude/scripts/workspacify-tree/lib/normalization.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUNNER = join(PROJECT_ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const FIXTURES = join(PROJECT_ROOT, 'tests/workspacify-tree/fixtures');
const SPEC_NAME = 'objects-table.md';
const SYSTEM_DESIGN_NAME = 'SYSTEM-DESIGN.md';
const DECISIONS_NAME = 'decisions-complete.json';
const MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

/** The declared surface of the entrance, read from its one declaration. */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function declaredUsage(source) {
  const usage = /function printUsage\(\) \{\s*return \[([\s\S]*?)\]\.join\('\\n'\)/.exec(source);
  assert.notEqual(usage, null, 'the entrance declares its surface in one block');
  return usage[1];
}

/** The options and placeholders a usage block names, as the tokens it writes. */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function declaredTokens(usage) {
  const options = [...usage.matchAll(/--[a-z][a-z-]*/g)].map(([name]) => name);
  const placeholders = [...usage.matchAll(/(?:^|[^=\w])(<[^>\s]+>)/g)]
    .map(([, name]) => name)
    .filter((name) => !name.includes('|'));
  return [...new Set([...options, ...placeholders])];
}

function survivingArguments() {
  return declaredTokens(declaredUsage(readFileSync(RUNNER, 'utf8')));
}

/**
 * A subject holding SYSTEM-DESIGN.md and, optionally, the decisions document at
 * the reserved path the rotation derives.
 */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function createSubject({ withDecisions = true, withSpec = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'workspacify-tree-surface-')));
  const specPath = join(root, SYSTEM_DESIGN_NAME);
  if (withSpec) copyFileSync(join(FIXTURES, SPEC_NAME), specPath);
  if (withDecisions) {
    mkdirSync(join(root, RESERVED_ROOT_NAME, RESERVED_TREE_SUBDIRECTORY), { recursive: true });
    copyFileSync(join(FIXTURES, DECISIONS_NAME), reservedTreeDecisionsPath(root));
  }
  return {
    root,
    specPath,
    manifestPath: join(root, MANIFEST_FILE_NAME),
    decisionsPath: reservedTreeDecisionsPath(root),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function runChain(args, cwd) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], { cwd, encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    text: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function decisionsPathNamedIn(text) {
  const named = new RegExp(`[^\\s"'\`]*${RESERVED_ROOT_NAME}[^\\s"'\`]*${RESERVED_DECISIONS_FILE_NAME}`).exec(text);
  return named === null ? null : named[0];
}

test('PX-454 / C005 precondition: the forward entrance declares no specification argument', () => {
  const declared = survivingArguments();
  assert.equal(declared.includes('--spec'), false, 'the dynamic specification argument left the command line');
  assert.equal(declared.includes('<spec>'), false, 'the positional spelling left the command line');
  assert.equal(
    declared.includes('<path-to-specification.md>'),
    false,
    'the documentation placeholder left the command line',
  );
  assert.match(readFileSync(RUNNER, 'utf8'), /SYSTEM-DESIGN\.md/, 'the fixed name is stated by the script');
});

test('PX-454 / C005 postcondition: parse and extract read SYSTEM-DESIGN.md with no argument', () => {
  const subject = createSubject();
  try {
    for (const subcommand of ['parse', 'extract']) {
      const run = runChain([subcommand], subject.root);
      assert.equal(run.status, 0, `${subcommand}: ${run.text}`);
      assert.match(run.text, /SYSTEM-DESIGN\.md|reconstruction|harvested|PASS/i, subcommand);
    }
  } finally {
    subject.dispose();
  }
});

test('PX-454 / C005 postcondition: gate and finalize complete with no argument and publish the manifest', () => {
  const subject = createSubject();
  try {
    const before = readFileSync(subject.specPath);
    const gate = runChain(['gate'], subject.root);
    assert.equal(gate.status, 0, gate.text);
    const finalize = runChain(['finalize'], subject.root);
    assert.equal(finalize.status, 0, finalize.text);

    assert.equal(existsSync(subject.manifestPath), true, 'the manifest is published at the workspace root');
    assert.deepEqual(readFileSync(subject.specPath), before, 'the fixed input is read and never rewritten');

    const manifest = JSON.parse(readFileSync(subject.manifestPath, 'utf8'));
    assert.equal(manifest.input.spec_path, SYSTEM_DESIGN_NAME, 'the fixed basename is recorded');
    assert.equal(
      manifest.input.source_hash,
      sha256Hex(normalizeTextBytes(before).bytes),
      'the recorded hash is the hash of the normalised fixed input',
    );
    assert.equal(
      existsSync(subject.decisionsPath),
      true,
      'the decisions document remains derived rather than selected and survives the run',
    );
  } finally {
    subject.dispose();
  }
});

test('PX-454 / C005 error case: a non-empty argument is refused and nothing is published', () => {
  const subject = createSubject();
  try {
    for (const args of [['parse', 'dynamic.md'], ['gate', '--spec=dynamic.md'], ['finalize', '--spec=dynamic.md']]) {
      const run = runChain(args, subject.root);
      assert.equal(run.status, 1, `${args.join(' ')}: ${run.text}`);
      assert.match(run.text, /SYSTEM-DESIGN\.md|takes no argument/);
      assert.equal(existsSync(subject.manifestPath), false, 'a refusal publishes nothing');
    }
  } finally {
    subject.dispose();
  }
});

test('PX-454 / C005 error case: a missing SYSTEM-DESIGN.md is refused by name', () => {
  const subject = createSubject({ withSpec: false });
  try {
    const run = runChain(['parse'], subject.root);
    assert.equal(run.status, 1, run.text);
    assert.match(run.text, /SYSTEM-DESIGN\.md/);
  } finally {
    subject.dispose();
  }
});

test('PX-454 / C005 invariant: the decisions document is derived, and a decisions token is refused by name', () => {
  const subject = createSubject({ withDecisions: false });
  try {
    const gate = runChain(['gate'], subject.root);
    assert.equal(gate.status, 1, 'a gate with no decisions document cannot pass');
    assert.equal(decisionsPathNamedIn(gate.text), subject.decisionsPath, 'the refusal names the derived file');

    const refused = runChain(['gate', '--decisions=/tmp/other.json'], subject.root);
    assert.equal(refused.status, 1);
    assert.ok(refused.text.includes('--decisions=/tmp/other.json'));
    assert.equal(existsSync(subject.manifestPath), false, 'a refusal publishes nothing');
  } finally {
    subject.dispose();
  }
});

test('PX-454 / C005 invariant: reverse mode keeps its own surface and refuses --spec', () => {
  const subject = createSubject();
  try {
    const run = runChain(['reverse', '--spec=dynamic.md'], subject.root);
    assert.equal(run.status, 1, run.text);
    assert.match(run.text, /withdrawn option|--spec/);
  } finally {
    subject.dispose();
  }
});
