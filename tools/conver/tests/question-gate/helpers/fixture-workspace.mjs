// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * Fixtures for the question-gate core and the two commands that consume it.
 *
 * The commands are CLIs, so the artifacts they produce are observed by running the
 * generator that writes them rather than by describing them: an inventory written
 * from a description would freeze the description, and the description is exactly
 * what a later change would edit.
 *
 * Every fixture lives in a fresh temporary directory and is removed by
 * `disposeFixture`, so a test never reads the state another test left behind.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const GRILL_DIR = join(REPO_ROOT, '.claude/scripts/grill-me-for-rfc');
const DRILL_DIR = join(REPO_ROOT, '.claude/scripts/drill-rfc-down');

/** The two commands' question-gate drivers, and the tree CRUD each drives. */
export const GRILL_SETTLE_RUN = join(GRILL_DIR, 'settle-run.js');
export const GRILL_UPDATE_TREE = join(GRILL_DIR, 'update-tree.js');
export const GRILL_INIT = join(GRILL_DIR, 'init.js');
export const GRILL_LIST_FILES = join(GRILL_DIR, 'list-files.js');
export const GRILL_SESSION_STATUS = join(GRILL_DIR, 'session-status.js');
export const GRILL_UPDATE_STATUS = join(GRILL_DIR, 'update-status.js');
export const GRILL_BACKUP_RFC = join(GRILL_DIR, 'backup-rfc.js');
export const GRILL_CANON_STATE = join(GRILL_DIR, 'canon-state.js');

/**
 * The defect gates the grill runs over a workspace rather than over one session:
 * one decides which paths may be written, three read the RFC's appendices, and one
 * opens a cited section so a defect can be confirmed before it is carried.
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
export const GRILL_GUARD_EDIT_SURFACE = join(GRILL_DIR, 'guard-edit-surface.js');
export const GRILL_DEFECT_REPORT = join(GRILL_DIR, 'defect-report.js');
export const GRILL_CHECK_DIVERGENCE_LEDGER = join(GRILL_DIR, 'check-divergence-ledger.js');
export const GRILL_SCAN_DEFECTS = join(GRILL_DIR, 'scan-defects.js');
export const GRILL_SHOW_RECORD = join(GRILL_DIR, 'show-record.js');

export const DRILL_SETTLE_RUN = join(DRILL_DIR, 'settle-run.js');
export const DRILL_UPDATE_TREE = join(DRILL_DIR, 'update-tree.js');
export const DRILL_PREFLIGHT = join(DRILL_DIR, 'preflight.cjs');

const RESEARCH_FILENAME = 'research.md';
const MATERIAL_FILENAME = 'material.md';
const RFC_FILENAME = 'RFC-AUTH.md';
const GRAPH_FILENAME = 'RFC-AUTH-GRAPH.json';
const DIRS_TREE_FILENAME = 'RFC-AUTH-Dirs-Tree.json';

/**
 * The RFC name /grill-me-for-rfc writes.
 *
 * The drill fixtures keep the slug spelling above on purpose: the prior-artifact
 * scanner recognises both spellings, and a fixture that dropped the slug would stop
 * exercising that recognition. Only the grill fixture moves, because grill is the
 * command whose output name this ticket fixes.
 */
export const GRILL_RFC_FILENAME = 'RFC.md';
const README_FILENAME = 'README.md';
const TICKETS_FILENAME = 'Tickets.json';
const SESSION_DIR_NAME = 'drills';
const PACKAGE_DIR_NAME = 'pkg';
const DESIGN_TREE_FILENAME = 'DesignTree.json';

/** The three artifacts a package directory may already hold, and what each says. */
// [::TICKET::] PX-237 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-237 --for-spec --no-implementation-order`.
const PRIOR_ARTIFACT_CONTENT = {
  'RFC-SEED.md': '## §1 Identity/Position\n\nThe soul side owns the key.\n',
  'INFO-RFC-SEED.md': 'session_store: declared at src/api/session_storage.rs\n',
  // The heading carries the ordinal and the record the frame writes it for: the
  // frame always appends them, so a fixture with the bare token would assert a
  // spelling no producer emits and would hide a reader that cannot see the real one.
  'EXPLAIN-RFC-SEED.md':
    '### 先に決めた A1 — contract-boundary-083\n- 決定: the store is a file\n- 根拠: RFC-SEED.md#§1\n- 覆す条件: a level moves\n',
};

/** A ground a fixture settlement may rest on, named the way priorDecisions reports it. */
export const FIXTURE_GROUND = 'EXPLAIN-RFC-SEED.md';

/** The ground the fixture explanation rests its decision on: what a settlement may cite. */
export const FIXTURE_SETTLEMENT_GROUND = 'RFC-SEED.md#§1';

/**
 * A question block in the shape the gate renders and reads back.
 *
 * The block is stored in the two halves the rule states — the framing that narrows
 * the question and the choice that asks it — so the gate can put the seven lines
 * back together and read them the way their reader does.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
export function questionBlock(overrides = {}) {
  return {
    boundNodeIds: ['Q1', 'Q2'],
    settleTrace: 'EXPLAIN-RFC-SEED.md was read and decides neither',
    scopeLine: 'the answer settles both',
    framing: {
      context: 'A person changes their handle.',
      conclusion: 'I think the store should be a file.',
      settled: 'Everything else is decided.',
      remainder: 'What is left to you is the shape of the store.',
    },
    choice: {
      directions: [
        { letter: 'A', meaning: 'A file. A lost file is lost.' },
        { letter: 'B', meaning: 'A directory. A lost file costs one entry.' },
      ],
      recommendation: 'I recommend A.',
      overturning: 'A second writer appearing would change this.',
    },
    ...overrides,
  };
}

// [::TICKET::] PX-234, PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-234|PX-235) --for-spec --no-implementation-order`.
function makeRoot(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

// [::TICKET::] PX-234, PX-235, PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-234|PX-235|PX-238) --for-spec --no-implementation-order`.
function runNode(script, args, options = {}) {
  return execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options });
}

/**
 * The design tree an open grill or drill session holds.
 *
 * `nodes` are open; `grounded` resolves each of them with a ground the prior
 * artifacts supply, which is the shape a run reaches when the records decide
 * everything and no question is opened.
 */
// [::TICKET::] PX-234, PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-234|PX-235) --for-spec --no-implementation-order`.
function designTree({ nodeCount = 0, grounded = false }) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => {
    const node = {
      id: `Q${index + 1}`,
      title: `design decision ${index + 1}`,
      status: 'open',
      questions: [],
      children: [],
    };
    if (grounded) {
      node.status = 'resolved';
      node.questions.push({
        resolvedAt: '2026-01-01T00:00:00.000Z',
        answer: `the records decide decision ${index + 1}`,
        decision: `the records decide decision ${index + 1}`,
        ground: `${FIXTURE_GROUND}#§1`,
        override: 'a level moves',
        source: 'ai',
      });
    }
    return node;
  });

  return { version: 1, updatedAt: new Date().toISOString(), nodes };
}

// [::TICKET::] PX-234, PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-234|PX-235) --for-spec --no-implementation-order`.
function writeTree(directory, tree) {
  writeFileSync(join(directory, DESIGN_TREE_FILENAME), JSON.stringify(tree, null, 2), 'utf8');
}

// [::TICKET::] PX-234, PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-234|PX-235) --for-spec --no-implementation-order`.
function writePriorArtifacts(directory) {
  for (const [name, content] of Object.entries(PRIOR_ARTIFACT_CONTENT)) {
    writeFileSync(join(directory, name), content, 'utf8');
  }
}

/**
 * A package directory as /grill-me-for-rfc leaves it.
 *
 * init.js writes the three machine artifacts. The RFC itself is written by the
 * command's STEP 5, so the fixture writes it too: the inventory being frozen is
 * "what a grill run leaves in the package directory", and the RFC is one of those
 * things.
 *
 * @param {{
 *   seedResolvedNode?: boolean,
 *   withPriorArtifacts?: boolean,
 *   withNodes?: number,
 *   grounded?: boolean,
 * }} [options]
 * @returns {{ root: string, rfcDir: string, researchPath: string, rfcPath: string, files: string[] }}
 */
export function materializeGrillFixture({
  seedResolvedNode = false,
  withPriorArtifacts = false,
  withNodes = 0,
  grounded = false,
} = {}) {
  const base = makeRoot('question-gate-grill-');
  const rfcDir = join(base, PACKAGE_DIR_NAME);
  const researchPath = join(base, RESEARCH_FILENAME);
  const rfcPath = join(rfcDir, GRILL_RFC_FILENAME);

  // The research material lives outside the package directory: the inventory
  // being frozen is what the command writes into $RFC_DIR, and the material the
  // operator points at is an input, not an artifact of the run.
  mkdirSync(rfcDir, { recursive: true });
  writeFileSync(researchPath, '# research\n', 'utf8');
  runNode(GRILL_INIT, [rfcDir, researchPath]);
  writeFileSync(rfcPath, '# RFC\n\n## Design\n', 'utf8');

  if (seedResolvedNode) {
    const tree = designTree({ nodeCount: 1, grounded: true });
    tree.nodes[0].questions[0].ground = `${GRILL_RFC_FILENAME}#Design`;
    writeTree(rfcDir, tree);
  }
  if (withNodes > 0) writeTree(rfcDir, designTree({ nodeCount: withNodes, grounded }));
  if (withPriorArtifacts) writePriorArtifacts(rfcDir);

  return { root: base, rfcDir, researchPath, rfcPath, files: readdirSync(rfcDir) };
}

/**
 * A drill session as /drill-rfc-down leaves it, isolated under `<rfcDir>/drills`.
 *
 * @param {{ withPriorArtifacts?: boolean, withNodes?: number, grounded?: boolean }} [options]
 * @returns {{ root: string, rfcDir: string, sessionDir: string, rfcPath: string, files: string[] }}
 */
export function materializeDrillSession({ withPriorArtifacts = false, withNodes = 0, grounded = false } = {}) {
  const root = makeRoot('question-gate-drill-');
  const rfcPath = join(root, RFC_FILENAME);
  writeFileSync(rfcPath, '# RFC-AUTH\n', 'utf8');

  runNode(join(DRILL_DIR, 'session-init.js'), [rfcPath]);

  const sessionDir = join(root, SESSION_DIR_NAME);
  if (withNodes > 0) writeTree(sessionDir, designTree({ nodeCount: withNodes, grounded }));
  // The prior artifacts belong to the package, not to the session: the session is
  // isolated under <rfcDir>/drills and holds only its own three files.
  if (withPriorArtifacts) writePriorArtifacts(root);

  return { root, rfcDir: root, sessionDir, rfcPath, files: readdirSync(sessionDir) };
}

/**
 * A workspace drill's preflight accepts: the three pipeline artifacts and a README
 * beside a Tickets.json that names them through metadata.resolvedPaths.
 */
export function materializeDrillWorkspace() {
  const root = makeRoot('question-gate-workspace-');
  const rfcPath = join(root, RFC_FILENAME);
  const graphPath = join(root, GRAPH_FILENAME);
  const dirsTreePath = join(root, DIRS_TREE_FILENAME);
  const readmePath = join(root, README_FILENAME);
  const materialPath = join(root, MATERIAL_FILENAME);
  const ticketsPath = join(root, TICKETS_FILENAME);

  writeFileSync(rfcPath, '# RFC-AUTH\n', 'utf8');
  writeFileSync(graphPath, JSON.stringify({ sourceFile: RFC_FILENAME, nodes: [], edges: [] }), 'utf8');
  writeFileSync(dirsTreePath, JSON.stringify({ nodes: [], edges: [], trees: [] }), 'utf8');
  writeFileSync(readmePath, '# AUTH\n', 'utf8');
  writeFileSync(materialPath, '# material\n', 'utf8');
  writeFileSync(
    ticketsPath,
    JSON.stringify({ title: 'fixture', round: 0, metadata: { resolvedPaths: { rfcPath, graphPath, dirsTreePath } }, phases: [] }),
    'utf8',
  );

  return { root, ticketsPath, materialPath, rfcPath, graphPath, dirsTreePath };
}

/** Run the checklist generator over a grill fixture and return the CheckList text. */
export function generateChecklist(rfcDir) {
  runNode(join(GRILL_DIR, 'generate-checklist.js'), [rfcDir]);
  return readFileSync(join(rfcDir, 'CheckList.md'), 'utf8');
}

/** Run the I/O boundary stub check and return its exit code. */
export function checkIoStubs(rfcPath) {
  try {
    runNode(join(GRILL_DIR, 'check-io-stubs.js'), [rfcPath]);
    return 0;
  } catch (error) {
    return error.status ?? 1;
  }
}

/** Run drill preflight and return its stdout, which carries the [VARIABLES] block. */
export function runDrillPreflight({ ticketsPath, materialPath }) {
  return runNode(join(DRILL_DIR, 'preflight.cjs'), [`--tickets=${ticketsPath}`, materialPath]);
}

/**
 * Run a command and return the exit code together with both streams.
 *
 * A refusal is a value here rather than an exception: the assertions about a gate
 * are about the exit code and the sentence it printed, and a thrown
 * ExecFileSyncError would hide the stdout the gate wrote.
 *
 * `options` is passed through to execFileSync, so a caller whose script resolves a
 * path against the working directory — preflight's README.md is one — can name the
 * directory the run starts in rather than inheriting the test runner's.
 *
 * @param {string} script
 * @param {string[]} args
 * @param {import('node:child_process').ExecFileSyncOptions} [options]
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
export function runCommand(script, args, options = {}) {
  try {
    const stdout = runNode(script, args, options);
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return { status: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

/** The design tree a fixture directory holds. */
export function readTree(directory) {
  return JSON.parse(readFileSync(join(directory, DESIGN_TREE_FILENAME), 'utf8'));
}

/** Remove a fixture directory. */
export function disposeFixture(fixture) {
  rmSync(fixture.root, { recursive: true, force: true });
}
