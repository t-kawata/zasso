// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
// PX-374 maintenance script: rebuild the no-history frame golden.
// Run from the repository root:
//   node tests/conver/fixtures/generate-no-history-frames.mjs
import fs from 'node:fs';
import path from 'node:path';

import { analyzeWorkspace } from '../../../.claude/scripts/conver/draw-progress-gif.js';
import { buildFrames } from '../../../.claude/scripts/conver/progress-gif/loop.js';
import { writeWorkspace } from '../fixtures.mjs';

const root = writeWorkspace({
  packages: [{ id: 'pkg-1', path: 'pkg-1' }],
  files: {
    'pkg-1/Tickets.json': {
      metadata: { generatedAt: '2026-11-01T00:00:00.000Z' },
      phases: [{
        id: 0,
        tickets: [{
          id: 1,
          phaseId: 0,
          status: 'reviewed',
          title: 't',
          created_at: '2026-11-01T00:00:00.000Z',
          completedAt: '2026-11-02T00:00:00.000Z',
          contracts: [{ id: 'C1' }],
        }],
      }],
    },
  },
});

const model = analyzeWorkspace(root, { sourceScan: false });
const frames = buildFrames(model, { frames: 20 });
const target = path.join(import.meta.dirname, 'no-history-frames.json');
fs.writeFileSync(target, `${JSON.stringify(frames, null, 2)}\n`, 'utf8');
process.stdout.write(`${target}\n`);
