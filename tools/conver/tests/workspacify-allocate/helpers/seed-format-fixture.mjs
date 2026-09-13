/**
 * Fixtures for the seed-format compatibility tests.
 *
 * A seed's format is declared in its first section's machine block, and the
 * declaration is the only evidence the parser is allowed to read: inferring the
 * format from the heading count would make the check unfalsifiable, because the
 * count is the very property the format defines. So every fixture here starts
 * from a really rendered current-format seed and mutates exactly one property of
 * it, which keeps each fixture wrong in exactly one way.
 *
 * The mutation helpers work on the rendered text rather than on the machine
 * object, because what the parser reads is the text on disk and nothing else.
 */
import { renderSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-render.mjs';
import { CURRENT_SEED_FORMAT_VERSION, SEED_FORMAT_MARKER, SEED_REQUIRED_SECTIONS } from '../../../.claude/scripts/workspacify-allocate/lib/seed-model.mjs';
import { sidecarReference } from '../../../.claude/scripts/workspacify-allocate/lib/forward-extensions.mjs';
import { buildValidManifest, baseAiSections } from './build-valid-manifest.mjs';

/** The three planned package directories the reverse gates judge against. */
export const PLANNED_PATHS = Object.freeze(['crates', 'crates/protocol', 'crates/protocol/alpha']);

/** The top-level directories of the fixture subject. */
export const FIXTURE_TOP_LEVEL_DIRECTORIES = Object.freeze(['crates', 'src', 'tests']);

/** The sidecar bundle the reverse render resolves against. */
export const SIDECAR_BUNDLE_HASH = 'c'.repeat(64);

/** The first package of the shared manifest, plus the machine inputs a render needs. */
export function seedFixture() {
  const { manifest } = buildValidManifest();
  const pkg = manifest.workspace.packages[0];
  const referenceBlock = {
    package: { id: pkg.id, name: pkg.name, path: pkg.path },
    source_spec: { path: 'spec.md', sha256: manifest.input.source_hash },
    stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: manifest.integrity.manifest_hash },
  };
  return { manifest, pkg, referenceBlock, expectedAllocation: [] };
}

/** A forward render: the format the forward rotation has always produced. */
export function renderCurrentSeed() {
  const { manifest, pkg, referenceBlock, expectedAllocation } = seedFixture();
  return renderSeed({
    package: pkg,
    machine: { manifest, expectedAllocation, referenceBlock, contractEdges: [] },
    aiSections: baseAiSections(),
  }).seedText;
}

/** A reverse render, which is the one that declares the format it wrote. */
export function renderReverseSeed({ reverseIndex = [] } = {}) {
  const { manifest, pkg, referenceBlock, expectedAllocation } = seedFixture();
  return renderSeed({
    package: pkg,
    machine: {
      manifest,
      expectedAllocation,
      referenceBlock,
      contractEdges: [],
      mode: 'reverse',
      reverseIndex,
      sidecarReference: sidecarReference({ bundleHash: SIDECAR_BUNDLE_HASH, counts: { claims: 1 } }),
    },
    aiSections: baseAiSections(),
  }).seedText;
}

/** A heading line, as the parser reads it: `## N. Title` in document order. */
const HEADING_LINE = /^## (\d+)\. (.+?)\s*$/;

/** Where the first fenced json block sits inside the text. */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
function locateFirstJsonBlock(seedText) {
  const opener = seedText.indexOf('```json\n');
  const bodyStart = opener + '```json\n'.length;
  const closer = seedText.indexOf('```', bodyStart);
  return { bodyStart, closer };
}

/** Replace the first fenced json block's contents, keeping every other byte. */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
function replaceFirstJsonBlock(seedText, replacement) {
  const { bodyStart, closer } = locateFirstJsonBlock(seedText);
  return `${seedText.slice(0, bodyStart)}${replacement}${seedText.slice(closer)}`;
}

/**
 * Declare a machine-block field the writer did not write.
 *
 * The block is re-serialised so the result stays valid JSON: the point of the
 * fixture is the declaration, not a syntax error.
 */
export function withMachineField(seedText, key, value) {
  const { bodyStart, closer } = locateFirstJsonBlock(seedText);
  const block = JSON.parse(seedText.slice(bodyStart, closer));
  block[key] = value;
  return replaceFirstJsonBlock(seedText, JSON.stringify(block, null, 2));
}

/** Declare the same field twice, which is malformed rather than ambiguous. */
export function withDuplicateMachineField(seedText, key, first, second) {
  const { bodyStart, closer } = locateFirstJsonBlock(seedText);
  const block = seedText.slice(bodyStart, closer);
  const duplicated = `${block.slice(0, block.indexOf('{') + 1)}\n`
    + `  ${JSON.stringify(key)}: ${JSON.stringify(first)},\n`
    + `  ${JSON.stringify(key)}: ${JSON.stringify(second)},${block.slice(block.indexOf('{') + 1)}`;
  return replaceFirstJsonBlock(seedText, duplicated);
}

/**
 * A reverse render whose declaration has been replaced.
 *
 * The reverse render is the one that carries both a declaration and the reverse
 * index A4 demands, so replacing only the declared version leaves exactly one
 * property under test.
 */
export function declaredReverseSeed(version = CURRENT_SEED_FORMAT_VERSION) {
  return withMachineField(renderReverseSeed(), SEED_FORMAT_MARKER, version);
}

/** Remove section 1's json block entirely, fences included: the machine block is absent. */
export function stripMachineJsonBlock(seedText) {
  const { bodyStart, closer } = locateFirstJsonBlock(seedText);
  const opener = bodyStart - '```json\n'.length;
  return `${seedText.slice(0, opener)}${seedText.slice(closer + '```'.length)}`;
}

/** Corrupt section 1's json block, so nothing can be read from it. */
export function corruptMachineJson(seedText) {
  return replaceFirstJsonBlock(seedText, '{ this is not json');
}

/** The line number of the heading carrying one index. */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
function headingLineOf(lines, wantedIndex) {
  return lines.findIndex((line) => {
    const match = HEADING_LINE.exec(line);
    return match !== null && Number.parseInt(match[1], 10) === wantedIndex;
  });
}

/** Replace two headings with each other's text, keeping the remaining lines as they are. */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
function transposeHeadings(seedText, firstIndex, secondIndex, describe) {
  const lines = seedText.split('\n');
  const firstLine = headingLineOf(lines, firstIndex);
  const secondLine = headingLineOf(lines, secondIndex);
  const first = HEADING_LINE.exec(lines[firstLine]);
  const second = HEADING_LINE.exec(lines[secondLine]);
  lines[firstLine] = describe(first, second);
  lines[secondLine] = describe(second, first);
  return lines.join('\n');
}

/** Swap two headings' titles, keeping their indices: the defect names both titles. */
export function swapHeadingTitles(seedText, firstIndex, secondIndex) {
  return transposeHeadings(seedText, firstIndex, secondIndex, (self, other) => `## ${self[1]}. ${other[2]}`);
}

/** Swap two headings' index numbers, keeping their titles: the defect names the index. */
export function swapHeadingIndexes(seedText, firstIndex, secondIndex) {
  return transposeHeadings(seedText, firstIndex, secondIndex, (self, other) => `## ${other[1]}. ${self[2]}`);
}

/**
 * Re-address a rendered seed's headings to another declared format.
 *
 * The bodies are kept byte for byte, so the only difference between the two
 * seeds is the format they are written in — which is what makes the older-format
 * case a test of the parser rather than a test of the renderer.
 */
export function renderSeedUnderFormat(format, source = renderCurrentSeed()) {
  const lines = source.split('\n');
  const headingPositions = lines
    .map((line, position) => (HEADING_LINE.test(line) ? position : -1))
    .filter((position) => position !== -1);
  const firstDroppedHeading = headingPositions[format.sections.length];
  const kept = firstDroppedHeading === undefined ? [...lines] : lines.slice(0, firstDroppedHeading);
  for (let ordinal = 0; ordinal < format.sections.length; ordinal += 1) {
    const [, , title] = HEADING_LINE.exec(lines[headingPositions[ordinal]]);
    kept[headingPositions[ordinal]] = `## ${format.sections[ordinal].index}. ${title}`;
  }
  return kept.join('\n');
}

/** A declared format that is not the current one, built from the current sections. */
export function olderFormatRow({ version = '0.9.0', count = 12, baseIndex = 21 } = {}) {
  return {
    version,
    sections: SEED_REQUIRED_SECTIONS.slice(0, count).map((section, position) => ({
      index: baseIndex + position,
      title: section.title,
    })),
    machineSectionIndex: baseIndex,
  };
}

/** A packet that carries the incoming-dependency excerpt A3 demands. */
export function packetWithExcerpt({ packageId = 'pkg-alpha' } = {}) {
  return {
    package: { id: packageId },
    incoming_boundary_count: 1,
    incoming_dependency_excerpts: [
      { contract_id: 'contract-1', consumer_package: 'pkg-beta', excerpt: 'see the consumer' },
    ],
  };
}
