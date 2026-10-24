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
 *
 * A third relation reads the package obligation record, which is the one document a run may
 * write. It exists because the two sources the surfaces are declared in are a stage-1 input and a
 * generated projection, so a judgment about a demand that no relation reaches had nowhere to live;
 * it now lives beside the package's own papers and is read back by everything downstream.
 */
import fs from 'node:fs';
import path from 'node:path';
import { basename } from 'node:path';

import { NOT_A_SEQUENCE } from './units.mjs';

/** The unit-id prefix a boundary unit carries. */
export const CARRIES_UNIT_PREFIX = 'ctr-';

/** The unit-id prefix a surface unit carries. */
export const SERVES_UNIT_PREFIX = 'obl-';

/** The unit-id prefix an operation demand carries, which a recorded assignment names. */
export const OPERATION_UNIT_PREFIX = 'op-';

/** The unit-id prefix a sequence demand carries, which a recorded assignment names. */
export const SEQUENCE_UNIT_PREFIX = 'seq-';

/** The relation a unit carries when a recorded judgment placed it rather than a relation. */
export const ASSIGNMENT_RELATION = 'assigns';

/** The relation names a unit may declare. */
export const OBLIGATION_RELATIONS = Object.freeze(['serves', 'carries', ASSIGNMENT_RELATION]);

/**
 * The writable document a run records its own judgments in, beside the package's own papers.
 *
 * Every other declaration source is either a stage-1 input or a generated projection, so a
 * judgment written into one of them would be indistinguishable from the material it was
 * derived from, and regenerating would silently discard it. This is the one document a run
 * may write, and the name is spelled once here because the reader, the guard and the run
 * that writes it must agree about it.
 */
export const OBLIGATION_RECORD_BASENAME = 'OBLIGATION.json';

/** The record version this reader understands. */
export const OBLIGATION_RECORD_VERSION = 2;

/**
 * The versions this reader knows, oldest first.
 *
 * A version is a rule set, not a number to match: version 1 recorded an adjudication with a ground
 * and nothing saying which package the duty went to, and version 2 requires that carrier. Reading
 * a version-1 record under version-2 rules would refuse every record written before the carrier
 * existed, which is a workspace punished for having been written yesterday. So the reader accepts
 * both and answers each under the rules it was written under, and the version it writes is the
 * newest one it knows.
 */
export const OBLIGATION_RECORD_SUPPORTED_VERSIONS = Object.freeze([1, 2]);

/** The version field of the record, and the three lists it carries. */
const RECORD_VERSION_FIELD = 'version';
const RECORD_SERVES_FIELD = 'serves';
const RECORD_ASSIGNMENTS_FIELD = 'assignments';
const RECORD_ADJUDICATIONS_FIELD = 'adjudications';

/** The demand kind each unit-id prefix names. */
const DEMAND_KIND_BY_PREFIX = Object.freeze({ [OPERATION_UNIT_PREFIX]: 'operation', [SEQUENCE_UNIT_PREFIX]: 'sequence' });

/**
 * The three states of a view's obligation source.
 *
 * `declared` and `undeclared` are produced by the projection; `absent` is a view on disk that
 * carries no obligation section at all, which is every view projected before the relations
 * existed. `absent` is a named condition requiring regeneration, never a satisfied set.
 */
export const OBLIGATION_SOURCES = Object.freeze(['declared', 'undeclared', 'absent']);

/** The field a stage-2 manifest may carry the declared interfaces in, keyed by package path. */
export const DECLARED_INTERFACES_FIELD = 'declared_interfaces';

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
  for (const [packagePath, obligation] of readPackageObligations(packageRoot, allocateManifest)) {
    if (obligation.listedBy !== null) declared.set(packagePath, obligation.serves);
  }
  return declared;
}

/** The seed declarations of every package beneath a root, keyed by the path the reader keys by. */
// [::TICKET::] PX-260, PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function readSeedsByDirectory(packageRoot) {
  const seeds = new Map();
  if (!fs.existsSync(packageRoot)) return seeds;
  walkPackageRoot(packageRoot, (directory, name, fullPath) => {
    if (name !== SEED_FILENAME) return;
    const entries = readSeedDeclarations(fs.readFileSync(fullPath, 'utf8'));
    if (entries.length > 0) seeds.set(path.relative(packageRoot, directory), entries);
  });
  return seeds;
}

/**
 * The obligation record of every package beneath a root, keyed the way the seeds are.
 *
 * A record that cannot be read, or that was written by a version this reader does not know,
 * is answered with a refusal naming it rather than with an empty obligation: a package read
 * as declaring nothing is a package whose silence is indistinguishable from a decision, and
 * that is the confusion this whole relation exists to remove.
 */
// [::TICKET::] PX-260, PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function readRecordsByDirectory(packageRoot) {
  const records = new Map();
  if (!fs.existsSync(packageRoot)) return records;
  walkPackageRoot(packageRoot, (directory, name, fullPath) => {
    if (name !== OBLIGATION_RECORD_BASENAME) return;
    const packagePath = path.relative(packageRoot, directory);
    records.set(packagePath, readRecordOrRefusal(fullPath, packagePath));
  });
  return records;
}

/** Every file beneath a package root, reported with the directory it sits in. */
// [::TICKET::] PX-260, PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function walkPackageRoot(directory, visit) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkPackageRoot(fullPath, visit);
    else visit(directory, entry.name, fullPath);
  }
}

/**
 * One record's content, or the refusal that stands in its place.
 *
 * The version is read before the lists, because a record written by a newer writer may mean
 * something else by the same field names, and half-reading it would put a judgment into the
 * obligation set that no writer of this version ever made.
 *
 * @param {string} filePath
 * @returns {{ serves: object[], assignments: object[], refused: string|null }}
 */
// [::TICKET::] PX-260, PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function readRecordOrRefusal(filePath, packagePath = '') {
  const empty = { serves: [], assignments: [], adjudications: [], refused: null };
  const refusedWith = (reason) => ({ ...empty, refused: `${basename(filePath)} ${reason}` });

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return refusedWith('could not be read as a record');
  }
  if (!OBLIGATION_RECORD_SUPPORTED_VERSIONS.includes(parsed?.[RECORD_VERSION_FIELD])) {
    return refusedWith(`records version ${JSON.stringify(parsed?.[RECORD_VERSION_FIELD])}, and this reader knows version${OBLIGATION_RECORD_SUPPORTED_VERSIONS.length > 1 ? 's' : ''} ${OBLIGATION_RECORD_SUPPORTED_VERSIONS.join(', ')}`);
  }

  const serves = Array.isArray(parsed[RECORD_SERVES_FIELD]) ? parsed[RECORD_SERVES_FIELD].map(normalizeDeclaration) : [];
  const assignments = Array.isArray(parsed[RECORD_ASSIGNMENTS_FIELD]) ? parsed[RECORD_ASSIGNMENTS_FIELD].map(normalizeAssignment).filter((entry) => entry.unit.length > 0) : [];
  const adjudications = classifyAdjudications(parsed, packagePath);
  return { serves, assignments, adjudications, refused: null };
}

/** One recorded judgment, with the demand it names and the evidence it rests on. */
// [::TICKET::] PX-260, PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function normalizeAssignment(entry) {
  return { unit: String(entry?.unit ?? '').trim(), ground: String(entry?.ground ?? '') };
}

/**
 * One recorded adjudication, with the column it removes and the evidence it rests on.
 *
 * An entry naming no column is dropped rather than kept as an empty subject: it removes nothing,
 * and a row whose subject is the empty string would sit in the refusal set looking like a demand.
 *
 * @param {{ column?: string, ground?: string }} entry
 * @returns {{ column: string, ground: string }}
 */
// [::TICKET::] PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-262) --for-spec --no-implementation-order`.
function normalizeAdjudication(entry, version = OBLIGATION_RECORD_VERSION, packagePath = '') {
  return {
    column: String(entry?.column ?? '').trim(),
    ground: String(entry?.ground ?? ''),
    // Version 1 had no carrier field, and its writer meant the package that wrote the record: the
    // adjudication was that package's own judgment about a column it was asked to serve. Reading it
    // as carrying nobody would turn every record written before this version into a refusal, so the
    // old rule set is completed rather than reinterpreted.
    carriedBy: version === 1 ? String(packagePath) : String(entry?.carriedBy ?? '').trim(),
  };
}

/**
 * The columns a record adjudicated away, read from the record alone.
 *
 * This is the route a run can write. The artifact's own exemptions array is the other one, and
 * only a readings pass of the rail writes it, so a candidate column that is not an interface
 * had nowhere to be recorded until this list existed — and the cheap alternative, declaring the
 * column as a surface, reaches the guarantee vacuously because every candidate column is carried
 * by the operation rows.
 *
 * @param {{ adjudications?: object[] }|null} record
 * @returns {Array<{ column: string, ground: string }>}
 */
// [::TICKET::] PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-261 --for-spec --no-implementation-order`.
export function classifyAdjudications(record, packagePath = '') {
  const version = record?.[RECORD_VERSION_FIELD];
  return (record?.[RECORD_ADJUDICATIONS_FIELD] ?? [])
    .map((entry) => normalizeAdjudication(entry, version, packagePath))
    .filter((entry) => entry.column.length > 0);
}

/**
 * Every package's obligation record, read from the three sources in precedence order.
 *
 * The surfaces keep the precedence they had before the record existed — the stage-2 manifest
 * field first, then the seed's fence, then the record — so a workspace that declared its
 * surfaces either way is read exactly as it was. The judgments have no other source, so the
 * record is read whichever source answered for the surfaces. `listedBy` names the source that
 * answered, because a reader that cannot say where a declaration came from cannot tell a
 * decision from a silence.
 *
 * @param {string} packageRoot
 * @param {{ [DECLARED_INTERFACES_FIELD]?: object }} [allocateManifest]
 * @returns {Map<string, { serves: object[], assignments: object[], adjudications: object[], refused: string[], listedBy: string|null, source: string }>}
 */
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
export function readPackageObligations(packageRoot, allocateManifest) {
  const obligations = new Map();
  const entryFor = (packagePath) => {
    if (!obligations.has(packagePath)) {
      obligations.set(packagePath, { serves: [], assignments: [], adjudications: [], refused: [], listedBy: null, source: OBLIGATION_SOURCES[1] });
    }
    return obligations.get(packagePath);
  };

  const fromManifest = allocateManifest?.[DECLARED_INTERFACES_FIELD];
  if (fromManifest !== null && typeof fromManifest === 'object') {
    for (const [packagePath, entries] of Object.entries(fromManifest)) {
      if (!Array.isArray(entries)) continue;
      const entry = entryFor(packagePath);
      entry.serves = entries.map(normalizeDeclaration);
      entry.listedBy = DECLARED_INTERFACES_FIELD;
    }
  } else {
    for (const [packagePath, serves] of readSeedsByDirectory(packageRoot)) {
      const entry = entryFor(packagePath);
      entry.serves = serves;
      entry.listedBy = SEED_FILENAME;
    }
  }

  for (const [packagePath, record] of readRecordsByDirectory(packageRoot)) {
    const entry = entryFor(packagePath);
    if (record.refused !== null) entry.refused.push(record.refused);
    if (entry.serves.length === 0 && record.serves.length > 0) {
      entry.serves = record.serves;
      entry.listedBy = OBLIGATION_RECORD_BASENAME;
    }
    entry.assignments = record.assignments;
    entry.adjudications = record.adjudications;
  }

  for (const entry of obligations.values()) {
    entry.source = entry.serves.length > 0 ? OBLIGATION_SOURCES[0] : OBLIGATION_SOURCES[1];
  }
  return obligations;
}

/**
 * The units one package's recorded judgments place, and the ones that name nothing.
 *
 * A judgment names the demand by the unit id the view already spells, so an assignment to an
 * operation is `op-<operationId>` and an assignment to a sequence is `seq-<sequenceId>`. A
 * name the artifact does not hold is reported rather than turned into a unit: a unit is a
 * duty a package is told to implement, and inventing one from a typo would tell a package to
 * implement something the specification never named.
 *
 * A sequence the reading ruled is not a sequence is not a demand, so a judgment naming one is
 * unbound for the same reason a typo is.
 *
 * @param {{ operations?: object[], sequences?: object[] }} artifact
 * @param {Array<{ unit: string, ground: string }>} assignments
 * @returns {{ units: object[], unbound: string[] }}
 */
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
export function classifyAssignments(artifact, assignments) {
  const demanded = new Set();
  for (const operation of artifact?.operations ?? []) {
    if (operation?.id) demanded.add(`${OPERATION_UNIT_PREFIX}${operation.id}`);
  }
  for (const sequence of artifact?.sequences ?? []) {
    if (sequence?.id && sequence.outcome !== NOT_A_SEQUENCE) demanded.add(`${SEQUENCE_UNIT_PREFIX}${sequence.id}`);
  }

  const units = [];
  const unbound = [];
  for (const assignment of assignments ?? []) {
    if (!demanded.has(assignment.unit)) {
      unbound.push(assignment.unit);
      continue;
    }
    units.push({
      unitId: assignment.unit,
      relation: ASSIGNMENT_RELATION,
      subject: assignment.unit.slice(assignment.unit.indexOf('-') + 1),
      kind: DEMAND_KIND_BY_PREFIX[assignment.unit.slice(0, assignment.unit.indexOf('-') + 1)],
      // The ground is normalized here rather than at the reader, so a whitespace-only ground reads
      // as no ground however the assignment reached this module. The coverage layer reads this
      // field to count a demand, so a judgment recorded without a ground places nothing.
      ground: String(assignment.ground ?? '').trim(),
    });
  }
  return { units, unbound };
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
        // The other direction, and the one that catches a declaration naming a column that is
        // not an interface at all. A column is a candidate as soon as one of its values
        // instantiates a member, which every candidate column does; a declaration is accepted
        // only when every value does. The asymmetry is deliberate: candidates over-approximate
        // so that no column escapes unremarked, and declarations under-approximate so that no
        // column joins the coverage vacuously.
        foreignValues: [...new Set(spellings)].filter((spelling) => !vocabulary.has(spelling)).sort(),
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
 * @param {{ artifact: object, allocateManifest: object, record?: { assignments?: object[] }|null }} input
 * @param {string} packageId
 * @param {Array<object>} declared
 * @returns {object[]}
 */
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
export function buildObligationUnits({ artifact, allocateManifest, record = null }, packageId, declared) {
  const units = [
    ...classifyServes(artifact, declared, packageId),
    ...classifyAssignments(artifact, record?.assignments ?? []).units,
    ...classifyCarries(allocateManifest, packageId),
  ];
  return units.sort((left, right) => (left.unitId === right.unitId ? left.relation.localeCompare(right.relation) : left.unitId.localeCompare(right.unitId)));
}
