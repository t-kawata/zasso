/**
 * The relations that assign work beside ownership: what a package owes because it holds a side of
 * a boundary, and what it owes because every operation is reached through its surface.
 *
 * Ownership joins an operation's result objects to the packages that own them, so a package whose
 * duty is structural — a port, a transport, a backend, a surface — appears in no unit at all. The
 * two relations here are the ones that reach it, and both are read rather than inferred: the
 * boundary relation comes from the allocate manifest's contract registry, which already names a
 * provider and a consumer per boundary, and the surface relation comes from the per-operation
 * columns of the artifact, whose values instantiate the vocabularies the specification pins.
 *
 * Nothing here knows a project. An interface id, a column name and a vocabulary name are opaque
 * strings: this module uses a column as a key into the operation rows and a vocabulary name as a key
 * into the pinned enumerations, and interprets neither.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The unit-id prefix a boundary unit carries. */
export const CARRIES_UNIT_PREFIX = 'ctr-';

/** The unit-id prefix a surface unit carries. */
export const SERVES_UNIT_PREFIX = 'obl-';

/** The relation names a unit may declare. */
export const OBLIGATION_RELATIONS = Object.freeze(['serves', 'carries']);

/**
 * The three states of a view's obligation source.
 *
 * `declared` and `undeclared` are produced by the projection; `absent` is a view on disk that
 * carries no obligation section at all, which is every view projected before the relations
 * existed. `absent` is a named condition requiring regeneration, never a satisfied set.
 */
export const OBLIGATION_SOURCES = Object.freeze(['declared', 'undeclared', 'absent']);

/** The field a stage-2 manifest may carry the declared interfaces in, keyed by package path. */
const DECLARED_INTERFACES_FIELD = 'declared_interfaces';

/** The fence that opens a JSON block inside a seed document. */
const JSON_FENCE = /```json\r?\n([\s\S]*?)```/g;

/** The seed document each package directory carries its declarations in. */
const SEED_FILENAME = 'RFC-SEED.md';

/** A value this module treats as carrying nothing. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return value === '';
}

/**
 * The surfaces one vocabulary member spells.
 *
 * A member spells a set rather than a string: a token of the form `<…>` is a placeholder the
 * caller substituted, and a token carrying `|` is an alternation the specification wrote once and
 * instantiated several times. Measured: the six members of one project's command vocabulary spell
 * eight surfaces, because one member carries an alternation of three commands.
 *
 * @param {string} member
 * @returns {string[]}
 */
export function spellMember(member) {
  let spellings = [''];
  for (const token of String(member).split(/\s+/)) {
    if (token.length === 0 || /^<.*>$/.test(token)) continue;
    const alternatives = token.includes('|') ? token.split('|') : [token];
    spellings = spellings.flatMap((prefix) => alternatives.map((part) => (prefix ? `${prefix} ${part}` : part)));
  }
  return spellings;
}

/** Every spelling a vocabulary's members produce, as a set. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function spellVocabulary(members) {
  const spellings = new Set();
  for (const member of members) for (const spelling of spellMember(member)) spellings.add(spelling);
  return spellings;
}

/**
 * The spelling a column value can be compared against.
 *
 * A value is a string, or an object whose own string sub-values name its parts — measured, one
 * project's route column holds `{ "method": "GET", "path": "/v1/capabilities" }`, whose parts joined
 * in order spell the endpoint the vocabulary records. Joining the parts is what lets the candidate
 * scan run without being told which sub-fields to join.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function spellingOfValue(value) {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const parts = Object.values(value).filter((part) => typeof part === 'string' && part.length > 0);
  return parts.length === 0 ? null : parts.join(' ');
}

/** The non-empty values a column carries, as spellings. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function columnSpellings(operations, column) {
  const spellings = [];
  for (const operation of operations) {
    const value = operation?.[column];
    if (isEmptyValue(value)) continue;
    const spelling = spellingOfValue(value);
    if (spelling !== null) spellings.push(spelling);
  }
  return spellings;
}

/**
 * The operation columns that carry a pinned vocabulary, and so are a demand no ownership can reach.
 *
 * The rule over-approximates on purpose: a column is a candidate when **at least one** of its values
 * instantiates a member, not when every value does. The two errors are not symmetric — a false
 * positive costs one exemption row, while a missed column is a silent hole, and that silence is
 * the defect these relations exist to remove. Measured on a live workspace, tightening the rule to
 * "every value" costs two columns coinciding with a member in one value out of 257, and would let
 * any near-miss column escape unremarked.
 *
 * @param {{ operations?: Array<object>, pins?: { enumerations?: Array<{ name: string, members?: string[] }> } }} artifact
 * @returns {string[]}
 */
export function collectCandidateColumns(artifact) {
  const operations = artifact?.operations ?? [];
  const vocabularies = (artifact?.pins?.enumerations ?? []).map((entry) => spellVocabulary(entry.members ?? []));

  const columns = [];
  for (const operation of operations) {
    for (const column of Object.keys(operation ?? {})) if (!columns.includes(column)) columns.push(column);
  }

  return columns.filter((column) => {
    const spellings = columnSpellings(operations, column);
    return spellings.some((spelling) => vocabularies.some((vocabulary) => vocabulary.has(spelling)));
  });
}

/** One declared interface, with its optional value join normalized to a list. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function normalizeDeclaration(entry) {
  return {
    interfaceId: String(entry?.interfaceId ?? ''),
    column: String(entry?.column ?? ''),
    operationSet: String(entry?.operationSet ?? ''),
    valueJoin: Array.isArray(entry?.valueJoin) ? entry.valueJoin.map((field) => String(field)) : [],
  };
}

/** The declared interfaces a seed document carries, or none. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function readSeedDeclarations(seedText) {
  JSON_FENCE.lastIndex = 0;
  let match;
  while ((match = JSON_FENCE.exec(seedText)) !== null) {
    let parsed;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    if (Array.isArray(parsed?.serves)) return parsed.serves.map(normalizeDeclaration);
  }
  return [];
}

/**
 * The declared interfaces of every package, keyed by package path.
 *
 * Two sources in precedence order, and the first is preferred because it is the manifest that
 * already owns what a package is: a field in the stage-2 allocation manifest, else a block in the
 * package's seed document, read the way `source_segments` already is. A package that declares
 * nothing is keyed by nothing and owes no surface — which is a valid answer, and the coverage
 * report names the columns that remain unadjudicated rather than letting the silence stand.
 *
 * @param {string} packageRoot
 * @param {{ [DECLARED_INTERFACES_FIELD]?: object }} [allocateManifest]
 * @returns {Map<string, Array<{ interfaceId: string, column: string, operationSet: string, valueJoin: string[] }>>}
 */
export function readDeclaredInterfaces(packageRoot, allocateManifest) {
  const declared = new Map();
  const fromManifest = allocateManifest?.[DECLARED_INTERFACES_FIELD];
  if (fromManifest !== null && typeof fromManifest === 'object') {
    for (const [packagePath, entries] of Object.entries(fromManifest)) {
      if (Array.isArray(entries)) declared.set(packagePath, entries.map(normalizeDeclaration));
    }
    return declared;
  }

  if (!fs.existsSync(packageRoot)) return declared;
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name === SEED_FILENAME) {
        const entries = readSeedDeclarations(fs.readFileSync(fullPath, 'utf8'));
        if (entries.length > 0) declared.set(path.relative(packageRoot, directory), entries);
      }
    }
  };
  walk(packageRoot);
  return declared;
}

/**
 * The boundary units one package holds.
 *
 * A contract names two packages, and the same unit id appears in both of their views carrying the
 * side each must honour — the shape the cross-boundary sequence units already use. A package on
 * both sides of one boundary holds both sides.
 *
 * @param {{ contract_registry?: Array<object> }} allocateManifest
 * @param {string} packageId
 * @returns {object[]}
 */
export function classifyCarries(allocateManifest, packageId) {
  const units = [];
  for (const contract of allocateManifest?.contract_registry ?? []) {
    const boundaryId = String(contract?.boundary_id ?? contract?.contract_id ?? '');
    if (boundaryId.length === 0) continue;
    if (contract.provider_package === packageId) {
      units.push({ unitId: `${CARRIES_UNIT_PREFIX}${boundaryId}`, relation: 'carries', subject: boundaryId, direction: 'provides', counterpart: String(contract.consumer_package ?? '') });
    }
    if (contract.consumer_package === packageId) {
      units.push({ unitId: `${CARRIES_UNIT_PREFIX}${boundaryId}`, relation: 'carries', subject: boundaryId, direction: 'consumes', counterpart: String(contract.provider_package ?? '') });
    }
  }
  return units.sort((left, right) => (left.unitId === right.unitId ? left.direction.localeCompare(right.direction) : left.unitId.localeCompare(right.unitId)));
}

/**
 * The surface units one package holds, each carrying the coverage it was measured at.
 *
 * One unit per declared interface rather than one per operation: the obligation is that every
 * operation is reachable, and enumerating one unit per operation for a package whose duty is a
 * single lookup path would state the same duty hundreds of times. The count is the content, and it
 * is asserted against the artifact rather than against a number the project wrote down.
 *
 * @param {{ operations?: Array<object>, pins?: { enumerations?: Array<{ name: string, members?: string[] }> } }} artifact
 * @param {Array<{ interfaceId: string, column: string, operationSet: string }>} declared
 * @param {string} packageId
 * @returns {object[]}
 */
export function classifyServes(artifact, declared, packageId) {
  const operations = artifact?.operations ?? [];
  const byName = new Map((artifact?.pins?.enumerations ?? []).map((entry) => [entry.name, entry.members ?? []]));

  return (declared ?? []).map((declaration) => {
    const spellings = columnSpellings(operations, declaration.column);
    const carriedSet = new Set(spellings);
    const vocabulary = spellVocabulary(byName.get(declaration.operationSet) ?? []);
    return {
      unitId: `${SERVES_UNIT_PREFIX}${declaration.interfaceId}`,
      relation: 'serves',
      subject: declaration.interfaceId,
      packageId,
      coverage: {
        column: declaration.column,
        operationSet: declaration.operationSet,
        carried: spellings.length,
        total: operations.length,
        uncoveredSpellings: [...vocabulary].filter((spelling) => !carriedSet.has(spelling)).sort(),
        crossChecked: operations.some((operation) => Object.prototype.hasOwnProperty.call(operation ?? {}, declaration.column)),
      },
    };
  }).sort((left, right) => left.unitId.localeCompare(right.unitId));
}

/**
 * Every unit one package holds under a relation other than ownership.
 *
 * The union is sorted and each unit carries a stable id, because the grill seeds one design node
 * per unit and a node whose id moved would read downstream as an undisclosed unit.
 *
 * @param {{ artifact: object, allocateManifest: object }} input
 * @param {string} packageId
 * @param {Array<object>} declared
 * @returns {object[]}
 */
export function buildObligationUnits({ artifact, allocateManifest }, packageId, declared) {
  const units = [...classifyServes(artifact, declared, packageId), ...classifyCarries(allocateManifest, packageId)];
  return units.sort((left, right) => (left.unitId === right.unitId ? left.relation.localeCompare(right.relation) : left.unitId.localeCompare(right.unitId)));
}
