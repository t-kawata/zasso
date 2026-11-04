// PX-359 @verifies C001
// [::TICKET::] PX-359 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-359 --for-spec --no-implementation-order`.
/**
 * A workspace whose three recordings of one specification agree by construction.
 *
 * The tests need to move one record at a time. Building the whole fixture from the
 * specification bytes means a test that changes a hash changes exactly one thing, not
 * a hand-copied expected value somewhere else.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';

export const SPEC_TEXT = [
  '# Specification',
  '',
  '\\[ M=2^b \\]',
  '',
  'The inline identity is \\( N=K+1 \\).',
  '',
].join('\n');

export const SPEC_PATH = 'specs/GaiaSekkeiShiyousho.md';
export const SPEC_RELATIVE_TO_ROOT = 'specs/GaiaSekkeiShiyousho.md';
export const PACKAGE_DIRECTORY = 'crates/alpha';
export const TREE_SEGMENT_ID = 'seg-1';

export function specBytes() {
  return Buffer.from(SPEC_TEXT, 'utf8');
}

export function specSha() {
  return sha256Hex(specBytes());
}

export function buildWorkspace({ infoSha = specSha(), seedSha = specSha(), sequencesSha = specSha(), statusMaterialPaths = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'spec-formula-'));
  const packageDirectory = join(root, PACKAGE_DIRECTORY);
  mkdirSync(packageDirectory, { recursive: true });
  mkdirSync(join(root, 'specs'), { recursive: true });
  writeFileSync(join(root, SPEC_PATH), SPEC_TEXT, 'utf8');

  writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
    structure: {
      segments: [{ id: TREE_SEGMENT_ID, line_start: 1, line_end: 6 }],
    },
    integrity: { manifest_hash: 'f'.repeat(64) },
  }, null, 2));
  writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ seed_index: [] }, null, 2));
  writeFileSync(join(root, 'workspace-sequences.json'), JSON.stringify({
    spec: { path: 'GaiaSekkeiShiyousho.md', sha256: sequencesSha, lines: SPEC_TEXT.split('\n').length },
  }, null, 2));

  writeFileSync(join(packageDirectory, 'RFC-SEED.md'), [
    '# RFC Seed: alpha',
    '',
    '## 1. Identity and Position in the Whole System',
    '',
    '```json',
    JSON.stringify({
      package: { id: 'pkg-0001', name: 'alpha', path: PACKAGE_DIRECTORY },
      source_spec: { path: SPEC_RELATIVE_TO_ROOT, sha256: seedSha },
      source_segments: [TREE_SEGMENT_ID],
      stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: 'f'.repeat(64) },
    }, null, 2),
    '```',
    '',
  ].join('\n'), 'utf8');

  writeFileSync(join(packageDirectory, 'INFO-RFC-SEED.md'), [
    '## 1. What this document verified',
    '',
    `- specification: \`${SPEC_RELATIVE_TO_ROOT}\` (sha256 \`${infoSha}\`)`,
    '',
  ].join('\n'), 'utf8');

  writeFileSync(join(packageDirectory, 'Status.json'), JSON.stringify({
    state: 'GRILLING',
    researchPath: statusMaterialPaths[0] ?? '',
    materialPaths: statusMaterialPaths,
  }, null, 2));

  return { root, packageDirectory };
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
