// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * The answer key: `siprs-with-4layers` extracted into a frozen bundle.
 *
 * `siprs-with-4layers` is the same project taken through the forward rotation
 * to RESIDUE 0, so it holds the RFC, the graph, the partition, the tickets and
 * the contract annotations that reverse rotation is trying to reconstruct.
 * Measuring against it turns "does the analysis look plausible" into a
 * concrete, falsifiable disagreement list.
 *
 * Three properties decide whether the instrument is sound.
 *
 * Every count names its rule. A number without a rule cannot be reproduced, and
 * a number that cannot be reproduced cannot be argued with. Where a design
 * document states a number this extraction does not reproduce, both are
 * recorded in `countDiscrepancies` — the measured value is not adjusted to
 * match the document, because a test that passes against a fabricated number is
 * worse than a test that fails.
 *
 * The answer key is never written to. Extraction only reads, and the caller's
 * project is written to only by `writeOracleBundle`.
 *
 * The known delta between the key and the subject is measured, never assumed.
 * Without it the first reconciliation would report known-and-intentional
 * differences as findings and waste a human's classification pass on them.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { NEVER_WALKED_DIRECTORY_NAMES, compareText, listTreeFiles, nonCommentLines } from './holdout-ledger.mjs';

export const ORACLE_TREE_RELATIVE_PATH = 'siprs-with-4layers';
/** The subject: the answer key with its forward-rotation artefacts stripped. */
export const SUBJECT_TREE_RELATIVE_PATH = 'siprs-for-reverse';
export const BUNDLE_RELATIVE_PATH = 'tests/workspacify-reverse/oracle/ORACLE-BUNDLE.json';
export const KNOWN_DELTA_RELATIVE_PATH = 'tests/workspacify-reverse/oracle/KNOWN-DELTA.json';
export const BUNDLE_SCHEMA_VERSION = 1;

/** The rule the `@verifies` count is measured by, named so the number reproduces. */
export const VERIFIES_RULE = 'comment-anchored @verifies annotations under the oracle root, target/ and .git/ excluded';

const GRAPH_FILE = 'RFC-ROOT-GRAPH.json';
const DIRS_TREE_FILE = 'RFC-ROOT-Dirs-Tree.json';
const TICKETS_FILE = 'Tickets.json';
const RFC_ROOT_FILE = 'RFC-ROOT.md';
const OMISSIONS_DIRECTORY = 'omissions';
const TESTS_DIRECTORY = 'tests';

/** A comment introducer, for the file types that carry provenance. */
const COMMENT_PREFIX = /^\s*(?:\/\/+|#|;)/;
const VERIFIES_ANNOTATION = /@verifies\s*(.*)$/;
const CONTRACT_ID = /^[A-Za-z][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*$/;
const DESIGN_HEADER = /^\s*(?:\/\/+|#)\s*Initial Design Artifact/;
/** A marker counts only where it is a comment, so prose mentions are not markers. */
const TICKET_MARKER = /^\s*(?:\/\/+|#|;)\s*.*\[::TICKET::\]/;
const CARGO_TEST_ENTRY = /^\s*name\s*=\s*"(verify_spec_[^"]+)"\s*$/;

/**
 * Counts the design documents state, and the definitions that were tried
 * against them.
 *
 * The stated numbers are plain `grep -rl` counts of the token, which include
 * prose: the string "Initial Design Artifact" occurs in 43 files of ticket and
 * RFC text that carry no header at all. A file "carries" a header or a marker
 * only when one of its lines is a comment that begins one — the definition
 * `trace-patterns.mjs` already uses for L1 and L2 — so the bundle counts by
 * that rule and records the difference rather than adopting the looser one.
 *
 * The verb "measured" in those documents is honoured by recording the
 * disagreement, not by rewriting the number.
 */
export const DESIGN_STATED_COUNTS = Object.freeze([
  Object.freeze({
    artefact: 'verifies',
    stated: 232,
    statedIn: 'tickets/specs/P22-2.md (Investigation), docs/P22-HANDOFF.md',
    reason: 'no definition tried reproduces 232: the closest reading is 228 files containing the token, and 127 files with a comment line carrying it, so the stated number could not be reproduced from this tree',
    definitionsTried: Object.freeze([
      Object.freeze({ definition: 'files containing the @verifies token', value: 228 }),
      Object.freeze({ definition: 'files with a comment line carrying @verifies', value: 127 }),
      Object.freeze({ definition: 'comment-anchored @verifies lines', value: 1356 }),
      Object.freeze({ definition: '@verifies lines in .rs files', value: 1268 }),
      Object.freeze({ definition: 'occurrences of the @verifies token', value: 2253 }),
      Object.freeze({ definition: 'distinct contract ids named by those annotations', value: 198 }),
      Object.freeze({ definition: 'lines of Tickets.json containing @verifies', value: 182 }),
    ]),
  }),
  Object.freeze({
    artefact: 'ticketMarkers',
    stated: 379,
    statedIn: 'tickets/specs/P22-2.md (Investigation, Invariants)',
    reason: 'the stated 379 is the count of files containing the token, which includes 66 files of prose that carry no marker; a file carries a marker only when a comment line does',
    definitionsTried: Object.freeze([
      Object.freeze({ definition: 'files containing the [::TICKET::] token', value: 379 }),
      Object.freeze({ definition: 'files with a comment line carrying [::TICKET::]', value: 313 }),
      Object.freeze({ definition: 'comment-anchored lines carrying [::TICKET::]', value: 3980 }),
    ]),
  }),
  Object.freeze({
    artefact: 'designHeaders',
    stated: 143,
    statedIn: 'tickets/specs/P22-2.md (Investigation, Invariants)',
    reason: 'the stated 143 is the count of files containing the text, which includes 43 files of ticket and RFC prose that carry no header; a file carries a header only when a comment line begins one',
    definitionsTried: Object.freeze([
      Object.freeze({ definition: 'files containing the "Initial Design Artifact" text', value: 143 }),
      Object.freeze({ definition: 'files with a comment line beginning the header', value: 100 }),
    ]),
  }),
]);

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** One digest over a set of files, so the set is frozen rather than each file. */
function digestOfFiles(root, relativePaths) {
  const lines = [...relativePaths].sort().map((file) => `${file}\0${sha256File(join(root, file))}`);
  return sha256(lines.join('\n'));
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

/** Every directory path declared by a Dirs-Tree, in order. */
function collectDirectories(trees) {
  const directories = [];
  const walk = (node, prefix) => {
    const path = prefix === '' ? node.name : `${prefix}/${node.name}`;
    directories.push(path);
    for (const child of node.children ?? []) walk(child, path);
  };
  for (const language of Object.keys(trees ?? {}).sort()) walk(trees[language], '');
  return directories;
}

/** The basename of a path without its extension. */
function stem(relativePath) {
  const name = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  const cut = name.lastIndexOf('.');
  return cut === -1 ? name : name.slice(0, cut);
}

/**
 * Every line of a tree that matches a predicate, with its relative path and line number.
 *
 * A file that cannot be read stops the measurement rather than being skipped.
 * The counts this feeds are the answer key: silently omitting a file would
 * under-report them and leave that file outside every frozen digest, so the
 * artefact would claim a completeness it does not have.
 */
function matchingLines(root, predicate) {
  const hits = [];
  for (const file of listTreeFiles(root, { excludedDirectoryNames: NEVER_WALKED_DIRECTORY_NAMES })) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch (error) {
      throw new Error(`cannot measure ${file} under ${root}: ${error.message}`);
    }
    text.split('\n').forEach((line, index) => {
      if (predicate(line)) hits.push({ file, line: index + 1, text: line });
    });
  }
  return hits;
}

function extractGraph(oracleRoot) {
  const parsed = readJson(oracleRoot, GRAPH_FILE);
  const nodeIds = parsed.nodes.map((node) => node.id).sort();
  return {
    rule: `${GRAPH_FILE}: nodes.length and edges.length`,
    nodes: parsed.nodes.length,
    edges: parsed.edges.length,
    nodeIds,
    // What each node says, so a grounding that names the right node for the
    // wrong reason is a divergence rather than a silent agreement.
    nodeTitles: Object.fromEntries(nodeIds.map((id) => [id, findNodeTitle(parsed.nodes, id)])),
    sha256: sha256File(join(oracleRoot, GRAPH_FILE)),
  };
}

/** The title a node carries, or null when the graph records none. */
function findNodeTitle(nodes, id) {
  return nodes.find((node) => node.id === id)?.title ?? null;
}

function extractDirsTree(oracleRoot) {
  const raw = readFileSync(join(oracleRoot, DIRS_TREE_FILE), 'utf8');
  const parsed = JSON.parse(raw);
  return {
    rule: `${DIRS_TREE_FILE}: character count of the minified JSON, and every directory path under trees.*`,
    minifiedChars: JSON.stringify(parsed).length,
    directories: collectDirectories(parsed.trees),
    sha256: sha256File(join(oracleRoot, DIRS_TREE_FILE)),
  };
}

function extractTickets(oracleRoot) {
  const parsed = readJson(oracleRoot, TICKETS_FILE);
  const ticketTitles = {};
  const ticketKeys = [];
  for (const phase of parsed.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      const key = `P${phase.id}-${ticket.id}`;
      ticketKeys.push(key);
      ticketTitles[key] = ticket.title ?? null;
    }
  }
  const verifySpecTests = listTreeFiles(join(oracleRoot, TESTS_DIRECTORY))
    .filter((file) => /^verify_spec_.*\.rs$/.test(file))
    .map((file) => stem(file))
    .sort();
  return {
    rule: `${TICKETS_FILE}: phases.length, the ticket count across all phases, and the verify_spec_* tests under ${TESTS_DIRECTORY}/`,
    phases: (parsed.phases ?? []).length,
    total: ticketKeys.length,
    ticketKeys: ticketKeys.sort(),
    // What each ticket is for, so a mapping that names the right key for the
    // wrong ticket is a divergence rather than a silent agreement.
    ticketTitles: Object.fromEntries(ticketKeys.sort().map((key) => [key, ticketTitles[key]])),
    verifySpecTests,
    sha256: sha256File(join(oracleRoot, TICKETS_FILE)),
  };
}

function extractOmissions(oracleRoot) {
  const directory = join(oracleRoot, OMISSIONS_DIRECTORY);
  const files = existsSync(directory)
    ? readdirSync(directory).filter((name) => name.startsWith('OMISSIONS-') && name.endsWith('.json')).sort()
    : [];
  return {
    rule: `${OMISSIONS_DIRECTORY}/OMISSIONS-*.json: the file names, each frozen by its own digest`,
    measuredCount: files.length,
    files,
    sha256: digestOfFiles(directory, files),
  };
}

function extractVerifies(oracleRoot) {
  const hits = matchingLines(oracleRoot, (line) => COMMENT_PREFIX.test(line) && VERIFIES_ANNOTATION.test(line));

  const contractIds = new Set();
  for (const hit of hits) {
    const annotation = hit.text.match(VERIFIES_ANNOTATION)[1];
    for (const token of annotation.split(/[\s,]+/)) {
      if (CONTRACT_ID.test(token)) contractIds.add(token);
    }
  }

  const files = [...new Set(hits.map((hit) => hit.file))].sort();
  // The annotation text is part of the signature, not only its position: editing
  // `@verifies C001` to `@verifies C999` in place keeps every file and line
  // number, so a signature over position alone cannot see it and the comparison
  // would run against a stale contract set.
  const signature = hits.map((hit) => `${hit.file}\0${hit.line}\0${hit.text}`).sort().join('\n');
  return {
    rule: VERIFIES_RULE,
    measuredCount: files.length,
    fileCount: files.length,
    annotationCount: hits.length,
    contractIds: [...contractIds].sort(),
    sha256: sha256(signature),
  };
}

function extractTicketMarkers(oracleRoot) {
  const hits = matchingLines(oracleRoot, (line) => TICKET_MARKER.test(line));
  const files = [...new Set(hits.map((hit) => hit.file))].sort();
  return {
    rule: 'files with a comment line carrying a [::TICKET::] marker; the test names are those under tests/',
    fileCount: files.length,
    occurrenceCount: hits.length,
    files,
    testBasenames: files.filter((file) => file.startsWith(`${TESTS_DIRECTORY}/`)).map((file) => stem(file)).sort(),
    sha256: digestOfFiles(oracleRoot, files),
  };
}

function extractDesignHeaders(oracleRoot) {
  const hits = matchingLines(oracleRoot, (line) => DESIGN_HEADER.test(line));
  const files = [...new Set(hits.map((hit) => hit.file))].sort();
  return {
    rule: 'files with a comment line beginning an "Initial Design Artifact — RFC-driven Implementation" header',
    fileCount: files.length,
    files,
    sha256: digestOfFiles(oracleRoot, files),
  };
}

function extractRfcRoot(oracleRoot) {
  const raw = readFileSync(join(oracleRoot, RFC_ROOT_FILE), 'utf8');
  const headings = [...raw.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1].trim());
  return {
    rule: `${RFC_ROOT_FILE}: every markdown heading, which is the unit R8's claims are compared against`,
    headings,
    bytes: Buffer.byteLength(raw),
    sha256: sha256File(join(oracleRoot, RFC_ROOT_FILE)),
  };
}

/** Every artefact the reconciliation measures against, extracted from one tree. */
export function extractArtefacts({ oracleRoot }) {
  return {
    graph: extractGraph(oracleRoot),
    dirsTree: extractDirsTree(oracleRoot),
    tickets: extractTickets(oracleRoot),
    omissions: extractOmissions(oracleRoot),
    verifies: extractVerifies(oracleRoot),
    ticketMarkers: extractTicketMarkers(oracleRoot),
    designHeaders: extractDesignHeaders(oracleRoot),
    rfcRoot: extractRfcRoot(oracleRoot),
  };
}

/** Whether the tree is under version control, and whether it has uncommitted changes. */
function readVersionControl(oracleRoot, gitCwd) {
  const probe = spawnSync('git', ['status', '--porcelain', '--', oracleRoot], {
    cwd: gitCwd ?? dirname(oracleRoot),
    encoding: 'utf8',
  });
  if (probe.status !== 0) {
    return {
      isRepository: false,
      dirty: null,
      status: null,
      reason: 'the tree is not inside a version-controlled work tree, so modification cannot be detected this way',
    };
  }
  const status = probe.stdout.trim();
  return {
    isRepository: true,
    dirty: status.length > 0,
    status,
    reason: status.length > 0 ? `uncommitted changes: ${status}` : 'no uncommitted change',
  };
}

/**
 * Extract the answer key into a frozen bundle. Pure: it reads the tree and
 * returns the bundle, and writes nothing anywhere.
 */
export function freezeOracle({ oracleRoot, frozenAt, gitCwd }) {
  if (!existsSync(oracleRoot)) {
    throw new Error(`no answer key exists at ${oracleRoot}`);
  }
  const artefacts = extractArtefacts({ oracleRoot });

  const countDiscrepancies = [];
  for (const stated of DESIGN_STATED_COUNTS) {
    // A file-set artefact reports the number of files; the annotation artefact
    // reports the same number under its own name, because a file is its unit.
    const artefact = artefacts[stated.artefact];
    const measured = artefact?.fileCount ?? artefact?.measuredCount;
    if (measured !== stated.stated) {
      countDiscrepancies.push({
        artefact: stated.artefact,
        stated: stated.stated,
        statedIn: stated.statedIn,
        measured,
        reason: stated.reason,
        definitionsTried: stated.definitionsTried,
      });
    }
  }

  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    frozenAt: frozenAt ?? null,
    source: {
      tree: ORACLE_TREE_RELATIVE_PATH,
      root: oracleRoot,
      control: readVersionControl(oracleRoot, gitCwd),
    },
    rule: 'each artefact records its measuring rule and a digest over the material it was extracted from',
    artefacts,
    countDiscrepancies,
    sha256: sha256(JSON.stringify(artefacts)),
  };
}

/** The single write path for the bundle. */
export function writeOracleBundle({ projectRoot, bundle }) {
  const bundlePath = join(projectRoot, BUNDLE_RELATIVE_PATH);
  mkdirSync(dirname(bundlePath), { recursive: true });
  writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  return bundlePath;
}

/**
 * Write the measured delta to disk.
 *
 * `oracle compare` reads this file, so without a producer it could only be
 * hand-written, and a hand-written delta labels today's real differences
 * `expected` without anyone noticing. Written from a fresh measurement, the
 * file cannot say anything the trees do not.
 */
export function writeKnownDelta({ projectRoot, delta }) {
  const deltaPath = join(projectRoot, KNOWN_DELTA_RELATIVE_PATH);
  mkdirSync(dirname(deltaPath), { recursive: true });
  writeFileSync(deltaPath, `${JSON.stringify(delta, null, 2)}\n`);
  return deltaPath;
}

/**
 * Read the frozen bundle and recompute every artefact from the tree it
 * describes. Read-only: drift is reported, and refusing to compare against a
 * changed oracle is the caller's decision.
 */
export function loadOracleBundle({ projectRoot, oracleRoot }) {
  const bundlePath = join(projectRoot, BUNDLE_RELATIVE_PATH);
  if (!existsSync(bundlePath)) {
    throw new Error(`no oracle bundle is frozen at ${BUNDLE_RELATIVE_PATH} — run "run.mjs oracle freeze" first`);
  }
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const root = oracleRoot ?? join(projectRoot, ORACLE_TREE_RELATIVE_PATH);
  const observed = extractArtefacts({ oracleRoot: root });

  const recomputed = [];
  const drifted = [];
  for (const [name, frozen] of Object.entries(bundle.artefacts ?? {})) {
    recomputed.push({ name, sha256: observed[name]?.sha256 ?? null });
    if (observed[name]?.sha256 !== frozen.sha256) {
      drifted.push({
        name,
        frozen: frozen.sha256,
        observed: observed[name]?.sha256 ?? '(absent)',
        reason: 'the material this artefact was extracted from has changed since it was frozen',
      });
    }
  }

  return { bundle, recomputed, drifted, oracleRoot: root };
}

// --- The known delta between the answer key and the subject ----------------------

/** Files present in the subject but not in the oracle that look like test files. */
function subjectTestNames(subjectRoot) {
  return listTreeFiles(join(subjectRoot, TESTS_DIRECTORY))
    .filter((file) => /^verify_spec_.*\.rs$/.test(file))
    .map((file) => stem(file))
    .sort();
}

function oracleTestNames(oracleRoot) {
  return listTreeFiles(join(oracleRoot, TESTS_DIRECTORY))
    .filter((file) => /^verify_spec_.*\.rs$/.test(file))
    .map((file) => stem(file))
    .sort();
}

/** The Cargo.toml `[[test]]` entries whose name is a verify_spec test, with line numbers. */
function cargoTestEntries(root) {
  const cargoPath = join(root, 'Cargo.toml');
  if (!existsSync(cargoPath)) return [];
  const entries = [];
  readFileSync(cargoPath, 'utf8').split('\n').forEach((line, index) => {
    const match = line.match(CARGO_TEST_ENTRY);
    if (match) entries.push({ name: match[1], line: index + 1 });
  });
  return entries;
}

function testFileExists(root, name) {
  return existsSync(join(root, TESTS_DIRECTORY, `${name}.rs`));
}

function readTestFile(root, name) {
  return readFileSync(join(root, TESTS_DIRECTORY, `${name}.rs`), 'utf8');
}

/**
 * Recover the ten renamed test files.
 *
 * Three rules are needed because no single one recovers all ten. Cargo.toml
 * line alignment recovers the four the rename left a trace of; comment-stripped
 * identity recovers the five whose code is untouched; the last is recovered by
 * elimination, and verified by the fact that its only difference is one whole
 * removed function. A name no rule can pair is reported, never guessed.
 */
function recoverTestRenames({ oracleRoot, subjectRoot }) {
  const oracleNames = oracleTestNames(oracleRoot);
  const subjectNames = subjectTestNames(subjectRoot);
  const named = new Map(); // original -> record

  const oracleEntries = cargoTestEntries(oracleRoot);
  const subjectEntries = cargoTestEntries(subjectRoot);
  for (let index = 0; index < oracleEntries.length; index += 1) {
    const original = oracleEntries[index];
    const renamed = subjectEntries[index];
    if (!renamed) continue;
    if (!testFileExists(oracleRoot, original.name) || !testFileExists(subjectRoot, renamed.name)) continue;
    named.set(original.name, {
      original: original.name,
      renamed: renamed.name,
      evidenceKind: 'cargo-toml-alignment',
      evidence: `Cargo.toml [[test]] entry ${index + 1}: "${original.name}" at line ${original.line} in the answer key, "${renamed.name}" at line ${renamed.line} in the subject`,
    });
  }

  const unmappedOracle = oracleNames.filter((name) => !named.has(name));
  const mappedSubject = new Set([...named.values()].map((record) => record.renamed));
  const unmappedSubject = subjectNames.filter((name) => !mappedSubject.has(name));

  const stillOracle = [];
  const stillSubject = new Set(unmappedSubject);
  for (const original of unmappedOracle) {
    const oracleLines = JSON.stringify(nonCommentLines(readTestFile(oracleRoot, original), `${TESTS_DIRECTORY}/${original}.rs`));
    const matches = [...stillSubject].filter(
      (candidate) => JSON.stringify(nonCommentLines(readTestFile(subjectRoot, candidate), `${TESTS_DIRECTORY}/${candidate}.rs`)) === oracleLines,
    );
    if (matches.length !== 1) {
      stillOracle.push(original);
      continue;
    }
    const renamed = matches[0];
    stillSubject.delete(renamed);
    named.set(original, {
      original,
      renamed,
      evidenceKind: 'comment-stripped-identity',
      evidence: `the comment-stripped content of tests/${original}.rs and tests/${renamed}.rs is identical (${nonCommentLines(readTestFile(oracleRoot, original), `${TESTS_DIRECTORY}/${original}.rs`).length} lines)`,
    });
  }

  const remainingSubject = [...stillSubject];
  for (const original of stillOracle) {
    const oracleText = readTestFile(oracleRoot, original);
    const oracleLines = nonCommentLines(oracleText, `${TESTS_DIRECTORY}/${original}.rs`);
    const candidates = remainingSubject.filter((candidate) => {
      const subjectLines = nonCommentLines(readTestFile(subjectRoot, candidate), `${TESTS_DIRECTORY}/${candidate}.rs`);
      if (subjectLines.length === 0) return false;
      const oracleSet = new Set(oracleLines);
      return subjectLines.every((line) => oracleSet.has(line));
    });
    if (candidates.length !== 1) continue;

    const renamed = candidates[0];
    const subjectText = readTestFile(subjectRoot, renamed);
    const removed = functionNamesIn(oracleText).filter((name) => !functionNamesIn(subjectText).includes(name));
    if (removed.length === 0) continue;

    remainingSubject.splice(remainingSubject.indexOf(renamed), 1);
    named.set(original, {
      original,
      renamed,
      evidenceKind: 'whole-function-removal',
      evidence: `the only unpaired name on both sides; its code is a subset of tests/${original}.rs with the whole function(s) ${removed.join(', ')} removed`,
    });
  }

  const unresolvedRenames = [
    ...subjectNames
      .filter((name) => ![...named.values()].some((record) => record.renamed === name))
      .map((name) => ({ name, side: 'subject', reason: 'no answer-key name could be paired with this test file' })),
    ...oracleNames
      .filter((name) => !named.has(name))
      .map((name) => ({ name, side: 'oracle', reason: 'no subject name could be paired with this answer-key test file' })),
  ];

  return { renamedTestFiles: [...named.values()].sort((left, right) => compareText(left.original, right.original)), unresolvedRenames };
}

function functionNamesIn(text) {
  return [...text.matchAll(/^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm)].map((match) => match[1]);
}

/**
 * The source of one function, found by brace depth from its declaration.
 *
 * Used to say what a removed function did, not merely that it is gone: a
 * difference is only understood once the thing that was removed is named.
 */
function functionBlock(text, name) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^\\s*(?:pub\\s+)?(?:async\\s+)?fn\\s+${name}\\b`).test(line));
  if (start === -1) return null;
  let depth = 0;
  let opened = false;
  for (let index = start; index < lines.length; index += 1) {
    for (const character of lines[index]) {
      if (character === '{') {
        depth += 1;
        opened = true;
      } else if (character === '}') {
        depth -= 1;
      }
    }
    if (opened && depth <= 0) return lines.slice(start, index + 1).join('\n');
  }
  return lines.slice(start).join('\n');
}

/** The design-document reference a removed block used, or null when it used none. */
function designDocumentReference(block) {
  const reference = block?.match(/RFC-[A-Za-z0-9._-]*/)?.[0] ?? null;
  if (reference) return reference;
  return block?.includes('include_str!') ? 'include_str!' : null;
}

/**
 * Every known structural difference between the answer key and the subject,
 * measured from both trees with the evidence that established each one.
 */
export function extractKnownDelta({ oracleRoot, subjectRoot }) {
  const oracleFiles = listTreeFiles(oracleRoot);
  const subjectFiles = listTreeFiles(subjectRoot);
  const oracleSet = new Set(oracleFiles);
  const subjectSet = new Set(subjectFiles);

  const shared = oracleFiles.filter((file) => subjectSet.has(file));
  const onlyInOracle = oracleFiles.filter((file) => !subjectSet.has(file));
  const onlyInSubject = subjectFiles.filter((file) => !oracleSet.has(file));
  const differing = shared.filter((file) => sha256File(join(oracleRoot, file)) !== sha256File(join(subjectRoot, file)));

  const groupCounts = {};
  for (const file of onlyInOracle) {
    const top = file.includes('/') ? file.split('/')[0] : file;
    groupCounts[top] = (groupCounts[top] ?? 0) + 1;
  }
  const oracleOnlyGroups = Object.entries(groupCounts)
    .map(([top, count]) => ({ top, count }))
    .sort((left, right) => right.count - left.count || compareText(left.top, right.top));

  const traceStrippedSharedFiles = [];
  const substantiveSharedFiles = [];
  const removedTestFunctions = [];
  for (const file of differing) {
    const oracleText = readFileSync(join(oracleRoot, file), 'utf8');
    const subjectText = readFileSync(join(subjectRoot, file), 'utf8');
    const oracleLines = nonCommentLines(oracleText, file);
    const subjectLines = nonCommentLines(subjectText, file);

    if (JSON.stringify(oracleLines) === JSON.stringify(subjectLines)) {
      traceStrippedSharedFiles.push({
        file,
        evidence: 'the two files differ only in comment lines, so no production line changed',
      });
      continue;
    }

    const oracleSet2 = new Set(oracleLines);
    const subjectSet2 = new Set(subjectLines);
    const removed = oracleLines.filter((line) => !subjectSet2.has(line)).length;
    const added = subjectLines.filter((line) => !oracleSet2.has(line)).length;
    substantiveSharedFiles.push({
      file,
      removedLines: removed,
      addedLines: added,
      evidence: `${removed} code line(s) removed and ${added} added`,
    });

    for (const name of functionNamesIn(oracleText)) {
      if (functionNamesIn(subjectText).includes(name)) continue;
      const reference = designDocumentReference(functionBlock(oracleText, name));
      if (reference === null) continue;
      removedTestFunctions.push({
        file,
        name,
        evidence: `the whole function ${name} was removed from ${file} in the subject; in the answer key it reads ${reference}, which the subject no longer carries`,
      });
    }
  }

  const { renamedTestFiles, unresolvedRenames } = recoverTestRenames({ oracleRoot, subjectRoot });

  // Every class of measured difference is an expected entry, not only the
  // renames: a class recorded here but absent from this list is handed to a
  // human as a finding, which is the cost the delta exists to remove.
  const expectedDifferences = [
    ...onlyInOracle.map((file) => ({
      name: file,
      oracleName: file,
      kind: 'artefact-only',
      evidence: 'a forward-rotation artefact present in the answer key and removed from the subject by PX-203',
    })),
    ...traceStrippedSharedFiles.map((record) => ({
      name: record.file,
      oracleName: record.file,
      kind: 'trace-stripped',
      evidence: record.evidence,
    })),
    ...renamedTestFiles.map((record) => ({
      name: record.renamed,
      oracleName: record.original,
      kind: 'renamed-test-file',
      evidence: record.evidence,
    })),
    ...removedTestFunctions.map((record) => ({
      name: record.name,
      oracleName: null,
      kind: 'removed-test-function',
      evidence: `${record.file}: ${record.evidence}`,
    })),
  ];

  return {
    measuredNotAssumed: true,
    rule: 'every difference between the two trees, measured by listing both and comparing bytes; a known difference is an expected entry, not a finding',
    counts: {
      oracleFiles: oracleFiles.length,
      subjectFiles: subjectFiles.length,
      shared: shared.length,
      onlyInOracle: onlyInOracle.length,
      onlyInSubject: onlyInSubject.length,
      differing: differing.length,
    },
    oracleOnlyGroups,
    onlyInSubject: onlyInSubject.map((file) => ({ file, evidence: 'present in the subject and in no answer-key path' })).sort((left, right) => compareText(left.file, right.file)),
    traceStrippedSharedFiles,
    substantiveSharedFiles,
    removedTestFunctions,
    renamedTestFiles,
    unresolvedRenames,
    oracleTestNames: oracleTestNames(oracleRoot),
    subjectTestNames: subjectTestNames(subjectRoot),
    expectedDifferences,
  };
}

/** Render a frozen bundle, or a bundle read back, as the Markdown a human reads. */
export function renderOracleReport(result) {
  const { bundle, recomputed = [], drifted = [] } = result;
  const lines = ['## Oracle bundle', ''];
  lines.push(`Source: \`${bundle.source.root}\`${bundle.frozenAt ? `, frozen at ${bundle.frozenAt}` : ''}.`);
  lines.push('');
  lines.push(`Bundle digest: \`${bundle.sha256}\``);
  lines.push('');

  lines.push('### Artefacts', '');
  for (const [name, artefact] of Object.entries(bundle.artefacts)) {
    const counts = Object.entries(artefact)
      .filter(([key, value]) => typeof value === 'number')
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    lines.push(`- **${name}** — ${counts}`);
    lines.push(`  - rule: ${artefact.rule}`);
    lines.push(`  - digest: \`${artefact.sha256}\``);
  }
  lines.push('');

  if (bundle.countDiscrepancies?.length > 0) {
    lines.push('### Counts the design documents state differently', '');
    for (const entry of bundle.countDiscrepancies) {
      lines.push(`- **${entry.artefact}**: the documents state ${entry.stated} (${entry.statedIn}); this extraction measures ${entry.measured}.`);
      lines.push('  - definitions tried:');
      for (const definition of entry.definitionsTried) {
        lines.push(`    - ${definition.definition} = ${definition.value}`);
      }
      lines.push('  - the measured value is recorded as measured; it was not adjusted to match the document');
    }
    lines.push('');
  }

  if (recomputed.length > 0) {
    lines.push('### Recomputed', '');
    for (const entry of recomputed) lines.push(`- ${entry.name}: \`${entry.sha256}\``);
    lines.push('');
  }

  if (drifted.length > 0) {
    lines.push('### Drifted artefacts', '');
    for (const entry of drifted) {
      lines.push(`- **${entry.name}** — ${entry.reason}`);
      lines.push(`  - frozen \`${entry.frozen}\``);
      lines.push(`  - observed \`${entry.observed}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}
