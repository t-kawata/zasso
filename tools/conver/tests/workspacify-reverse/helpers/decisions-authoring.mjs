// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
/**
 * The decisions input a claim-carrying representative needs.
 *
 * `workspacify-tree gate` refuses to publish without two things only the AI can
 * supply: a partition whose packages own the material the origin spec harvested,
 * and a settlement for every specification-pulse candidate. Neither is typed by
 * hand. The partition comes from the measured tree, the ownership from the
 * anchors the spec itself carries, and the settlements from the pulse the spec
 * itself produces — so a second operator re-runs this and gets the same file.
 *
 * Three rules keep the derivation honest rather than convenient:
 *
 *   - **Nothing inferred is owned twice or dropped.** Every harvested item is
 *     placed by the directory its own section names; an item whose section names
 *     no measured directory raises instead of being left out. A silent omission
 *     would make the coverage assertion pass while material went unowned.
 *   - **A package that owns nothing is not declared production code.** The gate
 *     calls that a speculative split, so the kind follows the ownership rather
 *     than the other way round.
 *   - **A pulse kind with no authored reading raises.** A loop that skipped it
 *     would report a settled candidate set it did not have.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { harvestCategoryInventory, harvestObjectCandidates, harvestClaimCandidates } from '../../../.claude/scripts/workspacify-tree/lib/extraction.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import { PULSE_KINDS, buildSpecPulse } from '../../../.claude/scripts/workspacify-tree/lib/spec-pulse.mjs';
import { SOURCE_FILE_EXTENSIONS, measureDirectoryTree } from '../../../.claude/scripts/workspacify-tree/lib/structure-parity.mjs';

/** The project this helper belongs to: `<root>/tests/workspacify-reverse/helpers` walked back to the root that holds `Tickets.json`. */
const PROJECT_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

/** The package path that denotes the project root (the measurement's own vocabulary). */
export const ROOT_PACKAGE_PATH = '.';

/**
 * The layer every measured directory is placed at.
 *
 * `runOwnershipChecks` accepts an owner only from `protocol` or `domain`, and
 * `LAYERS` declares no `domain` — so `protocol` is the one layer a package that
 * owns material can carry, and the measured population is one crate with no
 * declared dependency edge to tell its directories apart along that axis.
 */
const MEASURED_LAYER = 'protocol';

/**
 * The inventory categories in the order the ownership checks read them.
 *
 * `ownershipTable` marks the two families the decisions payload's `ownership[]`
 * maps id-by-id; the other four are owned through the package's `owns` lists
 * alone, which is the shape `buildOwnershipTable` reads.
 */
export const INVENTORY_CATEGORIES = Object.freeze([
  Object.freeze({ listKey: 'objects', ownsKey: 'objects', ownershipTable: true }),
  Object.freeze({ listKey: 'claims', ownsKey: 'claims', ownershipTable: true }),
  Object.freeze({ listKey: 'invariants', ownsKey: 'invariants', ownershipTable: false }),
  Object.freeze({ listKey: 'stateMachines', ownsKey: 'state_machines', ownershipTable: false }),
  Object.freeze({ listKey: 'errorCodes', ownsKey: 'error_codes', ownershipTable: false }),
  Object.freeze({ listKey: 'requiredTests', ownsKey: 'required_tests', ownershipTable: false }),
]);

/** Every observation kind the pulse can report, read from the pulse itself. */
export function knownPulseKinds() {
  return [...PULSE_KINDS];
}

/** The empty `owns` block every package starts from. */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function emptyOwns() {
  return { objects: [], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] };
}

/** Where a representative that is not a fixture has its decisions input mirrored. */
const DECISIONS_MIRROR = join('tests', 'workspacify-reverse', 'fixtures', 'patterns');

/**
 * The decisions input a representative the chain cannot configure reads.
 *
 * Every section a frozen decisions input carries, empty until a human's judgement
 * fills them. It is written beside the scratch copy rather than inside the
 * representative, because the representatives are frozen instruments and one of them
 * is the answer key the oracle rests on.
 *
 * It is declared here, beside the path that locates an authored input, so that the
 * bytes a run reads and the digest the observation records it by are computed from
 * one declaration. The observation is checked against them from the unit surface,
 * which is the only surface that runs on every routine test run.
 */
export const DECISIONS_INPUT_SKELETON = Object.freeze({
// [::TICKET::] P26-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-1 --for-spec --no-implementation-order`.
  workspace: [], ownership: [], dependencies: [], adapters: [], approvals: [],
});

/**
 * Where the authored decisions input for one representative lives.
 *
 * A representative under `tests/` is a fixture and already holds its own files,
 * so the input sits beside it. The experiment's subject was not: it was a frozen
 * instrument measured against an answer key, and the oracle asserted the two
 * trees differed by exactly the renamed test files — so a decisions input written
 * inside it would have been an eleventh difference and would have refused the key
 * rather than described the subject. Its input was mirrored under the fixture root
 * instead, which is also where the specification's own fixture representatives
 * keep theirs.
 *
 * The subject has since been deleted, and the mirror is all that is left of that
 * arrangement: `patterns/siprs-for-reverse/DECISIONS.json` is the reading a run
 * took over a spec that no longer exists. The branch below stays because the
 * mirror is still a real path this function has to resolve.
 *
 * This is the one declaration of the path: a second copy would be a second thing
 * to drift, and the input is the record a later operator has to find.
 */
export function decisionsPathFor(representative, projectRoot = PROJECT_ROOT) {
  if (representative.startsWith('tests/')) {
    return join(projectRoot, representative, 'DECISIONS.json');
  }
  return join(projectRoot, DECISIONS_MIRROR, representative, 'DECISIONS.json');
}

/**
 * Read the specification once and hand back the text, its headings and its segments.
 *
 * The reading is a value: the section reader, the harvester and the pulse all
 * consume the same one, so a run parses a multi-megabyte document once rather
 * than once per reader.
 */
export function readSpecification(specPath) {
  const sourceText = readFileSync(specPath, 'utf8');
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  return { sourceText, headings, segments };
}

/** Every heading, in document order, so a section's body is the text up to the next one. */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function headingsInDocumentOrder(headings) {
  const flat = [];
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      flat.push(node);
      visit(node.children);
    }
  };
  visit(headings);
  return flat.sort((left, right) => left.byte_start - right.byte_start);
}

/** The `scope` line a claim section carries, when it carries one. */
const SCOPE_LINE_RE = /^-\s*scope:\s*(.+)$/m;

/** A source file cited inside a claim section, in the evidence anchors' own notation. */
const EVIDENCE_ANCHOR_RE = new RegExp(
  '`([^`\\n]+\\.(?:' + SOURCE_FILE_EXTENSIONS.map((extension) => extension.replace('.', '')).join('|') + '))(?::\\d+)?`',
);

/** The directory a claim section names: its `scope` line, or else its first evidence anchor. */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function directoryOfSection(body) {
  const scope = SCOPE_LINE_RE.exec(body);
  if (scope !== null) {
    return scope[1].trim();
  }
  const anchor = EVIDENCE_ANCHOR_RE.exec(body);
  if (anchor === null) {
    return undefined;
  }
  const file = anchor[1];
  const separator = file.lastIndexOf('/');
  return separator === -1 ? ROOT_PACKAGE_PATH : file.slice(0, separator);
}

/**
 * The directory each section names, keyed by heading id.
 *
 * The inventory's items carry a `section_id`, so this is the join between what
 * the extractor harvested and where the specification says it lives.
 */
export function sectionDirectoriesOf(specification) {
  const { sourceText, headings } = specification;
  const ordered = headingsInDocumentOrder(headings);
  const directories = new Map();
  for (let index = 0; index < ordered.length; index += 1) {
    const heading = ordered[index];
    const next = ordered[index + 1];
    const body = sourceText.slice(heading.byte_end, next === undefined ? sourceText.length : next.byte_start);
    const directory = directoryOfSection(body);
    if (directory !== undefined) {
      directories.set(heading.id, directory);
    }
  }
  return directories;
}

/** The directory each section names, read from the specification at `specPath`. */
export function readSectionDirectories(specPath) {
  return sectionDirectoriesOf(readSpecification(specPath));
}

/** The inventory the pipeline will harvest for this specification, in its own vocabulary. */
export function inventoryOf(specification) {
  const { sourceText, headings, segments } = specification;
  const categories = harvestCategoryInventory({ sourceText, headings, segments });
  return {
    objects: harvestObjectCandidates({ sourceText, headings, segments }),
    claims: harvestClaimCandidates({ sourceText, headings, segments }),
    invariants: categories.invariants,
    stateMachines: categories.stateMachines,
    errorCodes: categories.errorCodes,
    requiredTests: categories.requiredTests,
  };
}

/** The inventory the pipeline will harvest for the specification at `specPath`. */
export function harvestInventory(specPath) {
  return inventoryOf(readSpecification(specPath));
}

/** A package name that is readable and unique across the measured paths. */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function packageName(dirPath) {
  if (dirPath === ROOT_PACKAGE_PATH) {
    return 'project-root';
  }
  return dirPath.replace(/\//g, '-');
}

/**
 * The kind a measured directory's ownership justifies.
 *
 * A measured directory can carry no claim of the specification's own: a module
 * whose every condition is a boundary crossing is not harvested into the
 * inventory, so it owns nothing even though the specification names it.
 * Declaring it production code would earn the speculative-split verdict that is
 * not true, so the kind follows the owned count rather than the directory's
 * name — which is why the kind is written here, where the count is known, and
 * not in the partition that only knows which directories the spec mentioned.
 */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function kindFor({ dirPath, ownsMaterial }) {
  if (!ownsMaterial) {
    return dirPath === ROOT_PACKAGE_PATH ? 'binary' : 'conformance';
  }
  const segments = dirPath.split('/');
  return segments.includes('tests') || segments.includes('examples') ? 'test-support' : 'production-library';
}

/** How a package's responsibility reads once its ownership is known. */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function responsibilityFor({ dirPath, ownsMaterial, ownedCount }) {
  const where = dirPath === ROOT_PACKAGE_PATH ? 'the project root' : dirPath;
  if (!ownsMaterial) {
    return `holds ${where}, which carries no claim or object of the origin spec's own`;
  }
  return `owns the ${ownedCount} harvested item(s) the origin spec anchors in ${where}`;
}

/**
 * One package per measured directory, and a tree whose leaves are exactly those paths.
 *
 * The measured population is "every directory that directly holds a source
 * file", which is not a hierarchy: `src` holds files of its own while `src/api`
 * does too, and both are measured. The tree therefore lists each unit as a leaf
 * node of its own rather than nesting them, because a nested tree can express
 * only one of the two and the gate compares leaves to package paths exactly.
 *
 * A subject whose specification carries no claim has no material to own, and a
 * production package that owns nothing is the speculative split the gate names —
 * so no partition is invented for it.
 */
export function derivePartition({ measuredDirectories, materialDirectories }) {
  if (materialDirectories.length === 0) {
    throw new Error('the origin spec carries no claim, so no partition can be derived from it');
  }
  const material = new Set(materialDirectories);
  const ordered = [...measuredDirectories].sort();
  // A unit's catalog entry is completed by `deriveOwnership`: whether a
  // directory is production code, needs a seed and owns anything all follow the
  // owned count, which is only known once the inventory has been placed.
  const workspace = ordered.map((dirPath, index) => ({
    id: `pkg-${String(index + 1).padStart(4, '0')}`,
    name: packageName(dirPath),
    path: dirPath,
    layer: MEASURED_LAYER,
    owns: emptyOwns(),
  }));
  const tree = ordered.map((dirPath) => ({ name: packageName(dirPath), path: dirPath, kind: 'dir', children: [] }));
  return { workspace, tree };
}

/** The section an inventory item sits in: its own, or the first its source refs name. */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function sectionOf(item) {
  if (typeof item.section_id === 'string' && item.section_id.length > 0) {
    return item.section_id;
  }
  const ref = (item.source_refs ?? []).find((entry) => typeof entry.section_id === 'string');
  return ref?.section_id;
}

/**
 * Place every harvested item in the package of the directory its section names.
 *
 * The count of owned items is therefore the count the specification harvested —
 * the set is derived, not drawn to satisfy a gate.
 */
export function deriveOwnership({ inventory, sectionDirectories, partition }) {
  const packageByPath = new Map(partition.workspace.map((pkg) => [pkg.path, pkg]));
  const ownsById = new Map(partition.workspace.map((pkg) => [pkg.id, emptyOwns()]));
  const ownership = [];

  for (const category of INVENTORY_CATEGORIES) {
    for (const item of inventory[category.listKey] ?? []) {
      const directory = sectionDirectories.get(sectionOf(item));
      if (directory === undefined) {
        throw new Error(`inventory item ${item.id} names no measured directory, so it cannot be owned`);
      }
      const pkg = packageByPath.get(directory);
      if (pkg === undefined) {
        throw new Error(`inventory item ${item.id} names ${directory}, which no measured package declares`);
      }
      ownsById.get(pkg.id)[category.ownsKey].push(item.id);
      if (category.ownershipTable) {
        ownership.push({ objectId: item.id, packageId: pkg.id });
      }
    }
  }

  const workspace = partition.workspace.map((pkg) => {
    const owns = ownsById.get(pkg.id);
    const ownedCount = Object.values(owns).reduce((total, ids) => total + ids.length, 0);
    const ownsMaterial = ownedCount > 0;
    return {
      ...pkg,
      kind: kindFor({ dirPath: pkg.path, ownsMaterial }),
      responsibilities: [responsibilityFor({ dirPath: pkg.path, ownsMaterial, ownedCount })],
      seed_required: ownsMaterial,
      owns,
    };
  });
  return { workspace, ownership };
}

/** Every inventory id a set of packages owns, across all six families. */
export function collectOwnedInventoryIds(packages) {
  return packages.flatMap((pkg) =>
    INVENTORY_CATEGORIES.flatMap((category) => pkg.owns?.[category.ownsKey] ?? []));
}

/**
 * The authored readings, one per pulse kind.
 *
 * A reading is the judgement the design's Step 5 asks the AI to take. Two of the
 * three kinds this pipeline reports are questions a later per-directory grill
 * answers, so they are carried as residual questions; the third describes the
 * document's own identifier vocabulary and is settled outright.
 */
export const SETTLEMENT_READINGS = Object.freeze({
  /** Two spellings of one name: the extractor already treats one as the declaration. */
  near_duplicate_term: Object.freeze({
    list: 'spec_defects',
    fields: (candidate) => ({
      ai_interpretation: candidate.observation,
      chosen_default: 'the first spelling is the canonical name and the other is an alias',
      rationale: 'the extractor already treats one spelling as the declaration',
    }),
  }),

  /**
   * An identifier cited once and defined nowhere.
   *
   * In an origin spec the claims chapter cites each claim id and each source
   * anchor exactly once, in the row that defines it, so the pulse's "used once"
   * reading fires on the document's own vocabulary rather than on a project
   * concept nobody defined.
   */
  undefined_reference: Object.freeze({
    list: 'spec_defects',
    fields: (candidate) => ({
      ai_interpretation: `${candidate.observation} This is the document's own claim-row identifier, cited once by the row that defines it.`,
      chosen_default: 'defined by the row that cites it; it reaches no directory of its own.',
      rationale: 'one question per citation would ask the same thing many times, and the claim anchor already names the owner.',
    }),
  }),

  /** A chapter no other chapter mentions and that carries no harvested item. */
  isolated_chapter: Object.freeze({
    list: 'residual_questions',
    fields: (candidate) => ({
      topic: candidate.observation,
      alternatives: ['leave the chapter unclaimed', 'claim it into the nearest package and re-cut the boundary that produced the observation'],
      chosen_default: 'the chapter reaches no directory until a seed claims it explicitly',
      why_unresolved: 'whether a chapter belongs to a directory is a boundary decision the canonical per-directory grill takes, not one this run may take in its place',
    }),
  }),

  /** A chapter that dominates the document. */
  oversized_chapter: Object.freeze({
    list: 'residual_questions',
    fields: (candidate) => ({
      topic: candidate.observation,
      alternatives: ['keep the chapter as one package', 'split the chapter along its own sub-headings before it becomes one package'],
      chosen_default: 'the chapter is carried whole and split only if a later grill decides its size is the boundary',
      why_unresolved: 'how a document is cut into packages is a boundary decision the canonical per-directory grill takes, and a run that cut it here would decide the partition from the document\'s shape alone',
    }),
  }),

  /** A chapter that states normative words but yields no material. */
  extraction_gap: Object.freeze({
    list: 'residual_questions',
    fields: (candidate) => ({
      topic: candidate.observation,
      alternatives: ['leave the rule without an owner', 'name the inventory item the chapter states and allocate it'],
      chosen_default: 'the rule is carried as a question rather than given an owner it was not harvested with',
      why_unresolved: 'which package owns a rule the extractor did not harvest is the per-directory grill\'s decision',
    }),
  }),

  /** A long chapter with neither normative words nor material. */
  thin_normative_density: Object.freeze({
    list: 'residual_questions',
    fields: (candidate) => ({
      topic: candidate.observation,
      alternatives: ['leave the chapter as documentation', 're-cut the boundary so the chapter states something implementable'],
      chosen_default: 'the chapter is carried as a question rather than turned into a package',
      why_unresolved: 'whether the chapter should state something implementable is a boundary decision the per-directory grill takes',
    }),
  }),

  /** A table row whose name the chapter prose never mentions. */
  table_prose_mismatch: Object.freeze({
    list: 'residual_questions',
    fields: (candidate) => ({
      topic: candidate.observation,
      alternatives: ['take the table as normative', 'take the prose as normative and correct the table'],
      chosen_default: 'the table and the prose are carried as a question rather than one being silently preferred',
      why_unresolved: 'which of the two statements was meant is the per-directory grill\'s reading to take',
    }),
  }),
});

/**
 * One settlement per pulse candidate, and none left over.
 *
 * A candidate whose kind carries no authored reading raises rather than being
 * carried silently: the settled count is the evidence that nothing was dropped,
 * and a loop that skipped an unread kind would report a count it did not have.
 */
export function settleCandidates({ candidates, readings = SETTLEMENT_READINGS }) {
  const specDefects = [];
  const residualQuestions = [];
  for (const candidate of candidates) {
    const reading = readings[candidate.kind];
    if (reading === undefined) {
      throw new Error(`pulse candidate ${candidate.id} has kind ${candidate.kind}, for which no authored reading exists`);
    }
    const record = { candidate_id: candidate.id, ...reading.fields(candidate) };
    if (reading.list === 'spec_defects') {
      specDefects.push(record);
    } else {
      residualQuestions.push(record);
    }
  }
  return { spec_defects: specDefects, residual_questions: residualQuestions };
}

/**
 * Author one representative's decisions input and write it where its consumer reads it.
 *
 * This is the authoring entry point, run deliberately rather than by the suite:
 * the file it writes is the pinned judgement, and re-running it is how a second
 * operator reproduces or replaces that judgement.
 */
export function writeDecisions({ specPath, measuredRoot, representative, projectRoot = PROJECT_ROOT }) {
  const decisions = authorDecisions({ specPath, measuredRoot, projectRoot });
  const outPath = decisionsPathFor(representative, projectRoot);
  writeFileSync(outPath, `${JSON.stringify(decisions, null, 2)}\n`, 'utf8');
  return { outPath, decisions };
}

/** The measured directories of a subject, in the measurement's own vocabulary. */
export function measuredDirectoriesOf(measuredRoot) {
  return measureDirectoryTree(measuredRoot).directories;
}

/** The design record that says what the input is, who took the judgement and on what evidence. */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function semanticReview({ specPath, measuredRoot }) {
  return {
    status: 'APPROVED',
    statement: `The partition is derived from the measured tree of ${measuredRoot} and the ownership from the evidence anchors of ${specPath}: every harvested item is placed by the directory its own section names, so the owned count is the harvested count rather than a set drawn to satisfy the gate. What is approved here is the reading that the measured directories are the partition units and that each claim's anchor names its owner. The pulse settlements are the judgements this run took; they are pinned so another operator can reproduce or replace them.`,
    approver: `P24-9 authoring, derived from the measured tree and the origin spec`,
  };
}

/**
 * Compose the decisions input the gate reads.
 *
 * Every section of the payload is either derived (workspace, ownership, tree,
 * settlements) or the record of the judgement taken (semantic review). Nothing
 * is typed by hand, and nothing that the derivation could not place is dropped.
 */
export function authorDecisions({ specPath, measuredRoot, projectRoot = PROJECT_ROOT }) {
  if (!existsSync(specPath)) {
    throw new Error(`the origin spec does not exist: ${specPath}`);
  }
  const specification = readSpecification(specPath);
  const measuredDirectories = measuredDirectoriesOf(measuredRoot);
  const sectionDirectories = sectionDirectoriesOf(specification);
  const inventory = inventoryOf(specification);
  const materialDirectories = [...new Set(sectionDirectories.values())];
  const partition = derivePartition({ measuredDirectories, materialDirectories });
  const owned = deriveOwnership({ inventory, sectionDirectories, partition });
  const { candidates } = pulseOf(specification, inventory);
  const settled = settleCandidates({ candidates });

  return {
    workspace: owned.workspace,
    tree: partition.tree,
    ownership: owned.ownership,
    dependencies: [],
    adapters: {},
    approvals: [],
    dependency_reviews: [],
    semantic_review: semanticReview({ specPath, measuredRoot }),
    spec_defects: settled.spec_defects,
    residual_questions: settled.residual_questions,
    decisions_input: {
      measured_root: measuredRoot,
      spec_path: specPath,
      // The digest rather than the path is what makes the reading reproducible: a
      // path names where this operator happened to keep a scratch copy, and the
      // reading is only the one that was taken if the document still hashes the same.
      spec_digest: sha256Hex(Buffer.from(specification.sourceText, 'utf8')),
      harvested: Object.fromEntries(INVENTORY_CATEGORIES.map((category) => [category.listKey, (inventory[category.listKey] ?? []).length])),
      pulse_candidates: candidates.length,
    },
    project_root: projectRoot,
  };
}

/**
 * The pulse the gate will compute for this specification.
 *
 * The candidates are read from the same module and the same inventory the gate
 * hands the pulse, so the settlement covers exactly the set the gate judges.
 */
export function pulseOf(specification, inventory) {
  return buildSpecPulse({
    sourceText: specification.sourceText,
    headings: specification.headings,
    segments: specification.segments,
    inventory: {
      objects: inventory.objects,
      claims: inventory.claims,
      invariants: inventory.invariants,
      state_machines: inventory.stateMachines,
      error_codes: inventory.errorCodes,
      required_tests: inventory.requiredTests,
    },
  });
}
