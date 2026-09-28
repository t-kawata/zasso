/**
 * Read one seed and take from it the two machine-written records it carries.
 *
 * A seed states its own inputs: the identity block names the package and the three
 * reference paths, and the coupling block names the contract edges. Everything the
 * command needs to locate its material is therefore already in the file it was
 * pointed at, which is what makes one positional argument enough.
 */
import { readFileSync } from 'node:fs';

import { ExplainSeedError } from './errors.mjs';

/** A fenced JSON block, which is how every machine-written seed section is carried. */
const JSON_BLOCK = /```json\s*\n([\s\S]*?)\n```/g;

/** Read the seed text, or say which path could not be read. */
// [::TICKET::] PX-221 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-221 --for-spec --no-implementation-order`.
function readSeedText(seedPath) {
  try {
    return readFileSync(seedPath, 'utf8');
  } catch {
    throw new ExplainSeedError(`the seed cannot be read: ${seedPath}`, { field: 'seed' });
  }
}

/** Parse one fenced block, or say which block in which seed is not JSON. */
// [::TICKET::] PX-221 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-221 --for-spec --no-implementation-order`.
function parseBlock(blockText, seedPath) {
  try {
    return JSON.parse(blockText);
  } catch {
    throw new ExplainSeedError(`the seed carries a JSON block that does not parse: ${seedPath}`, { field: 'seed' });
  }
}

/** The value at a dotted path, or a failure that names the path. */
export function requireField(source, path) {
  const value = path.split('.').reduce((current, key) => (current == null ? undefined : current[key]), source);
  if (value === undefined || value === null || value === '') {
    throw new ExplainSeedError(`the seed does not record ${path}`, { field: path });
  }
  return value;
}

/** Every field of the identity block the command cannot proceed without. */
const REQUIRED_IDENTITY_FIELDS = [
  'package.id',
  'package.name',
  'package.path',
  'package.layer',
  'source_spec.path',
  'source_spec.sha256',
  'stage1_manifest.path',
  'stage1_manifest.hash',
  'stage2_manifest.path',
];

/**
 * Read the seed: its text, its identity, its contract edges, and the field check.
 *
 * @param {string} seedPath - the one argument the command takes
 * @returns {{ seedPath: string, seedText: string, identity: object, contractEdges: Array<object> }}
 */
export function readSeed(seedPath) {
  const seedText = readSeedText(seedPath);
  const blocks = [...seedText.matchAll(JSON_BLOCK)].map((match) => parseBlock(match[1], seedPath));
  const identity = blocks.find((block) => block && typeof block === 'object' && block.package) ?? null;

  if (identity === null) {
    throw new ExplainSeedError(`the seed records no identity block: ${seedPath}`, { field: 'package' });
  }
  for (const field of REQUIRED_IDENTITY_FIELDS) requireField(identity, field);

  const coupling = blocks.find((block) => block && Array.isArray(block.contract_edges)) ?? null;

  return { seedPath, seedText, identity, contractEdges: coupling === null ? [] : coupling.contract_edges };
}
