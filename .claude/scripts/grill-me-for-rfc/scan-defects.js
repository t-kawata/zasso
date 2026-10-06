#!/usr/bin/env node
/**
 * scan-defects.js <RFC_DIR> [--json]
 *
 * Candidate discovery for the defect search, and never a verdict. Deciding whether two
 * prose designs contradict each other is not decidable, so this script reports the
 * shapes that produced real defects in the nine runs and leaves the adjudication to the
 * run. The exit status therefore never encodes the result: an empty candidate set is
 * not a pass, and a non-empty one is not a failure.
 *
 * Patterns, and what each reports:
 *   1. a §13 block deferring trait signatures, a concrete I/O contract or a protocol
 *      implementation — the grill forbids honouring the deferral;
 *   2. a §12 item marked unresolved whose topic the package's own RFC settles;
 *   3. an INFO seed stating no neighbour settled a shared question while a neighbour
 *      RFC was written after it — a stage-one snapshot cannot see a later document;
 *   4. a settled explanation whose ground is a "chosen default" — a default the seed
 *      admits it does not fix is not a ground;
 *   5. a seed assertion that the specification does not fix something, so the
 *      specification can be searched for a counterexample;
 *   6. a name the RFC uses and that is defined in neither the RFC nor a named record —
 *      the deficiency class;
 *   7. the same name spelled differently in two packages — the conflict class, since a
 *      boundary the two sides name differently is not one boundary.
 *
 * The list is extendable, and must be extended whenever a sixth shape appears in a real
 * run. It can never be complete: the run's own reading of the designs is the obligation.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { matchHeading, normalizeHeading } from './lib/markdown-sections.mjs';

/** The stage-1 artifacts whose assertions can go stale or defer a decision. */
const STAGE_ONE_FILES = ['RFC-SEED.md', 'INFO-RFC-SEED.md', 'EXPLAIN-RFC-SEED.md'];

/** A backticked identifier that names a type rather than a field or a path. */
const TYPE_NAME_PATTERN = /`([A-Z][A-Za-z0-9_]*)`/g;

/** What a deferral of a signature, a contract or a protocol looks like. */
const DEFERRAL_PATTERN = /trait\s+(method\s+)?signature|concrete\s+I\/O\s+contract|protocol\s+implementation/i;

/** A ground the seed itself admits is not a decision. */
const CHOSEN_DEFAULT_PATTERN = /chosen\s+default/i;

/** A seed claim that a higher document is silent. */
const SPECIFICATION_SILENT_PATTERN = /specification\s+does\s+not\s+(fix|specify|define)/i;

/** A stage-1 statement that no neighbour has settled a shared question. */
const NO_NEIGHBOUR_SETTLED_PATTERN = /no\s+neighbour\w*\s+(package\s+)?(has\s+)?settled/i;

/** The words that introduce a declaration rather than a use. */
const DECLARATION_PATTERN = (name) => new RegExp(`\\b(struct|enum|trait|type|const|fn|class)\\s+${name}\\b`);

/** Beyond this many sibling packages the directory is a scratch space, not a workspace. */
const MAX_SIBLING_PACKAGES = 64;

const USAGE = 'usage: scan-defects.js <RFC_DIR> [--json]';

/** @param {string} path @returns {string|null} null when the artifact is simply absent */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return null;
    throw error;
  }
}

/**
 * The numbered section `number` in a document, or null.
 *
 * @param {string} text
 * @param {number} number
 * @returns {{ title: string, body: string }|null}
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function findNumberedSection(text, number) {
  const lines = text.split('\n');
  const pattern = new RegExp(`^${number}[.\\s]`);

  for (let index = 0; index < lines.length; index += 1) {
    const heading = matchHeading(lines[index]);
    if (!heading) continue;
    const title = normalizeHeading(heading.title);
    if (!pattern.test(title)) continue;

    const body = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = matchHeading(lines[cursor]);
      if (next && next.level <= heading.level) break;
      body.push(lines[cursor]);
    }
    return { title, body: body.join('\n') };
  }
  return null;
}

/** @param {string} text @returns {string[]} */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function linesMatching(text, pattern) {
  return text.split('\n').filter((line) => pattern.test(line));
}

/** The type names a document uses. @param {string} text @returns {string[]} */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function usedTypeNames(text) {
  return [...text.matchAll(TYPE_NAME_PATTERN)].map((match) => match[1]);
}

/** Whether any of `texts` declares `name`. */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function isDeclared(name, texts) {
  const declaration = DECLARATION_PATTERN(name);
  return texts.some(
    (text) =>
      declaration.test(text) ||
      text.split('\n').some((line) => {
        const heading = matchHeading(line);
        return heading !== null && normalizeHeading(heading.title).includes(name);
      }),
  );
}

/** The sibling directories of `rfcDir` that are packages too. */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function siblingPackages(rfcDir) {
  const parent = dirname(rfcDir);
  let entries;
  try {
    entries = readdirSync(parent, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EACCES') return [];
    throw error;
  }

  const siblings = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(parent, entry.name);
    if (candidate === rfcDir) continue;
    if (!existsSync(join(candidate, 'RFC.md'))) continue;
    siblings.push(candidate);
    if (siblings.length > MAX_SIBLING_PACKAGES) return [];
  }
  return siblings;
}

/**
 * Every candidate the patterns can decide, for one package.
 *
 * @param {string} rfcDir
 * @returns {object[]}
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function findCandidates(rfcDir) {
  const texts = Object.fromEntries(
    ['RFC.md', ...STAGE_ONE_FILES].map((name) => [name, readText(join(rfcDir, name))]),
  );
  const candidates = [];

  const deferred = texts['RFC-SEED.md'] ? findNumberedSection(texts['RFC-SEED.md'], 13) : null;
  if (deferred && DEFERRAL_PATTERN.test(deferred.body)) {
    candidates.push({
      artifact: 'RFC-SEED.md',
      location: '§13',
      says: deferred.body.trim().split('\n')[0],
      pattern: 'stage-1-deferral',
      hint: 'the grill forbids honouring a deferral of a signature, a contract or a protocol; decide it here',
    });
  }

  const openItems = texts['RFC-SEED.md'] ? findNumberedSection(texts['RFC-SEED.md'], 12) : null;
  if (openItems && /unresolved/i.test(openItems.body) && texts['RFC.md']) {
    const topics = openItems.body
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 6);
    const settled = topics.filter((topic) => texts['RFC.md'].toLowerCase().includes(topic));
    for (const topic of settled) {
      candidates.push({
        artifact: 'RFC-SEED.md',
        location: '§12',
        says: `"${topic}" is recorded unresolved while this package's RFC settles it`,
        pattern: 'stale-open-item',
        hint: 'both locations are given; the RFC is the later record',
      });
    }
  }

  for (const line of texts['EXPLAIN-RFC-SEED.md'] ? linesMatching(texts['EXPLAIN-RFC-SEED.md'], CHOSEN_DEFAULT_PATTERN) : []) {
    candidates.push({
      artifact: 'EXPLAIN-RFC-SEED.md',
      location: 'settled item',
      says: line.trim(),
      pattern: 'ground-is-a-default',
      hint: 'a default the seed admits it does not fix is not a ground; settle it against a record',
    });
  }

  for (const line of texts['RFC-SEED.md'] ? linesMatching(texts['RFC-SEED.md'], SPECIFICATION_SILENT_PATTERN) : []) {
    candidates.push({
      artifact: 'RFC-SEED.md',
      location: 'assertion',
      says: line.trim(),
      pattern: 'specification-silent-claim',
      hint: 'search the specification for a counterexample before accepting the claim',
    });
  }

  const info = texts['INFO-RFC-SEED.md'];
  if (info && NO_NEIGHBOUR_SETTLED_PATTERN.test(info)) {
    const infoTime = statSync(join(rfcDir, 'INFO-RFC-SEED.md')).mtimeMs;
    for (const sibling of siblingPackages(rfcDir)) {
      const siblingTime = statSync(join(sibling, 'RFC.md')).mtimeMs;
      if (siblingTime > infoTime) {
        candidates.push({
          artifact: 'INFO-RFC-SEED.md',
          location: '§10',
          says: `the seed states no neighbour settled a shared question; ${sibling}/RFC.md is later`,
          pattern: 'stale-neighbour-claim',
          hint: 'a stage-one snapshot cannot see an upstream RFC published after it; read the neighbour',
        });
      }
    }
  }

  const rfc = texts['RFC.md'];
  if (rfc) {
    const namedRecords = Object.values(texts).filter((text) => text !== null);
    for (const name of new Set(usedTypeNames(rfc))) {
      if (!isDeclared(name, namedRecords)) {
        candidates.push({
          artifact: 'RFC.md',
          location: 'use',
          says: `${name} is used and defined in neither this document nor a named record`,
          pattern: 'undefined-name',
          hint: 'a name used and defined nowhere is the deficiency class: an implementer cannot write it',
        });
      }
    }

    for (const variant of findSpellingVariants(siblingPackages(rfcDir))) {
      candidates.push({
        artifact: 'RFC.md',
        location: 'boundary',
        says: `the same name is spelled ${variant.join(' and ')} across packages`,
        pattern: 'boundary-name-conflict',
        hint: 'a boundary the two sides name differently is not one boundary',
      });
    }
  }

  return candidates;
}

/**
 * Groups of type names that differ only in spelling, across the given packages.
 *
 * @param {string[]} siblings
 * @returns {string[][]}
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function findSpellingVariants(siblings) {
  const byFold = new Map();
  for (const sibling of siblings) {
    const rfc = readText(join(sibling, 'RFC.md'));
    if (!rfc) continue;
    for (const name of new Set(usedTypeNames(rfc))) {
      const fold = name.toLowerCase().replace(/_/g, '');
      byFold.set(fold, new Set([...(byFold.get(fold) ?? []), name]));
    }
  }
  return [...byFold.values()].filter((spellings) => spellings.size > 1).map((spellings) => [...spellings]);
}

/**
 * @param {string[]} argv
 * @returns {number} the exit status — always 0 once the directory was read
 */
export function run(argv) {
  const rfcDir = argv.find((arg) => !arg.startsWith('--')) ?? '';
  const json = argv.includes('--json');

  if (rfcDir.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  let candidates;
  try {
    candidates = findCandidates(rfcDir);
  } catch (error) {
    process.stderr.write(`cannot read ${rfcDir}: ${error.message}\n`);
    return 1;
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(candidates)}\n`);
  } else if (candidates.length === 0) {
    process.stdout.write(`no candidate defects found in ${rfcDir}\n`);
  } else {
    for (const candidate of candidates) {
      process.stdout.write(`${candidate.artifact} ${candidate.location} [${candidate.pattern}] ${candidate.says}\n`);
    }
  }

  return 0;
}

process.exit(run(process.argv.slice(2)));
