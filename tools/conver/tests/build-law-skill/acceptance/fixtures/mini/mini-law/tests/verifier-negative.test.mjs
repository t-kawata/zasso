import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
test('every v2 artifact exists', () => {
  for (const artifact of ['source/input-ledger.json', 'source/redaction.review.json', 'source/normative-inventory.json', 'source/delivery.json', 'okf/source.md', 'okf/source.baseline.md']) {
    assert.ok(existsSync(join(root, artifact)), artifact);
  }
});
