#!/usr/bin/env node
/**
 * check-divergence-ledger.js <RFC_DIR>
 *
 * The structural gate for STEP 5b. The RFC's seed divergence ledger is what answers
 * the precedence question a reader otherwise guesses at: this document is canonical,
 * and the three stage-1 artifacts beside it are inputs, not authorities.
 *
 * The gate checks the record's shape so a departure cannot quietly disappear, and it
 * deliberately does not require a design-tree coverage table: `gaia-foundation`
 * carries none, and a gate that fails on a real package is a gate nobody can pass.
 *
 * Exit 0 — the ledger is present and well formed.
 * Exit 1 — it is absent, malformed, or its DesignTree node is missing or unresolved.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findSectionByTitleSuffix, readFirstTable } from './lib/markdown-sections.mjs';

/** The appendix this gate reads. */
const LEDGER_TITLE_SUFFIX = 'Seed divergence ledger';

/** The artifacts the ledger may name as a departing input. */
const STAGE_ONE_ARTIFACTS = ['RFC-SEED.md', 'INFO-RFC-SEED.md', 'EXPLAIN-RFC-SEED.md'];

/** The ledger's columns, in the order that makes a row readable. */
const LEDGER_COLUMNS = ['Artifact', 'Location', 'What the artifact says', 'What this document decides', 'Ground'];

/** The DesignTree node the ledger must be represented by. */
const LEDGER_NODE_ID = 'seed-divergence-ledger';

/** The statement that makes this document canonical over its inputs. */
const PRECEDENCE_MARKER = 'canonical';

/**
 * Whether a ledger row's Location resolves inside the artifact it names.
 *
 * A numbered section (`§3.9.4`) and a named block (`pre-decisions`, `settled item B5`,
 * `A13 and A18`) both qualify: EXPLAIN-RFC-SEED.md is organised as A/B items and a
 * pre-decisions block and numbers none of them. What does not qualify is an empty cell
 * or a cell that names the artifact itself, since neither says where inside it to look.
 *
 * @param {string} location
 * @returns {boolean}
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function resolvesInsideArtifact(location) {
  const trimmed = location.trim();
  return trimmed.length > 0 && !trimmed.endsWith('.md');
}

const USAGE = 'usage: check-divergence-ledger.js <RFC_DIR>';

/**
 * Find a node anywhere in the tree, so a ledger recorded below the root still counts.
 *
 * @param {object[]} nodes
 * @param {string} id
 * @returns {object|null}
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function findNode(nodes, id) {
  for (const node of nodes ?? []) {
    if (node.id === id) return node;
    const nested = findNode(node.children, id);
    if (nested) return nested;
  }
  return null;
}

/**
 * @param {string} rfcDir
 * @returns {string|null} the first failure, or null when the ledger passes
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function findLedgerFailure(rfcDir) {
  const rfcPath = join(rfcDir, 'RFC.md');

  let rfc;
  try {
    rfc = readFileSync(rfcPath, 'utf8');
  } catch (error) {
    return `cannot read ${rfcPath}: ${error.message}`;
  }

  const ledger = findSectionByTitleSuffix(rfc, LEDGER_TITLE_SUFFIX);
  if (!ledger.found) {
    return `no appendix titled "${LEDGER_TITLE_SUFFIX}" in ${rfcPath}`;
  }

  if (!ledger.body.includes(PRECEDENCE_MARKER)) {
    return `the precedence statement is absent: the ledger must state that RFC.md is ${PRECEDENCE_MARKER}`;
  }

  const { header, rows } = readFirstTable(ledger.body);
  if (header.join('|') !== LEDGER_COLUMNS.join('|')) {
    return `the table's columns are ${JSON.stringify(header)}, expected ${JSON.stringify(LEDGER_COLUMNS)}`;
  }

  for (const row of rows) {
    const [artifact, location, , , ground] = row;

    if (!STAGE_ONE_ARTIFACTS.includes(artifact)) {
      return `${artifact} is outside the stage-1 set ${JSON.stringify(STAGE_ONE_ARTIFACTS)}`;
    }
    if (!resolvesInsideArtifact(location)) {
      return `location "${location}" does not resolve inside ${artifact}: it must name a section or a block of it`;
    }
    if (ground.trim().length === 0) {
      return `the row for ${artifact} ${location} has an empty Ground`;
    }
  }

  const treePath = join(rfcDir, 'DesignTree.json');
  let tree;
  try {
    tree = JSON.parse(readFileSync(treePath, 'utf8'));
  } catch (error) {
    return `cannot read ${treePath}: ${error.message}`;
  }

  const node = findNode(tree.nodes, LEDGER_NODE_ID);
  if (!node) {
    return `no ${LEDGER_NODE_ID} node in ${treePath}`;
  }
  if (node.status !== 'resolved') {
    return `the ${LEDGER_NODE_ID} node is ${node.status}, not resolved`;
  }

  return null;
}

/**
 * @param {string[]} argv
 * @returns {number} the exit status
 */
export function run(argv) {
  const rfcDir = argv.find((arg) => !arg.startsWith('--')) ?? '';

  if (rfcDir.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  const failure = findLedgerFailure(rfcDir);
  if (failure) {
    process.stderr.write(`divergence ledger refused: ${failure}\n`);
    return 1;
  }

  process.stdout.write(`divergence ledger ok: ${rfcDir}\n`);
  return 0;
}

process.exit(run(process.argv.slice(2)));
