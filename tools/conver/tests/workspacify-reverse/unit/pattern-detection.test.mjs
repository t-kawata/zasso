// @verifies C001
// @verifies C002
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
/**
 * Pattern detection, measured against the four representatives.
 *
 * Design 1.1 distinguishes the four patterns "by what conver scaffolding
 * already exists on disk, and by nothing else", and 5.4's Step 0 says the
 * identification is a reading rather than a question. These tests hold the
 * detection to that: one declared identifier over any subject, the presence and
 * absence material that decided it, an explicit answer when nothing matches, and
 * no prompt, environment variable or clock anywhere in the answer.
 *
 * The two existing trees are read, never written: they are P22's measuring
 * instrument and this repository records them as not to be rewritten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { languageOfPath, listArtefacts } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { classifyArtefacts } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import {
  CONVER_MARKERS,
  DOCUMENT_EXTENSIONS,
  LONG_SPECIFICATION_MIN_BYTES,
  PATTERNS,
  PATTERN_MARKERS,
  PATTERN_RULES,
  PATTERN_STATES,
  ROOT_LAYER_SET,
  SEARCHED_MARKERS,
  detectPattern,
  listPatternMarkers,
  renderPatternDetection,
} from '../../../.claude/scripts/workspacify-reverse/lib/pattern-detection.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PATTERN_MODULE_URL = new URL(
  '../../../.claude/scripts/workspacify-reverse/lib/pattern-detection.mjs',
  import.meta.url,
);
const REVERSE_ROOT = join(PROJECT_ROOT, 'siprs-for-reverse');
const LAYERED_ROOT = join(PROJECT_ROOT, 'siprs-with-4layers');
const PATTERNS_FIXTURES = join(PROJECT_ROOT, 'tests/workspacify-reverse/fixtures/patterns');
const FIXTURES_README = join(PROJECT_ROOT, 'tests/workspacify-reverse/fixtures/README.md');

/** The four representatives, one per declared pattern. */
const REPRESENTATIVES = Object.freeze({
  'pattern-1': REVERSE_ROOT,
  'pattern-2': LAYERED_ROOT,
  'pattern-3': join(PATTERNS_FIXTURES, 'partial-conver-project'),
  'pattern-4': join(PATTERNS_FIXTURES, 'spec-only-project'),
});

/** The detection over a real root: the walk is the caller's, the answer is the function's. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function detect(root) {
  return detectPattern({ root, artefacts: listArtefacts(root) });
}

/** An artefact record in `listArtefacts`'s shape, so the detection can be handed a fabricated list. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function artefact(path, { size = 64, readStatus = 'readable', exclusion = false, kind = 'file' } = {}) {
  return { path, kind, size, readStatus, exclusion, reason: null };
}

/** A throwaway directory for a subject that must not be written into the project tree. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function scratchDirectory(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// C001 precondition — the declaration, and the input the detection takes
// ---------------------------------------------------------------------------

test('C001 precondition — the four patterns are declared in design order, each naming the markers that decide it', () => {
  assert.deepEqual(PATTERNS.map((row) => row.id), ['pattern-1', 'pattern-2', 'pattern-3', 'pattern-4']);
  for (const pattern of PATTERNS) {
    assert.equal(typeof pattern.name, 'string');
    assert.ok(pattern.name.length > 0, `${pattern.id} carries a name a report can state`);
    assert.ok(PATTERN_MARKERS[pattern.id].length > 0, `${pattern.id} declares the markers that decide it`);
    assert.deepEqual(listPatternMarkers(pattern.id), PATTERN_MARKERS[pattern.id]);
  }
  assert.equal(Object.isFrozen(PATTERNS), true, 'the declaration is data, not something a run can edit');
  assert.equal(Object.isFrozen(PATTERN_RULES), true);
});

test('C001 precondition — every marker is declared once, and the searched set covers every rule', () => {
  const ids = SEARCHED_MARKERS.map((marker) => marker.id);
  assert.deepEqual(ids, [...new Set(ids)], 'no marker is declared twice');

  const declared = new Set(PATTERN_RULES.flatMap((rule) => rule.markerIds));
  assert.deepEqual([...declared].sort(), [...ids].sort(), 'the searched set is exactly what the rules name');
  assert.equal(SEARCHED_MARKERS.length, 9, 'seven conver artefacts, an implementation shape and a specification shape');
});

test('C001 precondition — the four representatives are readable directories, and each holds something', () => {
  for (const [patternId, root] of Object.entries(REPRESENTATIVES)) {
    assert.equal(statSync(root).isDirectory(), true, `${patternId}: ${root} is a directory`);
    assert.doesNotThrow(() => readdirSync(root), `${patternId}: the representative is readable, not merely present`);
    assert.ok(listArtefacts(root).length > 0, `${patternId}: a representative holding nothing decides nothing`);
  }
});

// ---------------------------------------------------------------------------
// C001 postcondition — one identifier, with the material that decided it
// ---------------------------------------------------------------------------

test('C001 postcondition — the pattern-1 representative detects as pattern 1, with the fourth-layer markers absent', () => {
  const detection = detect(REPRESENTATIVES['pattern-1']);

  assert.equal(detection.pattern, 'pattern-1');
  assert.equal(detection.state, 'pattern-1');
  assert.equal(detection.name, 'Pattern 1');
  assert.deepEqual(
    detection.present.filter((entry) => CONVER_MARKERS.some((marker) => marker.id === entry.marker)),
    [],
    'the presence list is empty for every fourth-layer marker',
  );
  assert.deepEqual(
    detection.present.map((entry) => entry.marker),
    ['project-source'],
    'what makes it a project rather than an empty directory is the implementation source',
  );
  assert.notEqual(languageOfPath(detection.present[0].path), 'unknown');
  assert.deepEqual(
    detection.absent.map((entry) => entry.marker).sort(),
    CONVER_MARKERS.map((marker) => marker.id).sort(),
    'the full absence list for the fourth-layer markers',
  );
  for (const entry of detection.absent) assert.equal(typeof entry.searched, 'string');
});

test('C001 postcondition — the pattern-2 representative names its five root artefacts, each with the path that evidenced it', () => {
  const detection = detect(REPRESENTATIVES['pattern-2']);

  assert.equal(detection.pattern, 'pattern-2');
  assert.deepEqual(
    detection.present.map((entry) => entry.marker).sort(),
    ['root-designtree', 'root-dirs-tree', 'root-graph', 'root-rfc', 'root-tickets'],
    'the root four-layer set, and nothing else, is what decides pattern 2',
  );
  assert.deepEqual(detection.absent, [], 'every marker the pattern-2 declaration names was found');
  for (const entry of detection.present) {
    assert.equal(existsSync(join(LAYERED_ROOT, entry.path)), true, `${entry.path} is on disk where the marker was read`);
    assert.equal(entry.scope, 'root', 'the pattern-2 criterion names the root set, not a nested copy of it');
  }
  assert.equal(detection.present.find((entry) => entry.marker === 'root-rfc').path, 'RFC-ROOT.md');
  assert.deepEqual([...ROOT_LAYER_SET].sort(), detection.present.map((entry) => entry.marker).sort());
});

test('C001 postcondition — the evidence names, for each marker, what was searched and whether it was found', () => {
  const detection = detect(REPRESENTATIVES['pattern-3']);

  for (const entry of detection.evidence) {
    assert.equal(typeof entry.marker, 'string');
    assert.equal(typeof entry.searched, 'string', 'the declaration name searched is stated');
    assert.equal(typeof entry.found, 'boolean');
    assert.equal(entry.found, entry.path !== null, 'a found marker names the path that evidenced it');
    assert.ok(['root', 'nested', null].includes(entry.scope));
  }
  assert.deepEqual(
    detection.evidence.filter((entry) => entry.found).map((entry) => [entry.marker, entry.path]).sort(),
    [['project-source', 'src/auth.rs'], ['root-rfc', 'docs/RFC-AUTH.md'], ['root-tickets', 'docs/Tickets.json']],
    'the evidence reports every declared marker, not only the conver ones',
  );
  const rendered = renderPatternDetection(detection);
  assert.match(rendered, /docs\/RFC-AUTH\.md/);
  assert.match(rendered, /docs\/Tickets\.json/);
  assert.match(rendered, /Pattern 3/);
  assert.match(rendered, /it is not a gate/, 'the rendering states the prohibition design 5.4 Step 0 names');
});

// ---------------------------------------------------------------------------
// C002 postcondition — one pattern per representative, and no representative two
// ---------------------------------------------------------------------------

test('C002 postcondition — the pattern-3 representative detects as pattern 3, holding some artefacts and not the set', () => {
  const detection = detect(REPRESENTATIVES['pattern-3']);

  assert.equal(detection.pattern, 'pattern-3');
  assert.deepEqual(
    detection.present.map((entry) => [entry.marker, entry.path]).sort(),
    [['root-rfc', 'docs/RFC-AUTH.md'], ['root-tickets', 'docs/Tickets.json']],
    'what exists is kept and named, including the nested path it sits at',
  );
  for (const marker of ['root-graph', 'root-dirs-tree', 'root-designtree']) {
    assert.ok(detection.absent.some((entry) => entry.marker === marker), `${marker} is named absent, not omitted`);
  }
  assert.notEqual(detection.pattern, 'pattern-2', 'two of five is some artefacts, not the set');
});

test('C002 postcondition — the pattern-4 representative detects as pattern 4: a specification and no implementation', () => {
  const detection = detect(REPRESENTATIVES['pattern-4']);

  assert.equal(detection.pattern, 'pattern-4');
  assert.deepEqual(detection.present.map((entry) => entry.marker), ['long-specification']);
  const specificationPath = detection.present[0].path;
  assert.ok(statSync(join(REPRESENTATIVES['pattern-4'], specificationPath)).size >= LONG_SPECIFICATION_MIN_BYTES);
  assert.equal(
    detection.absent.some((entry) => entry.marker === 'project-source'),
    true,
    'no implementation source is present, and the marker says so rather than being omitted',
  );
  for (const entry of detection.absent) assert.equal(entry.found, undefined, 'absent entries name what was searched, not a hit');
});

test('C002 postcondition — every present path is one the walk returned, for all four representatives', () => {
  for (const [patternId, root] of Object.entries(REPRESENTATIVES)) {
    const walk = new Set(listArtefacts(root).map((entry) => entry.path));
    for (const entry of detect(root).present) {
      assert.ok(walk.has(entry.path), `${patternId}: ${entry.path} came from the walk rather than from a guess`);
    }
  }
});

// ---------------------------------------------------------------------------
// C001 invariant — read from the filesystem, never asked for
// ---------------------------------------------------------------------------

test('C001 invariant — classification reads the list it is handed rather than the disk', () => {
  const fabricated = [artefact('src/auth.rs', { size: 120 }), artefact('docs/SPEC.md', { size: 4096 })];
  const boundary = classifyArtefacts({
    root: '/nonexistent/px2311',
    scope: { root: '/nonexistent/px2311' },
    artefacts: fabricated,
  });

  assert.deepEqual(boundary.artefacts.map((row) => row.path), ['docs/SPEC.md', 'src/auth.rs']);
  assert.deepEqual(boundary.counts, { in_scope: 1, out_of_scope: 0, undetermined: 1 });
  assert.equal(boundary.isEmpty, false, 'a boundary built from the disk would have been empty here');
});

test('C001 invariant — detection is a function of the artefact list and of nothing else', () => {
  const fabricated = [artefact('src/auth.rs', { size: 120 })];
  const fromNothing = detectPattern({ root: '/nonexistent/px2311', artefacts: fabricated });

  assert.equal(fromNothing.pattern, 'pattern-1', 'a list for a root that does not exist still decides');
  assert.equal(fromNothing.root, '/nonexistent/px2311');

  const sameList = detectPattern({ root: '/nonexistent/px2311', artefacts: fabricated });
  assert.deepEqual(fromNothing, sameList, 'the same list yields the same answer');
  assert.equal(renderPatternDetection(fromNothing), renderPatternDetection(sameList));
});

test('C001 invariant — the rendered document is byte-identical across two readings of one subject', () => {
  const first = detect(REPRESENTATIVES['pattern-3']);
  const second = detect(REPRESENTATIVES['pattern-3']);

  assert.deepEqual(first, second);
  assert.equal(renderPatternDetection(first), renderPatternDetection(second));
});

test('C001 invariant — the detection performs no interactive prompt', () => {
  const probe = [
    "globalThis.prompt = () => { throw new Error('the detection asked a question'); };",
    'globalThis.readline = globalThis.prompt;',
    `const { detectPattern } = await import(${JSON.stringify(PATTERN_MODULE_URL.href)});`,
    `const artefacts = [{ path: 'docs/SPEC.md', kind: 'file', size: ${LONG_SPECIFICATION_MIN_BYTES}, readStatus: 'readable', exclusion: false, reason: null }];`,
    "process.stdout.write(JSON.stringify(detectPattern({ root: '/nonexistent/px2311', artefacts })));",
  ].join('\n');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8' });

  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).pattern, 'pattern-4', 'detection completes with the prompt mechanism stubbed to throw');
});

test('C001 invariant — no environment variable changes the answer', () => {
  const probe = [
    `const { detectPattern } = await import(${JSON.stringify(PATTERN_MODULE_URL.href)});`,
    `const artefacts = [{ path: 'docs/SPEC.md', kind: 'file', size: ${LONG_SPECIFICATION_MIN_BYTES}, readStatus: 'readable', exclusion: false, reason: null }];`,
    "process.stdout.write(JSON.stringify(detectPattern({ root: '/nonexistent/px2311', artefacts })));",
  ].join('\n');
  const answerUnder = (environmentName) => spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    encoding: 'utf8',
    env: { ...process.env, [environmentName]: 'pattern-4' },
  }).stdout;

  assert.equal(answerUnder('WORKSPACIFY_PATTERN'), answerUnder('WSP_FORCE_PATTERN'));
  assert.equal(JSON.parse(answerUnder('WORKSPACIFY_PATTERN')).pattern, 'pattern-4');
});

test('C001 invariant — the module writes nothing: the subject is unchanged after a reading', () => {
  const before = listArtefacts(REPRESENTATIVES['pattern-3']).map((entry) => `${entry.path}:${entry.size}`);
  detect(REPRESENTATIVES['pattern-3']);
  const after = listArtefacts(REPRESENTATIVES['pattern-3']).map((entry) => `${entry.path}:${entry.size}`);

  assert.deepEqual(after, before);
});

// ---------------------------------------------------------------------------
// C002 invariant — mutually exclusive and jointly exhaustive over the declaration
// ---------------------------------------------------------------------------

test('C002 invariant — the four representatives yield four distinct values covering the declared set exactly', () => {
  const detected = Object.entries(REPRESENTATIVES).map(([expected, root]) => ({ expected, actual: detect(root).pattern }));

  for (const row of detected) {
    assert.equal(typeof row.actual, 'string', 'a detection is one value, never a set and never nothing');
    assert.equal(row.actual, row.expected, `${row.expected} detects as itself and as no other`);
  }
  assert.equal(new Set(detected.map((row) => row.actual)).size, 4);
  assert.deepEqual(
    [...new Set(detected.map((row) => row.actual))].sort(),
    PATTERNS.map((row) => row.id).sort(),
  );
});

// ---------------------------------------------------------------------------
// C001 invariant — the presence and absence lists account for the declaration
// ---------------------------------------------------------------------------

test('C001 invariant — every declared marker is in one list or the other, and none is in both', () => {
  for (const pattern of PATTERNS) {
    const declaration = PATTERN_MARKERS[pattern.id];
    const detection = detect(REPRESENTATIVES[pattern.id]);
    const named = [...detection.present, ...detection.absent].map((entry) => entry.marker);

    assert.equal(new Set(named).size, named.length, `${pattern.id}: no marker appears in both lists`);
    assert.deepEqual([...named].sort(), [...declaration].sort(), `${pattern.id}: every declared marker is accounted for`);
    assert.equal(detection.absent.length, declaration.length - detection.present.length);
    assert.equal(detection.evidence.length, SEARCHED_MARKERS.length, 'the evidence names what was searched, for every marker');
    assert.deepEqual(detection.markersSearched, SEARCHED_MARKERS.map((marker) => marker.id));
  }
});

test('C001 invariant — over generated artefact lists, detection returns one declared state and never nothing', () => {
  const generated = [];
  for (let index = 0; index < 20; index += 1) {
    generated.push([
      ...(index % 3 === 0 ? [artefact('RFC-A.md')] : []),
      ...(index % 4 === 0 ? [artefact('Tickets.json')] : []),
      ...(index % 5 === 0 ? [artefact('src/lib.rs')] : []),
      ...(index % 7 === 0 ? [artefact('docs/SPEC.md', { size: LONG_SPECIFICATION_MIN_BYTES + index })] : []),
    ]);
  }
  assert.equal(generated.length, 20);

  const declaredStates = [...PATTERNS.map((row) => row.id), ...Object.values(PATTERN_STATES)];
  for (const artefacts of generated) {
    const detection = detectPattern({ root: '/nonexistent/px2311', artefacts });
    assert.ok(declaredStates.includes(detection.state), `${detection.state} is a declared state`);
    assert.equal(detection.pattern === null, detection.state === PATTERN_STATES.NO_PATTERN);
    if (detection.pattern !== null) assert.ok(PATTERNS.some((row) => row.id === detection.pattern));
  }
});

// ---------------------------------------------------------------------------
// Error invariant — no pattern, and unreadable, are two different statements
// ---------------------------------------------------------------------------

test('C001 error invariant — a subject matching no declared pattern says so, naming every marker searched', () => {
  const empty = scratchDirectory('px2311-empty-');
  const unrelated = scratchDirectory('px2311-unrelated-');
  writeFileSync(join(unrelated.root, 'notes.txt'), 'shopping list\n');
  writeFileSync(join(unrelated.root, 'unrelated.bin'), 'unrelated bytes\n');
  try {
    for (const root of [empty.root, unrelated.root]) {
      const detection = detect(root);
      assert.equal(detection.pattern, null, 'no subject is forced into the nearest pattern');
      assert.equal(detection.state, PATTERN_STATES.NO_PATTERN, `${root} is looked at and found to match nothing`);
      assert.notEqual(detection.state, PATTERN_STATES.UNREADABLE_ROOT);
      assert.deepEqual(
        detection.absent.map((entry) => entry.marker).sort(),
        SEARCHED_MARKERS.map((marker) => marker.id).sort(),
        'every marker that was searched is named, so the answer can be re-derived',
      );
      assert.deepEqual(detection.present, []);
      assert.equal(
        detection.present.length + detection.absent.length,
        listPatternMarkers(detection.state).length,
        'the declaration the state is answered against is the one its two lists account for',
      );
      assert.match(renderPatternDetection(detection), /undetermined/i);
      assert.match(renderPatternDetection(detection), /RFC-\*\.md/, 'the render names what was searched for');
    }
  } finally {
    empty.dispose();
    unrelated.dispose();
  }
});

test('C001 error invariant — an unreadable root is reported by path rather than thrown or called no-pattern', () => {
  const missingRoot = join(tmpdir(), `px2311-absent-${process.pid}`);
  assert.equal(existsSync(missingRoot), false);
  const artefacts = listArtefacts(missingRoot);
  assert.equal(artefacts.length, 1);
  assert.equal(artefacts[0].kind, 'unreadable');
  assert.equal(artefacts[0].path, missingRoot);

  const detection = detectPattern({ root: missingRoot, artefacts });
  assert.equal(detection.pattern, null);
  assert.equal(detection.state, PATTERN_STATES.UNREADABLE_ROOT);
  assert.equal(detection.unreadablePath, missingRoot, 'the path is named rather than swallowed');
  assert.equal(detection.reason, artefacts[0].reason, 'the reason is carried through, not re-invented');
  assert.notEqual(detection.state, PATTERN_STATES.NO_PATTERN, 'could not look is a different statement from found nothing');
  assert.deepEqual(listPatternMarkers(detection.state), [], 'nothing was searched, so the declaration is empty');
  assert.deepEqual([detection.present, detection.absent, detection.evidence], [[], [], []]);
  assert.match(renderPatternDetection(detection), /could not be read/i);
});

// ---------------------------------------------------------------------------
// Boundary invariant — pinned to the declaration, not to an impression
// ---------------------------------------------------------------------------

test('C001 boundary invariant — the full terminal-state set still detects as pattern 2', () => {
  const terminal = createSyntheticTree({
    'RFC-ROOT.md': '# ROOT\n',
    'RFC-ROOT-GRAPH.json': '{}\n',
    'RFC-ROOT-Dirs-Tree.json': '{}\n',
    'Tickets.json': '{}\n',
    'DesignTree.json': '{}\n',
    'WORKSPACIFY-TREE-MANIFEST.json': '{}\n',
    'WORKSPACIFY-ALLOCATE-MANIFEST.json': '{}\n',
    'ARCHITECTURE-DELTA.json': '{}\n',
    'src/api/RFC-SEED.md': '# RFC Seed: api\n',
  });
  try {
    assert.equal(detect(terminal.root).pattern, 'pattern-2', 'the pattern is about scaffolding, not about how far the rotation ran');
  } finally {
    terminal.dispose();
  }
});

test('C002 boundary invariant — a fifth-layer manifest with no fourth-layer set is some artefacts, not the set', () => {
  const fifthOnly = createSyntheticTree({
    'WORKSPACIFY-TREE-MANIFEST.json': '{}\n',
    'src/lib.rs': 'pub fn a() {}\n',
  });
  try {
    const detection = detect(fifthOnly.root);
    assert.equal(detection.pattern, 'pattern-3');
    assert.deepEqual(detection.present.map((entry) => entry.marker), ['manifest']);
  } finally {
    fifthOnly.dispose();
  }
});

test('C002 boundary invariant — per-directory seeds with no root artefacts are pattern 3, because the criterion names the root set', () => {
  const seedsOnly = createSyntheticTree({
    'src/api/RFC-SEED.md': '# RFC Seed: api\n',
    'src/lib.rs': 'pub fn a() {}\n',
  });
  try {
    assert.equal(detect(seedsOnly.root).pattern, 'pattern-3');
  } finally {
    seedsOnly.dispose();
  }
});

test('C002 boundary invariant — a Tickets.json at a nested path is pattern 3, so the criterion is which artefacts exist', () => {
  const nestedTickets = createSyntheticTree({ 'docs/Tickets.json': '{}\n', 'src/lib.rs': 'pub fn a() {}\n' });
  try {
    const detection = detect(nestedTickets.root);
    assert.equal(detection.pattern, 'pattern-3');
    assert.equal(detection.present[0].scope, 'nested');
  } finally {
    nestedTickets.dispose();
  }
});

test('C001 boundary invariant — a subject that is a file rather than a directory is reported by name', () => {
  const scratch = scratchDirectory('px2311-file-');
  const fileRoot = join(scratch.root, 'a-file');
  writeFileSync(fileRoot, 'not a directory\n');
  try {
    const detection = detectPattern({ root: fileRoot, artefacts: listArtefacts(fileRoot) });
    assert.equal(detection.pattern, null);
    assert.equal(detection.state, PATTERN_STATES.UNREADABLE_ROOT);
    assert.equal(detection.unreadablePath, fileRoot);
  } finally {
    scratch.dispose();
  }
});

test('C002 boundary invariant — the specification threshold is the boundary: one byte under is not a long specification', () => {
  const shortSpec = createSyntheticTree({ 'docs/SPEC.md': 'x'.repeat(LONG_SPECIFICATION_MIN_BYTES - 1) });
  const longSpec = createSyntheticTree({ 'docs/SPEC.md': 'x'.repeat(LONG_SPECIFICATION_MIN_BYTES) });
  try {
    assert.equal(detect(shortSpec.root).state, PATTERN_STATES.NO_PATTERN);
    assert.equal(detect(longSpec.root).pattern, 'pattern-4');
  } finally {
    shortSpec.dispose();
    longSpec.dispose();
  }
});

test('C002 boundary invariant — an excluded tree is not evidence: a vendored source file does not make a subject a project', () => {
  const vendoredOnly = createSyntheticTree({ 'vendor/dep/src/lib.rs': 'pub fn a() {}\n' });
  try {
    assert.equal(detect(vendoredOnly.root).state, PATTERN_STATES.NO_PATTERN, 'out of scope is not the same as measured');
  } finally {
    vendoredOnly.dispose();
  }
});

test('C002 boundary invariant — a long file that is not a document extension is not a specification', () => {
  const binarySpec = createSyntheticTree({ 'docs/SPEC': 'x'.repeat(LONG_SPECIFICATION_MIN_BYTES * 2) });
  try {
    assert.equal(detect(binarySpec.root).state, PATTERN_STATES.NO_PATTERN);
    assert.ok(DOCUMENT_EXTENSIONS.every((extension) => extension.startsWith('.')));
  } finally {
    binarySpec.dispose();
  }
});

// ---------------------------------------------------------------------------
// The fixtures say what they are for
// ---------------------------------------------------------------------------

test('C002 precondition — the fixtures README names every fixture and what each one exercises', () => {
  const readme = readFileSync(FIXTURES_README, 'utf8');
  for (const name of [
    'sample-project', 'unclosed-header-project', 'mixed-l3-project', 'r3-subject', 'two-package-crate',
    'patterns/partial-conver-project', 'patterns/spec-only-project',
  ]) {
    assert.ok(readme.includes(name), `${name} is named in the fixtures README`);
  }
  assert.match(readme, /pattern, not a project's scale/i, 'the two new representatives say what they represent');
});

test('C002 precondition — each new representative states what it is beside itself', () => {
  for (const name of ['partial-conver-project', 'spec-only-project']) {
    const readme = readFileSync(join(PATTERNS_FIXTURES, name, 'README.md'), 'utf8');
    assert.match(readme, /pattern, not a project's scale/i, `${name} says what it represents`);
    assert.match(readme, /[Ww]hat a fuller\s+representative would need|A fuller\s+representative/, `${name} names what it does not exercise`);
  }
});
