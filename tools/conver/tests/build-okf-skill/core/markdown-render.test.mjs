// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-430 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006
// C001 precondition: An envelope has N frontier entries and a non-empty body.
// C001 postcondition: The Markdown contains exactly N frontier lines and the full body text.
// C001 invariant: The Markdown contains no ellipsis marker and no truncated line.
// C002 precondition: Coverage reports missing facets and guidance reports a state.
// C002 postcondition: missing renders as the exact facet list or none; state renders as stop, expand, or back.
// C002 invariant: No enum value is paraphrased into prose.
// C003 precondition: The envelope carries commands in frontier[].command, guidance.mustRun, and guidance.ifBack.
// C003 postcondition: Every command in the Markdown equals one of those strings.
// C003 invariant: A reader can copy a command and run it unchanged.
// C004 precondition: A read command runs with --format json.
// C004 postcondition: The output parses as JSON and carries the same envelope values as today.
// C004 invariant: The JSON view is unchanged by the Markdown work.
// C005 precondition: A read command runs without --format.
// C005 postcondition: The output is Markdown and contains no JSON document.
// C005 invariant: Generated SKILL.md never tells the AI about a JSON output mode.
// C006 precondition: The Markdown renderer receives a section.
// C006 postcondition: Each of the four sections is preceded by a one-line description.
// C006 invariant: No section appears without a description.
/**
 * PX-430 — the AI-facing view is lossless Markdown; JSON stays for verification.
 *
 * The renderer is tested as a pure function, and the CLI is spawned so a
 * stale dispatch or a library-only fix fails here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderEnvelopeMarkdown } from '../../../.claude/scripts/amend-rfc-up/okf-core/render/markdown.mjs';
import { createOneHopBundle } from '../lib/fixture-v2.mjs';

const CLI = fileURLToPath(new URL('../../../.claude/scripts/amend-rfc-up/okf-core/cli.mjs', import.meta.url));
const BODY = '## A\n\n| x | y |\n|---|---|\n| 1 | 2 |';

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-430 --for-spec --no-implementation-order`.
function envelopeOf(frontierLength) {
  return {
    protocol: 'okf-traversal/v1',
    node: { id: 'a', type: 'Section', title: 'A', body: BODY },
    coverage: {
      profile: 'okf-wiki',
      requiredFacets: ['body'],
      present: ['body'],
      missing: [],
      sufficient: true,
      insufficient: false,
      estimatedBytes: 10,
      overfetchRatio: 1,
    },
    frontier: Array.from({ length: frontierLength }, (_, index) => ({
      id: `r${index}`,
      type: 'Section',
      kind: 'sibling-rule',
      why: 'same directory',
      command: `node "$OKF" expand --id r${index}`,
      estBytes: 1,
      priority: 3,
    })),
    guidance: {
      state: 'stop',
      reason: 'every required facet is present',
      decideAfter: 'this response',
      mustRun: null,
      stopWhen: 'now',
      ifBack: 'node "$OKF" list',
      hop: 0,
      maxHops: 3,
      budget: { bytesUsed: 10, bytesLimit: null },
    },
    backTo: null,
  };
}

// [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
function run(root, ...args) {
  const result = spawnSync(process.execPath, [CLI, ...args, '--root', root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('C001: every frontier entry and the full body survive', () => {
  const markdown = renderEnvelopeMarkdown(envelopeOf(45));
  const frontierLines = markdown.split('\n').filter((line) => /^\d+\. `r\d+`/.test(line));
  assert.equal(frontierLines.length, 45);
  assert.ok(markdown.includes(BODY));
  assert.equal(markdown.includes('…'), false);
  assert.equal(/\.\.\. \d+ more/.test(markdown), false);
});

test('C002: decision values render verbatim', () => {
  const expand = envelopeOf(3);
  expand.coverage = { ...expand.coverage, missing: ['source', 'prerequisites'], sufficient: false };
  expand.guidance = { ...expand.guidance, state: 'expand', reason: 'missing facet: source,prerequisites' };
  const text = renderEnvelopeMarkdown(expand);
  assert.match(text, /missing: source, prerequisites/);
  assert.match(text, /state: expand/);

  const stop = renderEnvelopeMarkdown(envelopeOf(0));
  assert.match(stop, /missing: none/);
  assert.match(stop, /backTo: none/);
});

test('C003: every rendered command equals an envelope command', () => {
  const envelope = envelopeOf(3);
  const commands = new Set([
    ...envelope.frontier.map((entry) => entry.command),
    envelope.guidance.mustRun,
    envelope.guidance.ifBack,
  ].filter(Boolean));
  const renderedLines = renderEnvelopeMarkdown(envelope).split('\n').filter((line) => line.includes('node "$'));
  assert.ok(renderedLines.length > 0);
  for (const line of renderedLines) {
    const match = line.match(/node "\$[A-Z]+"[^`]*/);
    assert.ok(match, line);
    assert.ok(commands.has(match[0].trim()), match[0]);
  }
});

test('C004: --format json reproduces the envelope', () => {
  const bundle = createOneHopBundle();
  try {
    const result = run(bundle.root, 'show', 'a', '--format', 'json');
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.protocol, 'okf-traversal/v1');
    assert.ok(Array.isArray(parsed.frontier));
    assert.equal(typeof parsed.coverage.sufficient, 'boolean');
    assert.deepEqual(Object.keys(parsed.coverage), [
      'profile', 'requiredFacets', 'present', 'missing',
      'sufficient', 'insufficient', 'estimatedBytes', 'overfetchRatio',
    ]);
  } finally {
    bundle.cleanup();
  }
});

test('C005: the default output is Markdown and the manual does not name JSON', () => {
  const bundle = createOneHopBundle();
  try {
    const result = run(bundle.root, 'show', 'a');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /## Coverage/);
    assert.match(result.stdout, /## Frontier/);
    assert.match(result.stdout, /## Decision/);
    assert.notEqual(result.stdout.trimStart()[0], '{');
  } finally {
    bundle.cleanup();
  }

  const manual = readFileSync('.claude/skills/rust-interface-law/SKILL.md', 'utf8');
  assert.match(manual, /## Coverage/);
  assert.equal(manual.includes('--format json'), false);
});

test('C006: every section carries a one-line description', () => {
  // A body may contain its own headings; document sections are the ones outside a fence.
  const document = renderEnvelopeMarkdown(envelopeOf(0)).replace(/```[\s\S]*?```/g, '');
  const sections = document.split(/^## /m).slice(1);
  assert.equal(sections.length, 4);
  for (const section of sections) {
    const [heading, ...rest] = section.split('\n');
    const description = rest.find((line) => line.trim().length > 0);
    assert.ok(description && !description.startsWith('-') && !description.startsWith('```'), heading);
  }
});

test('UNKNOWN_FORMAT exits 1 and names the allowed values', () => {
  const bundle = createOneHopBundle();
  try {
    const result = run(bundle.root, 'show', 'a', '--format', 'yaml');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /UNKNOWN_FORMAT/);
    assert.match(result.stderr, /markdown, json/);
  } finally {
    bundle.cleanup();
  }
});
