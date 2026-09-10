// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-190 @verifies C001 C002 C003 C004 C005
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readManifestSource, loadTreeManifest } from '../../../.claude/scripts/workspacify-allocate/lib/tree-manifest-input.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { normalizeTextBytes } from '../../../.claude/scripts/workspacify-tree/lib/normalization.mjs';
import { deriveExpectedAllocation } from '../../../.claude/scripts/workspacify-allocate/lib/allocation-model.mjs';
import { buildAuthoringPacket } from '../../../.claude/scripts/workspacify-allocate/lib/seed-authoring-packet.mjs';
import { renderSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-render.mjs';
import { parseSeed } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parse.mjs';
import { runSeedParity } from '../../../.claude/scripts/workspacify-allocate/lib/seed-parity.mjs';
import { buildSeedFixture } from '../helpers/build-valid-manifest.mjs';

function aiSectionsFor() {
  return {
    4: 'Body 4.', 5: 'Body 5.', 6: 'Body 6.', 7: 'not_applicable — no mutable state.',
    8: 'not_applicable — no external I/O.', 9: 'Body 9.', 10: 'Body 10.',
    11: 'Body 11.', 12: 'Body 12.', 13: 'Body 13.',
  };
}

test('IT packet -> render -> parse -> parity over a real co-located spec', () => {
  const { manifest } = buildSeedFixture();
  const packages = manifest.workspace.packages;
  const entries = manifest.workspace.ownership.entries;
  const dir = mkdtempSync(join(tmpdir(), 'wt-190-it-'));
  try {
    const specText = '# Spec\n\n## Chapter\n\nAlpha Record\n\nBeta Claim\n';
    manifest.input.source_hash = sha256Hex(normalizeTextBytes(Buffer.from(specText)).bytes);
    writeFileSync(join(dir, 'spec.md'), specText);
    const manifestPath = join(dir, 'WORKSPACIFY-TREE-MANIFEST.json');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const loaded = loadTreeManifest(manifestPath);
    const { sourceText } = readManifestSource(loaded, dir);

    const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: entries, packages });
    const parsedByPackage = new Map();
    for (const pkg of packages) {
      const packet = buildAuthoringPacket({ manifest: loaded, sourceText, packageId: pkg.id });
      assert.equal(packet.owned_items.length, expectedByPackage.get(pkg.id).length);
      const { seedText } = renderSeed({
        package: pkg,
        machine: {
          manifest: loaded,
          expectedAllocation: expectedByPackage.get(pkg.id),
          contractEdges: [],
          referenceBlock: {
            package: { id: pkg.id, name: pkg.name, path: pkg.path, layer: pkg.layer, kind: pkg.kind, responsibilities: pkg.responsibilities },
            source_spec: { path: loaded.input.spec_path, sha256: loaded.input.source_hash },
            stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: loaded.integrity.manifest_hash },
            stage2_manifest: { path: 'WORKSPACIFY-ALLOCATE-MANIFEST.json' },
            implementation_order: { before: [], after: [], parallel_with: [], serial_index: 0, wave: 0 },
            contract_refs: [],
            source_segments: [],
          },
        },
        aiSections: aiSectionsFor(),
      });
      parsedByPackage.set(pkg.id, parseSeed(seedText).allocationIndexRows);
    }
    const report = runSeedParity({ expectedByPackage, parsedByPackage });
    assert.equal(report.ok, true, JSON.stringify(report));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
