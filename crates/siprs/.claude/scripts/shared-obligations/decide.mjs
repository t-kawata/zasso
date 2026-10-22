// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
/**
 * Decide every obligation from validated evidence, not from its recorded state.
 *
 * Mechanical and census closures are facts the workspace already carries. A semantic
 * obligation closes only through a judgment that passes the protocol, or through a
 * reading that a reader signed. A semantic obligation whose state says `closed` but
 * which has no worklist item is not trusted: that is exactly the presence-based closure
 * this module replaces.
 */
import {
  ATTACK_TIER,
  decideJudgment,
  validateAttackRecord,
  validateJudgmentRecord,
} from './judgment.mjs';
import { validateEffortTrace } from './effort.mjs';
import { validateBlindAttack } from './blind-attack.mjs';
import { templateSignature } from './attack-template.mjs';

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const DECISION_STATE = Object.freeze({
  HELD: 'held',
  BROKEN: 'broken',
  STUCK: 'stuck',
  OPEN: 'open',
  PROVEN: 'proven',
  NOT_APPLICABLE: 'not_applicable',
});

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const DECISION_SOURCE = Object.freeze({
  MECHANICAL: 'mechanical',
  READING: 'reading',
  JUDGMENT: 'judgment',
  NONE: 'none',
});

/** A basis signature used to detect the same citation closing two obligations. */
// [::TICKET::] PX-291, PX-292, PX-293, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function basisSignature(basis) {
  return JSON.stringify(basis.map((entry) => ({
    source: entry?.source ?? null,
    path: entry?.path ?? null,
    line: entry?.line ?? null,
    quote: entry?.quote ?? null,
    boundaryId: entry?.boundaryId ?? null,
    field: entry?.field ?? null,
    id: entry?.id ?? entry?.operationId ?? null,
    packageId: entry?.packageId ?? null,
    unitId: entry?.unitId ?? null,
    unit: entry?.unit ?? null,
  })));
}

/** Index the records by obligation, keeping the first and rejecting duplicates. */
// [::TICKET::] PX-291, PX-292, PX-293, PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293|PX-297|PX-298) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function indexRecords(records, rejected, kind) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const byId = new Map();
  for (const record of Array.isArray(records) ? records : []) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const id = record?.obligationId;
    if (typeof id !== 'string') {
      rejected.push({ record, obligationId: null, code: 'UNKNOWN_OBLIGATION', problems: [`the ${kind} names no obligationId`] });
      continue;
    }
    if (byId.has(id)) {
      rejected.push({ record, obligationId: id, code: 'DUPLICATE_RECORD', problems: [`more than one ${kind} for this obligation`] });
      continue;
    }
    byId.set(id, record);
  }
  return byId;
}

/** The decision for one obligation. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-297, PX-298 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297|PX-298) --for-spec --no-implementation-order`.
function decideObligation(obligation, item, record, attack, context) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const base = {
    obligationId: obligation.id,
    state: DECISION_STATE.OPEN,
    source: DECISION_SOURCE.NONE,
    recordId: record?.recordId ?? null,
    attackId: attack?.recordId ?? null,
    verdict: record?.verdict ?? null,
    reason: null,
  };

  if (obligation.state === 'not_applicable') {
    return { ...base, state: DECISION_STATE.NOT_APPLICABLE, source: DECISION_SOURCE.MECHANICAL };
  }
  if (obligation.class === 'mechanical') {
    return obligation.state === 'closed'
      ? { ...base, state: DECISION_STATE.PROVEN, source: DECISION_SOURCE.MECHANICAL }
      : { ...base, reason: 'MECHANICAL_OPEN' };
  }
  if (typeof obligation.id === 'string' && obligation.id.startsWith('READ:')) {
    // A reading is settled by its own semantics, not by a judgment record. A closed
    // reading is held with the reading as its source; an open reading carries the reason
    // the resolver named, so a Yes finding reaches the certificate as FINDING_OPEN.
    if (obligation.state === 'closed') {
      return { ...base, state: DECISION_STATE.HELD, source: DECISION_SOURCE.READING, reason: obligation.reason ?? null };
    }
    if (obligation.reason === 'LEGACY_RECORD' || obligation.reason === 'STALE_EVIDENCE') {
      context.staleRecords += 1;
    }
    return {
      ...base,
      state: obligation.state === 'stuck' ? DECISION_STATE.STUCK : DECISION_STATE.OPEN,
      source: DECISION_SOURCE.READING,
      reason: obligation.reason ?? 'READING_OPEN',
    };
  }
  if (item === undefined) {
    return { ...base, reason: 'NO_WORKLIST_ITEM' };
  }

  if (typeof obligation.id === 'string' && obligation.id.startsWith('FALSIFY:')) {
    if (attack === undefined) return { ...base, reason: 'NO_ATTACK' };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const result = validateAttackRecord(attack, null, item, context.validateOptions);
    if (!result.ok) {
      context.rejected.push({ record: attack, obligationId: obligation.id, code: result.code, problems: result.problems });
      return { ...base, reason: result.code };
    }
    if (item.requireEffort === true) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const blindResult = validateBlindAttack(attack, { ...item, basisQuotes: [] });
      if (!blindResult.ok) {
        context.rejected.push({ record: attack, obligationId: obligation.id, code: blindResult.code, problems: [blindResult.problem] });
        context.countRejection(blindResult.code);
        return { ...base, reason: blindResult.code };
      }
    }
    if (attack.outcome === 'held') {
      context.anchored += 1;
      context.independentAttacks += 1;
      return { ...base, state: DECISION_STATE.HELD, source: DECISION_SOURCE.JUDGMENT };
    }
    if (attack.outcome === 'broken') return { ...base, state: DECISION_STATE.BROKEN, source: DECISION_SOURCE.JUDGMENT, reason: 'FALSIFIED' };
    return { ...base, state: DECISION_STATE.STUCK, source: DECISION_SOURCE.JUDGMENT, reason: 'ATTACK_UNRESOLVED' };
  }

  if (record === undefined) return { ...base, reason: 'NO_JUDGMENT' };

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = validateJudgmentRecord(record, item, {
    ...context.validateOptions,
    subject: item?.subject,
  });
  if (!result.ok) {
    context.rejected.push({ record, obligationId: obligation.id, code: result.code, problems: result.problems });
    context.countRejection(result.code);
    return { ...base, reason: result.code };
  }

  if (item.requireEffort === true) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const effort = context.effortByObligation.get(obligation.id);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const effortResult = validateEffortTrace(effort, { ...item, verdict: record.verdict });
    if (!effortResult.ok) {
      context.rejected.push({ record: effort ?? null, obligationId: obligation.id, code: effortResult.code, problems: [effortResult.problem] });
      context.countRejection(effortResult.code);
      return { ...base, reason: effortResult.code };
    }
    if (item.attackTier === ATTACK_TIER.TIER_ONE) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      const blindResult = validateBlindAttack(attack, {
        ...item,
        basisQuotes: (Array.isArray(record.basis) ? record.basis : [])
          .map((entry) => entry?.quote)
          .filter((quote) => typeof quote === 'string' && quote !== ''),
      });
      if (!blindResult.ok) {
        context.rejected.push({ record: attack ?? null, obligationId: obligation.id, code: blindResult.code, problems: [blindResult.problem] });
        context.countRejection(blindResult.code);
        return { ...base, reason: blindResult.code };
      }
    }
  }

  if (['conflicting', 'not_entailed', 'absent'].includes(record.verdict)) {
    context.rejected.push({
      record,
      obligationId: obligation.id,
      code: 'VERDICT_NOT_ALLOWED',
      problems: [`verdict ${record.verdict} states a conflict and cannot close the obligation`],
    });
    return { ...base, reason: 'VERDICT_NOT_ALLOWED' };
  }

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const signature = basisSignature(record.basis);
  if (context.seenBasis.has(signature)) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const code = 'REUSED_BASIS';
    context.rejected.push({
      record,
      obligationId: obligation.id,
      code,
      problems: [`the same basis already decided ${context.seenBasis.get(signature)}`],
    });
    context.countRejection(code);
    return { ...base, reason: code };
  }

  if (item.attackTier === ATTACK_TIER.TIER_ONE && attack === undefined) {
    context.unattackedTier1 += 1;
    return { ...base, reason: 'NO_ATTACK' };
  }
  if (attack === undefined) {
    // A standard-tier judgment is settled by its validated record; only a Tier 1 claim
    // owes an independent attack.
    context.seenBasis.set(signature, obligation.id);
    context.anchored += 1;
    return { ...base, state: DECISION_STATE.HELD, source: DECISION_SOURCE.JUDGMENT };
  }
  if (attack !== undefined) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const attackResult = validateAttackRecord(attack, record, item);
    if (!attackResult.ok) {
      context.rejected.push({ record: attack, obligationId: obligation.id, code: attackResult.code, problems: attackResult.problems });
      context.countRejection(attackResult.code);
      return { ...base, reason: attackResult.code };
    }
  }

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const decision = decideJudgment({ record, attack: attack ?? null });
  context.seenBasis.set(signature, obligation.id);
  if (decision.state === 'held') {
    context.anchored += 1;
    if (attack !== undefined) context.independentAttacks += 1;
  }
  return {
    ...base,
    state: decision.state,
    source: DECISION_SOURCE.JUDGMENT,
    reason: decision.reason,
  };
}

/**
 * Decide every obligation from the worklist and the signed records.
 *
 * @param {{ obligations?: Array<object>, worklist?: Array<object>,
 *   judgments?: Array<object>, attacks?: Array<object>, artifactDigest?: string|null,
 *   linesByPath?: object }} input
 * @returns {{ decisions: Array<object>, rejected: Array<object>, metrics: object }}
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function decideAll(input = {}) {
  const {
    obligations = [],
    worklist = [],
    judgments = [],
    attacks = [],
    effort = [],
    artifactDigest = null,
    linesByPath = {},
    artifact = undefined,
    contractRegistry = undefined,
    rfcByPackage = undefined,
    staleReceipts = [],
    sensitivity = [],
    rejudge = [],
  } = input;

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const items = new Map();
  for (const item of Array.isArray(worklist) ? worklist : []) {
    if (typeof item?.obligationId === 'string') items.set(item.obligationId, item);
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const requireEffort = input.requireEffort === true
    || (Array.isArray(worklist) && worklist.some((item) => item?.requireEffort === true));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const rejected = [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const records = indexRecords(judgments, rejected, 'judgment');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const attackRecords = indexRecords(attacks, rejected, 'attack');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const effortByObligation = new Map(
    (Array.isArray(effort) ? effort : [])
      .filter((entry) => typeof entry?.obligationId === 'string')
      .map((entry) => [entry.obligationId, entry]),
  );
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const context = {
    rejected,
    anchored: 0,
    genericBasis: 0,
    reusedBasis: 0,
    staleRecords: 0,
    provisionalRecords: 0,
    unattackedTier1: 0,
    independentAttacks: 0,
    effortByObligation,
    seenBasis: new Map(),
    validateOptions: { linesByPath, artifact, contractRegistry, rfcByPackage },
// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
    countRejection(code) {
      if (code === 'BASIS_OUT_OF_SCOPE') this.genericBasis += 1;
      if (code === 'STALE_EVIDENCE') this.staleRecords += 1;
      if (code === 'PROVISIONAL_EVIDENCE') this.provisionalRecords += 1;
      if (code === 'REUSED_BASIS') this.reusedBasis += 1;
    },
  };

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const decisions = [];
  for (const obligation of Array.isArray(obligations) ? obligations : []) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const item = items.get(obligation.id);
    decisions.push(decideObligation(
      obligation,
      item,
      records.get(obligation.id),
      attackRecords.get(obligation.id),
      context,
    ));
  }

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const judgedHeld = decisions.filter((entry) => entry.source === DECISION_SOURCE.JUDGMENT && entry.state === DECISION_STATE.HELD).length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const heldJudgments = decisions.filter((entry) => entry.source === DECISION_SOURCE.JUDGMENT
    && entry.state === DECISION_STATE.HELD);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const basisJudgments = heldJudgments
    .filter((entry) => !String(entry.obligationId).startsWith('FALSIFY:'));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const basisResolved = basisJudgments.filter((entry) => (records.get(entry.obligationId)?.basis ?? []).length > 0).length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const quoteGrounded = basisJudgments.filter((entry) => (records.get(entry.obligationId)?.basis ?? [])
    .some((basis) => typeof basis?.quote === 'string' && basis.quote.trim() !== '')).length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const effortCovered = heldJudgments.filter((entry) => items.get(entry.obligationId)?.requireEffort !== true
    || effortByObligation.has(entry.obligationId)).length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const tier1Held = heldJudgments.filter((entry) => items.get(entry.obligationId)?.attackTier === ATTACK_TIER.TIER_ONE);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const blindHeld = tier1Held.filter((entry) => attackRecords.get(entry.obligationId)?.blind === true).length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const signatureCounts = new Map();
  for (const attack of Array.isArray(attacks) ? attacks : []) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const signature = templateSignature(attack?.attack);
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
  }
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const templateAttacks = [...signatureCounts.values()]
    .filter((count) => count > 1)
    .reduce((total, count) => total + count, 0);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const readingDecisions = decisions.filter((entry) => entry.source === DECISION_SOURCE.READING);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const inheritedReadings = readingDecisions.filter((entry) => entry.reason === 'INHERITED_READING').length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const escapeConflicts = decisions.filter((entry) => entry.reason === 'ESCAPE_ACT_CONFLICT'
    || entry.reason === 'POSITION_DISPOSITION_CONFLICT').length;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const discriminating = Array.isArray(sensitivity) ? sensitivity.filter((entry) => entry?.ok === true).length : 0;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const rejudgeAgreements = Array.isArray(rejudge) ? rejudge.filter((entry) => entry?.ok === true).length : 0;
  return {
    decisions,
    rejected,
    metrics: {
      anchoredRatio: judgedHeld === 0 ? 1 : context.anchored / judgedHeld,
      genericBasis: context.genericBasis,
      reusedBasis: context.reusedBasis,
      staleRecords: context.staleRecords,
      provisionalRecords: context.provisionalRecords,
      unattackedTier1: context.unattackedTier1,
      independentAttacks: context.independentAttacks,
      ...(requireEffort ? {
        basisResolvedRatio: basisJudgments.length === 0 ? 1 : basisResolved / basisJudgments.length,
        quoteGroundedRatio: basisJudgments.length === 0 ? 1 : quoteGrounded / basisJudgments.length,
        templateAttackRatio: (Array.isArray(attacks) ? attacks.length : 0) === 0
          ? 0
          : templateAttacks / attacks.length,
        inheritedRatio: readingDecisions.length === 0 ? 0 : inheritedReadings / readingDecisions.length,
        escapeActConflictCount: escapeConflicts,
        staleReceiptCount: Array.isArray(staleReceipts) ? staleReceipts.length : 0,
        effortCoverage: heldJudgments.length === 0 ? 1 : effortCovered / heldJudgments.length,
        blindAttackRatio: tier1Held.length === 0 ? 1 : blindHeld / tier1Held.length,
        discriminatingRatio: Array.isArray(sensitivity) && sensitivity.length > 0
          ? discriminating / sensitivity.length
          : 1,
        rejudgeAgreement: Array.isArray(rejudge) && rejudge.length > 0
          ? rejudgeAgreements / rejudge.length
          : 1,
      } : {}),
    },
  };
}
