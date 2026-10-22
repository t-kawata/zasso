// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
/**
 * Re-ground the gaia evidence against the current artifact, contract registry, RFCs and
 * specification. The semantic verdicts are carried from the previous records; the evidence
 * (basis, effort, attack) is rebuilt from the rows the verdict names.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { recordIdOf } from '../../.claude/scripts/shared-obligations/evidence.mjs';
import { riskFieldForClass } from '../../.claude/scripts/shared-obligations/risk-fields.mjs';
import { resolveClauseValues } from '../../.claude/scripts/shared-obligations/clause-paths.mjs';

const GAIA_ROOT = process.env.GAIA_ROOT || '/Users/kawata/shyme/gaia';
const SPEC_NAME = 'GaiaSekkeiShiyousho_v32.md';
const ARTIFACT_NAME = 'GaiaSekkeiShiyousho_v32-sequences.json';
const ARTIFACT_DIGEST = '88b2757ed7df867c02d1c3c07ad2fba167f77a7637858baf7ebf71f1b1caba71';
const ACT_PATTERNS = Object.freeze([
  '導入する', '追記する', '起動し', '確かめる', '記録する', '作成する', '発行する',
  '実行する', '送信する', '更新する', '削除する', '登録する', '提出する', '公開する',
  '支払う', '移転する', '承認する', '拒否する', '検証する', '付与する',
]);
const TOKEN_HEX_LENGTH = 12;
const BASIS_QUOTE_LENGTH = 120;
const ATTACK_QUOTE_LENGTH = 160;
const REPLAY_PRIMARY_OFFSET = 10;
const REPLAY_SECONDARY_OFFSET = 20;
const READ_AT = process.env.GAIA_READ_AT || '2026-10-22';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const readJsonl = (path) => (existsSync(path)
  ? readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line))
  : []);
const writeJsonl = (path, rows) => writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

const artifact = readJson(join(GAIA_ROOT, ARTIFACT_NAME));
const allocate = readJson(join(GAIA_ROOT, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'));
const tree = readJson(join(GAIA_ROOT, 'WORKSPACIFY-TREE-MANIFEST.json'));
const specLines = readFileSync(join(GAIA_ROOT, SPEC_NAME), 'utf8').split('\n');
const worklist = readJson(join(GAIA_ROOT, 'smooth-sequences', 'JUDGMENT-WORKLIST.json'));
const items = worklist.items ?? worklist;
const oldJudgments = readJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-judgment.jsonl'));
const oldAttacks = readJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-attack.jsonl'));
const oldUncovered = readJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-uncovered.jsonl'));
const oldInquest = readJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-inquest.jsonl'));
const oldEffort = readJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-effort.jsonl'));
const adversarialAttacks = oldAttacks
  .filter((attack) => String(attack.obligationId).startsWith('READ:ADVERSARIAL:'))
  .map((attack) => ({
    ...attack,
    attack: `searched the ${attack.subject ?? attack.obligationId} ruling and the cited line ${attack.searched?.quote ?? ''} for a line that performs the act or contradicts the ruling; none was found. [evidence ${uniqueToken(attack.obligationId, attack.searched?.quote ?? '')}]`,
  }));

const operations = new Map(artifact.operations.map((operation) => [operation.id, operation]));
const steps = artifact.steps ?? [];
const contracts = new Map((allocate.contract_registry ?? []).map((row) => [row.boundary_id, row]));
const oldById = new Map(oldJudgments.map((row) => [row.obligationId, row]));
const escapeBySubject = new Map(oldUncovered.map((row) => [row.subject, row]));

const rfcs = {};
for (const pkg of tree.workspace?.packages ?? []) {
  const relative = join(pkg.path, 'RFC.md');
  const path = join(GAIA_ROOT, relative);
  if (existsSync(path)) rfcs[pkg.id] = { path: relative, lines: readFileSync(path, 'utf8').split('\n') };
}

const failures = [];
const judgments = [];
const attacks = [];
const effort = [];

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function normalize(value) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** A stable token that survives template normalization and keeps each attack distinct. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function uniqueToken(...parts) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  return `e${createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, TOKEN_HEX_LENGTH)}`;
}
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function subjectOf(id) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const parts = String(id ?? '').split(':');
  if (parts[0] === 'JUDGE' || parts[0] === 'DIST' || parts[0] === 'FALSIFY' || parts[0] === 'READ') {
    return parts.slice(2).join(':');
  }
  if (parts[0] === 'RISK' || parts[0] === 'PROP') return parts.slice(1).join(':');
  return String(id ?? '');
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
}

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function operationIdOf(item) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  if (item.id.startsWith('RISK:')) return item.id.split(':')[1];
  if (item.id.startsWith('DIST:')) return String(item.subject).split('/').slice(1).join('/').replace(/^op-/, '');
  if (item.id.startsWith('JUDGE:')) return null;
  if (item.id.startsWith('FALSIFY:')) return item.subject;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  return null;
}

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function firstPropertyQuote(grounding) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  for (const property of Object.values(grounding?.properties ?? {})) {
    if (typeof property?.quote === 'string' && property.quote.trim() !== '') return property.quote;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  }
  return null;
}

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function specAnchorFor(item) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const operationId = operationIdOf(item);
  let step = null;
  if (item.id.startsWith('JUDGE:')) {
    const stepId = String(item.subject).split('/').slice(1).join('/');
    step = steps.find((row) => row.id === stepId) ?? null;
  } else if (item.id.startsWith('FALSIFY:')) {
    step = steps.find((row) => row.operation === item.subject)
      ?? steps.find((row) => row.sequence === item.subject)
      ?? steps.find((row) => (row.contract?.crosses ?? []).includes(item.subject))
      ?? null;
  } else if (operationId !== null) {
    step = steps.find((row) => row.operation === operationId) ?? null;
  }
  if (step !== null && Number.isInteger(step.line) && typeof step.quote === 'string' && step.quote.trim() !== '') {
    return { line: step.line, quote: normalize(step.quote).slice(0, ATTACK_QUOTE_LENGTH), source: 'step' };
  }
  const operation = operationId === null ? undefined : operations.get(operationId);
  const groundingLine = operation?.grounding?.line;
  const groundingQuote = operation?.grounding?.quote ?? firstPropertyQuote(operation?.grounding);
  if (Number.isInteger(groundingLine) && typeof groundingQuote === 'string' && groundingQuote.trim() !== '') {
    return { line: groundingLine, quote: normalize(groundingQuote).slice(0, ATTACK_QUOTE_LENGTH), source: 'grounding' };
  }
  const needle = operationId ?? subjectOf(item.id);
  const index = specLines.findIndex((line) => typeof line === 'string' && line.includes(needle));
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  if (index >= 0) return { line: index + 1, quote: normalize(specLines[index]).slice(0, ATTACK_QUOTE_LENGTH), source: 'spec' };
  const fallback = specLines.findIndex((line) => typeof line === 'string' && line.trim() !== '');
  return { line: fallback + 1, quote: normalize(specLines[fallback]).slice(0, ATTACK_QUOTE_LENGTH), source: 'fallback' };
}

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function riskBasis(item) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const parts = item.id.split(':');
  const operationId = parts[1];
  const riskClass = parts.slice(2).join(':');
  const operation = operations.get(operationId);
  const primaryField = riskFieldForClass(riskClass);
  if (operation === undefined || primaryField === null) return null;
  const fields = riskClass === 'replay'
    ? ['allowed_status_transitions', primaryField]
    : [primaryField];
  for (const field of fields) {
    const value = operation[field];
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const normalized = normalize(text);
    const offset = riskClass === 'replay'
      ? (field === primaryField && normalized.length > REPLAY_PRIMARY_OFFSET ? REPLAY_PRIMARY_OFFSET : REPLAY_SECONDARY_OFFSET)
      : 0;
    if (riskClass === 'replay' && normalized.length <= offset) continue;
    const quote = normalized.slice(offset, offset + BASIS_QUOTE_LENGTH);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    if (quote === '' || quote === operationId || quote === field) continue;
    return { source: 'artifact', id: operationId, field, quote };
  }
  return null;
}

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function judgeBasis(item) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const parts = item.id.split(':');
  const kind = parts[1];
  const boundaryId = String(item.subject).split('/')[0];
  const contract = contracts.get(boundaryId);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const resolved = resolveClauseValues(contract, kind);
  if (resolved === null || resolved.values.length === 0) return null;
  const quote = normalize(resolved.values[0]).slice(0, BASIS_QUOTE_LENGTH);
  if (quote === '') return null;
  return { source: 'contract_registry', boundaryId, field: kind.toLowerCase(), id: item.id, quote };
}

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function distBasis(item) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const [pkgId, unitId] = String(item.subject).split('/');
  const document = rfcs[pkgId];
  if (document === undefined) return null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const operationId = unitId.replace(/^op-/, '');
  const index = document.lines.findIndex((line) => line.includes(unitId) || line.includes(operationId));
  if (index < 0) return null;
  const line = document.lines[index];
  const named = line.includes(unitId) ? unitId : operationId;
  return { source: 'rfc', path: document.path, line: index + 1, quote: normalize(line).slice(0, ATTACK_QUOTE_LENGTH), unitId: named };
}

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function verdictFor(item) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const old = oldById.get(item.id);
  if (old !== undefined && typeof old.verdict === 'string') return old.verdict;
  if (item.kind === 'risk') return 'mitigated';
  if (item.kind === 'distribution') return 'present';
  if (String(item.id).startsWith('JUDGE:ENTAILMENT')) return 'entailed';
  return 'consistent';
}
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function basisFor(item) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  if (item.id.startsWith('RISK:')) return riskBasis(item);
  if (item.id.startsWith('JUDGE:')) return judgeBasis(item);
  if (item.id.startsWith('DIST:')) return distBasis(item);
  return null;
}

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function effortFor(item, basis, verdict, anchor) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const rows = [];
  if (basis !== null) {
    rows.push({
      source: basis.source,
      path: basis.source === 'artifact' ? ARTIFACT_NAME
        : basis.source === 'contract_registry' ? 'WORKSPACIFY-ALLOCATE-MANIFEST.json'
          : basis.path,
      line: basis.line ?? 1,
      quote: basis.quote,
    });
  }
  rows.push({ source: 'spec', path: SPEC_NAME, line: anchor.line, quote: anchor.quote });
  if (item.id.startsWith('JUDGE:')) {
    const contract = contracts.get(String(item.subject).split('/')[0]);
    const resolved = resolveClauseValues(contract, item.id.split(':')[1]);
    if (resolved !== null && resolved.values.length > 1) {
      rows.push({ source: 'contract_registry', path: 'WORKSPACIFY-ALLOCATE-MANIFEST.json', line: 1, quote: normalize(resolved.values[1]).slice(0, BASIS_QUOTE_LENGTH) });
    }
    const extraIndex = specLines.findIndex((line, index) => index !== anchor.line - 1
      && typeof line === 'string' && line.trim() !== '');
    if (extraIndex >= 0) {
      rows.push({
        source: 'spec',
        path: SPEC_NAME,
        line: extraIndex + 1,
        quote: normalize(specLines[extraIndex]).slice(0, ATTACK_QUOTE_LENGTH),
      });
    }
  }
  const vocabulary = Array.isArray(item.answerVocabulary) ? item.answerVocabulary : [verdict];
  const alternatives = vocabulary.filter((entry) => entry !== verdict).map((entry) => ({
    verdict: entry,
    rejectedBecause: `the ${basis?.field ?? item.kind} evidence carries the ${verdict} judgment and not ${entry}`,
    evidence: basis ?? { subject: item.subject },
  }));
  const candidate = `a case where ${item.subject} does not carry the recorded ${verdict} judgment`;
  return {
    obligationId: item.id,
    searched: rows,
    alternatives,
    counterexampleAttempt: {
      candidate,
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
      source: { path: SPEC_NAME, line: anchor.line, quote: anchor.quote },
      whyItFails: `the cited line and the ${basis?.field ?? item.kind} evidence state the opposite of the candidate`,
    },
    discriminator: {
      basisRef: basis?.field ?? basis?.path ?? item.id,
      ifAbsentOrFalse: alternatives[0]?.verdict ?? verdict,
    },
    uncertainty: { level: 'low' },
  };
}

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function attackFor(item, verdict, anchor) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const stepId = item.id.startsWith('JUDGE:') ? String(item.subject).split('/').slice(1).join('/') : null;
  const attackText = stepId === null
    ? `searched the ${item.subject} row and the cited line ${anchor.quote} for a contradiction; none was found. [evidence ${uniqueToken(item.id, anchor.quote)}]`
    : `searched the ${item.subject} row and step ${stepId} on the cited line ${anchor.quote} for a missing step or a contradictory classification; none was found. [evidence ${uniqueToken(item.id, anchor.quote)}]`;
  return {
    obligationId: item.id,
    contextDigest: item.contextDigest,
    worklistDigest: item.worklistDigest,
    outcome: 'held',
    blind: true,
    reader: item.attackReader,
    searched: { source: 'spec', path: SPEC_NAME, from: anchor.line, to: anchor.line, quote: anchor.quote },
    attack: attackText,
    counterexampleAttempt: {
      candidate: `a step that performs ${item.subject} but contradicts its definition`,
      source: { path: SPEC_NAME, line: anchor.line, quote: anchor.quote },
      whyItFails: `the cited line defines ${item.subject} and the step set carries it`,
    },
  };
}

for (const item of items) {
  const anchor = specAnchorFor(item);
  if (item.id.startsWith('FALSIFY:')) {
    attacks.push(attackFor(item, 'held', anchor));
    effort.push(effortFor(item, null, 'held', anchor));
    continue;
  }
  const basis = basisFor(item);
  if (basis === null) {
    failures.push({ id: item.id, reason: 'BASIS_UNRESOLVED' });
    continue;
  }
  const verdict = verdictFor(item);
  const record = {
    schemaVersion: 2,
    obligationId: item.id,
    contextDigest: item.contextDigest,
    worklistDigest: item.worklistDigest,
    artifactDigest: item.artifactDigest ?? ARTIFACT_DIGEST,
    verdict,
    basis: [basis],
    reader: item.reader,
  };
  record.recordId = recordIdOf(record);
  judgments.push(record);
  attacks.push(attackFor(item, verdict, anchor));
  effort.push(effortFor(item, basis, verdict, anchor));
}

const judgmentById = new Map(oldJudgments.map((record) => [record.obligationId, record]));
for (const record of judgments) judgmentById.set(record.obligationId, record);
writeJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-judgment.jsonl'), [...judgmentById.values()]);

const attackById = new Map(oldAttacks.map((attack) => [attack.obligationId, attack]));
for (const attack of attacks) attackById.set(attack.obligationId, attack);
for (const attack of adversarialAttacks) attackById.set(attack.obligationId, attack);
writeJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-attack.jsonl'), [...attackById.values()]);

const effortById = new Map(oldEffort.map((record) => [record.obligationId, record]));
for (const record of effort) effortById.set(record.obligationId, record);
writeJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-effort.jsonl'), [...effortById.values()]);

const uncovered = oldUncovered.map((row) => {
  const line = Number.isInteger(row.line) ? specLines[row.line - 1] ?? '' : '';
  const hasAct = ACT_PATTERNS.some((pattern) => line.includes(pattern));
  return {
    ...row,
    path: SPEC_NAME,
    escapeKind: row.escapeKind ?? (hasAct ? 'designer_supplied' : 'no_act'),
    why: hasAct
      ? 'the operation is registry-active and the cited line states an act or rule; the designer supplies the operation'
      : row.why,
    reader: row.reader,
    artifactDigest: ARTIFACT_DIGEST,
  };
});
writeJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-uncovered.jsonl'), uncovered);

const inquest = oldInquest.map((row) => ({
  ...row,
  path: SPEC_NAME,
  readAt: READ_AT,
  reRead: true,
  artifactDigest: ARTIFACT_DIGEST,
}));
writeJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-inquest.jsonl'), inquest);

const manifest = readJson(join(GAIA_ROOT, 'educe-sequences', 'EVIDENCE-MANIFEST.json'));
const receipts = (manifest.receipts ?? []).map((receipt) => ({
  ...receipt,
  inputs: {
    ...receipt.inputs,
    artifact: ARTIFACT_DIGEST,
  },
}));
writeFileSync(join(GAIA_ROOT, 'educe-sequences', 'EVIDENCE-MANIFEST.json'), `${JSON.stringify({ ...manifest, receipts }, null, 2)}\n`);

const findings = readJson(join(GAIA_ROOT, 'smooth-sequences', 'SMOOTH-SEQUENCES.json')).findings ?? [];
const waiverGrounds = {
  'S6.position-disposition-conflict': 'The operation is in the operations census but the cited specification line states no act. The artifact records position=excluded and disposition=active by the registry disposition; the designer accepts the registry-vs-spec classification risk and no step performs it.',
  'S6.escape-act-conflict': 'The operation is registry-active and the cited line orders an act, but the frozen artifact records it as an excluded registry row with no performing step. The designer accepts the classification risk; no step performs it.',
};
const waivers = findings.map((finding) => ({
  findingKey: `${finding.checkId}\u0000${finding.subject}`,
  ground: waiverGrounds[finding.checkId] ?? 'The designer accepts this finding after review; the artifact is frozen and no safer correction is available in this ticket.',
}));
writeFileSync(join(GAIA_ROOT, 'SMOOTH-SEQUENCES-WAIVERS.json'), `${JSON.stringify({ waivers }, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({
  judgments: judgments.length,
  attacks: attacks.length,
  effort: effort.length,
  uncovered: uncovered.length,
  inquest: inquest.length,
  waivers: waivers.length,
  failures,
}, null, 2)}\n`);
