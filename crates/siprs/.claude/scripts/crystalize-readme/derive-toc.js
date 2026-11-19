#!/usr/bin/env node

/**
 * derive-toc.js — non-interactive TOC candidates.
 *
 * The AI still judges the final wording. This module guarantees the structure:
 * the semantic, language and interface families exist, prior headings are kept,
 * and Examples is always last.
 */

const fs = require('fs');

const TRAILING_SECTION_TITLE = 'Examples (implementation samples) spec and design';

/** CLI flags: file-based input so a multi-line RFC is never hand-serialized. */
const FLAG_SOURCE_FILE = '--source-file=';
const FLAG_GRAPH = '--graph=';
const FLAG_INTERFACES = '--interfaces=';
const FLAG_LANGUAGES = '--languages=';
const FLAG_STATUS = '--status=';

/** The families every usage README must cover. */
const REQUIRED_FAMILIES = [
  { key: 'purpose', heading: 'Purpose' },
  { key: 'quick start', heading: 'Quick start' },
  { key: 'capabilities', heading: 'Capabilities' },
  { key: 'input', heading: 'Inputs, outputs, and effects' },
  { key: 'precondition', heading: 'Preconditions, postconditions, and invariants' },
  { key: 'errors', heading: 'Errors and failure behavior' },
  { key: 'constraints', heading: 'Constraints and non-goals' },
];

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function normalize(text) {
  return String(text).trim().toLowerCase();
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function matchesFamily(heading, family) {
  const text = normalize(heading);
  if (family.key === 'input') return text.includes('input') || text.includes('output');
  if (family.key === 'precondition') return text.includes('precondition') || text.includes('invariant');
  return text.includes(family.key);
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function maxTopLevel(nodes) {
  let max = 0;
  for (const node of nodes) {
    const match = String(node.id).match(/^H(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

/**
 * Derive the candidate heading set.
 *
 * @param {{sourceText?: string, graph?: object, priorNodes?: Array<object>,
 *   interfaces?: string[], languages?: string[]}} input
 * @returns {{nodes: Array<object>, coverage: object}}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function deriveToc(input = {}) {
  const {
    sourceText = '',
    graph = { nodes: [] },
    priorNodes = [],
    interfaces = [],
    languages = ['rust'],
  } = input;
  const working = priorNodes.map((node) => ({ ...node }));
  let nextTop = maxTopLevel(working) + 1;

  const ensureFamily = (heading) => {
    if (working.some((node) => normalize(node.heading) === normalize(heading))) return;
    working.push({ id: `H${nextTop}`, heading, level: 1 });
    nextTop += 1;
  };

  for (const family of REQUIRED_FAMILIES) {
    if (working.some((node) => matchesFamily(node.heading, family))) continue;
    ensureFamily(family.heading);
  }

  if (languages.length > 0 && !working.some((node) => normalize(node.heading).includes('language'))) {
    ensureFamily('Language usage');
  }

  if (interfaces.length > 0 && !working.some((node) => normalize(node.heading).includes('interface'))) {
    ensureFamily('Interface reference');
  }

  const capabilities = working.find((node) => normalize(node.heading).includes('capability'));
  const graphTitles = (graph.nodes || [])
    .map((node) => node.title)
    .filter((title) => typeof title === 'string' && title.trim() !== '')
    .slice(0, 8);

  if (capabilities) {
    graphTitles.forEach((title, index) => {
      const childId = `${capabilities.id}-${index + 1}`;
      if (!working.some((node) => node.id === childId)) {
        working.push({ id: childId, heading: title, level: 2 });
      }
    });
  }

  const withoutExamples = working.filter((node) => normalize(node.heading) !== normalize(TRAILING_SECTION_TITLE));
  const examples = working.find((node) => normalize(node.heading) === normalize(TRAILING_SECTION_TITLE));
  const examplesNode = examples || { id: `H${maxTopLevel(withoutExamples) + 1}`, heading: TRAILING_SECTION_TITLE, level: 1 };
  const nodes = [...withoutExamples, examplesNode];

  return {
    nodes,
    coverage: {
      families: REQUIRED_FAMILIES.map((family) => family.key),
      languages,
      interfaces,
      graphTitles: graphTitles.length,
    },
  };
}

/**
 * Split a comma-separated flag value.
 *
 * @param {string} value
 * @returns {string[]}
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function splitComma(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * Parse file-based CLI arguments.
 *
 * @param {string[]} args
 * @returns {{sourceFilePath: string|null, graphPath: string|null, interfaces: string[]|null,
 *   languages: string[]|null, statusPath: string|null}}
 * @throws {Error} On an unknown argument
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function parseArguments(args) {
  const parsed = {
    sourceFilePath: null,
    graphPath: null,
    interfaces: null,
    languages: null,
    statusPath: null,
  };
  for (const arg of args) {
    if (arg.startsWith(FLAG_SOURCE_FILE)) parsed.sourceFilePath = arg.slice(FLAG_SOURCE_FILE.length);
    else if (arg.startsWith(FLAG_GRAPH)) parsed.graphPath = arg.slice(FLAG_GRAPH.length);
    else if (arg.startsWith(FLAG_INTERFACES)) parsed.interfaces = splitComma(arg.slice(FLAG_INTERFACES.length));
    else if (arg.startsWith(FLAG_LANGUAGES)) parsed.languages = splitComma(arg.slice(FLAG_LANGUAGES.length));
    else if (arg.startsWith(FLAG_STATUS)) parsed.statusPath = arg.slice(FLAG_STATUS.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

/**
 * Build the deriveToc input from file paths.
 *
 * @param {ReturnType<typeof parseArguments>} parsed
 * @returns {object}
 * @throws {Error} When the source file is missing or unreadable
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function buildInputFromArguments(parsed) {
  if (!parsed.sourceFilePath) {
    throw new Error('--source-file=<path> is required when flags are used.');
  }
  const sourceText = fs.readFileSync(parsed.sourceFilePath, 'utf8');
  const graph = parsed.graphPath
    ? JSON.parse(fs.readFileSync(parsed.graphPath, 'utf8'))
    : { nodes: [] };
  let priorNodes = [];
  if (parsed.statusPath && fs.existsSync(parsed.statusPath)) {
    const status = JSON.parse(fs.readFileSync(parsed.statusPath, 'utf8'));
    if (status.grill && status.grill.toc && Array.isArray(status.grill.toc.nodes)) {
      priorNodes = status.grill.toc.nodes;
    }
  }
  return {
    sourceText,
    graph,
    priorNodes,
    interfaces: parsed.interfaces || [],
    languages: parsed.languages && parsed.languages.length > 0 ? parsed.languages : ['rust'],
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  try {
    const input = argv.length > 0
      ? buildInputFromArguments(parseArguments(argv))
      : JSON.parse(fs.readFileSync(0, 'utf8'));
    process.stdout.write(`${JSON.stringify(deriveToc(input), null, 2)}\n`);
  } catch (error) {
    console.error('[ERROR] TOC derivation failed.');
    console.error(`Cause: ${error.message}`);
    console.error('Action: Provide readable --source-file/--graph paths, or pass the input object on stdin.');
    process.exit(1);
  }
}

module.exports = {
  TRAILING_SECTION_TITLE,
  REQUIRED_FAMILIES,
  matchesFamily,
  parseArguments,
  buildInputFromArguments,
  deriveToc,
};
