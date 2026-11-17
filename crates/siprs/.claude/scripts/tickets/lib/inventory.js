'use strict';

/**
 * PX-436 — clause inventory.
 *
 * The inventory is generated from the project's normative artifacts only. Every
 * source element is accounted for exactly once: emitted as a clause or excluded
 * with a reason. A source element that disappears from that arithmetic is a
 * blocking finding, because a broken enumerator would otherwise make coverage
 * look complete.
 */

const { createHash } = require('node:crypto');
const {
  DEFAULT_ELEMENTS,
  clauseKey,
  compareClauseKeys,
  isNonEmptyText,
  normalizeClauseText,
  textHash,
} = require('./contract-clause.js');

/** Default identity scope when an adapter declares none. */
const DEFAULT_CONTRACT_ID_SCOPE = 'global';

/** Finding code emitted when a source element is neither emitted nor excluded. */
const INVENTORY_SOURCE_UNACCOUNTED = 'INVENTORY_SOURCE_UNACCOUNTED';

/** Finding code emitted when no normative source yields a clause. */
const REPAIR_REQUIRED = 'REPAIR_REQUIRED';

/** Finding code emitted when copies of one global contract disagree. */
const CLAUSE_TEXT_CONFLICT = 'CLAUSE_TEXT_CONFLICT';

/** Whether a value is a non-empty string. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** The element vocabulary an adapter declares, or the default. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function elementsOf(adapter) {
  const declared = Array.isArray(adapter?.elements) ? adapter.elements : DEFAULT_ELEMENTS;
  return declared.filter(isNonEmptyString);
}

/** A contract-id scope, defaulting to the backward-compatible global rule. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function contractIdScopeOf(adapter) {
  return adapter?.contractIdScope === 'local' ? 'local' : DEFAULT_CONTRACT_ID_SCOPE;
}

/** A stable digest of one artifact's content. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function artifactDigest(source) {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

/**
 * Enumerate every source element, including empty ones.
 *
 * Empty elements are kept so reconciliation can exclude them explicitly. A
 * contract field outside the adapter's element vocabulary is not a source
 * element and is not counted.
 *
 * @param {{adapter: object, sources: object[]}} input
 * @returns {{elements: object[], artifacts: object[]}}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function enumerateSourceElements({ adapter, sources }) {
  const elements = [];
  const artifacts = [];
  const vocabulary = elementsOf(adapter);

  for (const source of Array.isArray(sources) ? sources : []) {
    const artifact = source?.artifact ?? source?.kind ?? 'source';
    artifacts.push({ kind: source?.kind ?? 'unknown', path: artifact, digest: artifactDigest(source) });

    if (source?.kind === 'graph') {
      for (const edge of source.edges ?? []) {
        for (const contract of edge.contracts ?? []) {
          for (const element of vocabulary) {
            elements.push({
              contractId: String(contract.id ?? ''),
              element,
              text: contract[element] ?? '',
              ordinal: null,
              ticketKey: null,
              source: { artifact, locator: (edge.id ?? 'edge') + '/' + String(contract.id ?? '') + '/' + element },
            });
          }
        }
      }
      continue;
    }

    if (source?.kind === 'tickets') {
      for (const ticket of source.tickets ?? []) {
        for (const contract of ticket.contracts ?? []) {
          for (const element of vocabulary) {
            elements.push({
              contractId: String(contract.id ?? ''),
              element,
              text: contract[element] ?? '',
              ordinal: null,
              ticketKey: ticket.key ?? null,
              source: { artifact, locator: String(ticket.key ?? 'ticket') + '/' + String(contract.id ?? '') + '/' + element },
            });
          }
        }
      }
      continue;
    }

    if (source?.kind === 'spec') {
      for (const contract of source.contracts ?? []) {
        for (const element of vocabulary) {
          elements.push({
            contractId: String(contract.id ?? ''),
            element,
            text: contract[element] ?? '',
            ordinal: null,
            ticketKey: contract.ticketKey ?? null,
            source: { artifact, locator: String(contract.id ?? '') + '/' + element },
          });
        }
      }
      continue;
    }

    if (source?.kind === 'manifest') {
      (source.clauses ?? []).forEach((clause, index) => {
        elements.push({
          contractId: String(clause.contractId ?? clause.id ?? ''),
          element: String(clause.element ?? ''),
          text: clause.text ?? '',
          ordinal: Number.isInteger(clause.ordinal) ? clause.ordinal : null,
          ticketKey: clause.ticketKey ?? null,
          source: { artifact, locator: artifact + '#' + String(index) },
        });
      });
    }
  }

  return { elements, artifacts };
}

/**
 * Group source elements into canonical clauses.
 *
 * The same key is one clause. Owners merge across ticket copies; sources merge
 * across normative artifacts. Empty text is excluded with a reason, never
 * emitted as an empty clause.
 *
 * @param {{adapter: object, elements: object[]}} input
 * @returns {{clauses: object[], exclusions: object[]}}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function buildClauses({ adapter, elements }) {
  const scope = adapter?.scope ?? 'package';
  const byKey = new Map();
  const exclusions = [];

  for (const element of elements) {
    if (!isNonEmptyString(element.contractId) || !isNonEmptyString(element.element)) {
      exclusions.push({
        contractId: element.contractId ?? '',
        element: element.element ?? '',
        ordinal: element.ordinal ?? null,
        reason: 'invalid-element-identity',
        source: element.source,
      });
      continue;
    }
    if (!isNonEmptyText(element.text)) {
      exclusions.push({
        contractId: element.contractId,
        element: element.element,
        ordinal: element.ordinal ?? null,
        reason: 'empty-element',
        source: element.source,
      });
      continue;
    }

    const normalized = normalizeClauseText(element.text);
    const key = clauseKey({
      scope,
      contractId: element.contractId,
      element: element.element,
      ordinal: element.ordinal ?? null,
      text: normalized,
    });
    const existing = byKey.get(key);
    const source = element.source;
    const owner = element.ticketKey;
    if (existing === undefined) {
      byKey.set(key, {
        key,
        scope,
        contractId: element.contractId,
        element: element.element,
        ordinal: element.ordinal ?? null,
        text: String(element.text),
        normalizedText: normalized,
        textHash: textHash(normalized),
        applicability: adapter?.applicability ?? null,
        source: [source],
        owners: owner ? [owner] : [],
      });
      continue;
    }
    if (!existing.source.some((entry) => entry.artifact === source.artifact && entry.locator === source.locator)) {
      existing.source.push(source);
    }
    if (owner && !existing.owners.includes(owner)) existing.owners.push(owner);
  }

  const clauses = [...byKey.values()].map((clause) => ({
    ...clause,
    source: [...clause.source].sort((left, right) => compareClauseKeys(left.artifact + '/' + left.locator, right.artifact + '/' + right.locator)),
    owners: [...clause.owners].sort(compareClauseKeys),
  }));
  clauses.sort((left, right) => compareClauseKeys(left.key, right.key));
  return { clauses, exclusions };
}

/**
 * Detect conflicting copies of one global contract.
 *
 * In global scope, two texts for the same contract element are one contract
 * that disagrees with itself. In local scope they are two distinct clauses, so
 * there is nothing to reconcile.
 *
 * @param {{adapter: object, clauses: object[]}} input
 * @returns {object[]}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function detectConflicts({ adapter, clauses }) {
  if (contractIdScopeOf(adapter) !== 'global') return [];

  const groups = new Map();
  for (const clause of clauses) {
    const groupKey = [clause.contractId, clause.element, clause.ordinal ?? ''].join('|');
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(clause);
  }

  const conflicts = [];
  for (const group of groups.values()) {
    const hashes = [...new Set(group.map((clause) => clause.textHash))].sort(compareClauseKeys);
    if (hashes.length <= 1) continue;
    const first = group[0];
    conflicts.push({
      code: CLAUSE_TEXT_CONFLICT,
      class: 'must-fix',
      contractId: first.contractId,
      element: first.element,
      ordinal: first.ordinal,
      textHashes: hashes,
      keys: group.map((clause) => clause.key).sort(compareClauseKeys),
      sources: group.flatMap((clause) => clause.source),
      problem: 'contract ' + first.contractId + ' ' + first.element + ' has ' + String(hashes.length) + ' differing texts',
    });
  }
  return conflicts.sort((left, right) => compareClauseKeys(left.keys[0], right.keys[0]));
}

/**
 * Reconcile the source population against the emitted and excluded sets.
 *
 * @param {{sourceElements: object[], clauses: object[], exclusions: object[]}} input
 * @returns {{sourceElements:number, emitted:number, excluded:number, unaccounted:number, exclusions:object[], findings:object[]}}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function reconcileSource({ sourceElements, clauses, exclusions }) {
  const total = Array.isArray(sourceElements) ? sourceElements.length : 0;
  const emitted = Array.isArray(clauses) ? clauses.length : 0;
  const excluded = Array.isArray(exclusions) ? exclusions.length : 0;
  const unaccounted = total - emitted - excluded;
  const findings = unaccounted === 0 ? [] : [{
    code: INVENTORY_SOURCE_UNACCOUNTED,
    class: 'must-fix',
    problem: String(unaccounted) + ' source element(s) were neither emitted nor explicitly excluded',
    unaccounted,
  }];

  return { sourceElements: total, emitted, excluded, unaccounted, exclusions: exclusions ?? [], findings };
}

/**
 * The digest of an inventory's clause content.
 *
 * Only content that defines an obligation participates: key, text hash,
 * sorted owners and sorted source locators. Arrays and sources are sorted, so
 * two enumerations of the same population agree.
 *
 * @param {object[]} clauses
 * @returns {string}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function inventoryDigest(clauses) {
  const canonical = [...(clauses ?? [])]
    .map((clause) => ({
      key: clause.key,
      textHash: clause.textHash,
      text: normalizeClauseText(clause.text),
      owners: [...(clause.owners ?? [])].sort(compareClauseKeys),
      source: [...(clause.source ?? [])]
        .map((entry) => entry.artifact + '/' + entry.locator)
        .sort(compareClauseKeys),
    }))
    .sort((left, right) => compareClauseKeys(left.key, right.key));
  return 'sha256:' + createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Build one inventory from its normative sources.
 *
 * @param {{adapter: object, sources: object[]}} input
 * @returns {object}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function buildInventory({ adapter = {}, sources = [] } = {}) {
  const { elements, artifacts } = enumerateSourceElements({ adapter, sources });
  const { clauses, exclusions } = buildClauses({ adapter, elements });
  const conflicts = detectConflicts({ adapter, clauses });
  const reconciliation = reconcileSource({ sourceElements: elements, clauses, exclusions });
  const findings = [...reconciliation.findings, ...conflicts];

  if (clauses.length === 0) {
    findings.push({
      code: REPAIR_REQUIRED,
      class: 'must-fix',
      problem: 'no normative source yielded a clause; synthesize the missing source or create a repair ticket',
    });
  }

  const digest = inventoryDigest(clauses);
  return {
    version: 1,
    scope: adapter.scope ?? 'package',
    adapter: { id: adapter.id ?? 'generic-manifest', version: adapter.version ?? 1, contractIdScope: contractIdScopeOf(adapter) },
    source: { artifacts, digest: 'sha256:' + createHash('sha256').update(JSON.stringify(artifacts)).digest('hex') },
    digest,
    clauses,
    conflicts,
    reconciliation,
    findings,
  };
}

module.exports = {
  CLAUSE_TEXT_CONFLICT,
  DEFAULT_CONTRACT_ID_SCOPE,
  INVENTORY_SOURCE_UNACCOUNTED,
  REPAIR_REQUIRED,
  buildClauses,
  buildInventory,
  contractIdScopeOf,
  detectConflicts,
  elementsOf,
  enumerateSourceElements,
  inventoryDigest,
  reconcileSource,
};
