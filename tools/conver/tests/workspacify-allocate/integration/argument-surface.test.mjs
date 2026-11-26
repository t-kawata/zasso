// PX-454 @verifies C005
/**
 * The forward workspacify-allocate surface.
 *
 * The stage-one manifest is fixed at WORKSPACIFY-TREE-MANIFEST.json in the
 * workspace root. The command takes no manifest argument; --package remains a
 * selector for the packet subcommand. The decisions document remains derived.
 * Reverse mode keeps its own surface.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  RESERVED_ALLOCATE_SUBDIRECTORY,
  RESERVED_DECISIONS_FILE_NAME,
  RESERVED_ROOT_NAME,
  reservedAllocateDecisionsPath,
} from '../../../.claude/scripts/workspacify-tree/lib/reserved-root.mjs';
import { ALLOCATE_MANIFEST_FILE_NAME, SEED_FILE_NAME } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUNNER = join(PROJECT_ROOT, '.claude/scripts/workspacify-allocate/run.mjs');
const COMMAND_PATH = join(PROJECT_ROOT, '.claude/commands/workspacify-allocate.md');
const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

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

function authorDecisions(dir, manifest, options) {
  const decisionsPath = reservedAllocateDecisionsPath(dir);
  mkdirSync(join(dir, RESERVED_ROOT_NAME, RESERVED_ALLOCATE_SUBDIRECTORY), { recursive: true });
  writeFileSync(decisionsPath, `${JSON.stringify(makeDecisions(manifest, options))}\n`);
  return decisionsPath;
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

function seedsUnder(root) {
  const found = [];
  const visit = (abs, rel) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === RESERVED_ROOT_NAME) continue;
        visit(join(abs, entry.name), relPath);
      } else if (entry.name === SEED_FILE_NAME) {
        found.push(relPath);
      }
    }
  };
  visit(root, '');
  return found.sort();
}

test('PX-454 / C005 precondition: the forward entrance declares no manifest argument', () => {
  const declared = survivingArguments();
  assert.equal(
    declared.includes('<path-to-WORKSPACIFY-TREE-MANIFEST.json>'),
    false,
    'the dynamic manifest argument left the command line',
  );
  assert.equal(declared.includes('<manifest>'), false, 'the positional spelling left the command line');
  assert.equal(declared.includes('--package'), true, 'the packet selector remains a declared option');
  assert.match(readFileSync(RUNNER, 'utf8'), /WORKSPACIFY-TREE-MANIFEST\.json/, 'the fixed name is stated by the script');
});

test('PX-454 / C005 postcondition: validate and plan read the fixed manifest with no argument', () => {
  const fixture = materializeSeedFixture();
  try {
    for (const subcommand of ['validate', 'plan']) {
      const run = runChain([subcommand], fixture.dir);
      assert.equal(run.status, 0, `${subcommand}: ${run.text}`);
      assert.match(run.stdout, /PASS|plan|PASS/, subcommand);
    }
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('PX-454 / C005 postcondition: finalize completes with no argument and publishes the manifest', () => {
  const fixture = materializeSeedFixture();
  try {
    const decisionsPath = authorDecisions(fixture.dir, fixture.manifest);
    const stagedText = readFileSync(decisionsPath, 'utf8');
    const run = runChain(['finalize'], fixture.dir);
    assert.equal(run.status, 0, run.text);

    assert.equal(existsSync(join(fixture.dir, ALLOCATE_MANIFEST_FILE_NAME)), true, 'the allocate manifest is published');
    assert.equal(existsSync(join(fixture.dir, TREE_MANIFEST_FILE_NAME)), true, 'the stage-one manifest is still there');
    assert.deepEqual(
      seedsUnder(fixture.dir),
      (fixture.manifest.workspace?.packages ?? []).map((pkg) => `${pkg.path}/${SEED_FILE_NAME}`).sort(),
      'one seed per package, placed in the package rather than in the reserve',
    );
    assert.equal(readFileSync(decisionsPath, 'utf8'), stagedText, 'the authored decisions document survives byte-identical');
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('PX-454 / C005 error case: a non-empty argument is refused and nothing is published', () => {
  const fixture = materializeSeedFixture();
  try {
    authorDecisions(fixture.dir, fixture.manifest);
    for (const args of [['validate', 'other.json'], ['finalize', 'other.json']]) {
      const run = runChain(args, fixture.dir);
      assert.equal(run.status, 1, `${args.join(' ')}: ${run.text}`);
      assert.match(run.text, /WORKSPACIFY-TREE-MANIFEST\.json|takes no manifest argument/);
      assert.equal(existsSync(join(fixture.dir, ALLOCATE_MANIFEST_FILE_NAME)), false, 'a refusal publishes nothing');
    }
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('PX-454 / C005 error case: a missing fixed manifest is refused by name', () => {
  const fixture = materializeSeedFixture();
  try {
    rmSync(fixture.manifestPath, { force: true });
    const run = runChain(['validate'], fixture.dir);
    assert.equal(run.status, 1, run.text);
    assert.match(run.text, /WORKSPACIFY-TREE-MANIFEST\.json/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('PX-454 / C005 invariant: the decisions document is derived, and a decisions token is refused by name', () => {
  const fixture = materializeSeedFixture();
  try {
    const derived = reservedAllocateDecisionsPath(fixture.dir);
    mkdirSync(join(fixture.dir, RESERVED_ROOT_NAME, RESERVED_ALLOCATE_SUBDIRECTORY), { recursive: true });
    writeFileSync(derived, '{\n  "not": "a decisions document"\n}\n');

    const run = runChain(['finalize', '--decisions=/tmp/other.json'], fixture.dir);
    assert.equal(run.status, 1);
    assert.ok(run.text.includes('--decisions=/tmp/other.json'), 'the whole token is named');
    assert.doesNotMatch(run.stdout, /not readable JSON|schema/i, 'the derived document is not read on the way to the refusal');
    assert.equal(existsSync(join(fixture.dir, ALLOCATE_MANIFEST_FILE_NAME)), false, 'a refusal publishes nothing');
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('PX-454 / C005 invariant: the packet selector remains available without a manifest argument', () => {
  const fixture = materializeSeedFixture();
  try {
    const packageId = fixture.manifest.workspace?.packages?.[0]?.id;
    const run = runChain(['packet', `--package=${packageId}`], fixture.dir);
    assert.equal(run.status, 0, run.text);
    assert.match(run.stdout, /package|owned|inventory/i);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('PX-454 / C005 invariant: reverse mode keeps its own surface', () => {
  const fixture = materializeSeedFixture();
  try {
    const run = runChain(['reverse'], fixture.dir);
    // Reverse is a separate rotation; a missing measured tree is its own refusal,
    // never a missing-manifest refusal.
    assert.notEqual(run.status, 0);
    assert.doesNotMatch(run.text, /takes no manifest argument/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});
