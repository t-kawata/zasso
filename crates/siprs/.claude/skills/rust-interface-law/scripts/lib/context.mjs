// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sha256 } from './redact.mjs';

export function deliverContext({ manifest, phase, ledgerPath, replay = false }) {
  const phases = manifest.phases ?? [];
  const index = phases.indexOf(phase);
  if (index < 0) throw new Error('unknown phase: ' + phase);

  const ledger = existsSync(ledgerPath)
    ? JSON.parse(readFileSync(ledgerPath, 'utf8'))
    : { phases: [] };

  const predecessor = phases[index - 1];
  if (predecessor && !replay && !ledger.phases.includes(predecessor)) {
    throw new Error('predecessor phase not delivered: ' + predecessor);
  }

  const nodes = (manifest.nodes ?? [])
    .filter((node) => node.phase === phase && node.delivery === 'must')
    .map((node) => ({
      id: node.id,
      concept_id: node.concept_id ?? null,
      content_sha256: node.content_sha256 ?? sha256(node.body ?? ''),
      body: node.body ?? '',
      outgoing: node.outgoing ?? [],
      incoming: node.incoming ?? [],
      sources: node.sources ?? [],
      trustTier: node.trustTier ?? 'unverified',
      freshness: node.freshness ?? null,
    }));

  const hash = sha256(nodes.map((node) => node.id + '\0' + node.content_sha256).join('\n'));
  if (!ledger.phases.includes(phase)) {
    ledger.phases.push(phase);
    writeAtomic(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
  }

  return { phase, nodes, hash };
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + '.tmp';
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}
