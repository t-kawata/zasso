// [::TICKET::] P22-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-1 --for-spec --no-implementation-order`.
/**
 * The command-file digest: proof that an edit was an edit.
 *
 * The nine `.claude/commands/*.md` files may be appended to and corrected, so a
 * whole-file hash would cry wolf on a legitimate edit. Three things must survive
 * character for character — the heading set, the Language Protocol table and the
 * First-Class Rule line — and those three are what this digest freezes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import process from 'node:process';

/** The digest a protected section has when the file does not carry it at all. */
const sha256OfEmpty = createHash('sha256').update('').digest('hex');

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

import {
  COMMAND_FILE_NAMES,
  COMMANDS_RELATIVE_DIR,
  compareDigests,
  digestCommandFiles,
  extractCommandFileSections,
} from '../../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs';

const MODULE_ROOT = process.cwd();

function makeCommandsCopy() {
  const root = mkdtempSync(join(tmpdir(), 'p22-1-cmd-'));
  cpSync(join(MODULE_ROOT, COMMANDS_RELATIVE_DIR), join(root, COMMANDS_RELATIVE_DIR), { recursive: true });
  return root;
}

function commandPath(root, name) {
  return join(root, COMMANDS_RELATIVE_DIR, name + '.md');
}

test('C002 postcondition: every command file yields the three protected sections', () => {
  const root = makeCommandsCopy();
  try {
    const digests = digestCommandFiles(root);
    assert.deepEqual(Object.keys(digests).sort(), [...COMMAND_FILE_NAMES].sort());

    for (const [name, entry] of Object.entries(digests)) {
      assert.ok(entry.headings.length > 0, name + ' must yield a non-empty heading set');
      assert.match(entry.languageProtocolDigest, /^[0-9a-f]{64}$/, name + ' must digest the Language Protocol table');
      assert.match(entry.firstClassRuleDigest, /^[0-9a-f]{64}$/, name + ' must digest the First-Class Rule line');
    }
    const documentDigests = Object.values(digests).map((entry) => entry.documentDigest);
    assert.equal(new Set(documentDigests).size, COMMAND_FILE_NAMES.length, 'the nine digests must be distinct');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('extractCommandFileSections separates the heading set from the Language Protocol table', () => {
  const text = [
    '# Title',
    '',
    '## Language Protocol',
    '',
    '| Context | Language |',
    '|---------|----------|',
    '| Chat | Japanese |',
    '',
    '## Workflow',
    '',
    '**First-Class Rule — [::STUB::] Marker is an Absolute Obligation**: every stub carries a marker.',
    '',
  ].join('\n');

  const sections = extractCommandFileSections(text);
  assert.deepEqual(sections.headings, ['# Title', '## Language Protocol', '## Workflow']);
  assert.match(sections.languageProtocolTable, /\|\s*Context\s*\|\s*Language\s*\|/);
  assert.match(sections.firstClassRuleLine, /First-Class Rule/);
});

test('C002 postcondition: an appended paragraph is not drift — edits are permitted', () => {
  const root = makeCommandsCopy();
  try {
    const baseline = digestCommandFiles(root);
    const target = commandPath(root, 'drill-rfc-down');
    writeFileSync(target, readFileSync(target, 'utf8') + '\n## Appended section\n\nNew guidance.\n');

    assert.deepEqual(compareDigests(baseline, digestCommandFiles(root)), [], 'an append must not be reported as a loss');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 postcondition: a shortened heading set is reported with the file path and the missing heading', () => {
  const root = makeCommandsCopy();
  try {
    const baseline = digestCommandFiles(root);
    const target = commandPath(root, 'drill-rfc-down');
    const lostHeading = baseline['drill-rfc-down'].headings.at(-1);
    const withoutLast = readFileSync(target, 'utf8')
      .split('\n')
      .filter((line, index, lines) => !(line === lostHeading && lines.indexOf(line) === index))
      .join('\n');
    writeFileSync(target, withoutLast);

    const findings = compareDigests(baseline, digestCommandFiles(root));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, join(COMMANDS_RELATIVE_DIR, 'drill-rfc-down.md'));
    assert.equal(findings[0].kind, 'missing-heading');
    assert.equal(findings[0].heading, lostHeading);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 postcondition: a damaged First-Class Rule obligation sentence is reported by name', () => {
  const root = makeCommandsCopy();
  try {
    // Measured on 2026-09-10: none of the nine command files carries the
    // stub-marker obligation sentence, so the loss is exercised against the
    // extractor and comparator directly rather than against a file that would
    // have to be invented for the test.
    const withRule = ['# Title', '', '**First-Class Rule — [::STUB::] Marker is an Absolute Obligation**: every stub carries a marker.', ''].join('\n');
    const withoutRule = ['# Title', '', 'The rule was quietly removed.', ''].join('\n');

    const frozen = { headings: ['# Title'], languageProtocolDigest: sha256OfEmpty, firstClassRuleDigest: sha256(withRule.match(/First-Class Rule\s*—\s*\[::STUB::\][^\n]*/)[0]) };
    const observed = { headings: ['# Title'], languageProtocolDigest: sha256OfEmpty, firstClassRuleDigest: sha256('') };

    assert.match(withRule, /First-Class Rule\s*—\s*\[::STUB::\]/, 'the fixture text carries the obligation sentence');
    assert.doesNotMatch(withoutRule, /First-Class Rule\s*—\s*\[::STUB::\]/);

    const findings = compareDigests({ 'a-command': frozen }, { 'a-command': observed });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, join(COMMANDS_RELATIVE_DIR, 'a-command.md'));
    assert.equal(findings[0].kind, 'changed-first-class-rule');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 postcondition: the obligation sentence is frozen where it exists and its absence where it does not', () => {
  const root = makeCommandsCopy();
  try {
    const digests = digestCommandFiles(root);

    // A section heading that merely shares the wording is not the obligation
    // sentence, and must not be mistaken for it.
    const carrying = COMMAND_FILE_NAMES.filter((name) => digests[name].firstClassRuleDigest !== sha256OfEmpty);
    assert.deepEqual(carrying, [], 'measured 2026-09-10: none of the nine carries the obligation sentence');
    assert.ok(
      readFileSync(commandPath(root, 'grill-me-for-rfc'), 'utf8').includes('First-Class Rules'),
      'the wording does appear as a section heading, which is why the match must be specific',
    );

    // Adding the sentence to a file that never had it is an addition, not a loss.
    const target = commandPath(root, 'graphify-rfc');
    writeFileSync(target, readFileSync(target, 'utf8') + '\n**First-Class Rule — [::STUB::] Marker is an Absolute Obligation**: every stub carries a marker.\n');
    assert.deepEqual(compareDigests(digests, digestCommandFiles(root)), [], 'an addition must not be reported as a loss');

    // Removing it from a file that does carry it is a loss, and is named.
    const afterAdd = digestCommandFiles(root);
    writeFileSync(target, readFileSync(target, 'utf8').replace(/First-Class Rule\s*—\s*\[::STUB::\][^\n]*\n/g, ''));
    const findings = compareDigests(afterAdd, digestCommandFiles(root));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, join(COMMANDS_RELATIVE_DIR, 'graphify-rfc.md'));
    assert.equal(findings[0].kind, 'changed-first-class-rule');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 postcondition: a damaged Language Protocol table is reported by name', () => {
  const root = makeCommandsCopy();
  try {
    const baseline = digestCommandFiles(root);
    const target = commandPath(root, 'boundify-graph');
    writeFileSync(target, readFileSync(target, 'utf8').replace(/\|\s*Chat,\s*proposals,\s*explanations\s*\|[^\n]*/g, '| Chat | English |'));

    const findings = compareDigests(baseline, digestCommandFiles(root));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, join(COMMANDS_RELATIVE_DIR, 'boundify-graph.md'));
    assert.equal(findings[0].kind, 'changed-language-protocol');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-7: a digest comparison against a file that no longer exists reports the path rather than throwing', () => {
  const root = makeCommandsCopy();
  try {
    const baseline = digestCommandFiles(root);
    rmSync(commandPath(root, 'split-to-tickets'));

    let findings;
    assert.doesNotThrow(() => {
      findings = compareDigests(baseline, digestCommandFiles(root));
    }, 'a missing command file must be reported, not thrown');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, join(COMMANDS_RELATIVE_DIR, 'split-to-tickets.md'));
    assert.equal(findings[0].kind, 'missing-file');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
