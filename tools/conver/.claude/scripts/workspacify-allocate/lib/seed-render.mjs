// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
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
import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';
import { lookupInventoryItem } from './allocation-model.mjs';
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
 * @param {{ package: object, manifest: object, expectedAllocation: Array<object>, referenceBlock: object, contractEdges: Array<object>, aiSections: object }} input
 * @returns {{ seedText: string, fileName: string }}
 * @throws {WorkSpacifyTreeError} gateId "G3.6" on a missing/invalid body or a machine-section override
 */
export function renderSeed({
  package: pkg,
  manifest,
  expectedAllocation = [],
  referenceBlock,
  contractEdges = [],
  aiSections = {},
}) {
  assertNoMachineSectionOverride(pkg, aiSections);

  const bodies = new Map();
  bodies.set(1, buildMachineSectionBody(referenceBlock, pkg));
  bodies.set(2, buildContractSectionBody(pkg, contractEdges));
  bodies.set(3, buildAllocationSectionBody(expectedAllocation));
  for (const index of SEED_AUTHORING_SECTION_INDEXES) {
    const body = aiSections[index];
    if (typeof body !== 'string') {
      throw new WorkSpacifyTreeError(`aiSections is missing section ${index} for package ${pkg.id}`, { gateId: 'G3.6' });
    }
    bodies.set(index, body);
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
