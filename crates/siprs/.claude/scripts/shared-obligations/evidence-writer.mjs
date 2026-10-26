#!/usr/bin/env node
/**
 * The only writer for reader-authored evidence.
 *
 * It never creates a record. It validates a reader's staging file against the
 * worklist item, stamps the generation that read it, and writes all records or
 * none. A direct write to readings-*.jsonl leaves no receipt, and the gate
 * refuses it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { validateBlindAttack } from './blind-attack.mjs';
import { validateEffortTrace } from './effort.mjs';
import {
  recordIdOf,
  sha256File,
  writeReceiptFor,
} from './evidence.mjs';
import {
  ATTACK_TIER,
  validateAttackRecord,
  validateJudgmentRecord,
} from './judgment.mjs';

/** The file each evidence kind lives in. */
export const EVIDENCE_FILE_BY_KIND = Object.freeze({
  judgment: 'educe-sequences/readings-judgment.jsonl',
  attack: 'educe-sequences/readings-attack.jsonl',
  effort: 'educe-sequences/readings-effort.jsonl',
});

/**
 * Every live reading file a write receipt must bind.
 *
 * The three reader-authored kinds are written through this module; the rest are written
 * by the rail's reading phases, and all of them are evidence the certificate counts. A
 * file outside this list would be a reading no receipt can vouch for.
 */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
export const EVIDENCE_FILE_PATHS = Object.freeze([
  'educe-sequences/readings-judgment.jsonl',
  'educe-sequences/readings-attack.jsonl',
  'educe-sequences/readings-effort.jsonl',
  'educe-sequences/readings-inquest.jsonl',
  'educe-sequences/readings-adversarial.jsonl',
  'educe-sequences/readings-uncovered.jsonl',
  'educe-sequences/readings-span.jsonl',
  'educe-sequences/readings-adjudicate.jsonl',
  'educe-sequences/readings-reroute.jsonl',
]);

/** A non-empty string. */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function text(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** Whether a record carries a field the writer is responsible for stamping. */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function hasWriterStamp(record) {
  return record?.readAt !== undefined || record?.readerGeneration !== undefined;
}

/** The attempt to stamp, or a refusal when the reader already supplied one. */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function stampRecord(record, { generation, now }) {
  if (hasWriterStamp(record)) {
    return { ok: false, code: 'WRITER_STAMPED_FIELD' };
  }
  return {
    ok: true,
    record: { ...record, readAt: now.toISOString(), readerGeneration: generation },
  };
}

/** The judgment a staged attack names, when it is available. */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function judgmentFor(record, judgments) {
  return (Array.isArray(judgments) ? judgments : [])
    .find((entry) => entry?.obligationId === record?.obligationId) ?? null;
}

/**
 * Validate one record against its worklist item.
 *
 * @param {'judgment'|'attack'|'effort'} kind
 * @param {object} record
 * @param {object} item
 * @param {{judgments?: object[], artifact?: object, artifactDigest?: string,
 *   linesByPath?: object, contractRegistry?: object[], rfcByPackage?: object}} options
 * @returns {{ok: boolean, code: string|null, problems: string[]}}
 */
export function validateForKind(kind, record, item, options = {}) {
  if (kind === 'judgment') {
    const result = validateJudgmentRecord(record, item, {
      artifact: options.artifact,
      artifactDigest: options.artifactDigest,
      linesByPath: options.linesByPath,
      contractRegistry: options.contractRegistry,
      rfcByPackage: options.rfcByPackage,
    });
    return { ok: result.ok, code: result.code, problems: result.problems ?? [] };
  }
  if (kind === 'attack') {
    const judgment = judgmentFor(record, options.judgments);
    // A FALSIFY obligation has no judgment basis; its claim is the counterexample itself.
    const requireAnchor = options.requireAnchor === true
      && !String(item?.obligationId ?? '').startsWith('FALSIFY:');
    const result = validateAttackRecord(record, judgment, item, {
      sources: options.sources ?? options.linesByPath,
      requireAnchor,
    });
    if (!result.ok) return { ok: false, code: result.code, problems: result.problems ?? [] };
    if (item?.requireEffort === true && item?.attackTier === ATTACK_TIER.TIER_ONE) {
      const blind = validateBlindAttack(record, {
        ...item,
        basisQuotes: (judgment?.basis ?? [])
          .map((entry) => entry?.quote)
          .filter((quote) => text(quote)),
      });
      return { ok: blind.ok, code: blind.code, problems: blind.problem ? [blind.problem] : [] };
    }
    return { ok: true, code: null, problems: [] };
  }
  if (kind === 'effort') {
    const judgment = judgmentFor(record, options.judgments);
    const result = validateEffortTrace(record, item, {
      verdict: judgment?.verdict,
      requireAnchor: options.requireAnchor === true,
    });
    return { ok: result.ok, code: result.code, problems: result.problem ? [result.problem] : [] };
  }
  return { ok: false, code: 'UNKNOWN_EVIDENCE_KIND', problems: [`${kind} is not an evidence kind`] };
}

/** Write every row once, through a temporary file, so a failure leaves no partial file. */
export function writeAtomically(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  renameSync(temporary, path);
  return path;
}

/**
 * Validate a reader-authored batch and write it once.
 *
 * @param {{root: string, kind: string, records: object[], worklist: object|object[],
 *   judgments?: object[], artifact?: object, artifactDigest?: string,
 *   generation: number, generationStartedAt?: string|null, now?: Date,
 *   linesByPath?: object, contractRegistry?: object[], rfcByPackage?: object}} request
 */
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
export function writeEvidence(request) {
  const {
    root, kind, records, worklist, judgments = [], artifact, artifactDigest,
    generation, generationStartedAt, now = new Date(), linesByPath, sources, contractRegistry, rfcByPackage,
    requireAnchor = false,
  } = request;
  // A positive generation without a start cannot prove the record was taken after the
  // questions changed; refuse before writing rather than stamping a fresh readAt onto it.
  if (Number.isInteger(generation) && generation > 0 && typeof generationStartedAt !== 'string') {
    return {
      ok: false,
      written: [],
      rejected: [{ obligationId: null, code: 'READING_NOT_REREAD' }],
    };
  }
  const path = EVIDENCE_FILE_BY_KIND[kind];
  if (path === undefined) {
    return { ok: false, written: [], rejected: [{ obligationId: null, code: 'UNKNOWN_EVIDENCE_KIND' }] };
  }
  const items = new Map(
    (Array.isArray(worklist) ? worklist : worklist?.items ?? [])
      .filter((item) => typeof item?.obligationId === 'string')
      .map((item) => [item.obligationId, item]),
  );
  const written = [];
  const rejected = [];
  for (const record of Array.isArray(records) ? records : []) {
    const item = items.get(record?.obligationId);
    if (item === undefined) {
      rejected.push({ obligationId: record?.obligationId ?? null, code: 'NOT_IN_WORKLIST' });
      continue;
    }
    const stamped = stampRecord(record, { generation, now });
    if (!stamped.ok) {
      rejected.push({ obligationId: record.obligationId, code: stamped.code });
      continue;
    }
    const withId = kind === 'judgment'
      ? { ...stamped.record, recordId: recordIdOf(stamped.record) }
      : stamped.record;
    const result = validateForKind(kind, withId, item, {
      judgments, artifact, artifactDigest, linesByPath, sources, contractRegistry, rfcByPackage, requireAnchor,
    });
    if (!result.ok) {
      rejected.push({ obligationId: record.obligationId, code: result.code, problems: result.problems });
      continue;
    }
    written.push(withId);
  }
  if (rejected.length > 0) {
    return { ok: false, written: [], rejected };
  }
  // The worklist holds only the obligations still open, so a batch is an increment of the
  // generation's evidence, not a replacement for it. Rows the batch does not name are kept
  // byte-for-byte; a row it does name is replaced, because two records for one obligation
  // are read as a duplicate and neither decides it.
  const merged = mergeBatch(readJsonLinesIfPresent(join(root, path)), written);
  writeAtomically(join(root, path), merged);
  const receipt = writeReceiptFor(root, { kind, path, generation, now });
  return { ok: true, written, rejected: [], receipt };
}

/**
 * The file's rows with the batch applied: earlier rows keep their position, a re-judged
 * obligation takes the batch's row, and a new one is appended in batch order.
 *
 * @param {object[]} existing
 * @param {object[]} batch
 * @returns {object[]}
 */
function mergeBatch(existing, batch) {
  const byObligation = new Map();
  for (const row of batch) if (typeof row?.obligationId === 'string') byObligation.set(row.obligationId, row);
  const merged = [];
  const placed = new Set();
  for (const row of existing) {
    const id = row?.obligationId;
    if (typeof id !== 'string') {
      merged.push(row);
      continue;
    }
    if (byObligation.has(id)) {
      if (!placed.has(id)) {
        merged.push(byObligation.get(id));
        placed.add(id);
      }
      continue;
    }
    merged.push(row);
  }
  for (const row of batch) {
    const id = row?.obligationId;
    if (typeof id === 'string' && !placed.has(id)) {
      merged.push(row);
      placed.add(id);
    }
  }
  return merged;
}

/** Read a JSON file, or null when it is absent or unreadable. */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Read JSONL rows, or an empty list. */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function readJsonLinesIfPresent(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/** Parse `--name=value` or `--name value`. */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

/** The reader context a staged record is validated against. */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function readerContext(root) {
  const status = readJsonIfPresent(join(root, 'educe-sequences', 'status.json'));
  const allocate = readJsonIfPresent(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'));
  const tree = readJsonIfPresent(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'));
  const artifactName = readdirSync(root).find((name) => name.endsWith('-sequences.json')) ?? null;
  const artifactPath = artifactName === null ? null : join(root, artifactName);
  const artifact = artifactPath === null ? null : readJsonIfPresent(artifactPath);
  const specPath = typeof artifact?.spec?.path === 'string' ? join(root, artifact.spec.path) : null;
  const linesByPath = specPath !== null && existsSync(specPath)
    ? { [artifact.spec.path]: readFileSync(specPath, 'utf8').split('\n') }
    : {};
  const rfcByPackage = {};
  for (const pkg of tree?.workspace?.packages ?? []) {
    const path = join(root, pkg.path, 'RFC.md');
    if (existsSync(path)) rfcByPackage[pkg.id] = { path: join(pkg.path, 'RFC.md'), lines: readFileSync(path, 'utf8').split('\n') };
  }
  const sources = { ...linesByPath };
  for (const document of Object.values(rfcByPackage)) sources[document.path] = document.lines;
  return {
    artifact,
    artifactPath,
    artifactDigest: artifactPath === null ? null : sha256File(artifactPath),
    linesByPath,
    sources,
    contractRegistry: allocate?.contract_registry ?? [],
    rfcByPackage,
    generation: status?.generation ?? null,
    generationStartedAt: status?.generationStartedAt ?? null,
  };
}

/** Run the CLI. */
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function runCli(argv) {
  const root = resolve(argumentFor(argv, 'root') ?? process.cwd());
  const kind = argumentFor(argv, 'kind');
  const input = argumentFor(argv, 'input');
  if (kind === null || input === null) {
    process.stderr.write('usage: evidence-writer.mjs --root=<workspace> --kind=<judgment|attack|effort> --input=<staging.jsonl>\n');
    return 2;
  }
  const context = readerContext(root);
  if (context.generation === null) {
    process.stderr.write('evidence-writer: the workspace carries no generation; run the reading phases first\n');
    return 2;
  }
  const worklist = readJsonIfPresent(join(root, 'smooth-sequences', 'JUDGMENT-WORKLIST.json'));
  const judgments = readJsonLinesIfPresent(join(root, 'educe-sequences', 'readings-judgment.jsonl'));
  const records = readJsonLinesIfPresent(resolve(input));
  const result = writeEvidence({
    root,
    kind,
    records,
    worklist,
    judgments,
    artifact: context.artifact,
    artifactDigest: context.artifactDigest,
    generation: context.generation,
    generationStartedAt: context.generationStartedAt,
    linesByPath: context.linesByPath,
    sources: context.sources,
    contractRegistry: context.contractRegistry,
    rfcByPackage: context.rfcByPackage,
    requireAnchor: true,
  });
  process.stdout.write(`${JSON.stringify({
    ok: result.ok,
    written: result.written.length,
    rejected: result.rejected,
  }, null, 2)}\n`);
  return result.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runCli(process.argv.slice(2));
}
