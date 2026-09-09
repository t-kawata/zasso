// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-190 @verifies C003
/**
 * RFC-SEED.md rendering (corrected ALLOCATE §10.1-§10.3).
 *
 * The machine scaffolds the deterministic sections (identity, ownership,
 * Allocation Index, source trace index) and places AI-authored prose for the
 * semantic sections. A body the AI did not author is never fabricated: the
 * render refuses to emit a seed with a missing or empty semantic section.
 */
import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';
import { lookupInventoryItem } from './allocation-model.mjs';
import { SEED_REQUIRED_SECTIONS, SEED_TITLE_PREFIX, ALLOCATION_INDEX_HEADERS, SEED_FILE_NAME, assertSeedBodyValid } from './seed-model.mjs';

/** Sections whose prose only the AI can author. */
const AI_AUTHORED_SECTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15];

/**
 * Render the canonical RFC-SEED.md text for one package.
 *
 * @param {{ package: object, manifest: object, expectedAllocation: Array<object>, aiSections: object }} input
 * @returns {{ seedText: string, fileName: string }}
 * @throws {WorkSpacifyTreeError} gateId "G3.6" on a missing/invalid body
 */
export function renderSeed({ package: pkg, manifest, expectedAllocation = [], aiSections = {} }) {
  const bodies = new Map();
  bodies.set(1, buildIdentityBody(pkg));
  bodies.set(2, buildOwnershipBody(expectedAllocation));
  bodies.set(3, buildAllocationMaterialBody(expectedAllocation, aiSections[3]));
  for (const index of AI_AUTHORED_SECTIONS) {
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

function buildIdentityBody(pkg) {
  return [
    `- package id: ${pkg.id}`,
    `- name: ${pkg.name}`,
    `- path: ${pkg.path}`,
    `- layer: ${pkg.layer}`,
    `- kind: ${pkg.kind}`,
    `- seed_required: ${pkg.seed_required}`,
    '- status: allocated (input for the per-directory grill)',
  ].join('\n');
}

function buildOwnershipBody(expectedAllocation) {
  if (expectedAllocation.length === 0) {
    return 'not_applicable — no stage-1 owned items';
  }
  const lines = expectedAllocation.map((item) => `- ${item.category}: ${item.inventory_ref} (${item.canonical_name})`);
  lines.push('Forbidden ownership: this seed must not claim items stage-1 assigned to another package.');
  return lines.join('\n');
}

function buildAllocationMaterialBody(expectedAllocation, note) {
  const header = `### Allocation Index\n\n| ${ALLOCATION_INDEX_HEADERS.join(' | ')} |\n| --- | --- | --- |`;
  const rows = expectedAllocation.map((item) => `| ${item.category} | ${item.inventory_ref} | ${item.canonical_name} |`).join('\n');
  const table = expectedAllocation.length === 0 ? header : `${header}\n${rows}`;
  return typeof note === 'string' && note.trim().length > 0 ? `${table}\n\n${note.trim()}` : table;
}

function buildTraceIndexBody(manifest, expectedAllocation) {
  if (expectedAllocation.length === 0) {
    return 'not_applicable — no inventory items assigned';
  }
  const lines = expectedAllocation.map((item) => {
    const record = lookupInventoryItem(manifest, item.category, item.inventory_ref);
    const ref = record?.source_refs?.[0];
    if (ref) {
      return `- ${item.inventory_ref} (${item.category}): section ${ref.section_id ?? '?'} L${ref.line_start}-${ref.line_end}`;
    }
    return `- ${item.inventory_ref} (${item.category}): source refs pending — REVIEW_REQUIRED`;
  });
  return lines.join('\n');
}
