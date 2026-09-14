// @verifies C001
// @verifies C002
// @verifies C003
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
/**
 * Pattern detection through the pipeline that runs it.
 *
 * The unit suite proves each function alone. These prove the wiring, and one
 * property the unit suite cannot: design 1.2 says **none of the four patterns
 * may be blocked or aborted on the grounds that the project is an incomplete
 * conver project**, and the only way to measure that is to run all four to the
 * same depth and compare what they published. A key set that differed per
 * pattern would be a gate wearing a document's clothes.
 *
 * The four representatives are tracked files of this repository, so none of
 * these tests is skipped: a run that reached three of them would be exactly the
 * silent narrowing this file exists to prevent.
 *
 * Cost, measured 2026-09-13: the full-run test pays about 23 s for
 * `siprs-for-reverse` and about 70 s for `siprs-with-4layers` (R8; design A.1
 * measures roughly three minutes for the first on a cold tree). That is the
 * price of measuring the invariant over four inputs rather than over two.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listArtefacts } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { PATTERNS, PATTERN_FILE_NAME, detectPattern } from '../../../.claude/scripts/workspacify-reverse/lib/pattern-detection.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REVERSE_ROOT = join(PROJECT_ROOT, 'siprs-for-reverse');
const LAYERED_ROOT = join(PROJECT_ROOT, 'siprs-with-4layers');
const PATTERNS_FIXTURES = join(PROJECT_ROOT, 'tests/workspacify-reverse/fixtures/patterns');
const DESIGN_DOCUMENT = join(PROJECT_ROOT, 'docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md');
const SCOPE_MODULE = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/lib/scope.mjs');

/** The four representatives, in the declared order, each with the pattern it is. */
const REPRESENTATIVES = Object.freeze([
  Object.freeze({ patternId: 'pattern-1', root: REVERSE_ROOT }),
  Object.freeze({ patternId: 'pattern-2', root: LAYERED_ROOT }),
  Object.freeze({ patternId: 'pattern-3', root: join(PATTERNS_FIXTURES, 'partial-conver-project') }),
  Object.freeze({ patternId: 'pattern-4', root: join(PATTERNS_FIXTURES, 'spec-only-project') }),
]);

/** A throwaway destination: a run refuses to publish inside the tree it measures. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function scratchDirectory(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/** Run the pipeline over every representative, publish each beside its own record, and clean up. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
async function runsOverEverything({ through, prefix }) {
  const runs = [];
  for (const representative of REPRESENTATIVES) {
    const out = scratchDirectory(prefix);
    runs.push({ ...representative, out, outcome: await analyzeProject({ ...representative, out: out.root, through }) });
  }
  return { runs, dispose: () => runs.forEach((run) => run.out.dispose()) };
}

/** The names a run published, read from the directory rather than from a declared list. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function publishedNames(root) {
  return readdirSync(root).sort();
}

/** The detection a run published, parsed from its own sidecar. */
// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
function publishedPattern(root) {
  return JSON.parse(readFileSync(join(root, PATTERN_FILE_NAME), 'utf8'));
}

// ---------------------------------------------------------------------------
// C001 / C002 — the identification reaches the pipeline, and is the same one
// ---------------------------------------------------------------------------

test('IT: the scope prefix over the four representatives publishes one key set and four patterns', async () => {
  const { runs, dispose } = await runsOverEverything({ through: 'r0.5', prefix: 'wsp-pattern-r05-' });
  try {
    const reference = publishedNames(runs[0].out.root);
    for (const run of runs) {
      const published = publishedPattern(run.out.root);
      assert.equal(published.pattern, run.patternId, `${run.root} is published as ${run.patternId}`);
      assert.equal(published.root, run.root);
      assert.equal(run.outcome.pattern.pattern, run.patternId, 'and the run reports the value it published');
      assert.deepEqual(publishedNames(run.out.root), reference, 'design 1.2: the pattern changes no published key');
      assert.ok(published.present.length + published.absent.length > 0, 'the decision material travels with the answer');
    }
    assert.equal(new Set(runs.map((run) => publishedPattern(run.out.root).pattern)).size, 4);
    assert.deepEqual(
      [...new Set(runs.map((run) => publishedPattern(run.out.root).pattern))].sort(),
      PATTERNS.map((row) => row.id).sort(),
    );
  } finally {
    dispose();
  }
});

test('IT: the pattern and the evidence cannot disagree with the boundary the run published beside them', async () => {
  const { runs, dispose } = await runsOverEverything({ through: 'r0.5', prefix: 'wsp-pattern-evidence-' });
  try {
    for (const run of runs) {
      const published = publishedPattern(run.out.root);
      const boundaryPaths = new Set(
        JSON.parse(readFileSync(join(run.out.root, 'SCOPE-BOUNDARY.json'), 'utf8'))
          .artefacts.map((artefact) => artefact.path),
      );
      for (const entry of published.evidence.filter((row) => row.found)) {
        assert.ok(
          boundaryPaths.has(entry.path),
          `${run.root}: ${entry.path} is evidence, so it must be an artefact the same run enumerated`,
        );
      }
    }
  } finally {
    dispose();
  }
});

test('IT: the detection is deterministic over a real tree — two runs publish byte-identical PATTERN.json', async () => {
  const first = scratchDirectory('wsp-pattern-det-1-');
  const second = scratchDirectory('wsp-pattern-det-2-');
  const root = join(PATTERNS_FIXTURES, 'partial-conver-project');
  try {
    await analyzeProject({ root, out: first.root, through: 'r0.5' });
    await analyzeProject({ root, out: second.root, through: 'r0.5' });
    assert.equal(
      readFileSync(join(first.root, PATTERN_FILE_NAME), 'utf8'),
      readFileSync(join(second.root, PATTERN_FILE_NAME), 'utf8'),
    );
  } finally {
    first.dispose();
    second.dispose();
  }
});

// ---------------------------------------------------------------------------
// C003 — no pattern is a refusal condition, measured rather than asserted
// ---------------------------------------------------------------------------

test('IT: a full run over each of the four representatives reaches the origin spec and publishes the same key set', async () => {
  const { runs, dispose } = await runsOverEverything({ prefix: 'wsp-pattern-r8-' });
  try {
    const reference = publishedNames(runs[0].out.root);
    for (const run of runs) {
      assert.equal(
        existsSync(join(run.out.root, 'ORIGIN-LONG-SPEC.json')),
        true,
        `${run.patternId} (${run.root}) reaches the origin spec rather than being refused`,
      );
      assert.equal(existsSync(join(run.out.root, PATTERN_FILE_NAME)), true, 'and still publishes the identification');
      assert.deepEqual(publishedNames(run.out.root), reference, `${run.patternId} publishes what every other pattern publishes`);
    }
  } finally {
    dispose();
  }
});

test('IT: the procedure names the document the identification is published as', () => {
  const procedure = readFileSync(join(PROJECT_ROOT, '.claude/commands/workspacify-reverse.md'), 'utf8');
  const stepZero = procedure.slice(procedure.indexOf('## Step 0:'), procedure.indexOf('## Step 1:'));

  assert.match(stepZero, /PATTERN\.json/, 'Step 0 names the document Step 2 publishes, so the prose and the run agree');
  assert.match(stepZero, /presence and absence/i, 'and the material that decided it, not only the verdict');
});

test('IT: the pipeline walks the tree once, and this is what would catch a second walk being added', () => {
  const source = readFileSync(SCOPE_MODULE, 'utf8');
  const callSites = source.match(/listArtefacts\(/g) ?? [];

  assert.equal(
    callSites.length,
    2,
    'one call in the pipeline, and the classification default that call satisfies — a third would be a second walk',
  );
  assert.match(source, /classifyArtefacts\(\{[^}]*artefacts[^}]*\}\)/, 'the boundary is handed the walk, not left to take its own');
  assert.match(source, /detectPattern\(\{[^}]*artefacts[^}]*\}\)/, 'and so is the identification');
});

test('IT: no stage gates on the pattern — the refusal design 1.2 forbids is absent from the code, not only from this run', () => {
  const source = readFileSync(SCOPE_MODULE, 'utf8');

  for (const row of PATTERNS) {
    assert.equal(
      source.includes(`'${row.id}'`) || source.includes(`"${row.id}"`),
      false,
      `the pipeline names ${row.id}, which is the shape a gate would take`,
    );
  }
  assert.match(source, /detectPattern\(/, 'and the pipeline does call the detection, so the absence is not silence');
});

// ---------------------------------------------------------------------------
// The implementation and the design document agree about the two real trees
// ---------------------------------------------------------------------------

test('IT: design 1.3 names the two existing trees, and the detection reads them the same way', () => {
  const design = readFileSync(DESIGN_DOCUMENT, 'utf8');
  assert.match(design, /siprs-for-reverse\s+none of the above/, 'the design names the pattern-1 input');
  assert.match(design, /pattern-1 representative/);
  assert.match(design, /pattern-2 representative/);

  for (const [patternId, root] of [['pattern-1', REVERSE_ROOT], ['pattern-2', LAYERED_ROOT]]) {
    assert.equal(
      detectPattern({ root, artefacts: listArtefacts(root) }).pattern,
      patternId,
      `the tree the design calls ${patternId} detects as ${patternId}`,
    );
  }
});
