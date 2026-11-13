import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cli = join(root, 'scripts/cli.mjs');

test('implementation-check passes a fixture with all admitted dependencies', () => {
  const project = join(here, 'fixtures/implementation/project-all');
  const state = mkdtempSync(join(tmpdir(), 'law-implementation-'));
  try {
    const manifestPath = join(state, 'manifest.json');
    const out = join(state, 'implementation-report.json');
    writeFileSync(manifestPath, JSON.stringify({
      nodes: [{ id: 'IMP-01', delivery: 'must', phase: 'adapter' }],
      changed: [],
      root: project,
    }));
    const output = execFileSync(process.execPath, [
      cli, 'implementation-check', '--root', project, '--manifest', manifestPath, '--out', out,
    ], { encoding: 'utf8' });
    assert.match(output, /# Implementation check — PASS/);
    const report = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(report.ok, true);
    assert.equal(report.statuses[0].status, 'machine_verified');
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('gate fails closed when the implementation report is missing', () => {
  const project = join(here, 'fixtures/implementation/project-all');
  const state = mkdtempSync(join(tmpdir(), 'law-gate-implementation-'));
  try {
    const manifestPath = join(state, 'manifest.json');
    const gatePath = join(state, 'gate.json');
    writeFileSync(manifestPath, JSON.stringify({
      nodes: [{ id: 'IMP-01', delivery: 'must', phase: 'adapter' }],
      changed: ['src/lib.rs'],
      root: project,
    }));
    assert.throws(
      () => execFileSync(process.execPath, [
        cli, 'gate', '--manifest', manifestPath, '--out', gatePath,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
      (error) => error.status === 50,
    );
    const gate = JSON.parse(readFileSync(gatePath, 'utf8'));
    assert.equal(gate.statuses.find((entry) => entry.rule === 'IMP-01').status, 'not_run');
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('template command writes a resolved plan', () => {
  const state = mkdtempSync(join(tmpdir(), 'law-template-cli-'));
  try {
    const valuesPath = join(state, 'values.json');
    const out = join(state, 'plan.json');
    writeFileSync(valuesPath, JSON.stringify({ crate: 'app-rest', package: 'crates/app-rest' }));
    execFileSync(process.execPath, [
      cli, 'template',
      '--interface', 'rest',
      '--unit', 'app-rest',
      '--templates', join(here, 'fixtures/implementation/templates'),
      '--values', valuesPath,
      '--out', out,
    ], { encoding: 'utf8' });
    assert.ok(existsSync(out));
    const plan = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(plan.files[0].content.includes('{{'), false);
    assert.match(plan.files[0].content, /RULE: REST-19/);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});
