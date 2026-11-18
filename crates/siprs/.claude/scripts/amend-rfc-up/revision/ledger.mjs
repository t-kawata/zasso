// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { canonicalJson, sha256Text } from './determinism.mjs';
import { failRevision } from './errors.mjs';

export function buildRevisionLedger({ baseline, plan, effective, authorizations }) {
  const rules = {};
  for (const [id, entry] of Object.entries(effective?.rules ?? {})) {
    rules[id] = {
      concept_id: entry.concept_id ?? null,
      status: entry.status ?? 'unchanged',
    };
  }
  const ledger = {
    schema: 'revision-ledger/v1',
    baseline: {
      version: baseline?.version ?? null,
      digest: baseline?.digest ?? null,
    },
    revision: {
      sha256: plan?.revision?.sha256 ?? plan?.revision?.document_sha256 ?? null,
      plan_sha256: plan?.revision?.plan_sha256 ?? null,
    },
    rules,
    authorizations: authorizations?.authorizations ?? [],
    counts: {
      unchanged: Object.values(rules).filter((entry) => entry.status === 'unchanged').length,
      updated: Object.values(rules).filter((entry) => entry.status === 'updated').length,
      added: Object.values(rules).filter((entry) => entry.status === 'added').length,
      retired: 0,
    },
  };
  return { ...ledger, ledger_sha256: hashLedger(ledger) };
}

export function hashLedger(ledger) {
  const { ledger_sha256, ...withoutHash } = ledger;
  return sha256Text(canonicalJson(withoutHash));
}

export function assertLedger(ledger) {
  if (!ledger || ledger.schema !== 'revision-ledger/v1') {
    failRevision('REVISION_LEDGER_DRIFT', 'ledger is missing or invalid', { target: 'ledger' });
  }
  if (hashLedger(ledger) !== ledger.ledger_sha256) {
    failRevision('REVISION_LEDGER_DRIFT', 'ledger hash does not match the canonical ledger', { target: 'ledger_sha256' });
  }
  return true;
}
