// [::TICKET::] PX-193, PX-201 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-193|PX-201) --for-spec --no-implementation-order`.
// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-193 @verifies C002
/**
 * RFC-SEED.md rendering.
 *
 * Sections 1, 2, 3 and 14 are machine-injected: the reference block, the coupling
 * contracts, the Allocation Index with the coverage facts and the segment-addressed
 * traceability table. Sections 4-13 are the AI's prose and are never fabricated —
 * a missing or invalid body fails the render.
 */
// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';
import { FORWARD_ARTIFACT_KINDS, assertReverseAdditions, extendForwardArtifacts } from '../../workspacify-reverse/lib/forward-extensions.mjs';
import { lookupInventoryItem } from './allocation-model.mjs';
import { GRILL_QUESTION_SECTION_INDEX, renderResidualQuestions } from './self-grill.mjs';
import {
  SEED_REQUIRED_SECTIONS,
  SEED_TITLE_PREFIX,
  SEED_AUTHORING_SECTION_INDEXES,
  ALLOCATION_INDEX_HEADERS,
  SEED_FILE_NAME,
  assertSeedBodyValid,
} from './seed-model.mjs';

/**
 * Render the canonical RFC-SEED.md text for one package.
 *
 * The inputs are split by authority: `machine` holds the facts only the manifests
 * can supply, while the AI authors the prose and states the questions the seed must
 * answer. The machine appends those questions itself, so a grill question can never
 * be lost between the loop that raised it and the seed that must answer it.
 *
 * In reverse mode `machine` may also carry `reverseIndex` and `sidecarReference`.
 * Section 1 is then extended in place — the reverse index becomes a key inside the
 * existing machine block rather than a fifteenth heading, because `seed-parse.mjs`
 * enforces an exact heading count and a new heading would break the forward rotation.
 *
 * @param {{ package: object, machine: { manifest: object, expectedAllocation?: Array<object>, referenceBlock: object, contractEdges?: Array<object>, mode?: string, reverseIndex?: Array<object>, sidecarReference?: object }, aiSections?: object, residualQuestions?: Array<object> }} input
 * @returns {{ seedText: string, fileName: string }}
 * @throws {WorkSpacifyTreeError} gateId "G3.6" on a missing/invalid body, a machine-section override or a residual addressed elsewhere
 */
export function renderSeed({ package: pkg, machine, aiSections = {}, residualQuestions = [] }) {
  const { manifest, expectedAllocation = [], referenceBlock, contractEdges = [], mode, reverseIndex = null } = machine;
  assertNoMachineSectionOverride(pkg, aiSections);
  assertResidualsBelongToPackage(pkg, residualQuestions);

  const bodies = new Map();
  bodies.set(1, buildMachineSectionBody(extendReferenceBlock(referenceBlock, machine, mode, reverseIndex), pkg));
  bodies.set(2, buildContractSectionBody(pkg, contractEdges));
  bodies.set(3, buildAllocationSectionBody(expectedAllocation));
  for (const index of SEED_AUTHORING_SECTION_INDEXES) {
    const body = aiSections[index];
    if (typeof body !== 'string') {
      throw new WorkSpacifyTreeError(`aiSections is missing section ${index} for package ${pkg.id}`, { gateId: 'G3.6' });
    }
    bodies.set(index, index === GRILL_QUESTION_SECTION_INDEX ? appendResidualQuestions(body, residualQuestions) : body);
  }
  bodies.set(14, buildTraceIndexBody(manifest, expectedAllocation));

  const blocks = [];
  for (const section of SEED_REQUIRED_SECTIONS) {
    const body = bodies.get(section.index);
    const reason = assertSeedBodyValid(body);
    if (reason !== null) {
      throw new WorkSpacifyTreeError(`section ${section.index} of ${pkg.id} is invalid: ${reason}`, { gateId: 'G3.6' });
    }
    blocks.push(`## ${section.index}. ${section.title}\n\n${body.trim()}\n`);
  }
  return { seedText: `${SEED_TITLE_PREFIX}${pkg.name}\n\n${blocks.join('\n')}`, fileName: SEED_FILE_NAME };
}

/** The AI prose of the grill section, followed by the questions the machine carries. */
function appendResidualQuestions(prose, residualQuestions) {
  const block = renderResidualQuestions(residualQuestions);
  return block === '' ? prose : `${prose.trim()}\n\n${block}`;
}

/**
 * A residual addressed elsewhere belongs to the render of that other seed.
 *
 * Dropping it here would silently lose a question the human grill must answer, so
 * the mismatch stops the render instead.
 */
function assertResidualsBelongToPackage(pkg, residualQuestions) {
  for (const entry of residualQuestions) {
    if (entry?.package_id !== pkg.id) {
      throw new WorkSpacifyTreeError(
        `${entry?.id ?? 'a residual'} is addressed to ${entry?.package_id}, but this seed belongs to ${pkg.id}`,
        { gateId: 'G3.6' },
      );
    }
  }
}

/** Machine sections are not part of the AI surface; supplying one is an error. */
function assertNoMachineSectionOverride(pkg, aiSections) {
  for (const key of Object.keys(aiSections ?? {})) {
    if (!SEED_AUTHORING_SECTION_INDEXES.includes(Number(key))) {
      throw new WorkSpacifyTreeError(
        `aiSections must not carry section ${key} for package ${pkg.id}: sections 1 and 2 are machine-injected`,
        { gateId: 'G3.6' },
      );
    }
  }
}

/**
 * The section-1 block, extended with the reverse index when the run is in reverse mode.
 *
 * A forward render supplies no reverse field, so the block comes back as the very
 * object it went in as and the rendered bytes are the ones the forward rotation has
 * always produced. A render that supplies the index while claiming forward mode is
 * refused rather than quietly ignored.
 */
// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
function extendReferenceBlock(referenceBlock, machine, mode, reverseIndex) {
  const kind = FORWARD_ARTIFACT_KINDS.RFC_SEED;
  if (reverseIndex === null) {
    return extendForwardArtifacts(referenceBlock, { kind, mode, reverseFields: {} });
  }
  const extended = extendForwardArtifacts(referenceBlock, {
    kind,
    mode,
    reverseFields: { reverse_index: reverseIndex, sidecar_reference: machine.sidecarReference },
  });
  assertReverseAdditions(extended, kind);
  return extended;
}

// [::TICKET::] P22-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-10 --for-spec --no-implementation-order`.
function buildMachineSectionBody(referenceBlock, pkg) {
  if (!referenceBlock || typeof referenceBlock !== 'object') {
    throw new WorkSpacifyTreeError(`package ${pkg.id} has no reference block`, { gateId: 'G3.6' });
  }
  return [
    'The three reference paths, the verified implementation order and the contract ids below are',
    'machine-injected. Do not rewrite them: a disagreement with the manifests is a gate failure.',
    '',
    '```json',
    JSON.stringify(referenceBlock, null, 2),
    '```',
  ].join('\n');
}

function buildContractSectionBody(pkg, contractEdges) {
  if (contractEdges.length === 0) {
    return [
      'This package declares no external contract.',
      '',
      '```json',
      JSON.stringify(
        {
          schema_version: '1.0.0',
          seed_package: pkg.id,
          seed_path: pkg.path,
          no_external_contracts: true,
          no_external_contracts_reason: 'the stage-1 manifest declares no dependency boundary for this package',
          contract_edges: [],
        },
        null,
        2,
      ),
      '```',
    ].join('\n');
  }
  return [
    'The clause groups below are the coupling authority of this directory. The prose in sections 5, 6',
    'and 7-11 references these contract ids and must not contradict them.',
    '',
    '```json',
    JSON.stringify(
      {
        schema_version: '1.0.0',
        seed_package: pkg.id,
        seed_path: pkg.path,
        no_external_contracts: false,
        no_external_contracts_reason: null,
        contract_edges: contractEdges,
      },
      null,
      2,
    ),
    '```',
  ].join('\n');
}

function buildAllocationSectionBody(expectedAllocation) {
  const header = `### Allocation Index\n\n| ${ALLOCATION_INDEX_HEADERS.join(' | ')} |\n| --- | --- | --- |`;
  if (expectedAllocation.length === 0) {
    return `${header}\n\nnot_applicable — this package owns no stage-1 inventory item`;
  }
  const rows = expectedAllocation
    .map((item) => `| ${item.category} | ${item.inventory_ref} | ${item.canonical_name} |`)
    .join('\n');
  return `${header}\n${rows}\n\nEvery stage-1 segment this package touches is listed in section 14; the union across all seeds must cover the whole specification.`;
}

function buildTraceIndexBody(manifest, expectedAllocation) {
  if (expectedAllocation.length === 0) {
    return 'not_applicable — no inventory items assigned, so this package carries no source material';
  }
  return expectedAllocation
    .map((item) => {
      const record = lookupInventoryItem(manifest, item.category, item.inventory_ref);
      const refs = record?.source_refs ?? [];
      const segmentIds = [...new Set(refs.map((ref) => ref.segment_id).filter((id) => typeof id === 'string'))];
      const segments = segmentIds.length > 0 ? segmentIds.join(', ') : 'unresolved — REVIEW_REQUIRED';
      const firstRef = refs[0];
      const location = firstRef ? `L${firstRef.line_start}-${firstRef.line_end}` : 'location pending';
      return `- ${item.category}:${item.inventory_ref} (${item.canonical_name}) — segments ${segments} (${location})`;
    })
    .join('\n');
}
