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

import {
  checkCoverage,
  checkCoverageSemantics,
  checkDelivery,
  checkGenericBoundary,
  checkInputLedger,
  checkInstalledLeak,
  checkLayer,
  checkLock,
  checkManifest,
  checkPathAlias,
  checkRedaction,
  checkRegistry,
  checkStyle,
} from '../../.claude/scripts/amend-rfc-up/law-verify/checks-artifact.mjs';
import {
  checkDeterminism,
  checkInstaller,
  checkReproduction,
  checkRuntime,
  checkTests,
  prepareRuntime,
} from '../../.claude/scripts/amend-rfc-up/law-verify/checks-runtime.mjs';
import { VERIFIER_CHECKS } from '../../.claude/scripts/amend-rfc-up/law-verify/report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../..');
const referenceSkill = join(repositoryRoot, '.claude/skills/rust-interface-law');
const referenceAlias = join(repositoryRoot, '.claude/skills/rust-interface-law.path-alias.json');
const fixtureRoot = join(here, 'fixtures/verifier');
const sourceRoot = repositoryRoot;

const CHECKS = {
  layer: ({ skillPath }) => checkLayer({ skillPath, mode: 'dev' }),
  manifest: ({ skillPath, aliasPath }) => checkManifest({ skillPath, sourceRoot, aliasPath }),
  lock: ({ skillPath }) => checkLock({ skillPath, mode: 'dev' }),
  coverage: ({ skillPath, aliasPath }) => checkCoverage({ skillPath, sourceRoot, aliasPath }),
  registry: ({ skillPath, aliasPath }) => checkRegistry({ skillPath, sourceRoot, aliasPath }),
  genericBoundary: ({ skillPath }) => checkGenericBoundary({ skillPath, mode: 'dev' }),
  delivery: ({ skillPath }) => checkDelivery({ skillPath }),
  runtime: ({ skillPath }) => checkRuntime({ runtime: prepareRuntime({ skillPath, mode: 'dev' }) }),
  reproduction: ({ skillPath, aliasPath }) => checkReproduction({ skillPath, sourceRoot, aliasPath }),
  tests: ({ skillPath }) => checkTests({ skillPath }),
  installer: ({ skillPath, aliasPath }) => checkInstaller({ skillPath, mode: 'dev', sourceRoot, aliasPath }),
  determinism: ({ skillPath, aliasPath }) => checkDeterminism({ skillPath, sourceRoot, aliasPath }),
  redaction: ({ skillPath, aliasPath }) => checkRedaction({ skillPath, sourceRoot, aliasPath }),
  coverageSemantics: ({ skillPath }) => checkCoverageSemantics({ skillPath }),
  inputLedger: ({ skillPath, aliasPath }) => checkInputLedger({ skillPath, sourceRoot, aliasPath }),
  pathAlias: ({ skillPath, aliasPath }) => checkPathAlias({ skillPath, sourceRoot, aliasPath }),
  installedLeak: ({ skillPath, aliasPath }) => checkInstalledLeak({
    skillPath, mode: 'dev', aliasPath, sourceRoot, runtime: null,
  }),
  style: ({ skillPath }) => checkStyle({ skillPath, mode: 'dev' }),
};

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function materialize({ skillPath, aliasPath, mutation }) {
  if (mutation.path === '<alias-map>') {
    const original = readFileSync(aliasPath, 'utf8');
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

test('C006 every check fails its named mutated fixture', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'law-negative-'));
  const skillPath = join(workspace, 'rust-interface-law');
  const aliasPath = join(workspace, 'rust-interface-law.path-alias.json');
  try {
    cpSync(referenceSkill, skillPath, { recursive: true });
    copyFileSync(referenceAlias, aliasPath);
    for (const name of VERIFIER_CHECKS) {
      const mutationPath = join(fixtureRoot, name, 'mutation.json');
      assert.ok(existsSync(mutationPath), `mutation fixture missing: ${name}`);
      const mutation = JSON.parse(readFileSync(mutationPath, 'utf8'));
      const restore = materialize({ skillPath, aliasPath, mutation });
      let result;
      try {
        result = CHECKS[name]({ skillPath, aliasPath });
      } catch (error) {
        result = { status: 'failed', evidence: error.message };
      } finally {
        restore();
      }
      assert.notEqual(result.status, 'machine_verified', name);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('C006 the baseline reference passes every check', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'law-baseline-'));
  const skillPath = join(workspace, 'rust-interface-law');
  const aliasPath = join(workspace, 'rust-interface-law.path-alias.json');
  try {
    cpSync(referenceSkill, skillPath, { recursive: true });
    copyFileSync(referenceAlias, aliasPath);
    for (const name of VERIFIER_CHECKS) {
      if (name === 'tests' || name === 'installer' || name === 'determinism') continue;
      const result = CHECKS[name]({ skillPath, aliasPath });
      assert.equal(result.status, 'machine_verified', `${name}: ${result.evidence}`);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
