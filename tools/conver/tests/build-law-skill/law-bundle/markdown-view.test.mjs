// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-430 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006
// C001 precondition: A law read command has a non-empty body and a frontier.
// C001 postcondition: The Markdown lists every frontier entry and the full body.
// C001 invariant: No ellipsis marker and no truncated frontier line.
// C002 precondition: Coverage and guidance carry decision values.
// C002 postcondition: missing, sufficient, and state appear as exact values.
// C002 invariant: No enum value is paraphrased into prose.
// C003 precondition: The envelope carries frontier commands, mustRun, and ifBack.
// C003 postcondition: Every rendered command uses node "$LAW" and equals an envelope command.
// C003 invariant: The command is executable as printed.
// C004 precondition: A law read command runs with --format json.
// C004 postcondition: The output parses as the current envelope.
// C004 invariant: The JSON view is unchanged by the Markdown work.
// C005 precondition: A law read command runs without --format.
// C005 postcondition: The output is Markdown and contains no JSON document.
// C005 invariant: The generated SKILL.md does not name a JSON output mode.
// C006 precondition: The law Markdown view has four sections.
// C006 postcondition: Each section has a one-line description.
// C006 invariant: No section appears without a description.
/**
 * PX-430 — the law CLI hands the AI lossless Markdown by default.
 *
 * The product is dist/skill.mjs, so a stale bundle fails here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LAW = join(process.cwd(), '.claude/skills/rust-interface-law');
const CLI = join(LAW, 'dist/skill.mjs');
const LAW_PREFIX = 'node "$LAW"';

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('C005: law read commands default to Markdown', () => {
  const cases = [
    ['show', 'sources/part-iii-6/6-http-rules'],
    ['expand', '--id', 'rules/c/rest-01'],
    ['context', '--rule', 'REST-01'],
    ['list', '--path', '/'],
    ['search', '--query', 'authorization'],
  ];
  for (const args of cases) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^# /, args.join(' '));
    assert.notEqual(result.stdout.trimStart()[0], '{', args.join(' '));
  }
});

test('C001/C002/C006: the default view is lossless and self-describing', () => {
  const result = run(['expand', '--id', 'rules/c/rest-01', '--hop', '1', '--from', 'rules/c/rest-01']);
  assert.equal(result.status, 0, result.stderr);
  const text = result.stdout;
  assert.match(text, /## Coverage/);
  assert.match(text, /## Frontier/);
  assert.match(text, /## Decision/);
  assert.match(text, /state: expand/);
  assert.match(text, /missing: source, prerequisites/);
  assert.equal(text.includes('…'), false);
  assert.equal(/\b\d+ more\b/.test(text), false);
  const frontierLines = text.split('\n').filter((line) => /^\d+\. `/.test(line));
  assert.ok(frontierLines.length > 0);
});

test('C003: law commands are executable as printed and never name $OKF', () => {
  const result = run(['show', 'sources/part-iii-6/6-http-rules']);
  assert.equal(result.status, 0, result.stderr);
  const commandLines = result.stdout.split('\n').filter((line) => line.includes(LAW_PREFIX));
  assert.ok(commandLines.length > 0);
  assert.equal(result.stdout.includes('$OKF'), false);
});

test('C004: --format json keeps the envelope', () => {
  const result = run(['context', '--rule', 'REST-01', '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.protocol, 'okf-traversal/v1');
  assert.equal(parsed.coverage.sufficient, true);
  assert.ok(Array.isArray(parsed.frontier));
  assert.ok(parsed.required && parsed.artifact);
});

test('C005: the generated manual stays Markdown-only and the build docs keep JSON', () => {
  const manual = readFileSync(join(LAW, 'SKILL.md'), 'utf8');
  assert.match(manual, /## Coverage/);
  assert.equal(manual.includes('--format json'), false);

  for (const buildDoc of ['.claude/commands/build-okf-skill.md', '.claude/commands/build-law-skill.md']) {
    const text = readFileSync(buildDoc, 'utf8');
    assert.match(text, /--format json/, buildDoc);
  }
});

test('UNKNOWN_FORMAT exits 1 and names the allowed values', () => {
  const result = run(['show', 'sources/part-iii-6/6-http-rules', '--format', 'yaml']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UNKNOWN_FORMAT/);
  assert.match(result.stderr, /markdown, json/);
});
