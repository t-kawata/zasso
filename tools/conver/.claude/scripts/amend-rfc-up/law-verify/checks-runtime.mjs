/**
 * Runtime and reproduction checks.
 *
 * `prepareRuntime` executes the shipped entry point once. `runtime` and
 * `installedLeak` consume the same evidence, so a passing runtime cannot be
 * claimed from a separate, weaker execution.
 */

import fs from 'node:fs';
import os from 'node:os';
import { cpSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  EVIDENCE_LIMIT,
  exists,
  listFiles,
  normalizeLf,
  readText,
  redactText,
  sha256Text,
  status,
  writeAtomic,
} from './source.mjs';
import { loadSourceContext } from './checks-artifact.mjs';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const VERIFIER_PATH = path.resolve(MODULE_DIRECTORY, '../verify-law-skill.mjs');
const CORE_TEST_FILES = Object.freeze([
  'atom-lock.test.mjs',
  'redaction.test.mjs',
  'generic-boundary.test.mjs',
  'skill-runtime.test.mjs',
  'integration.test.mjs',
  'bootstrap.test.mjs',
  'scaffold.test.mjs',
  'context-phases.test.mjs',
  'render.test.mjs',
  'applicability.test.mjs',
  'pipeline-checkpoints.test.mjs',
  'source-rederivation.test.mjs',
]);
const META_TEST_FILES = Object.freeze(['installed-parity.test.mjs', 'verifier-negative.test.mjs']);
const REQUIRED_TEST_FILES = Object.freeze([...CORE_TEST_FILES, ...META_TEST_FILES]);
const INSTALLED_ROOTS = Object.freeze(['dist/', 'okf/', 'source/', 'templates/', 'tests/fixtures/runtime/']);
const BUILD_COMMAND_PATTERN = /\b(?:npm\s+run\s+build|tsc\b|esbuild\b|build-[a-z0-9-]+)\b/;
const COPY_COMMAND_PATTERN = /\b(?:copyFileSync|cpSync|cp\s+-R|rsync)\b/;

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function failed(code, evidence, extra = {}) {
  return status('failed', evidence, { codes: [code], ...extra });
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function verified(evidence, extra = {}) {
  return status('machine_verified', evidence, { codes: [], ...extra });
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function runNode(scriptPath, args, cwd) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function parseTestCounts(output) {
  const tests = output.match(/(?:#|ℹ) tests (\d+)/)?.[1];
  const pass = output.match(/(?:#|ℹ) pass (\d+)/)?.[1];
  const fail = output.match(/(?:#|ℹ) fail (\d+)/)?.[1];
  return { tests: Number(tests ?? -1), pass: Number(pass ?? -1), fail: Number(fail ?? -1) };
}

export function renderSourceView({ documents, redaction }) {
  const parts = ['# Source View', '', 'Generated from the source documents. Do not edit.', ''];
  for (const document of documents) {
    const text = redactText(document.text, redaction).replace(/\n+$/, '');
    parts.push(`# Source: ${document.alias}`, '', text, '');
  }
  return parts.join('\n');
}

export function prepareRuntime({ skillPath, mode }) {
  const fixturePath = path.join(skillPath, 'tests/fixtures/runtime/runtime.json');
  if (!exists(fixturePath)) {
    return { ok: false, codes: ['RUNTIME_FIXTURE_MISSING'], evidence: 'tests/fixtures/runtime/runtime.json is missing' };
  }
  let fixture;
  try {
    fixture = JSON.parse(readText(fixturePath));
  } catch (error) {
    return { ok: false, codes: ['RUNTIME_FIXTURE_MISSING'], evidence: `runtime fixture is not JSON: ${error.message}` };
  }
  const distPath = path.join(skillPath, 'dist/skill.mjs');
  if (!exists(distPath)) {
    return { ok: false, codes: ['RUNTIME_FAILED'], evidence: 'dist/skill.mjs is missing' };
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'law-runtime-'));
  // Cargo writes target/ beside the manifest; run a copy so the skill tree stays clean.
  const fixtureRoot = path.join(temporary, 'fixtures');
  cpSync(path.join(skillPath, 'tests/fixtures/runtime'), fixtureRoot, { recursive: true });
  const appliedRoot = path.resolve(fixtureRoot, fixture.applies.root);
  const unrelatedRoot = path.resolve(fixtureRoot, fixture.unrelated.root);
  const manifestPath = path.join(temporary, 'manifest.json');
  const ledgerPath = path.join(temporary, 'ledger.json');
  const gatePath = path.join(temporary, 'gate.json');
  const rowsPath = path.join(temporary, 'rows.json');
  const failures = [];
  const record = (label, result, expected) => {
    if (!expected.includes(result.status)) {
      failures.push(`${label} exited ${result.status}`);
    }
    return result;
  };

  record('applies applicable', runNode(distPath, ['applies', '--root', appliedRoot, '--paths', fixture.applies.paths.join(',')], appliedRoot), [fixture.applies.expect]);
  record('applies unrelated', runNode(distPath, ['applies', '--root', unrelatedRoot, '--paths', fixture.unrelated.paths.join(',')], unrelatedRoot), [fixture.unrelated.expect]);

  const resolveResult = runNode(distPath, [
    'resolve', '--root', appliedRoot, '--paths', fixture.applies.paths.join(','), '--out', manifestPath,
  ], appliedRoot);
  record('resolve', resolveResult, [0]);
  if (!exists(manifestPath)) failures.push('resolve produced no manifest');

  let manifest = null;
  if (exists(manifestPath)) manifest = JSON.parse(readText(manifestPath));
  const phases = Array.isArray(fixture.phases) ? fixture.phases : (manifest?.phases ?? []).slice(0, 1);
  const contextResult = record('context', runNode(distPath, [
    'context', '--manifest', manifestPath, '--phases', phases.join(','), '--ledger', ledgerPath,
  ], appliedRoot), [0]);
  const predecessorResult = runNode(distPath, [
    'context', '--manifest', manifestPath, '--phases', phases[phases.length - 1], '--ledger', path.join(temporary, 'ledger-2.json'),
  ], appliedRoot);
  if (predecessorResult.status === 0) failures.push('context accepted a missing predecessor');

  const gateResult = record('gate', runNode(distPath, [
    'gate', '--manifest', manifestPath, '--out', gatePath,
  ], appliedRoot), [0, 50]);
  if (exists(gatePath)) {
    const gate = JSON.parse(readText(gatePath));
    if (!Array.isArray(gate.statuses) || gate.statuses.length === 0) failures.push('gate report has no statuses');
    else {
      for (const entry of gate.statuses) {
        if (!['machine_verified', 'human_attested', 'failed', 'unverifiable', 'not_run'].includes(entry.status)) {
          failures.push(`gate status is unknown: ${entry.status}`);
        }
      }
    }
  }

  if (manifest && fixture.attest_phase) {
    const rows = (manifest.nodes ?? [])
      .filter((node) => node.delivery === 'must' && node.phase === fixture.attest_phase)
      .map((node) => ({ rule: node.id, status: 'unset' }));
    writeAtomic(rowsPath, JSON.stringify({ phase: fixture.attest_phase, rows }));
    const attest = runNode(distPath, [
      'attest', '--manifest', manifestPath, '--phase', fixture.attest_phase, '--rows', rowsPath,
    ], appliedRoot);
    if (attest.status === 0) failures.push('attest accepted unset');
  } else {
    failures.push('runtime fixture has no attest_phase');
  }

  const checkCommands = [['check', 'lint'], ['check', 'graph']];
  if (mode === 'dev') {
    const lockPath = path.join(skillPath, 'atoms.lock.json');
    checkCommands.push(['check', 'coverage', '--lock', lockPath], ['check', 'audit', '--lock', lockPath]);
  }
  for (const args of checkCommands) {
    const result = runNode(distPath, args, appliedRoot);
    if (result.status !== 0) failures.push(`${args.join(' ')} exited ${result.status}`);
  }

  fs.rmSync(temporary, { recursive: true, force: true });
  if (failures.length > 0) {
    return { ok: false, codes: ['RUNTIME_FAILED'], evidence: failures.slice(0, EVIDENCE_LIMIT).join('; '), contextOutput: contextResult.stdout };
  }
  return { ok: true, codes: [], evidence: 'applies/resolve/context/gate/attest/check ok', contextOutput: contextResult.stdout };
}

export function checkRuntime({ runtime }) {
  if (!runtime?.ok) return failed('RUNTIME_FAILED', runtime?.evidence ?? 'runtime evidence is missing');
  return verified(runtime.evidence);
}

export function checkReproduction({ skillPath, sourceRoot, aliasPath, runtime }) {
  if (!sourceRoot) {
    return status('unverifiable', 'dev reproduction check needs --source-root', { codes: ['SOURCE_ROOT_REQUIRED'] });
  }
  const ingestPath = path.join(skillPath, 'scripts/ingest.mjs');
  const verifyResult = runNode(ingestPath, ['verify', '--alias', aliasPath], sourceRoot);
  if (verifyResult.status !== 0) {
    return failed('REPRODUCTION_FAILED', `ingest verify exited ${verifyResult.status}: ${verifyResult.stderr.trim()}`);
  }
  const distPath = path.join(skillPath, 'dist/skill.mjs');
  const rebuild = runNode(distPath, ['rebuild', '--root', skillPath, '--alias', aliasPath], sourceRoot);
  if (rebuild.status !== 0) return failed('REPRODUCTION_FAILED', `rebuild exited ${rebuild.status}: ${rebuild.stderr.trim()}`);
  try {
    const context = loadSourceContext({ skillPath, sourceRoot, aliasPath });
    const expected = renderSourceView(context);
    const sourceView = readText(path.join(skillPath, 'okf/source.md'));
    const baseline = readText(path.join(skillPath, 'okf/source.baseline.md'));
    if (normalizeLf(sourceView) !== normalizeLf(expected)) return failed('SOURCE_VIEW_DRIFT', 'okf/source.md is not regenerable');
    if (normalizeLf(baseline) !== normalizeLf(sourceView)) return failed('SOURCE_VIEW_DRIFT', 'okf/source.baseline.md differs from source.md');
  } catch (error) {
    return failed(error.code ?? 'REPRODUCTION_FAILED', error.message);
  }
  void runtime;
  return verified('ingest verify and rebuild are byte-identical');
}

export function checkTests({ skillPath }) {
  const testsDirectory = path.join(skillPath, 'tests');
  const missing = REQUIRED_TEST_FILES.filter((name) => !exists(path.join(testsDirectory, name)));
  if (missing.length > 0) return failed('TEST_FILE_MISSING', `missing: ${missing.join(', ')}`);
  for (const name of REQUIRED_TEST_FILES) {
    const text = readText(path.join(testsDirectory, name));
    if (!/\btest\s*\(/.test(text) || !/\bassert\b/.test(text)) {
      return failed('TEST_VACUOUS', `test file has no test/assert: ${name}`);
    }
  }
  const core = CORE_TEST_FILES.map((name) => path.join(testsDirectory, name));
  // A verifier invoked from inside node --test must start a fresh test context;
  // inherited NODE_TEST_CONTEXT makes the child skip every file.
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', ...core], {
    cwd: skillPath,
    env: environment,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const counts = parseTestCounts(output);
  if (result.status !== 0) return failed('TEST_FAILED', `core suite exited ${result.status}`);
  if (counts.tests <= 0 || counts.pass <= 0 || counts.fail !== 0) {
    return failed('TEST_FAILED', `core suite counts tests=${counts.tests} pass=${counts.pass} fail=${counts.fail}`);
  }
  return verified(`${counts.pass} core tests passed`);
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function installedSubset(skillPath) {
  return listFiles(skillPath)
    .map((file) => path.relative(skillPath, file).replace(/\\/g, '/'))
    .filter((relative) => INSTALLED_ROOTS.some((root) => relative.startsWith(root)))
    .sort();
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function treeDigest(skillPath) {
  return sha256Text(
    installedSubset(skillPath).map((relative) => `${relative}\0${sha256Text(fs.readFileSync(path.join(skillPath, relative)))}`).join('\n'),
  );
}

export function checkInstaller({ skillPath, mode, sourceRoot, aliasPath }) {
  if (mode === 'installed') {
    const outside = installedSubset(skillPath).filter((relative) => !INSTALLED_ROOTS.some((root) => relative.startsWith(root)));
    if (outside.length > 0) return failed('INSTALLED_LAYER_MISMATCH', `unexpected installed files: ${outside.slice(0, EVIDENCE_LIMIT).join(', ')}`);
    const lint = runNode(path.join(skillPath, 'dist/skill.mjs'), ['check', 'lint'], skillPath);
    if (lint.status !== 0) return failed('INSTALLER_INVALID', 'installed dist cannot resolve okf/');
    return verified('installed layering and dist resolution ok');
  }

  const installerPath = path.join(skillPath, 'install.js');
  if (!exists(installerPath)) return failed('INSTALLER_INVALID', 'install.js is missing');
  const text = readText(installerPath);
  if (BUILD_COMMAND_PATTERN.test(text)) return failed('INSTALLER_INVALID', 'install.js contains a build command');
  if (!COPY_COMMAND_PATTERN.test(text)) return failed('INSTALLER_INVALID', 'install.js contains no copy command');
  if (!sourceRoot) return status('unverifiable', 'dev installer check needs --source-root', { codes: ['SOURCE_ROOT_REQUIRED'] });
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'law-install-'));
  try {
    const install = runNode(installerPath, [target], sourceRoot);
    if (install.status !== 0) return failed('INSTALLER_INVALID', `install exited ${install.status}: ${install.stderr.trim()}`);
    const installedSkill = path.join(target, '.claude/skills', path.basename(skillPath));
    if (!exists(installedSkill)) return failed('INSTALLER_INVALID', 'installed skill is missing');
    const installedDigest = treeDigest(installedSkill);
    const sourceDigest = treeDigest(skillPath);
    if (installedDigest !== sourceDigest) return failed('INSTALLED_SHA_MISMATCH', 'source and installed SHA differ');
    const outPath = path.join(target, 'installed-verification.json');
    const recursive = runNode(VERIFIER_PATH, [
      '--skill', installedSkill, '--mode', 'installed', '--path-alias', aliasPath, '--out', outPath,
    ], target);
    if (recursive.status !== 0) return failed('INSTALLER_INVALID', `installed mode exited ${recursive.status}`);
    return verified('installed copy passes installed mode');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

export function checkDeterminism({ skillPath, sourceRoot, aliasPath }) {
  if (!sourceRoot) return status('unverifiable', 'dev determinism check needs --source-root', { codes: ['SOURCE_ROOT_REQUIRED'] });
  const first = fs.mkdtempSync(path.join(os.tmpdir(), 'law-determinism-a-'));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'law-determinism-b-'));
  try {
    for (const directory of [first, second]) {
      const result = runNode(path.join(skillPath, 'scripts/ingest.mjs'), [
        'classify', '--alias', aliasPath,
        '--lock', path.join(directory, 'atoms.lock.json'),
        '--coverage', path.join(directory, 'coverage.json'),
        '--report', path.join(directory, 'coverage.md'),
      ], sourceRoot);
      if (result.status !== 0) return failed('NON_DETERMINISTIC', `classify exited ${result.status}: ${result.stderr.trim()}`);
    }
    for (const name of ['atoms.lock.json', 'coverage.json', 'coverage.md']) {
      const firstText = readText(path.join(first, name));
      if (firstText !== readText(path.join(second, name))) return failed('NON_DETERMINISTIC', `${name} differs between runs`);
      if (firstText !== readText(path.join(skillPath, name))) return failed('NON_DETERMINISTIC', `${name} differs from the committed artifact`);
    }
    const rebuild = runNode(path.join(skillPath, 'dist/skill.mjs'), ['rebuild', '--root', skillPath, '--alias', aliasPath], sourceRoot);
    if (rebuild.status !== 0) return failed('NON_DETERMINISTIC', `rebuild exited ${rebuild.status}`);
    return verifyDistDeterminism(skillPath);
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function verifyDistDeterminism(skillPath) {
  let esbuild;
  try {
    esbuild = createRequire(import.meta.url)('esbuild');
  } catch {
    return status('unverifiable', 'esbuild is not resolvable', { codes: ['DIST_UNVERIFIABLE'] });
  }
  const absoluteSkill = path.resolve(skillPath);
  const result = esbuild.buildSync({
    entryPoints: [path.join(absoluteSkill, 'scripts/cli.mjs')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
    sourcemap: false,
    legalComments: 'none',
    absWorkingDir: absoluteSkill,
  });
  const rebuilt = result.outputFiles[0].text;
  const committed = readText(path.join(skillPath, 'dist/skill.mjs'));
  if (rebuilt !== committed) return failed('DIST_DRIFT', 'dist/skill.mjs is not reproducible');
  return verified('lock, coverage, report, and dist are deterministic');
}
