// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Text } from '../revision/determinism.mjs';

export function writePreOkfOriginalV2({ baselineSkill, documentText, documentAlias, outDir }) {
  const baselineOriginalPath = join(baselineSkill, 'PRE-OKF-ORIGINAL.md');
  const baselineOriginal = existsSync(baselineOriginalPath) ? readFileSync(baselineOriginalPath, 'utf8') : '';
  const combined = [
    `<!-- pre-okf-baseline: ${documentAlias} sha256=${sha256Text(baselineOriginal)} -->`,
    baselineOriginal,
    `<!-- pre-okf-revision: ${documentAlias} sha256=${sha256Text(documentText)} -->`,
    documentText,
  ].join('\n');
  writeFileSync(join(outDir, 'PRE-OKF-ORIGINAL.md'), combined);
  const record = {
    schema: 'pre-okf-original/v2',
    sources: [
      { role: 'baseline', alias: documentAlias, sha256: sha256Text(baselineOriginal), bytes: Buffer.byteLength(baselineOriginal) },
      { role: 'revision', alias: documentAlias, sha256: sha256Text(documentText), bytes: Buffer.byteLength(documentText) },
    ],
    sha256: sha256Text(combined),
    bytes: Buffer.byteLength(combined),
  };
  writeFileSync(join(outDir, 'source/pre-okf-original.json'), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
