// @verifies C001
// @verifies C002
// @verifies C003
/**
 * The language population through the pipeline that will consume it.
 *
 * The unit suite proves the declaration against itself. These prove the two
 * properties that make it usable rather than merely present: an analysis run
 * pointed at any of the six representatives completes and publishes the same
 * document set, and the material the later tickets will look for is actually
 * there — the grammar installed, the language classified, the trees unchanged
 * by having been run over.
 *
 * `siprs-for-reverse` is the experiment subject and is not analysed here. These
 * are the instrument's validation population, and pointing the experiment's
 * analysis at a validation tree is the confusion C003's invariant exists to
 * prevent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TARGET_LANGUAGES, languageOfPath } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { GRAMMAR_BY_LANGUAGE } from '../../../.claude/scripts/workspacify-reverse/lib/structure.mjs';
import { analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import {
  BUILD_BY_LANGUAGE,
  LANGUAGE_DECLARATION_PATH,
  REPRESENTATIVE_ROOTS,
  digestRepresentative,
  loadLanguageRepresentatives,
} from '../../../.claude/scripts/workspacify-reverse/lib/language-representatives.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REVERSE_TREE = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse');
const FIXTURES_ROOT = 'tests/workspacify-reverse/fixtures';
const LANGUAGES_FIXTURES_ROOT = `${FIXTURES_ROOT}/languages`;

/** Where an analysis run stops, named rather than inherited from a default that moves. */
const THROUGH_R2_5 = 'r2.5';

/** The documents a run publishes, so "it completed" has a shape a reader can check. */
const PUBLISHED_DOCUMENTS = Object.freeze([
  'ANALYSIS-SCOPE.json',
  'SCOPE-BOUNDARY.json',
  'STRUCTURE.json',
  'EXECUTION-SURFACE.json',
  'PATTERN.json',
]);

const declaration = loadLanguageRepresentatives({ projectRoot: PROJECT_ROOT });

// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function scratchOutput() {
  const root = mkdtempSync(join(tmpdir(), 'p24-languages-it-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test('C003 IT — an analysis run can be pointed at each of the six representatives and completes', async () => {
  const published = new Map();

  for (const entry of declaration.languages) {
    const out = scratchOutput();
    try {
      await analyzeProject({ root: join(PROJECT_ROOT, entry.root), out: out.root, through: THROUGH_R2_5 });
      const documents = readdirSync(out.root).sort();
      published.set(entry.language, documents);

      for (const name of PUBLISHED_DOCUMENTS) {
        assert.equal(existsSync(join(out.root, name)), true, `${entry.language} publishes ${name}`);
      }
    } finally {
      out.dispose();
    }
  }

  const first = published.get(declaration.languages[0].language);
  for (const [language, documents] of published) {
    assert.deepEqual(documents, first, `${language} publishes the same document set as the rest`);
  }
});

test('C002 IT — the representatives are byte-identical after a run, because a fixture a run rewrote is a different subject', async () => {
  const before = new Map(
    declaration.languages.map((entry) => [entry.language, digestRepresentative(entry.language, { projectRoot: PROJECT_ROOT }).sha256]),
  );

  for (const entry of declaration.languages) {
    const out = scratchOutput();
    try {
      await analyzeProject({ root: join(PROJECT_ROOT, entry.root), out: out.root, through: THROUGH_R2_5 });
    } finally {
      out.dispose();
    }
  }

  for (const entry of declaration.languages) {
    assert.equal(
      digestRepresentative(entry.language, { projectRoot: PROJECT_ROOT }).sha256,
      before.get(entry.language),
      `${entry.language} must not be written to by a run`,
    );
  }
});

test('C001 IT — every source file under a representative classifies as the language the declaration claims', () => {
  for (const entry of declaration.languages) {
    const root = join(PROJECT_ROOT, entry.root);
    const sources = Object.keys(listFilesUnder(root));

    assert.equal(sources.length > 0, true, `${entry.language}'s walk reads real files`);
    for (const file of sources) {
      const language = languageOfPath(file);
      if (language === 'unknown') continue;
      assert.equal(language, entry.language, `${entry.language}/${file} must classify as ${entry.language}`);
    }
  }
});

test('C001 IT — the five new trees live under the fixture root beside the two siprs trees, and Rusts representative is one of the existing fixtures', () => {
  for (const entry of declaration.languages) {
    assert.equal(entry.root.startsWith(`${FIXTURES_ROOT}/`), true, `${entry.root} lives inside the fixture root`);

    if (entry.language === 'rust') {
      assert.equal(
        entry.root.startsWith(`${LANGUAGES_FIXTURES_ROOT}/`),
        false,
        'Rust is the language the instrument already exercised, so its representative is an existing fixture',
      );
      continue;
    }
    assert.equal(entry.root, `${LANGUAGES_FIXTURES_ROOT}/${entry.language}`, `${entry.language}'s tree is named for its language`);
    assert.equal(existsSync(join(PROJECT_ROOT, entry.root, 'README.md')), true, `${entry.language}'s tree describes itself`);
  }

  assert.equal(
    readFileSync(join(PROJECT_ROOT, LANGUAGES_FIXTURES_ROOT, 'README.md'), 'utf8').includes('LANGUAGES.json'),
    true,
    'the directory points at the one declaration that names the population',
  );
});

test('C002 IT — every declared grammar and toolchain is declared in ENV-DEPS.json with the ticket that provides it', () => {
  const environment = JSON.parse(readFileSync(join(PROJECT_ROOT, 'ENV-DEPS.json'), 'utf8'));

  for (const language of TARGET_LANGUAGES) {
    const grammar = GRAMMAR_BY_LANGUAGE[language].packageName;
    const declaredGrammar = environment.npmRoots.find((root) => root.id === grammar);

    assert.ok(declaredGrammar, `${grammar} is declared in ENV-DEPS.json rather than assumed installed`);
    assert.equal(typeof declaredGrammar.providedBy, 'string', `${grammar} names the ticket that provides it`);

    const toolchain = BUILD_BY_LANGUAGE[language].toolchain;
    const declaredToolchain = environment.tools.find((tool) => tool.id === toolchain);

    assert.ok(declaredToolchain, `${toolchain} is declared for ${language}'s build command`);
  }
});

test('C002 IT — every grammar the declaration names resolves to an installed wasm, so the population is usable rather than merely present', () => {
  for (const language of TARGET_LANGUAGES) {
    const { packageName, wasmName } = GRAMMAR_BY_LANGUAGE[language];
    const wasm = join(REVERSE_TREE, 'node_modules', packageName, wasmName);

    assert.equal(existsSync(wasm), true, `${language}'s grammar is installed at ${wasmName}`);
  }
});

test('C001 IT — the declaration is the one place the population is named, and it is inside the fixture root it describes', () => {
  const declarationPath = join(PROJECT_ROOT, LANGUAGE_DECLARATION_PATH);

  assert.equal(existsSync(declarationPath), true);
  assert.equal(
    LANGUAGE_DECLARATION_PATH.startsWith(`${LANGUAGES_FIXTURES_ROOT}/`),
    true,
    'the declaration sits beside the representatives it names',
  );
  for (const root of Object.values(REPRESENTATIVE_ROOTS)) {
    assert.equal(existsSync(join(PROJECT_ROOT, root)), true, `${root} exists`);
  }
});

/** Every file beneath a root, as paths relative to that root. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function listFilesUnder(root) {
  const collected = {};
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(join(directory, entry.name), relativePath);
      } else {
        collected[relativePath] = true;
      }
    }
  };
  walk(root, '');
  return collected;
}
