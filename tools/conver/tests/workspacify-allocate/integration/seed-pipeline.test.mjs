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
    3: 'Note: allocation table above is authoritative.',
    4: 'Body 4.', 5: 'Body 5.', 6: 'Body 6.', 7: 'Integration context prose.',
    8: 'not_applicable — no state.', 9: 'not_applicable — no I/O.', 10: 'Body 10.',
    11: 'Body 11.', 12: 'Body 12.', 13: 'Grill question.', 15: 'Body 15.',
  };
}

test('IT packet -> render -> parse -> parity over a real co-located spec', () => {
  const { manifest, packages, entries } = buildSeedFixture();
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
      assert.equal(packet.ownedItems.length, expectedByPackage.get(pkg.id).length);
      const { seedText } = renderSeed({ package: pkg, manifest: loaded, expectedAllocation: expectedByPackage.get(pkg.id), aiSections: aiSectionsFor() });
      parsedByPackage.set(pkg.id, parseSeed(seedText).allocationIndexRows);
    }
    const report = runSeedParity({ expectedByPackage, parsedByPackage });
    assert.equal(report.ok, true, JSON.stringify(report));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
