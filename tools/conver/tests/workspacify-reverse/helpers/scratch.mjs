// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * Shared test helpers for the workspacify-reverse suite.
 *
 * Every test that scrubs must operate on a throwaway copy: the fixtures under
 * tests/workspacify-reverse/fixtures are the single source of truth and must
 * never be mutated by a test run.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUITE_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Absolute path of the fixture project that mirrors a contaminated tree. */
export const FIXTURE_PROJECT = path.join(SUITE_ROOT, 'fixtures', 'sample-project');

/** Absolute path of a fixture holding only the pathological header case. */
export const FIXTURE_UNCLOSED_HEADER = path.join(SUITE_ROOT, 'fixtures', 'unclosed-header-project');

/** Absolute path of a fixture mixing production code with an L3 dependency. */
export const FIXTURE_MIXED_L3 = path.join(SUITE_ROOT, 'fixtures', 'mixed-l3-project');

/**
 * Copy a fixture project into a fresh temporary directory.
 * @param {string} [fixturePath] — fixture to copy; defaults to the main project
 * @returns {{ root: string, dispose: () => void }}
 */
export function createScratchFrom(fixturePath = FIXTURE_PROJECT) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'wsp-reverse-'));
  cpSync(fixturePath, root, { recursive: true });
  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Copy the main contaminated fixture project into a fresh temporary directory. */
export function createScratchProject() {
  return createScratchFrom(FIXTURE_PROJECT);
}

/** Read a file as an array of lines (newline characters stripped). */
export function readLines(filePath) {
  return readFileSync(filePath, 'utf8').split('\n');
}

/** Keep only lines that are not comment-only lines. */
export function nonCommentLines(lines) {
  return lines.filter((line) => !/^\s*(\/\/|\/\/!|\/\*|\*)/.test(line));
}

/** SHA-256 of a string. */
export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * SHA-256 of every file under a root, keyed by path relative to that root.
 * Used to prove that a scrub did not touch anything outside its target.
 */
export function hashTree(root) {
  const hashes = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        hashes[path.relative(root, full)] = sha256(readFileSync(full));
      }
    }
  };
  walk(root);
  return hashes;
}

/** Write lines back to a file, preserving a trailing newline when present. */
export function writeLines(filePath, lines) {
  writeFileSync(filePath, lines.join('\n'));
}

/**
 * Materialise a path-to-content map beneath an existing directory.
 *
 * Parents are created on demand so a caller declares only the files it cares
 * about. Used by the P22-2 holdout and oracle suites, which need synthetic
 * candidate projects and a miniature answer-key/subject pair rather than the
 * multi-thousand-file real trees.
 */
export function writeSyntheticTree(root, filesByPath) {
  for (const [relativePath, content] of Object.entries(filesByPath)) {
    const full = path.join(root, relativePath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

/** Create a throwaway temporary tree from a path-to-content map. */
export function createSyntheticTree(filesByPath, { prefix = 'wsp-synth-' } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  writeSyntheticTree(root, filesByPath);
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * A miniature forward-rotated tree: the answer key a reverse rotation would be
 * measured against. It carries every artefact kind the oracle bundle extracts.
 */
export const ORACLE_FIXTURE_FILES = Object.freeze({
  'Cargo.toml': [
    '[package]',
    'name = "mini"',
    '',
    '[[test]]',
    'name = "verify_spec_p0_1"',
    '',
    '[[test]]',
    'name = "verify_spec_p7_3"',
    '',
  ].join('\n'),
  'RFC-ROOT.md': '# Mini RFC\n\n## Purpose\n\nAudio only.\n\n## Scope\n\nSmall.\n',
  'RFC-ROOT-GRAPH.json': `${JSON.stringify(
    {
      sourceFile: 'RFC-ROOT.md',
      mainLanguage: 'rust',
      nodes: [
        { id: 'N0001', title: 'Purpose', kind: 'requirement' },
        { id: 'N0002', title: 'Scope', kind: 'requirement' },
      ],
      edges: [{ from: 'N0001', to: 'N0002', type: 'refines', attributes: {}, contracts: [{ id: 'C001' }] }],
    },
    null,
    2,
  )}\n`,
  'RFC-ROOT-Dirs-Tree.json': `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: '2026-09-10T00:00:00Z',
      sourceGraph: 'RFC-ROOT-GRAPH.json',
      sourceFile: 'RFC-ROOT.md',
      analysis: { nodeCount: 2, edgeCount: 1 },
      trees: {
        rust: {
          name: 'src',
          type: 'directory',
          kind: 'root',
          children: [
            {
              name: 'audio',
              type: 'directory',
              kind: 'architecture',
              mappedNodeIds: [{ nodeId: 'N0001', title: 'Purpose' }],
              children: [{ name: 'mod.rs', type: 'file', kind: 'api_contract', mappedNodeIds: [], declarationStub: 'pub fn a() {}' }],
            },
          ],
        },
      },
      dependencyDirections: { rust: [] },
      warnings: [],
    },
    null,
    2,
  )}\n`,
  'Tickets.json': `${JSON.stringify(
    { title: 'Mini', round: 1, metadata: {}, phases: [{ id: 0, tickets: [{ id: 1, phaseId: 0, title: 'Foundation' }] }] },
    null,
    2,
  )}\n`,
  'omissions/OMISSIONS-1.json': '{ "omissions": [] }\n',
  'src/audio/mod.rs': [
    '// =================================================================',
    '// Initial Design Artifact — RFC-driven Implementation',
    '// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1`',
    '// =================================================================',
    'pub fn a() -> u8 { 1 }',
    '',
  ].join('\n'),
  'tests/verify_feature.rs': [
    '// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1`',
    'pub fn shared() -> u8 { 7 }',
    '',
  ].join('\n'),
  'tests/verify_spec_p0_1.rs': [
    '// @verifies C001',
    '// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1`',
    'pub fn read_spec() -> u8 { 1 }',
    '',
    'pub fn rfc_source_referenced() {',
    '    let spec = "RFC-ROOT";',
    '    assert!(spec.contains("RFC"));',
    '}',
    '',
  ].join('\n'),
  'tests/verify_spec_p7_3.rs': [
    '// @verifies C002',
    '// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3`',
    'pub fn ordered() -> u8 { 2 }',
    '',
  ].join('\n'),
});

/**
 * The same project after a trace scrub: provenance comments are gone, two test
 * files are renamed to content-hash names, one L3 test function is removed
 * whole, and one production function differs substantively.
 */
export const SUBJECT_FIXTURE_FILES = Object.freeze({
  'Cargo.toml': [
    '[package]',
    'name = "mini"',
    '',
    '[[test]]',
    'name = "verify_spec_4b35a676"',
    '',
    '[[test]]',
    'name = "verify_spec_26d77120"',
    '',
  ].join('\n'),
  'src/audio/mod.rs': 'pub fn a() -> u8 { 2 }\n',
  'tests/verify_feature.rs': 'pub fn shared() -> u8 { 7 }\n',
  'tests/verify_spec_4b35a676.rs': ['pub fn read_spec() -> u8 { 1 }', ''].join('\n'),
  'tests/verify_spec_26d77120.rs': ['pub fn ordered() -> u8 { 2 }', ''].join('\n'),
});

/** Both halves of the synthetic pair, plus one disposer for the pair. */
export function createSyntheticOraclePair() {
  const oracle = createSyntheticTree(ORACLE_FIXTURE_FILES, { prefix: 'wsp-oracle-' });
  const subject = createSyntheticTree(SUBJECT_FIXTURE_FILES, { prefix: 'wsp-subject-' });
  return {
    oracleRoot: oracle.root,
    subjectRoot: subject.root,
    dispose: () => {
      oracle.dispose();
      subject.dispose();
    },
  };
}
