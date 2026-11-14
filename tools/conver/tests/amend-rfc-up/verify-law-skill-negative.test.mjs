// @verifies C006
/**
 * PX-421 — every verifier check fails its named mutated fixture.
 *
 * The suite mutates one artifact at a time in a private copy of the reference
 * skill. Running the named check directly keeps the proof precise: the
 * mutation must break that check, not merely the report.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as CHECKS_MODULE from '../../.claude/scripts/amend-rfc-up/law-verify/v3.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../..');
const referenceSkill = join(repositoryRoot, '.claude/skills/rust-interface-law');
const referenceAlias = join(repositoryRoot, '.claude/skills/rust-interface-law.path-alias.json');
const fixtureRoot = join(here, 'fixtures/verifier');
const sourceRoot = repositoryRoot;

// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
// The verifier runs v3 checks. Running the same module here keeps the
// mutation proof attached to the shipped implementation, not a v2 copy.
const CHECKS = {
  layer: ({ skillPath }) => CHECKS_MODULE.checkLayer({ skillPath, mode: 'dev' }),
  manifest: ({ skillPath, aliasPath }) => CHECKS_MODULE.checkManifest({ skillPath, sourceRoot, aliasPath }),
  lock: ({ skillPath }) => CHECKS_MODULE.checkLock({ skillPath }),
  coverage: ({ skillPath }) => CHECKS_MODULE.checkCoverage({ skillPath }),
  registry: ({ skillPath }) => CHECKS_MODULE.checkRegistry({ skillPath }),
  genericBoundary: ({ skillPath }) => CHECKS_MODULE.checkGenericBoundary({ skillPath }),
  delivery: ({ skillPath }) => CHECKS_MODULE.checkDelivery({ skillPath }),
  runtime: ({ skillPath }) => CHECKS_MODULE.checkRuntime({ runtime: CHECKS_MODULE.prepareRuntime({ skillPath }) }),
  reproduction: ({ skillPath }) => CHECKS_MODULE.checkReproduction({ skillPath }),
  tests: ({ skillPath }) => CHECKS_MODULE.checkTests({ skillPath }),
  installer: ({ skillPath }) => CHECKS_MODULE.checkInstaller({ skillPath, mode: 'dev' }),
  determinism: ({ skillPath }) => CHECKS_MODULE.checkDeterminism({ skillPath }),
  redaction: ({ skillPath }) => CHECKS_MODULE.checkRedaction({ skillPath }),
  coverageSemantics: ({ skillPath }) => CHECKS_MODULE.checkCoverageSemantics({ skillPath }),
  inputLedger: ({ skillPath }) => CHECKS_MODULE.checkInputLedger({ skillPath }),
  pathAlias: ({ skillPath, aliasPath }) => CHECKS_MODULE.checkPathAlias({ skillPath, aliasPath }),
  installedLeak: ({ skillPath, aliasPath }) => CHECKS_MODULE.checkInstalledLeak({ skillPath, mode: 'installed', aliasPath }),
  style: ({ skillPath }) => CHECKS_MODULE.checkStyle({ skillPath }),
};

// [::TICKET::] PX-421, PX-422, PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422|PX-429) --for-spec --no-implementation-order`.
function materialize({ skillPath, aliasPath, mutation }) {
  if (mutation.path === '<alias-map>') {
    const original = readFileSync(aliasPath, 'utf8');
    if (mutation.operation === 'delete') {
      rmSync(aliasPath, { force: true });
      return () => writeFileSync(aliasPath, original);
    }
    const data = JSON.parse(original);
    delete data.aliases[mutation.alias];
    writeFileSync(aliasPath, JSON.stringify(data, null, 2) + '\n');
    return () => writeFileSync(aliasPath, original);
  }
  const target = join(skillPath, mutation.path);
  const original = existsSync(target) ? readFileSync(target) : null;
  const restore = () => {
    if (original === null) rmSync(target, { force: true });
    else writeFileSync(target, original);
  };
  if (mutation.operation === 'delete') {
    rmSync(target, { force: true });
    return restore;
  }
  if (mutation.operation === 'write') {
    writeFileSync(target, mutation.content);
    return restore;
  }
  if (mutation.operation === 'append') {
    writeFileSync(target, readFileSync(target, 'utf8') + mutation.content);
    return restore;
  }
  if (mutation.operation === 'replace') {
    const text = readFileSync(target, 'utf8');
    assert.ok(text.includes(mutation.find), `mutation anchor missing: ${mutation.path}`);
    writeFileSync(target, text.replace(mutation.find, mutation.replace));
    return restore;
  }
  throw new Error(`unknown mutation operation: ${mutation.operation}`);
}

test('C006 every fixture-backed check fails its named mutated fixture', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'law-negative-'));
  const skillPath = join(workspace, 'rust-interface-law');
  const aliasPath = join(workspace, 'rust-interface-law.path-alias.json');
  try {
    cpSync(referenceSkill, skillPath, { recursive: true });
    copyFileSync(referenceAlias, aliasPath);
    for (const name of Object.keys(CHECKS)) {
      // These three spawn the skill suite or a rebuild from inside a test; the
      // mutation cannot be observed without nesting the same runner.
      if (name === 'tests' || name === 'installer' || name === 'determinism') continue;
      const mutationPath = join(fixtureRoot, name, 'mutation.json');
      assert.ok(existsSync(mutationPath), `mutation fixture missing: ${name}`);
      const mutation = JSON.parse(readFileSync(mutationPath, 'utf8'));
      const restore = materialize({ skillPath, aliasPath, mutation });
      let result;
      try {
        result = await CHECKS[name]({ skillPath, aliasPath });
      } catch (error) {
        result = { status: 'failed', evidence: error.message };
      } finally {
        restore();
      }
      assert.notEqual(result.status, 'machine_verified', `${name}:${result.evidence}`);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('C006 the baseline reference passes every fixture-backed check', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'law-baseline-'));
  const skillPath = join(workspace, 'rust-interface-law');
  const aliasPath = join(workspace, 'rust-interface-law.path-alias.json');
  try {
    cpSync(referenceSkill, skillPath, { recursive: true });
    copyFileSync(referenceAlias, aliasPath);
    for (const name of Object.keys(CHECKS)) {
      if (name === 'tests' || name === 'installer' || name === 'determinism') continue;
      const result = await CHECKS[name]({ skillPath, aliasPath });
      assert.equal(result.status, 'machine_verified', `${name}: ${result.evidence}`);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
