// @verifies C001
// @verifies C002
// @verifies C003
/**
 * E12, E13 and E14 through the published artefacts.
 *
 * The unit suites prove each item's shape in memory. This one proves the same
 * facts survive a run: that `analyze --through=r6.5` completes for every
 * representative, that the reachability partition published in `GAPS.json` sums
 * to the population, that `ORACLE-GAP.json` carries TCE verdicts drawn from the
 * declared two-value vocabulary with the normalisation each verdict rests on,
 * that `GENERATED-PROPERTIES.json` reports generated and executed separately,
 * and that the subject is byte-identical afterwards.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAPABILITY_MATRIX, TARGET_LANGUAGES } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { REPRESENTATIVE_ROOTS } from '../../../.claude/scripts/workspacify-reverse/lib/language-representatives.mjs';
import { PROPERTY_ENGINES } from '../../../.claude/scripts/workspacify-reverse/lib/property-tests.mjs';
import { analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { TCE_VERDICTS, NOT_TRIVIALLY_EQUIVALENT, TRIVIALLY_EQUIVALENT } from '../../../.claude/scripts/workspacify-reverse/lib/tce.mjs';
import { hashTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SIX = Object.freeze([...TARGET_LANGUAGES]);

/** Where this suite's analyses stop: R6.5 is the last stage the three items feed. */
const THROUGH_R6_5 = 'r6.5';

/** The comment token each language writes a trailing probe comment with. */
const COMMENT_BY_LANGUAGE = Object.freeze({
  rust: '//', typescript: '//', javascript: '//', go: '//', c_cpp: '//', python: '#',
});

/** The extension each language's own source carries. */
const EXTENSIONS_BY_LANGUAGE = Object.freeze({
  rust: ['.rs'], typescript: ['.ts'], javascript: ['.js'], go: ['.go'], python: ['.py'], c_cpp: ['.cpp', '.h'],
});

/** The phrase no output of E13 may carry, in either spelling. */
const SEMANTIC_EQUIVALENCE = /semantically equivalent|semantic equivalence|proved equivalent/i;

/** Every string anywhere in a value, at full depth. */
function stringsIn(value, found = []) {
  if (typeof value === 'string') { found.push(value); return found; }
  if (Array.isArray(value)) { for (const entry of value) stringsIn(entry, found); return found; }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) stringsIn(value[key], found);
  }
  return found;
}

/** Every file beneath a root, at full depth. */
function filesUnder(root, found = []) {
  for (const entry of readdirSync(root).sort()) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) { filesUnder(full, found); continue; }
    found.push(full);
  }
  return found;
}

/** A throwaway directory to publish into, so no test writes into the project. */
function scratchOutput() {
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-p24-5-it-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * Two mutant pairs per language, built from that representative's own files.
 *
 * The equivalent pair appends a comment, which the normalisation drops; the
 * differing pair swaps in another file's text, which is certainly a different
 * tree. Both are read from the representative rather than written into it, so a
 * run that consumed them cannot have changed what it measured.
 */
function pairsFor(language) {
  const root = join(PROJECT_ROOT, REPRESENTATIVE_ROOTS[language]);
  const extensions = EXTENSIONS_BY_LANGUAGE[language];
  const sources = filesUnder(root)
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .sort();
  assert.ok(sources.length >= 2, `${language}: the pair construction needs two source files`);

  const original = readFileSync(sources[0], 'utf8');
  const other = readFileSync(sources[1], 'utf8');
  return [
    { mutant_id: `${language}-reflowed`, language, original, mutated: `${original}\n${COMMENT_BY_LANGUAGE[language]} reflow probe\n` },
    { mutant_id: `${language}-other-file`, language, original, mutated: other },
  ];
}

test('IT: a full run over each representative publishes E12, E13 and E14 records and leaves the subject byte-identical', async () => {
  for (const language of SIX) {
    const fixture = join(PROJECT_ROOT, REPRESENTATIVE_ROOTS[language]);
    const before = hashTree(fixture);
    const out = scratchOutput();

    await analyzeProject({
      root: fixture,
      out: out.root,
      through: THROUGH_R6_5,
      options: { reconstruction: { tcePairs: pairsFor(language) } },
    });

    const gaps = JSON.parse(readFileSync(join(out.root, 'GAPS.json'), 'utf8'));
    const counts = gaps.reachability.counts;
    assert.equal(
      counts.reachable + counts.unreachable + counts.notAnalysable,
      counts.population,
      `${language}: the three reachability states must partition the population`,
    );
    assert.equal(counts.population, gaps.reachability.regions.length);
    assert.equal(typeof gaps.reachability.caveat, 'string');

    const unreachable = gaps.reachability.regions.filter((region) => region.state === 'unreachable');
    const unreachableGaps = gaps.gaps.filter((gap) => gap.kind === 'dead_code' && gap.provenance === 'inferred');
    if (unreachable.length > 0) {
      assert.ok(
        unreachableGaps.some((gap) => unreachable.some((region) => region.file === gap.file)),
        `${language}: E12's unreachable regions enter the gap list rather than being dropped`,
      );
    }

    const oracle = JSON.parse(readFileSync(join(out.root, 'ORACLE-GAP.json'), 'utf8'));
    assert.equal(oracle.tce.language, language);
    assert.equal(oracle.tce.comparisons.length, 2, `${language}: every presented pair is compared`);
    assert.deepEqual(
      [...new Set(oracle.tce.comparisons.map((record) => record.verdict))].sort(),
      [...TCE_VERDICTS].sort(),
      `${language}: both values of the declared vocabulary are reached`,
    );
    for (const record of oracle.tce.comparisons) {
      assert.ok(TCE_VERDICTS.includes(record.verdict), `${language}: ${record.verdict}`);
      assert.equal(typeof record.normalised_original, 'string');
      assert.equal(typeof record.normalised_mutant, 'string');
      assert.equal(record.configuration_id, oracle.tce.configuration.configuration_id);
      assert.equal(record.grammar, oracle.tce.configuration.grammar);
    }
    assert.equal(
      oracle.tce.comparisons.find((record) => record.mutant_id.endsWith('-reflowed')).verdict,
      TRIVIALLY_EQUIVALENT,
      `${language}: a comment the normalisation drops does not change the tree`,
    );
    assert.equal(
      oracle.tce.comparisons.find((record) => record.mutant_id.endsWith('-other-file')).verdict,
      NOT_TRIVIALLY_EQUIVALENT,
      `${language}: a different file is a different tree`,
    );
    // The phrase may appear in exactly one place: the caveat that says the claim
    // is never made. A denial is not an assertion, and a walk that could not tell
    // the two apart would force the caveat to stop naming what it denies.
    const claims = [];
    (function walk(value, path) {
      if (typeof value === 'string') {
        if (SEMANTIC_EQUIVALENCE.test(value)) claims.push(path);
        return;
      }
      if (Array.isArray(value)) { value.forEach((entry, index) => walk(entry, path + `[${index}]`)); return; }
      if (value !== null && typeof value === 'object') {
        for (const key of Object.keys(value)) walk(value[key], `${path}.${key}`);
      }
    }(oracle, 'ORACLE-GAP.json'));
    assert.deepEqual(
      claims.filter((path) => path !== 'ORACLE-GAP.json.tce.caveat'),
      [],
      `${language}: no output of E13 may claim semantic equivalence`,
    );
    assert.match(oracle.tce.caveat, /never claims it/, 'the one place the phrase appears denies it');

    const properties = JSON.parse(readFileSync(join(out.root, 'GENERATED-PROPERTIES.json'), 'utf8'));
    assert.equal(typeof properties.generatedCount, 'number');
    assert.equal(typeof properties.executedCount, 'number');
    assert.equal(typeof properties.refusedCount, 'number');
    assert.equal(
      properties.executedCount + properties.refusedCount,
      properties.generatedCount,
      `${language}: generated and executed are reported separately and reconcile`,
    );

    assert.equal(CAPABILITY_MATRIX[language].E13, 'unsupported_in_principle');
    assert.deepEqual(hashTree(fixture), before, `${language}: the subject must be byte-identical after the run`);
    out.dispose();
  }
});

test('IT: a language with no pair presented reports that it had none, rather than an empty verdict list', async () => {
  const fixture = join(PROJECT_ROOT, REPRESENTATIVE_ROOTS.rust);
  const out = scratchOutput();

  await analyzeProject({ root: fixture, out: out.root, through: THROUGH_R6_5 });

  const oracle = JSON.parse(readFileSync(join(out.root, 'ORACLE-GAP.json'), 'utf8'));
  assert.deepEqual(oracle.tce.comparisons, []);
  assert.equal(oracle.tce.counts.comparisons, 0);
  assert.ok(
    oracle.tce.unavailable.some((reason) => reason.includes('no mutant pair was presented')),
    'a run with nothing to compare says so rather than publishing an empty list as a result',
  );
  assert.equal(oracle.tce.configuration.language, 'rust', 'the configuration is published whether or not a pair was compared');
  out.dispose();
});

test('IT: the run\'s own before-and-after digest and this suite\'s independent one agree', async () => {
  const fixture = join(PROJECT_ROOT, REPRESENTATIVE_ROOTS.rust);
  const before = hashTree(fixture);
  const out = scratchOutput();

  const outcome = await analyzeProject({
    root: fixture,
    out: out.root,
    through: THROUGH_R6_5,
    options: { reconstruction: { tcePairs: pairsFor('rust') } },
  });

  assert.equal(outcome.structure !== null, true, 'the analysis completed rather than stopping at a stage boundary');
  assert.deepEqual(hashTree(fixture), before);
  const scope = JSON.parse(readFileSync(join(out.root, 'ANALYSIS-SCOPE.json'), 'utf8'));
  assert.equal(scope.target_digest.unmodified, true);
  out.dispose();
});

/**
 * The row `PROPERTY_ENGINES` carries for a language whose engine is not recorded.
 *
 * It is the absence of an engine rather than one: a property under it is refused
 * by name, so there is nothing for the environment to provide and nothing to
 * declare.
 */
const UNRECORDED_LANGUAGE = 'unknown';

/** Every ticket key `Tickets.json` holds, as `P{phase}-{ticket}`. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function ticketKeys(tickets) {
  const keys = new Set();
  const pending = [tickets];

  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) { for (const entry of value) pending.push(entry); continue; }
    if (value === null || typeof value !== 'object') continue;
    if (typeof value.id === 'number' && typeof value.phaseId === 'number') {
      keys.add(`P${value.phaseId}-${value.id}`);
    }
    for (const entry of Object.values(value)) pending.push(entry);
  }

  return keys;
}

test('IT: every engine E14 writes a property for is declared in ENV-DEPS.json with the ticket that provides it', () => {
  const environment = JSON.parse(readFileSync(join(PROJECT_ROOT, 'ENV-DEPS.json'), 'utf8'));
  const declaredEngines = environment.propertyEngines ?? [];
  const byEngine = new Map(declaredEngines.map((entry) => [entry.id, entry]));

  // The engines a property can actually be written and run for. The comparison is
  // made against the module rather than against a second list typed into the test,
  // because a copied list drifts on spelling and each side's own assertions would
  // still pass against its own copy.
  const executedEngines = new Map(
    Object.entries(PROPERTY_ENGINES).filter(([language]) => language !== UNRECORDED_LANGUAGE),
  );

  assert.deepEqual(
    [...byEngine.keys()].sort(),
    [...new Set(executedEngines.values())].sort(),
    'the engines declared for the environment and the ones PROPERTY_ENGINES holds are the same set, both ways',
  );

  const known = ticketKeys(JSON.parse(readFileSync(join(PROJECT_ROOT, 'Tickets.json'), 'utf8')));

  for (const [language, engine] of executedEngines) {
    const entry = byEngine.get(engine);

    assert.equal(entry.requiredFor, 'reverse', `${engine} is needed by the reverse rotation`);
    assert.equal(
      known.has(entry.providedBy), true,
      `${engine} names ${entry.providedBy} as the ticket that provides it, and that ticket exists`,
    );
    assert.equal(
      entry.languages.includes(language), true,
      `${engine} names ${language} among the languages it serves`,
    );
  }
});
