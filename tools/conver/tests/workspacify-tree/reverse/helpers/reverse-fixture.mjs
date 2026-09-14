// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
/**
 * Fixtures for the reverse-mode gate tests.
 *
 * Every measured tree is written to a throwaway directory, so the gates are
 * judged against a real filesystem rather than against a description of one.
 * The layout mirrors `siprs-for-reverse`: hand-written sources beside the two
 * populations the reverse rotation must never count — `vendor/` and `target/`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

/** The sidecar a reverse run reads its provenance from. */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
export const FIXTURE_SIDECAR_NAME = 'ANALYSIS-SCOPE.json';
const FIXTURE_SIDECAR_BODY = '{\n  "scope": "the fixture project"\n}\n';

/** The hand-written sources, plus one vendor file and one build artefact. */
export const FIXTURE_LAYOUT = Object.freeze({
  'src/lib.rs': 'pub mod api;\n',
  'src/api/mod.rs': 'pub fn call() {}\n',
  'examples/free.rs': 'fn main() {}\n',
  'vendor/pjsip/pj.c': 'int pj(void) { return 0; }\n',
  'target/debug/generated.rs': 'fn generated() {}\n',
});

/** The directories `measureDirectoryTree` must report: only those holding a source file directly. */
export const FIXTURE_DIRECTORIES = Object.freeze(['examples', 'src', 'src/api']);

/** The hand-written sources, with the excluded populations removed. */
export const FIXTURE_SOURCE_FILES = Object.freeze(['examples/free.rs', 'src/api/mod.rs', 'src/lib.rs']);

/**
 * Write a tree from a `{ 'relative/path': 'contents' }` map.
 *
 * @param {Record<string, string>} layout - relative paths to file contents
 * @returns {string} the absolute root of the written tree
 */
export function writeTree(layout = FIXTURE_LAYOUT) {
  const root = mkdtempSync(join(tmpdir(), 'workspacify-tree-reverse-'));
  for (const [relativePath, contents] of Object.entries(layout)) {
    const absolute = join(root, relativePath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return root;
}

/** Remove a tree that `writeTree` created. */
export function removeTree(root) {
  rmSync(root, { recursive: true, force: true });
}

/**
 * Run a body against a real sidecar directory and always clean up.
 *
 * The body receives `[ { name, path } ]`, which is exactly the shape a gate
 * resolves its bundle hash from.
 *
 * @param {(sidecarFiles: Array<{name: string, path: string}>) => unknown} body
 * @returns {unknown} whatever the body returned
 */
export function withSidecars(body) {
  const dir = mkdtempSync(join(tmpdir(), 'workspacify-tree-sidecars-'));
  try {
    const sidecarPath = join(dir, FIXTURE_SIDECAR_NAME);
    writeFileSync(sidecarPath, FIXTURE_SIDECAR_BODY);
    return body([{ name: FIXTURE_SIDECAR_NAME, path: sidecarPath }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A fully agreeing reverse input: every one of T1 to T6 has what it needs to pass.
 *
 * The measured edges are expressed in package-id space, because the gate judges
 * the order the manifest declares, not the paths the measurement used.
 *
 * @param {object} overrides - replace any part of the agreeing input
 * @returns {object} the input `runReverseGates` consumes
 */
export function agreeingReverseInput(overrides = {}) {
  return {
    mode: 'reverse',
    manifest: {
      workspace: {
        packages: [
          { id: 'p-examples', path: 'examples' },
          { id: 'p-src', path: 'src' },
          { id: 'p-src-api', path: 'src/api' },
        ],
      },
      // No declared or measured edge, so every package sits in wave 0 and the
      // stable order is the packages sorted by id.
      dependencies: { dag: { implementation_order: { serial: ['p-examples', 'p-src', 'p-src-api'], levels: [] } } },
    },
    measured: {
      directories: [...FIXTURE_DIRECTORIES],
      sourceFiles: [...FIXTURE_SOURCE_FILES],
      edges: [],
    },
    graph: { nodes: [] },
    resolveFilePath: (file) => file,
    delta: { exists: true, mismatches: [] },
    sidecarFiles: [],
    reverseProvenance: undefined,
    ...overrides,
  };
}
