import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(SKILL, 'dist/skill.mjs');
const FIXTURE = JSON.parse(readFileSync(join(SKILL, 'tests/fixtures/runtime/runtime.json'), 'utf8'));

function run(args) {
  return spawnSync(process.execPath, [DIST, ...args], { encoding: 'utf8' });
}

test('the runtime fixture names a shipped entry concept', () => {
  assert.ok(existsSync(DIST), 'dist/skill.mjs is missing');
  const show = run(['show', FIXTURE.entryConcept, '--format', 'json']);
  assert.equal(show.status, 0, show.stderr);
  const page = JSON.parse(show.stdout);
  assert.equal(page.id, FIXTURE.entryConcept);
  assert.equal(page.protocol, 'okf-traversal/v1');
});

test('the installed dist resolves its sibling bundle without a root argument', () => {
  const list = run(['list']);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /pages/);
});

test('directory drill-down reaches the handbook directory', () => {
  const list = run(['list', '--path', 'pages/pjsip-build-guide']);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /expand --id pages\/pjsip-build-guide\//);
});

test('a page read is lossless Markdown', () => {
  const page = run(['show', FIXTURE.displayConcept]);
  assert.equal(page.status, 0, page.stderr);
  for (const heading of ['## Page', '## Coverage', '## Frontier', '## Decision']) {
    assert.ok(page.stdout.includes(heading), heading);
  }
  assert.ok(page.stdout.length > 500);
});

test('both directions and neighbors answer for the entry concept', () => {
  for (const command of ['outgoing', 'incoming', 'neighbors']) {
    const result = run([command, '--id', FIXTURE.entryConcept]);
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  }
});

test('the required closure and a fitting context are complete', () => {
  const required = run(['required', '--entry', FIXTURE.entryConcept, '--format', 'json']);
  assert.equal(required.status, 0, required.stderr);
  const closure = JSON.parse(required.stdout);
  assert.ok(closure.required.includes(FIXTURE.entryConcept));
  const context = run(['context', '--entry', FIXTURE.entryConcept, '--budget', String(FIXTURE.limits.contextBudgetBytes), '--format', 'json']);
  assert.equal(context.status, 0, context.stderr);
  const artifact = JSON.parse(context.stdout);
  assert.deepEqual(artifact.artifact.manifest.ids, closure.context);
});

test('search, trust, freshness, and sources answer', () => {
  const search = run(['search', '--query', 'pjsip', '--format', 'json']);
  assert.equal(search.status, 0, search.stderr);
  assert.ok(JSON.parse(search.stdout).rows.length > 0);
  for (const command of ['trust', 'freshness']) {
    const result = run([command, '--format', 'json']);
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  }
  const sources = run(['sources', FIXTURE.entryConcept, '--format', 'json']);
  assert.equal(sources.status, 0, sources.stderr);
  assert.equal(JSON.parse(sources.stdout).sources[0].resource, 'sources/pjsip-build-guide.md');
});

test('the shipped bundle validates and rebuilds identically', () => {
  const conformance = run(['validate', '--mode', 'conformance']);
  assert.equal(conformance.status, 0, conformance.stdout);
  const lint = run(['validate', '--mode', 'lint']);
  assert.equal(lint.status, 0, lint.stdout);
  const rebuild = run(['rebuild']);
  assert.equal(rebuild.status, 0, rebuild.stderr);
});
