#!/usr/bin/env node
// Procedure Registry completeness checks.
//
// This is the test half of the pair described in registry-completeness-checks.md. It reads
// the specification directly — never a copy — so that a change to the specification changes
// the test, and it reads the registry as the implementation under test.
//
// Exit 0: every check passed. Exit 1: at least one check reported a violation.
// Exit 2: an input could not be read.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_FILENAME = 'GaiaSekkeiShiyousho_v32.md';

/** Walk up from this file until the specification is found, so the checker is path-agnostic. */
function findRepoRoot(start) {
  let dir = start;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(dir, SPEC_FILENAME))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start, '../../../..');
}

const REPO = findRepoRoot(HERE);

const DEFAULT_SPEC = resolve(REPO, SPEC_FILENAME);
const DEFAULT_REGISTRY = resolve(REPO, 'crates/protocol/gaia-operation/docs/procedure-registry.md');
const MANIFEST = resolve(HERE, 'sequence-manifest.jsonl');
const EXEMPTIONS = resolve(HERE, 'code-exemptions.jsonl');
/**
 * One row per section the manifest does not fully span, recording why it carries no Core
 * Operation sequence. S20 fails a section that neither the manifest spans nor this file
 * adjudicates, which is what turns the section census from an open number into a closed set.
 */
const SECTION_ADJUDICATIONS = resolve(HERE, 'section-adjudications.jsonl');
/**
 * One row per sequence-shaped entry that names no operation and is not a sequence, recording what
 * it actually is. S24 fails such an entry when it appears here without a reason, so "this is not a
 * procedure" is a recorded judgment rather than a silence.
 */
const SEQUENCE_ADJUDICATIONS = resolve(HERE, 'sequence-adjudications.jsonl');
/**
 * The ordered step decomposition. One row per step of one sequence.
 *
 * A sequence is an ordered composition of operations, and until this file existed the registry
 * carried only an unordered operation set per sequence plus a pointer into the specification.
 * That is an index, not a sequence: it says which operations a procedure involves, never in what
 * order, and never which step each one performs. "Neither too many nor too few" cannot be checked
 * against an index, because there is no step correspondence to check it against.
 */
const SEQUENCE_STEPS = resolve(HERE, 'sequence-steps.jsonl');
/**
 * The entries carrying a step decomposition, each with its steps.
 *
 * A Set would do for the sequence-entry test; S24 needs the steps themselves, because it now asks
 * whether a neighbour's reading actually reaches into the entry it is said to realise. `.has` on a
 * Map answers the same question a Set does, so one structure serves both.
 */
const DECOMPOSED = new Map();
for (const s of readJsonl(SEQUENCE_STEPS)) {
  if (!DECOMPOSED.has(s.seq)) DECOMPOSED.set(s.seq, []);
  DECOMPOSED.get(s.seq).push(s);
}

/** Line ranges of the specification, named once so the checks read as prose. */
const ZONE = {
  objectTable31: [537, 681],
  objectRegistry221: [9831, 9870],
  objectRegistryFramework: [9866, 9866],
  objectRegistryCivic: [9870, 9870],
  proofClaims: [10439, 10483],
  rejectCodes: [9880, 10393],
  rejectTransportTable: [10395, 10403],
  statusList: [14097, 14097],
  allowedWhenNotHealthy: [6022, 6035],
  transferSafe: [6648, 6661],
  forbiddenDuringFreeze: [6666, 6679],
  restEndpoints: [14157, 14157],
  websocketMethods: [14159, 14159],
  cliCommands: [14161, 14161],
};

const OPERATION_STATUS = [
  'draft', 'submitted', 'accepted', 'pending_proof', 'pending_external', 'pending_finality',
  'finalized', 'rejected', 'cancelled', 'expired', 'failed', 'disputed', 'reversed',
  'recovery_pending', 'recovered',
];

const TERMINAL_STATUS = [
  'finalized', 'rejected', 'cancelled', 'expired', 'failed', 'reversed', 'recovered',
];

/**
 * The authority classes the operation set actually needs. S23 holds the other direction: every
 * value here must be demanded by at least one operation.
 *
 * Four values were removed on 2026-10-08 — `forum_issuer_authority`,
 * `root_ekyc_provider_authorization`, `bank_operator_credential` and `civic_validator_committee`.
 * They appeared in no line of the specification (grep: 0 hits each) and no operation demanded
 * them: they were invented as plausible classes rather than derived, and S23 found them by asking
 * the reverse question that S7 cannot ask. A vocabulary that carries values nothing uses reads as
 * coverage while measuring nothing.
 */
const AUTHORITY = [
  'none', 'soul_authority', 'soul_authority_and_lease', 'forum_root_authority',
  'owner_threshold', 'ekyc_provider_authorization',
  'payment_service_authorization', 'validator_quorum',
  'storage_provider_authorization',
];

/**
 * What an operation waits on outside Gaia. S23 holds the reverse direction here too.
 *
 * `civic_validator_committee` sits in this list and not in AUTHORITY. It had been filed as an
 * authority, where no operation demanded it, while nineteen civic operations used it as their
 * external dependency — civic finality waits on a committee that is not Gaia. The value was never
 * unused; it was in the wrong list, and only the reverse check made the difference visible.
 */
const EXTERNAL_DEPENDENCY = [
  'none', 'stripe_payment', 'stripe_payout', 'stripe_connect_eligibility',
  'stripe_refund_or_dispute', 'ekyc_provider', 'storage_provider', 'bank_provider',
  'compute_provider', 'time_witness', 'discovery_provider', 'civic_validator_committee',
];

/** Value-moving object types: a row producing one must name the law it conserves. */
const VALUE_MOVING = [
  'PaymentSettlement', 'PayoutEntitlement', 'ForumRevenuePoolDistribution',
  'ForumPoolContributionRecord', 'LineageRoyaltySettlement', 'PayoutAggregation',
  'GaiaServiceCreditGrant', 'RefundSettlement', 'PayoutRecoveryAction',
  'ForumPoolUndistributedForfeiture', 'PayoutEntitlementExpiration',
];

/** Names in the object-inventory zones that are formula variables, not object types. */
const NOT_OBJECT_TYPES = ['Q', 'A_max', 'A_seed', 'T_actual', 'I_protocol_max'];

/** The six civic claims that require validator quorum rather than a single writer. */
const CIVIC_QUORUM_CLAIMS = [
  'civic_vote_validity', 'civic_vote_tally_validity', 'civic_need_asset_status',
  'civic_need_asset_publish_eligibility', 'civic_candidates', 'civic_reach',
];

function fail(msg) {
  console.error(`check-registry: ${msg}`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = { spec: DEFAULT_SPEC, registry: DEFAULT_REGISTRY };
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--spec') out.spec = resolve(argv[i + 1]);
    else if (argv[i] === '--registry') out.registry = resolve(argv[i + 1]);
    else fail(`unknown argument ${argv[i]}`);
  }
  return out;
}

/** Slice a 1-based inclusive line range out of the specification. */
function zone(lines, key) {
  const [a, b] = ZONE[key];
  return lines.slice(a - 1, b);
}

function backtickedPascal(text) {
  return (text.match(/`[A-Z][A-Za-z0-9_]*`/g) ?? []).map((s) => s.slice(1, -1));
}

/** Every identifier in a fenced block inside the given range, one per line. */
function fencedIdentifiers(lines, key) {
  const out = [];
  let inFence = false;
  for (const line of zone(lines, key)) {
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (!inFence) continue;
    const t = line.trim().replace(/[;,.]$/, '');
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(t)) out.push(t);
  }
  return out;
}

/** The same, keeping each identifier's line number — S11 needs it to place the family. */
function fencedIdentifiersWithLines(lines, key) {
  const out = [];
  let inFence = false;
  const [a] = ZONE[key];
  for (let i = a - 1; i < a - 1 + zone(lines, key).length; i += 1) {
    const line = lines[i];
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (!inFence) continue;
    const t = line.trim().replace(/[;,.]$/, '');
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(t)) out.push({ line: i + 1, code: t });
  }
  return out;
}

/**
 * Every first-column code in a markdown table inside the given range.
 *
 * The uppercase-initial test is what excludes the table's own header row and its separator:
 * a reject code is PascalCase, so a lowercase header cell can never be mistaken for one.
 */
function tableFirstColumnWithLines(lines, key) {
  const out = [];
  const [a] = ZONE[key];
  const body = zone(lines, key);
  for (let i = 0; i < body.length; i += 1) {
    if (!body[i].startsWith('|')) continue;
    const cell = body[i].split('|')[1]?.trim();
    if (cell && /^[A-Z][A-Za-z0-9_]*$/.test(cell)) out.push({ line: a + i, code: cell });
  }
  return out;
}

/** The body of the single fenced jsonl block, or null. */
function jsonlBlock(text) {
  const m = text.match(/```jsonl\n([\s\S]*?)```/);
  return m ? m[1] : null;
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------- checks

const violations = [];
function report(check, kind, detail) {
  violations.push({ check, kind, detail });
}

function checkS1(rows, manifest) {
  const kinds = new Set(rows.map((r) => r.kind));
  const manifestIds = new Set(manifest.map((m) => m.id));
  for (const m of manifest) {
    if (m.maps_to === null || m.maps_to === undefined) continue;
    for (const k of [].concat(m.maps_to)) {
      if (!kinds.has(k)) report('S1', k, `sequence ${m.id} maps to a kind with no registry row`);
    }
  }
  for (let n = 1; n <= 30; n += 1) {
    const id = `I${String(n).padStart(2, '0')}`;
    if (!manifestIds.has(id)) report('S1', id, 'seam scenario has no sequence-manifest entry');
  }
}

/**
 * S17 — the manifest must be a complete enumeration of the specification's sequences.
 *
 * S1 checks that every scenario the manifest lists is present in the registry. That test is
 * self-referential: it cannot see a sequence nobody wrote down. This one closes the hole by
 * finding the sequences in the specification itself.
 *
 * A procedure list is a maximal run of three or more consecutive numbered items inside one
 * section — the form every ordered procedure in the body takes. Each run must have a manifest
 * entry whose range overlaps it. A run with no entry is a sequence the manifest never recorded.
 */
const MIN_PROCEDURE_RUN = 3;

function numberedProcedureRuns(lines) {
  const runs = [];
  let cur = [];
  for (const [i, line] of lines.entries()) {
    if (/^\s*\d+\.\s/.test(line)) { cur.push(i + 1); continue; }
    if (line.trim() === '') continue;
    if (cur.length >= MIN_PROCEDURE_RUN) runs.push({ from: cur[0], to: cur[cur.length - 1] });
    cur = [];
  }
  if (cur.length >= MIN_PROCEDURE_RUN) runs.push({ from: cur[0], to: cur[cur.length - 1] });
  return runs;
}

function checkS17(manifest, lines) {
  const runs = numberedProcedureRuns(lines);
  if (!runs.length) report('S17', '-', 'no numbered procedure run found — the detector is wrong');
  for (const run of runs) {
    const covered = manifest.some((m) => {
      const [a, b] = [Math.min(...(m.spec_lines ?? [])), Math.max(...(m.spec_lines ?? []))];
      if (!Number.isFinite(a)) return false;
      return a <= run.to && b >= run.from; // the entry's range overlaps the run
    });
    if (!covered) report('S17', `${run.from}..${run.to}`, 'numbered procedure run has no manifest entry');
  }
}

/**
 * S18 — bullet-form sequences, measured rather than assumed.
 *
 * S17 covers numbered runs. The body also expresses procedures as bullet lists, and 131 of its
 * 430 sections carry three or more bullets with fewer than three numbered items. Most of those
 * are invariant lists, prohibition lists or role lists rather than sequences — 24.20 alone has
 * 217 bullets, all invariants — and telling a sequence from an invariant is a reading, not a
 * computation. So this check does not pretend to classify them. It enforces the claim where a
 * claim is made, and it *reports* the count where none is, because a number that stays visible
 * is worth more than a green tick that hides it.
 */
function bulletSections(lines) {
  const out = [];
  let cur = null;
  for (const [i, line] of lines.entries()) {
    if (/^#{3,4} /.test(line)) {
      if (cur && cur.bullets >= 3 && cur.numbered < 3) out.push(cur);
      cur = { heading: line.replace(/^#+ /, ''), from: i + 1, bullets: 0, numbered: 0 };
      continue;
    }
    if (!cur) continue;
    if (/^\s*[-*]\s/.test(line)) cur.bullets += 1;
    else if (/^\s*\d+\.\s/.test(line)) cur.numbered += 1;
  }
  if (cur && cur.bullets >= 3 && cur.numbered < 3) out.push(cur);
  return out;
}

function checkS18(manifest, lines) {
  const sections = bulletSections(lines);
  let uncovered = 0;
  for (const s of sections) {
    const entry = manifest.find((m) => (m.spec_lines ?? []).includes(s.from));
    if (!entry) { uncovered += 1; continue; }
    const resolved = (entry.maps_to !== null && entry.maps_to !== undefined) || (entry.reason ?? '').trim();
    if (!resolved) {
      report('S18', `line ${s.from}`, `bullet section "${s.heading.slice(0, 48)}" is claimed but classified neither as a sequence nor with a reason`);
    }
  }
  return { sections: sections.length, uncovered };
}

/**
 * S19 — ordered-procedure regions that no manifest entry spans.
 *
 * S17 finds numbered runs; S18 measures bullet sections. Neither reaches a procedure written as
 * an arrow chain inside a fenced block, nor a guarded transition table stated as such. An
 * enumeration cannot certify its own totality, so this check does not try to: it finds every
 * region of the body that carries an order marker and that no manifest entry spans, and
 * requires each to be adjudicated — either spanned by an entry, or named below with the reason
 * it is not a Core Operation sequence.
 *
 * The detector is mechanical. The adjudication list is judgment and is reviewed as such; what
 * is mechanical is that a region appearing in neither fails the run. A procedure the
 * specification gains later therefore surfaces as a violation rather than as silence.
 *
 * This check exists because the first version of the manifest spanned the heat state machine
 * diagram but not its guard table: B-5170 ended at 5183, A-5198 began at 5198, and the fourteen
 * lines between them defined when every transition fires. A citation inside an entry's prose is
 * not a span, and nothing was measuring the difference.
 */
const MIN_REGION_ORDER_MARKERS = 3;
const MIN_REGION_ARROW_MARKERS = 2;
const ORDER_MARKERS = [/次の順/, /以下の順/, /順に/, /順序で/, /順序は/, /手順/, /ステップ/];
const ARROW_MARKER = /→|->\s|=>/;

/**
 * Regions carrying an order marker that no manifest entry spans and that are not Core Operation
 * sequences, keyed by the line the unspanned run begins at. A region adjudicated here is a
 * reviewed judgment, not an absence of measurement.
 */
const ADJUDICATED_UNSPANNED = new Map([
  [3818, 'asset publication incentive policy: each field is annotated with what it applies to, not ordered'],
  [5040, 'marketing action kinds mapped to their feasibility classification: a mapping, not a procedure'],
  [8070, 'Stripe Transfer and Payout: a definition of two provider-side money movements, not a Gaia sequence'],
  [13632, 'python scoring function signatures: the arrows are return types'],
  [14264, 'gaia-network transport architecture and discovery path: ordered, but excluded from Core Operations by 14029, 14179 and 14258'],
  [14383, 'rust trait signatures: the arrows are return types'],
  [14847, 'rust function signatures: the arrows are return types'],
  [15036, 'rust trait and impl signatures: the arrows are return types'],
]);

const spanPairs = (specLines) =>
  (Array.isArray(specLines) && specLines.length === 2 && specLines.every((x) => typeof x === 'number'))
    ? [[specLines[0], specLines[1]]] : [];

function checkS19(manifest, lines) {
  const covered = new Array(lines.length + 2).fill(false);
  for (const m of manifest) {
    for (const [a, b] of spanPairs(m.spec_lines)) {
      for (let i = Math.max(1, a); i <= Math.min(lines.length, b); i += 1) covered[i] = true;
    }
  }

  const runs = [];
  let from = null;
  for (let i = 1; i <= lines.length; i += 1) {
    if (!covered[i]) { if (from === null) from = i; continue; }
    if (from !== null) { runs.push([from, i - 1]); from = null; }
  }
  if (from !== null) runs.push([from, lines.length]);

  let candidates = 0;
  for (const [a, b] of runs) {
    const body = lines.slice(a - 1, b);
    const orders = body.filter((l) => ORDER_MARKERS.some((re) => re.test(l))).length;
    const arrows = body.filter((l) => ARROW_MARKER.test(l)).length;
    if (orders < MIN_REGION_ORDER_MARKERS && arrows < MIN_REGION_ARROW_MARKERS) continue;
    candidates += 1;
    if (ADJUDICATED_UNSPANNED.has(a)) continue;
    report('S19', `${a}..${b}`,
      'unspanned region carries an order marker and is neither a manifest sequence nor adjudicated');
  }
  return { candidates, adjudicated: ADJUDICATED_UNSPANNED.size };
}

/**
 * S20 — section-level coverage of the manifest, measured rather than assumed.
 *
 * S17, S18 and S19 all test *within* a region: does this numbered run, this bullet section, this
 * order-marked region reach an entry. None of them can see a section the manifest never entered
 * at all, and that is the largest hole this apparatus has. When this check was written, of the 430
 * sections at heading level three or deeper, 92 were spanned completely, 186 partially, and 152
 * not at all. The counts are not restated here because they move: correcting an entry's spec_lines
 * to the true extent of its procedure changes them without any section being read for the first
 * time. The number that does not move on its own is `unadjudicated`, and it must be 0.
 *
 * Most of the unspanned ones are type tables, error-code tables and formula definitions, which
 * are legitimately not sequences. But "most" is a reading, not a measurement, so this check does
 * not convert the census into a pass or a fail. It prints the census and enforces the one floor
 * that is mechanical: a section that the specification itself numbers as a procedure run, or
 * that S19 flags as order-marked, must be spanned. What remains is reported, because a number
 * that stays visible is worth more than a green tick that hides it.
 */
function checkS20(manifest, lines) {
  const covered = new Array(lines.length + 2).fill(false);
  for (const m of manifest) {
    for (const [a, b] of spanPairs(m.spec_lines)) {
      for (let i = Math.max(1, a); i <= Math.min(lines.length, b); i += 1) covered[i] = true;
    }
  }

  const headings = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(#{3,5}) /);
    if (m) headings.push({ line: i + 1, level: m[1].length });
  });

  const adjudicated = new Map(readJsonl(SECTION_ADJUDICATIONS).map((r) => [r.section, r]));

  let full = 0; let part = 0; let none = 0; let unadjudicated = 0;
  for (const [k, h] of headings.entries()) {
    let end = lines.length;
    for (let j = k + 1; j < headings.length; j += 1) {
      if (headings[j].level <= h.level) { end = headings[j].line - 1; break; }
    }
    let c = 0;
    for (let i = h.line; i <= end; i += 1) if (covered[i]) c += 1;
    const len = end - h.line + 1;
    if (c === len) { full += 1; continue; }
    if (c === 0) none += 1; else part += 1;

    // A section is accounted for when a reader made a claim about it, of either kind: a span
    // entry that BEGINS in the section (the section carries a sequence, and the entry names the
    // lines that matter), or an adjudication (the section carries none, and here is why).
    //
    // Beginning-in matters: an entry that merely overlaps from a parent section has said nothing
    // about this one. The two claims fail differently — an unspanned sequence is a coverage gap,
    // an unadjudicated section is an unread section — so both are required to be explicit.
    const spanBeginsHere = manifest.some((m) => {
      const s = spanPairs(m.spec_lines)[0];
      return s && s[0] >= h.line && s[0] <= end;
    });
    if (spanBeginsHere) continue;

    const a = adjudicated.get(h.line);
    if (!a || !String(a.reason ?? '').trim() || !String(a.category ?? '').trim()) {
      unadjudicated += 1;
      report('S20', `line ${h.line}`,
        `section "${String(lines[h.line - 1]).replace(/^#+ /, '').slice(0, 52)}" is neither spanned nor adjudicated`);
    }
  }

  return { sections: headings.length, full, part, none, unadjudicated };
}

/**
 * S21 — a sequence may not name an operation the registry excludes.
 *
 * `excluded` asserts "this is not a Core Operation at all" — an alias, a transport procedure, a
 * schema heading. A manifest entry that names an excluded row as the operation realizing it
 * contradicts that assertion, and the contradiction is invisible unless something compares the
 * two lists.
 *
 * This check found nine real ones. Six were sequences naming an alias (`EmitStorageReceipt` for
 * `IssueStorageReceipt`, `RotateContentKeyAndReissueKeyEnvelope` for `RotateKeyEnvelope`) or a
 * non-kind (`operation.submit`, the dispatcher entry point). Three were a different error: two
 * read-only verification rows had been excluded for being read-only, when read-only is exactly
 * what the framework set is — `OBJECT_GET`, `PROOF_VERIFY` and `OPERATION_WATCH` are all
 * read-only and all framework. Those two were promoted, and the distinction is now enforced:
 * `excluded` means "not a Core Operation", never "does not change state".
 */
function checkS21(rows, manifest) {
  const excluded = new Set(rows.filter((r) => r.disposition === 'excluded').map((r) => r.kind));
  for (const m of manifest) {
    for (const k of [].concat(m.maps_to ?? [])) {
      if (excluded.has(k)) {
        report('S21', m.id, `sequence names "${k}", which the registry excludes as not a Core Operation`);
      }
    }
  }
}

/**
 * S22 — an open gap must carry a decision, not a deferral.
 *
 * The specification is a description of the space Gaia wants, not a specification of operations.
 * A place where it does not state what happens is therefore the normal condition, not an error:
 * it is the material the designer is meant to read and decide. An entry that records "the
 * implementing package must decide" has moved the author's own work to someone else and called
 * that a disposition.
 *
 * Every open gap must carry a `decision` of the settle form: the rule decided, the lines the
 * rule rests on, why those lines support it, and the fact that would overturn it. A decision
 * without an override condition is not a decision — it is an assumption that cannot be revised.
 *
 * The `rule` is prose because a decision is a judgment, and judgments are read. The `grounds`
 * are line numbers because they are checked: each must be a real line of the specification.
 *
 * An earlier form of this check also required every ground to lie inside a manifest entry's span.
 * That was wrong and reported 18 violations against correct decisions: a decision may rest on a
 * line in a section that carries no sequence at all, which is the ordinary case for a rule about
 * composition. S20 already guarantees that every section is either spanned or adjudicated, so a
 * separate coverage test here would be redundant with it as well as wrong.
 */
function checkS22(manifest, lines) {
  const isOpen = (m) => {
    if (m.resolved_by) return false;
    const v = String(m.verification ?? '');
    if (v.startsWith('not a requirement') || v.startsWith('withdrawn')) return false;
    return m.maps_to === null || m.maps_to === undefined;
  };

  let decided = 0;
  for (const m of manifest.filter((x) => x.kind === 'emergent' && isOpen(x))) {
    const d = m.decision;
    if (!d) {
      report('S22', m.id, 'open gap carries no decision — recording that someone else must decide is not a disposition');
      continue;
    }
    for (const field of ['rule', 'why', 'override']) {
      if (!String(d[field] ?? '').trim()) report('S22', m.id, `decision has no ${field}`);
    }
    const grounds = [].concat(d.grounds ?? []);
    if (!grounds.length) report('S22', m.id, 'decision rests on no line');
    for (const g of grounds) {
      if (!Number.isInteger(g) || g < 1 || g > lines.length) {
        report('S22', m.id, `decision ground ${g} is not a line of the specification`);
      }
    }
    if (String(d.rule).trim() && String(d.override).trim() && grounds.length) decided += 1;
  }
  return { decided };
}

/**
 * Members of a closed enumeration that legitimately need no operation, each with a reason.
 *
 * Some enumerations are closed lists of things the space contains (the 38 proof claims, the
 * thirteen reject-code families): every member must be reached. Others are stated as a MINIMUM —
 * line 14097 introduces OperationStatus with 少なくとも, "at least" — and requiring totality over
 * an open list would demand that statuses the specification has not written yet also be reachable.
 *
 * An exemption is a reviewed judgment, not a silence: S23 fails a member that is neither reached
 * nor named here with a reason.
 */
const TOTALITY_EXEMPTIONS = resolve(HERE, 'totality-exemptions.jsonl');

/**
 * S23 — the reverse direction: every closed enumeration the specification provides must be
 * REACHED by some operation.
 *
 * S5 already does this for one axis, and it is the shape of the whole answer: an object type must
 * have a producing operation or an excluded row with a reason. That is a totality claim — it fails
 * when the operation set is too small, which is the direction a consistency check can never see.
 *
 * S6, S7, S9, S11 and S12 all check the FORWARD direction only: that an operation's own field is
 * inside the vocabulary. That catches an invented name and cannot catch a missing operation. The
 * registry could have declared a single operation and passed every one of them.
 *
 * The specification supplies closed enumerations — 38 proof claims, thirteen reject-code families,
 * thirteen authority classes, fifteen OperationStatus values. Each is a list of things the
 * described space contains. If an operation set is total over the space, then every member of
 * every one of those lists is reached by at least one operation. That is checkable, it is the
 * direction that matters, and it was missing.
 *
 * What this does NOT establish: that the operation set is total. It establishes that it is total
 * over every enumeration the specification actually gives. An act the specification describes but
 * never enumerates can still have no operation, and no mechanical test reaches that — which is why
 * S19, S20 and S22 exist as well.
 */
function checkS23(rows, claimVocabulary) {
  const active = rows.filter((r) => r.disposition !== 'excluded');
  const exempt = new Map(readJsonl(TOTALITY_EXEMPTIONS).map((e) => [`${e.axis}:${e.member}`, e]));
  const excused = (axis, member) => {
    const e = exempt.get(`${axis}:${member}`);
    return Boolean(e && String(e.reason ?? '').trim());
  };
  const reach = (pick) => {
    const seen = new Set();
    for (const r of active) for (const v of [].concat(pick(r) ?? [])) seen.add(v);
    return seen;
  };

  const requiredClaims = reach((r) => r.required_proof_classes);
  for (const c of claimVocabulary) {
    if (!requiredClaims.has(c) && !excused('proof_claim', c)) {
      report('S23', c, 'proof claim is in the specification vocabulary but no operation requires it');
    }
  }

  const emittedFamilies = reach((r) => r.reject_code_families);
  for (const [name] of CODE_FAMILIES) {
    if (!emittedFamilies.has(name) && !excused('reject_family', name)) {
      report('S23', name, 'reject-code family is in the specification but no operation can emit it');
    }
  }

  const demandedAuthority = reach((r) => r.required_authority);
  for (const a of AUTHORITY) {
    if (!demandedAuthority.has(a) && !excused('authority', a)) {
      report('S23', a, 'authority class is in the closed vocabulary but no operation demands it');
    }
  }

  const reachedStatus = new Set();
  for (const r of active) {
    if (r.initial_status) reachedStatus.add(r.initial_status);
    for (const [from, tos] of Object.entries(r.allowed_status_transitions ?? {})) {
      reachedStatus.add(from);
      for (const to of tos) reachedStatus.add(to);
    }
  }
  for (const s of OPERATION_STATUS) {
    if (!reachedStatus.has(s) && !excused('status', s)) {
      report('S23', s, 'OperationStatus is in the closed list but no operation reaches it');
    }
  }

  return {
    claims: requiredClaims.size,
    families: emittedFamilies.size,
    authorities: demandedAuthority.size,
    statuses: reachedStatus.size,
    exempted: exempt.size,
  };
}

/**
 * Which manifest entries these checks treat as sequences.
 *
 * The test used to be the SPELLING of the id — an `S-`, `R-`, `M-`, `P-`, `I-` or `A-` prefix.
 * A spelling test is not a shape test, and it hid two classes. `I01`..`I30`, the thirty seam
 * scenarios of section 25.2, carry no hyphen, so thirty entries that name no operation and are
 * adjudicated nowhere sat outside the check written for exactly that case. And a `B-` entry was
 * excluded on the ground that a bullet section is not a sequence — true of the section, not of the
 * entry: twelve `B-`/`H-` entries carry ordered step decompositions covering 145 steps, and no
 * check examined them either.
 *
 * So the test is what the entry IS. An emergent row is governed by the emergence rules; a bullet
 * section is governed by its section adjudication; every other entry is a sequence entry; and an
 * entry that carries a step decomposition is one whatever its id says.
 */
function isSequenceEntry(m, decomposed) {
  if (decomposed.has(m.id)) return true;
  if (m.kind === 'emergent') return false;
  return !/^B-/.test(m.id);
}
/**
 * S24 — every sequence must be realized by operations, or be adjudicated as not a procedure.
 *
 * This is the check the whole apparatus exists for. A sequence is an ordered bundle of operations,
 * so the guarantee that the operation set is complete is exactly this: for every sequence the
 * specification states, the operations it needs are defined. Measured without it, that guarantee
 * is a claim; measured with it, it is a fact that fails the run when it stops holding.
 *
 * An entry is a sequence when it is not an emergent row, not a bullet section, or carries a step
 * decomposition — see `isSequenceEntry`. Such an entry is realized when
 *
 *   1. it names operations, every operation it names is a registry row, and a reader has confirmed
 *      that the entry states an ordered procedure; or
 *   2. another entry over the same lines names them AND cites lines inside this entry's span —
 *      `R-` rows are the detector's raw output and `A-` rows are the reading of the same lines, so
 *      the reading realises the run; or
 *   3. `sequence-adjudications.jsonl` records that it is not a procedure, with a category, a
 *      reason, and the line a reader opened to confirm it.
 *
 * The `R-` rows are why this check matters. `R-` comes from a numbered-LIST detector, and a
 * numbered list is not a procedure: invariant lists, property lists and transport internals all
 * fire it. Those entries carried a `reason` and looked recorded, but no one had asked whether they
 * were sequences at all. A reason is not an adjudication.
 *
 * The first two clauses were in exactly that state until the acceptance pass. Naming an operation
 * is not stating a procedure, and a neighbour whose span reaches your first line to your last has
 * not thereby read anything in between — a span is a range a reader was assigned, not evidence
 * that the reader went there. Both clauses accepted an entry on an untested claim, which is the
 * shape the adjudication clause was in before the forty-one audits, and the shape of the eight
 * `defining_section` claims that turned out to be false. So each now carries its own test: a signed
 * reading for the first, and a citation inside the span for the second.
 */
function checkS24(manifest, rows, decomposed, lines) {
  const kinds = new Set(rows.map((r) => r.kind));
  const adjudicated = new Map(readJsonl(SEQUENCE_ADJUDICATIONS).map((r) => [r.entry, r]));
  const spanOf = (m) => (Array.isArray(m.spec_lines) && m.spec_lines.length === 2 ? m.spec_lines : null);
  const namesOps = (m) => Array.isArray(m.maps_to) && m.maps_to.length > 0;

  // The reading an entry carries once a reader has opened its lines and answered whether they state
  // an ordered procedure. Returns null when the reading stands, or the reason it does not.
  const readingRefused = (m) => {
    const r = m.entry_reading;
    if (!r || r.is_sequence !== true) return 'no reader has confirmed that this entry states an ordered procedure';
    if (!Number.isInteger(r.line)) return 'the entry reading carries no line';
    if (r.line < 1 || r.line > lines.length || !isOpenableLine(lines, r.line)) {
      return `the entry reading cites line ${r.line}, which is not a line a reader can open`;
    }
    const s = spanOf(m);
    if (s && (r.line < s[0] || r.line > s[1])) {
      return `the entry reading cites line ${r.line}, outside the entry's own span ${s[0]}..${s[1]}`;
    }
    if (!String(r.note ?? '').trim()) return 'the entry reading states no note';
    return null;
  };

  let direct = 0; let viaNeighbour = 0; let excused = 0;
  // An entry is realized either by naming operations or by a neighbour whose span contains it.
  // Both are ways of being accounted for, and the supersession clause at the end of this check
  // must accept both or it fails correct work — which is how it was written the first time.
  const realized = new Set();
  for (const m of manifest.filter((x) => isSequenceEntry(x, decomposed))) {
    const ops = [].concat(m.maps_to ?? []);
    if (ops.length) {
      for (const k of ops) {
        if (!kinds.has(k)) report('S24', m.id, `sequence names "${k}", which is not a registry row`);
      }
      const refused = readingRefused(m);
      if (refused) { report('S24', m.id, `sequence names operations and ${refused}`); continue; }
      realized.add(m.id);
      direct += 1;
      continue;
    }

    // The neighbour must COVER the entry, not merely touch it.
    //
    // The clause above says a reader's entry realises the detector's run over the same lines. The
    // test for "the same lines" was a plain intersection, and intersection is not sameness: twelve
    // of the pairs it accepted shared fewer than five lines, and two shared exactly one —
    // A-14147 [14147,14147] was realised by P-14147 [14147,14147]. An entry whose span touches its
    // neighbour at a single line has not been read; it has been next to something that was.
    //
    // And coverage is not reading either. A neighbour whose span runs from 8714 to 8951 covers
    // every entry between them; that says where the neighbour was assigned to read, not where it
    // went. Twenty-three entries were realised this way and five of them are covered by a neighbour
    // that cites not one of their lines — R-8942 is covered by an entry of eighty-three steps, none
    // of them inside 8942..8947. So the neighbour must now cite a line inside this entry's span.
    // The adjudication is read BEFORE the neighbour, and the order is the check's meaning.
    //
    // An entry can be both: R-733 is the detector's run over lines 733..737, and A-731 is a reading
    // whose span begins two lines earlier and whose steps cite every one of them. A-731 states a
    // procedure there — with its lead-in. R-733 is the same five lines without the lead-in, and
    // alone they state three conditional failure outcomes and one act. So A-731 read these lines
    // AND R-733 is not a procedure, and neither fact cancels the other. A ruling that the entry is
    // not a sequence settles the entry; there is nothing left for a neighbour to realise.
    // A superseded row settles nothing — it is a retraction, and the entry it retracts stands on
    // whatever realises it now. Reading it as live would let a withdrawn judgment excuse an entry
    // a neighbour has since read, which is the opposite of what superseding it recorded.
    const a = adjudicated.get(m.id);
    const live = a && !a.superseded ? a : null;
    if (live && String(live.category ?? '').trim() && String(live.reason ?? '').trim()) {
      // A reason is not an adjudication until someone has tested it. The rest of this branch is
      // shared with the clause below and is written once, after it.
    } else {
      const s = spanOf(m);
      const reaches = (o) => (decomposed.get(o.id) ?? [])
        .some((x) => x.spec_line >= s[0] && x.spec_line <= s[1]);
      const neighbour = s && manifest.find((o) => o !== m && namesOps(o)
        && spanOf(o) && spanOf(o)[0] <= s[0] && spanOf(o)[1] >= s[1] && reaches(o));
      // A reader may still report that a neighbour which does cite inside did not read these acts.
      // That answer is not overruled by the mechanical test above; it sends the entry on to the
      // adjudication clause, which is where an entry that no reading realises belongs.
      if (neighbour && m.entry_reading?.realized_by_neighbour !== false) {
        const refused = readingRefused(m);
        if (refused) { report('S24', m.id, `a neighbour covers this entry and ${refused}`); continue; }
        realized.add(m.id);
        viaNeighbour += 1;
        continue;
      }
      report('S24', m.id,
        'sequence-shaped entry names no operation, no neighbour reads its lines, and it is not adjudicated as a non-sequence');
      continue;
    }
    // A reason is not an adjudication until someone has tested it.
    //
    // The clause above accepted a row that carried a category and a reason. Forty-one rows did,
    // and no one had asked whether they were true. They were then put to readers one at a time,
    // each asked whether its region states an ordered procedure; all forty-one were confirmed,
    // and each confirmation carries the line that shows it. An untested excuse is now a failure
    // rather than a silence, because "not a sequence" is a claim about the specification.
    if (!a.audit || a.audit.confirmed !== true || !Number.isInteger(a.audit.line)) {
      report('S24', m.id, 'the adjudication carries no audit: no one has tested whether the region states a procedure');
      continue;
    }
    if (a.audit.line < 1 || a.audit.line > lines.length || !isOpenableLine(lines, a.audit.line)) {
      report('S24', m.id, `the audit's confirming line ${a.audit.line} is not a line a reader can open`);
      continue;
    }
    // And the audit is itself a claim about the specification, so it carries the reader who was
    // sent to break it. Forty-one excuses were confirmed by a reader who agreed with them; a
    // reader who agrees is not a test. Of the thirty-three large rulings that were attacked, one
    // fell — A-5672, whose span contains line 5777, where the peer confirms the handshake hash and
    // then signs the unsigned projection, an order 5775's no-self-hash rule makes mandatory.
    if (!a.audit.adversarial || a.audit.adversarial.upholds !== true) {
      report('S24', m.id, 'the adjudication carries no adversarial reading: no one has tried to falsify it');
      continue;
    }
    if (!Number.isInteger(a.audit.adversarial.line) || a.audit.adversarial.line < 1
      || a.audit.adversarial.line > lines.length || !isOpenableLine(lines, a.audit.adversarial.line)) {
      report('S24', m.id, `the adversarial reading's line ${a.audit.adversarial.line} is not a line a reader can open`);
      continue;
    }
    if (!String(a.audit.adversarial.note ?? '').trim()) {
      report('S24', m.id, 'the adversarial reading states no note');
      continue;
    }
    excused += 1;
  }

  // Every adjudication row is accounted for. A row whose entry is now realized — it names
  // operations, or a neighbour covers it — no longer states the entry's disposition, and leaving
  // it unmarked lets a later pass act on a judgment that has been overtaken.
  let superseded = 0;
  for (const [id, a] of adjudicated) {
    if (realized.has(id)) {
      if (!a.superseded) report('S24', id, 'the entry now names operations, and its adjudication as a non-sequence is not marked superseded');
      else superseded += 1;
      continue;
    }
    if (a.superseded) report('S24', id, 'the adjudication is marked superseded and the entry still names no operation');
  }
  // Counted over the whole manifest rather than over the entries this check realized. A reading on
  // an entry S24 never examined is a reading nobody needed, and the two counts would agree only if
  // they were the same number, which is the kind of agreement that hides the case it is meant for.
  const readings = manifest.filter((m) => m.entry_reading?.is_sequence === true).length;
  return { direct, viaNeighbour, excused, superseded, readings };
}

/**
 * S25 — the reverse direction for operations: every operation is either placed in a sequence or
 * accounted for as a single-step one.
 *
 * S2 asks whether an unsequenced operation carries a note. S25 asks the harder question the note
 * was standing in for: on what is the operation's existence based? An operation the specification
 * never places in any ordered flow is legitimate — `SubmitNeed` produces a `NeedSubmission` and is
 * governed by that object's validity rules, which is its whole procedure — but it must say so, and
 * name the section that defines it.
 *
 * This is the closure that keeps the operation set from growing silently. An operation resting on
 * nothing but a plausible name fails here, and so does one whose defining section does not exist.
 */
/**
 * The registry's section 4.2 rules: the acts the specification names and never defines, for which
 * the design supplies the procedure. S25 and S31 both read them, so the block is parsed once.
 */
function namedActRules(registryText) {
  const blocks = jsonlBlocks(registryText);
  if (blocks.length < 3) return null;
  return blocks[2].split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}

function checkS25(rows, lines, registryText) {
  const headings = lines
    .map((l, i) => ({ line: i + 1, text: l }))
    .filter((h) => /^#{3,5} /.test(h.text));
  // An unsequenced operation stands on one of two things: a section that states its whole
  // procedure as validity rules, or a rule at 4.2 for an act the specification never defines.
  // The second is a decision, and S31 holds it to the row; here it is only the claim that one
  // exists, so that a row cannot be unsequenced on the strength of a deleted sentence.
  const supplied = new Set((namedActRules(registryText) ?? []).map((r) => r.kind));

  let positioned = 0; let singleStep = 0; let suppliedRule = 0;
  for (const r of rows) {
    if (r.disposition === 'excluded') continue;
    if (r.position && r.position !== 'unsequenced') { positioned += 1; continue; }

    const section = String(r.evidence?.defining_section ?? '').trim();
    if (!section) {
      if (supplied.has(r.kind)) { suppliedRule += 1; continue; }
      report('S25', r.kind, 'unsequenced operation names neither a section that defines it nor a rule this design supplies');
      continue;
    }
    // "section 23.8 (NeedSubmission)" -> the number must be a real heading of the specification
    const m = section.match(/section\s+([0-9][0-9.]*)/);
    if (!m) { report('S25', r.kind, `defining section "${section}" names no section number`); continue; }
    const found = headings.some((h) => new RegExp(`^#{3,5} ${m[1].replace(/\./g, '\\.')}[ .]`).test(h.text));
    if (!found) {
      report('S25', r.kind, `defining section ${m[1]} is not a heading of the specification`);
      continue;
    }
    singleStep += 1;
  }
  return { positioned, singleStep, suppliedRule };
}

/**
 * S26 — every realized sequence is an ORDERED STEP DECOMPOSITION bound one-to-one to operations.
 *
 * S24 establishes that a sequence names operations that exist. That is an index of a sequence, not
 * the sequence: `maps_to` is an unordered set, so nothing said which step an operation performs, in
 * what order, or by whom. The claim "the sequence is satisfied by neither too many nor too few
 * operations" is unstatable against an index, because there is no step to check against.
 *
 * This check fixes the target. For every sequence that names operations, `sequence-steps.jsonl`
 * must give an ordered decomposition in which
 *
 *   - each step carries a subject, a predicate, an object and a contract, and cites the
 *     specification line that states it;
 *   - the steps are numbered 1..n with no gap;
 *   - every operation the sequence names appears in exactly one step, and
 *   - every operation a step binds is one the sequence names.
 *
 * That last pair is a bijection, and until the repair pass it was the whole of this check's value:
 * an operation the sequence needs but no step performs failed, and so did a step performing an
 * operation the sequence never needed. It is now a consistency invariant and nothing more.
 *
 * The repair pass derived `maps_to` FROM the steps, because two fields assigned independently
 * diverge in the same direction — `position` and `maps_to` agreed on all 174 rows and were both
 * read from the same window, so their agreement proved nothing. Deriving one from the other closed
 * that class structurally. What it also did is make this clause unable to fail: measured over all
 * 109 decomposed entries, `maps_to` equals the set of operations their steps bind in every one, so
 * the two loops below can never report. They are kept because they do stop the two files drifting
 * apart — the same check that used to measure completeness now catches only a later edit that
 * touches one file and not the other.
 *
 * **Completeness of the reading is no longer measured here, and no check in this apparatus measures
 * it.** The operation a sequence needs and nobody bound is invisible to a bijection between two
 * products of the same reading. A candidate replacement — report an operation name occurring inside
 * an entry's span that none of its steps binds — was measured over all 109 entries and fires on
 * five, and all five are false: two are substring matches (`AdvertisementDeliveryPolicy` for
 * `AdvertisementDelivery`, `CanPublishAsset` for `PublishAsset`), and three are a state or a chain
 * named as a precondition. A name appearing near a region is the signal that produced the
 * fabrications, and a check built on it inherits their error. What completeness rests on is the
 * entry-level reading each sequence now carries, required by S24.
 *
 * A step may carry NO operation, and then it is a SUB-STEP: a stage of the specification's own
 * numbered procedure that no registered operation performs, folded into the step that governs it.
 * The specification's granularity is kept rather than flattened, and the sub-step must still carry
 * its contract, so what happens inside an operation is written down instead of being lost. A
 * sequence of nothing but sub-steps fails — the sub-step is an elaboration of an operation, not a
 * substitute for one.
 */
const STEP_FIELDS = ['subject', 'predicate', 'object', 'contract'];

function checkS26(manifest, rows, lines, hasDecomposition) {
  const kinds = new Set(rows.map((r) => r.kind));
  const bySeq = new Map();
  for (const s of readJsonl(SEQUENCE_STEPS)) {
    if (!bySeq.has(s.seq)) bySeq.set(s.seq, []);
    bySeq.get(s.seq).push(s);
  }

  let decomposed = 0; let steps = 0; let substeps = 0;
  // Only sequence-shaped entries. A `B-` bullet section or an `E-` emergent entry may name
  // operations without being an ordered procedure, and demanding a step decomposition of those
  // would be the same category error S24 exists to catch.
  for (const m of manifest.filter((x) => isSequenceEntry(x, hasDecomposition)
    && Array.isArray(x.maps_to) && x.maps_to.length)) {
    const named = [].concat(m.maps_to);
    const declared = bySeq.get(m.id) ?? [];
    if (!declared.length) {
      report('S26', m.id, 'sequence names operations but has no ordered step decomposition');
      continue;
    }

    const ordered = declared.slice().sort((a, b) => a.step - b.step);
    ordered.forEach((s, i) => {
      if (s.step !== i + 1) report('S26', m.id, `steps are not numbered 1..n (found ${s.step} at position ${i + 1})`);
      for (const f of STEP_FIELDS) {
        if (!String(s[f] ?? '').trim()) report('S26', m.id, `step ${s.step} has no ${f}`);
      }
      if (!Number.isInteger(s.spec_line) || s.spec_line < 1 || s.spec_line > lines.length) {
        report('S26', m.id, `step ${s.step} cites no valid specification line`);
      }
      const op = s.operation;
      if (op === null || op === undefined || op === '') {
        substeps += 1; // an elaboration of the governing operation, not a unit of the sequence
      } else if (!kinds.has(op)) {
        report('S26', m.id, `step ${s.step} binds "${op}", which is not a registry row`);
      }
    });

    const bound = new Set(ordered.filter((s) => s.operation).map((s) => s.operation));
    if (!bound.size) {
      report('S26', m.id, 'every step is a sub-step, so the sequence names no operation it performs');
    }
    for (const o of named) {
      if (!bound.has(o)) report('S26', m.id, `operation "${o}" is needed by the sequence but no step performs it`);
    }
    for (const o of bound) {
      if (!named.includes(o)) report('S26', m.id, `step binds "${o}", which the sequence does not name`);
    }
    steps += ordered.length;
    decomposed += 1;
  }
  return { decomposed, steps, substeps };
}

/**
 * S27 — a step is stated by PROSE, not by a table.
 *
 * S26 asks whether the steps form an ordered bijection with the operations the sequence names.
 * That is a shape, and a shape can be produced without reading. The first version of
 * sequence-steps.jsonl was built by matching each operation to whichever line of the entry's
 * window mentioned its result object and then writing a plausible subject and predicate around the
 * match. A-525 — citation issuance, section 3.1 — carried twenty-five steps instructing the
 * Payment-Service to accept receipts, settle payments, create maturity bonds and allocate seed
 * budgets. Twenty-one of them cited rows of the "objects other than ordinary certificates" table at
 * lines 539-549, each row naming the object that operation produces. Every step cited a line inside
 * the entry's span. Every step carried a subject, a predicate, an object and a contract. Both
 * directions of the bijection held. The sequence was fiction.
 *
 * No shape check can see that, because the defect is not in the shape: it is in WHERE the cited
 * line sits. A procedure step is stated by a sentence an implementer executes. A table row is a
 * cell of an inventory; it states what a thing IS, never what anyone DOES, so a step citing one has
 * taken its operation from the entry's index rather than from its text.
 *
 * The rule is about the shape of the CITED LINE and nothing else, and that narrowness is the
 * point. Two wider forms were tried and rejected by measurement:
 *
 *   - "any section adjudicated as one of the twelve non-procedure categories" fired 20 times
 *     against correct work, because a state-machine transition list and a prohibition-list section
 *     are both legitimately cited by the steps that read them.
 *   - "a line in a section adjudicated object_inventory or type_table" fired 6 times against
 *     correct work for the same reason at a finer grain: section 19.2 is adjudicated type_table
 *     because it contains the PaymentState and FulfillmentState enumerations, but the same section
 *     also states, at 9451, that the Payment-Service processes payment and the service provider
 *     signs the fulfilment — prose a step may cite.
 *
 * Measured against the twenty-five fabricated steps of A-525 the rule fires 21 times; against the
 * 1436 steps re-read from the specification for the same entries it fires zero times. A rule that
 * fails correct work is a defect in the rule, so it was narrowed until it did not.
 *
 * One more distinction was needed and is drawn here. The specification uses `|` for two unrelated
 * things: as a Markdown table column separator, and as the union operator of a type declaration
 * inside a fenced block — `status: "pending_successor" | "active" | "retired" ...`, one member per
 * line. Of the 602 lines matching /^\s*\|/, 91 are the second kind. A fenced line is code, not an
 * inventory, so the test excludes fenced lines. No step currently cites one, which is exactly why
 * the distinction is drawn now rather than after a false report.
 */
const isTableRow = (line) => /^\s*\|/.test(line);
/** The opening line of a type or schema declaration: \`SomeRecord {\`, optionally generic. */
const isTypeDeclaration = (line) => /^\s*[A-Z][A-Za-z0-9_]*(?:<[^>]*>)?\s*\{\s*$/.test(line);
/** A line that is one identifier and nothing else. */
const isBareIdentifier = (line) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*$/.test(line);
/** A field declaration inside a code block: indented, a lowercase name, a colon, a value. */
const isFieldDeclaration = (line) => /^\s{2,}[a-z_][a-z0-9_]*\??\s*:\s*\S/.test(line);

/**
 * Why this line states what a thing IS rather than what anyone DOES, or null if it states neither.
 *
 * S27's first rule caught only Markdown table rows, and a table row is one member of a larger
 * class: an INVENTORY line. A type declaration's opening line, a bare identifier inside a code
 * block, and a field declaration are the same kind of statement — \`StorageAvailabilityProof {\`
 * says what the object is made of, never that the provider answered the challenge. Eleven steps
 * cited such a line, each because the line names the object the act produces.
 *
 * The predicates were measured against the whole specification before they were adopted, because
 * a rule that fails correct work is a defect in the rule. \`isTypeDeclaration\` matches 78 lines,
 * every one of them inside a fence and none in prose. \`isBareIdentifier\` matches 16 prose lines
 * and 1265 fenced ones, so it is applied only inside a fence, where a bare identifier is an
 * inventory entry and not a heading.
 */
function inventoryKind(lines, fenced, n) {
  const line = lines[n - 1] ?? '';
  if (!line.trim()) return 'a blank line';
  if (/^\s*```/.test(line)) return 'a fence marker';
  if (!fenced[n] && isTableRow(line)) return 'a Markdown table row';
  if (isTypeDeclaration(line)) return 'the opening line of a type declaration';
  if (fenced[n] && isBareIdentifier(line)) return 'a bare identifier inside a code block';
  if (fenced[n] && isFieldDeclaration(line)) return 'a field declaration inside a code block';
  return null;
}

/** True for every line inside a fenced code block, including the fence lines themselves. */
function fencedLines(lines) {
  const fenced = new Array(lines.length + 2).fill(false);
  let open = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { open = !open; fenced[i + 1] = true; return; }
    fenced[i + 1] = open;
  });
  return fenced;
}

function checkS27(manifest, lines, decomposed) {
  const fenced = fencedLines(lines);
  let examined = 0;
  let quoted = 0;
  for (const s of readJsonl(SEQUENCE_STEPS)) {
    const m = manifest.find((x) => x.id === s.seq);
    if (!m || !isSequenceEntry(m, decomposed)) continue;
    examined += 1;

    const span = spanPairs(m.spec_lines)[0] ?? null;
    if (span && (s.spec_line < span[0] || s.spec_line > span[1])) {
      report('S27', s.seq, `step ${s.step} cites line ${s.spec_line}, outside the entry's span ` +
        `[${span[0]},${span[1]}]: the entry does not state this step`);
      continue;
    }
    const inventory = inventoryKind(lines, fenced, s.spec_line);
    if (inventory) {
      report('S27', s.seq, `step ${s.step} cites line ${s.spec_line}, which is ${inventory}: ` +
        'an inventory states what a thing is, never what anyone does');
      continue;
    }
    const q = String(s.quote ?? '');
    if (!q.trim()) { report('S27', s.seq, `step ${s.step} carries no quote from line ${s.spec_line}`); continue; }
    if (!lines[s.spec_line - 1].includes(q)) {
      report('S27', s.seq, `step ${s.step} quotes text that line ${s.spec_line} does not contain`);
      continue;
    }
    quoted += 1;
  }
  return { examined, quoted };
}

/**
 * S28 — a gap the specification does not close is closed by the design, in the design.
 *
 * Nineteen emergent entries survived two whole-specification searches, each run to falsify the
 * claim that no line governs them. Those entries carry a `decision` — the rule this design adopts,
 * the lines it rests on, why, and the fact that would overturn it. Until this check existed that
 * decision lived only in the manifest, which is the record of a FINDING, not of a design. An
 * operation implementer reading the registry would not have seen it.
 *
 * So the rule is also written into the registry, in section 4.1, and this check holds the two
 * copies to each other field for field. Neither can drift without the run failing.
 *
 * Its second clause is the one that caught a real defect while it was being written. Every ground
 * a decision rests on must be a LINE — text a reader can open. Eight of the 133 recorded grounds
 * were not: three were fence markers and five were blank lines, and three `why` clauses cited a
 * line number one line above the line they were arguing from. A decision grounded on a blank line
 * is a decision grounded on nothing, and the citation is the only part of it a machine can check.
 */
const GROUND_CITATION = /(?:^|[^\d])(\d{3,5})\s+(states|says|requires|makes|fixes|gives|defines|names|places|bars|shows|calls|opens|lists|scopes)\b/g;

/** True for a line a reader can open: it carries text and is not a fence marker. */
function isOpenableLine(lines, n) {
  const text = lines[n - 1];
  return typeof text === 'string' && text.trim() !== '' && !/^\s*```/.test(text);
}

/**
 * The emergent entries that are still open: no `resolved_by`, not withdrawn, and naming no
 * operation. Defined once and used by both S28 and the summary, so the two cannot disagree about
 * what "open" means.
 */
function openEmergentOf(manifest) {
  return manifest.filter((m) => m.kind === 'emergent').filter((m) => {
    if (m.resolved_by) return false;
    const v = String(m.verification ?? '');
    if (v.startsWith('not a requirement')) return false;
    if (v.startsWith('withdrawn')) return false;
    return m.maps_to === null || m.maps_to === undefined;
  });
}

/** Every fenced jsonl block of a document, in order. */
function jsonlBlocks(text) {
  return [...text.matchAll(/```jsonl\n([\s\S]*?)```/g)].map((m) => m[1]);
}

function checkS28(manifest, lines, registryText) {
  const blocks = jsonlBlocks(registryText);
  if (blocks.length < 2) {
    report('S28', '-', 'the registry carries no section 4.1 block of rules supplied where the specification is silent');
    return { recorded: 0, open: openEmergentOf(manifest).length };
  }
  const recorded = blocks[1].split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
  const byGap = new Map(recorded.map((r) => [r.gap, r]));
  const open = openEmergentOf(manifest);

  for (const m of open) {
    const r = byGap.get(m.id);
    if (!r) {
      report('S28', m.id, 'gap is open and carries a decision, and no registry row states the rule');
      continue;
    }
    for (const f of ['rule', 'why', 'override', 'affects']) {
      if (!String(r[f] ?? '').trim()) report('S28', m.id, `the rule states no ${f}`);
    }
    // The two copies of one decision must agree exactly; a difference means one of them is stale.
    for (const f of ['rule', 'why', 'override']) {
      if (String(r[f] ?? '') !== String(m.decision?.[f] ?? '')) {
        report('S28', m.id, `the registry's ${f} differs from the decision the manifest records`);
      }
    }
    if (JSON.stringify(r.grounds) !== JSON.stringify(m.decision?.grounds)) {
      report('S28', m.id, "the registry's grounds differ from the decision the manifest records");
    }
    if (!Array.isArray(r.grounds) || !r.grounds.length) {
      report('S28', m.id, 'the rule rests on no ground');
    } else {
      for (const g of r.grounds) {
        if (!Number.isInteger(g) || g < 1 || g > lines.length) report('S28', m.id, `ground ${g} is out of range`);
        else if (!isOpenableLine(lines, g)) report('S28', m.id, `ground ${g} is a blank line or a fence marker, not a line a reader can open`);
      }
    }
  }
  for (const r of recorded) {
    if (!open.some((m) => m.id === r.gap)) {
      report('S28', r.gap, 'a rule is stated for a gap that is not open');
    }
  }
  // A decision argued from a line must cite that line, not the blank line above it.
  for (const m of manifest) {
    const why = String(m.decision?.why ?? '');
    for (const [, cited] of why.matchAll(GROUND_CITATION)) {
      const n = Number(cited);
      if (n < 1 || n > lines.length) report('S28', m.id, `the reasoning cites line ${n}, which does not exist`);
      else if (!isOpenableLine(lines, n)) report('S28', m.id, `the reasoning cites line ${n}, which is a blank line or a fence marker`);
    }
  }
  return { recorded: recorded.length, open: open.length };
}

/**
 * S29 — every step carries the verdict of the reader who asked whether its line states it.
 *
 * S27 checks three things a machine can see: the cited line is inside the entry, it is not an
 * inventory line, and the quote is a substring of it. Those are necessary and they are not the
 * question. The question is whether the line STATES the step, and that is a reading.
 *
 * It has now been read. Every step was put to a reader with one question — does this cited line
 * state this actor performing this act — and the answer is recorded on the step as `grounding`.
 * The verdicts are `stated`, and four ways of not being stated:
 *
 *   - `inventory`  the line is an inventory entry: a schema, a field list, a formula, an endpoint list
 *   - `condition`  the line states a rule, a prohibition or a boundary, not an act
 *   - `scope`      the line says what a section governs, not what anyone does
 *   - `elsewhere`  the line states a different act from the one the step records
 *   - `duplicate`  the step restates another step of the same sequence
 *
 * A `duplicate` is not a verdict this file tolerates: a step counted twice is a step that does
 * not exist, and the two renderings of one act were both numbered as steps, which is why S26 —
 * which checks the numbering — could not see them. Those steps are removed and the check fails if
 * one comes back.
 *
 * The other four remain, and they are the honest size of a backlog rather than a pass. They are
 * printed on every run. A step whose line does not state it is a step the specification does not
 * state, and repairing one means either re-citing it to the line that does, folding it into the
 * contract of the operation it elaborates, or dropping it — each of which is a reading, and none
 * of which is done by this check.
 */
const STEP_GROUNDING_VERDICTS = ['stated', 'inventory', 'condition', 'scope', 'elsewhere', 'duplicate', 'duplicate_operation'];

function checkS29(manifest, decomposed) {
  const counts = {};
  let examined = 0;
  for (const s of readJsonl(SEQUENCE_STEPS)) {
    const m = manifest.find((x) => x.id === s.seq);
    if (!m || !isSequenceEntry(m, decomposed)) continue;
    examined += 1;
    const g = s.grounding;
    if (!g || !STEP_GROUNDING_VERDICTS.includes(g.verdict)) {
      report('S29', s.seq, `step ${s.step} carries no grounding verdict: no one has asked whether its line states it`);
      continue;
    }
    if (g.verdict !== 'stated' && !String(g.note ?? '').trim()) {
      report('S29', s.seq, `step ${s.step} is recorded as ${g.verdict} with no reason`);
      continue;
    }
    if (g.verdict === 'duplicate') {
      report('S29', s.seq, `step ${s.step} restates another step of the same sequence and was not removed`);
      continue;
    }
    counts[g.verdict] = (counts[g.verdict] || 0) + 1;
  }
  return { examined, counts };
}
/**
 * S30 — every row carries the verdict of the reader who asked whether its line DEFINES it.
 *
 * S13 checks that a row’s evidence lines are in range. That is not the question either. The
 * question is whether the cited line defines the operation, and a spot check found it wrong at a
 * high rate: of the 35 operations that had lost their position, 15 were grounded on a line that
 * merely MENTIONED them — one that forbids the operation, lists it in an allowlist, or cites it in
 * a conformance matrix. A prohibition is not a definition: a line saying "this operation may not be
 * performed while frozen" tells you the operation exists, never what it is.
 *
 * All 257 rows were then put to readers on exactly that question. `definition` keeps the line;
 * `mention` was re-grounded on the line that states the act. Two further classes are legitimate and
 * are named rather than excused: `interface_inventory` for a transport frame, whose definition IS the
 * interface surface inventory, and `no_producer` for an object type the specification registers and no
 * operation produces.
 *
 * The check enforces the shape of the record and that a re-grounded row actually cites the line it
 * was re-grounded on. Rows where the first search found no defining line are flagged `unresolved` and
 * counted on every run — a backlog that is printed rather than hidden.
 */
const EVIDENCE_GROUNDING = ['definition', 'mention', 'interface_inventory', 'no_producer', 'not_an_operation', 'designer_supplied'];

function checkS30(rows, lines) {
  const counts = {};
  let unresolved = 0;
  for (const r of rows) {
    const g = r.evidence?.grounding;
    if (!g || !EVIDENCE_GROUNDING.includes(g.classification)) {
      report('S30', r.kind, 'the row carries no evidence grounding: no one has tested whether its cited line defines it');
      continue;
    }
    counts[g.classification] = (counts[g.classification] || 0) + 1;
    if (g.classification === 'no_producer') {
      if (g.line !== null) report('S30', r.kind, 'a row with no producing operation names a line');
      continue;
    }
    if (!Number.isInteger(g.line) || g.line < 1 || g.line > lines.length) {
      report('S30', r.kind, `the grounding line ${g.line} is out of range`);
      continue;
    }
    if (!isOpenableLine(lines, g.line)) {
      report('S30', r.kind, `the grounding line ${g.line} is a blank line or a fence marker`);
      continue;
    }
    if (g.classification === 'mention' && !(r.evidence.spec_lines || []).includes(g.line)) {
      report('S30', r.kind, `the row is recorded as re-grounded on ${g.line} and does not cite it`);
      continue;
    }
    // A row whose cited line neither defines it nor mentions it is a row nobody has decided. An
    // unresolved flag used to be printed here as the honest size of a backlog; the backlog is now
    // closed, so the flag is a failure rather than a count. It returns the moment a new row the
    // search cannot ground is added without the design answering it.
    if (g.unresolved === true) {
      unresolved += 1;
      report('S30', r.kind, 'the row records that no line defines it and carries no decision: the specification names the act and never states it');
    }
  }
  return { counts, unresolved };
}

/**
 * S31 — the rules this design supplies for the acts the specification names and never defines.
 *
 * Eight rows cite a line that neither defines them nor mentions them in any defining way. Every
 * one is an act the specification uses — in an allowlist, in a denylist, in a prohibition, or in
 * a sentence that sends the reader to a procedure it never states — and no line states it. That
 * is not a defect in the rows: the names come from the specification and the acts are real, and
 * a registry that dropped them would lose the very acts the specification refuses to let anyone
 * perform while a body is unhealthy or a forum is frozen.
 *
 * It is not a licence to invent either. The design decides, and the decision is written into the
 * registry at 4.2 and held to the row here. Four things are checked, and each one closes a way
 * the decision could be a relabelling rather than a decision:
 *
 *   - `spec_name` must occur on the `presupposition` line. The rule must name what the
 *     specification calls the act, at a line that carries that name, so a rule cannot rest on
 *     lines that never mention the thing it governs.
 *   - the row must cite one of the rule's grounds, and its grounding line must be one of them, so
 *     the row and the rule cannot drift apart.
 *   - the row must carry no `defining_section`. These rows used to claim one — "section 15.1
 *     (CreateAuthorityDelegation)", "section 14.6 (RequestRevalidation)" — and the claim was
 *     false: the section states the states or the keys, not the act. A row whose section does not
 *     define it may not name one.
 *   - an `alias` rule must name a `covers` kind that has a `stated_here` rule, so a name cannot be
 *     parked as an alias to escape the question of what the act is.
 */
function checkS31(rows, lines, registryText) {
  const blocks = jsonlBlocks(registryText);
  if (blocks.length < 3) {
    report('S31', '-', 'the registry carries no section 4.2 block of rules for the acts the specification names and never defines');
    return { recorded: 0, supplied: 0, aliases: 0 };
  }
  const recorded = blocks[2].split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
  const byKind = new Map(recorded.map((r) => [r.kind, r]));
  const supplied = rows.filter((r) => r.evidence?.grounding?.classification === 'designer_supplied');

  for (const r of supplied) {
    const rule = byKind.get(r.kind);
    if (!rule) {
      report('S31', r.kind, 'the row records that no line defines it and section 4.2 states no rule for it');
      continue;
    }
    if (r.evidence.defining_section) {
      report('S31', r.kind, `the row claims the defining section ${r.evidence.defining_section} and no section defines it`);
    }
    const cited = r.evidence.spec_lines || [];
    if (!rule.grounds.some((g) => cited.includes(g))) {
      report('S31', r.kind, 'the row cites none of the lines its rule rests on');
    }
    if (!cited.includes(rule.presupposition)) {
      report('S31', r.kind, `the line carrying the specification's own name for the act, ${rule.presupposition}, is not cited by the row`);
    }
    if (!rule.grounds.includes(r.evidence.grounding.line)) {
      report('S31', r.kind, 'the row is grounded on a line its rule does not rest on');
    }
  }

  for (const rule of recorded) {
    if (!supplied.some((r) => r.kind === rule.kind)) {
      report('S31', rule.kind, 'a rule is stated for an act no row records as having no defining line');
    }
    for (const f of ['act', 'rule', 'why', 'override', 'spec_name']) {
      if (!String(rule[f] ?? '').trim()) report('S31', rule.kind, `the rule states no ${f}`);
    }
    if (!['stated_here', 'alias'].includes(rule.disposition)) {
      report('S31', rule.kind, `disposition ${rule.disposition} is neither stated_here nor alias`);
    }
    if (!Array.isArray(rule.grounds) || !rule.grounds.length) {
      report('S31', rule.kind, 'the rule rests on no ground');
    } else {
      for (const g of rule.grounds) {
        if (!Number.isInteger(g) || g < 1 || g > lines.length) report('S31', rule.kind, `ground ${g} is out of range`);
        else if (!isOpenableLine(lines, g)) report('S31', rule.kind, `ground ${g} is a blank line or a fence marker, not a line a reader can open`);
      }
    }
    if (!Number.isInteger(rule.presupposition) || !isOpenableLine(lines, rule.presupposition)) {
      report('S31', rule.kind, `the presupposition line ${rule.presupposition} is not a line a reader can open`);
    } else if (!String(lines[rule.presupposition - 1]).includes(rule.spec_name)) {
      report('S31', rule.kind, `the specification does not use the name "${rule.spec_name}" at line ${rule.presupposition}`);
    }
    if (rule.disposition === 'alias') {
      const target = byKind.get(rule.covers);
      if (!target) report('S31', rule.kind, `the alias covers ${rule.covers}, for which no rule is stated`);
      else if (target.disposition !== 'stated_here') report('S31', rule.kind, `the alias covers ${rule.covers}, which is itself an alias`);
    } else if (rule.covers) {
      report('S31', rule.kind, 'a rule states an act and names a covered kind');
    }
  }
  return {
    recorded: recorded.length,
    supplied: supplied.length,
    aliases: recorded.filter((r) => r.disposition === 'alias').length,
  };
}
/**
 * S32 — a step states an ACT, and a prohibition is not an act.
 *
 * S29 put every step to a reader with one question: does the cited line state this step. That
 * question has a blind spot, and the entry A-197 is where it shows. A-197's ten steps all cite
 * line 197, which states what a Soul Transfer's legitimacy is JUDGED BY — both parties' eKYC,
 * signatures, Soul-Bank serialisation, old-authority revocation, new-body binding, state
 * commitment and settlement conditions. Three of the ten took their predicate from the line's
 * negation ("must not be expressed as a change of identity_pubkey", "cannot verify sharing of the
 * private key") and the reader answered `stated`, correctly: the line does state that prohibition.
 * It is still not a step. A sequence is an ordered bundle of ACTS, and a prohibition is a contract
 * on an act, not one of them.
 *
 * The rule is narrow on purpose, and it is checked against the reading that produced the verdicts
 * before it was adopted: of the 40 steps whose predicate is a modal negation, the earlier reader
 * already called 34 of them `condition`. The check agrees with that reading everywhere except the
 * six it missed, which is the measure of what it adds. The wording is deliberately the five
 * modals and nothing more — "is forbidden", "not permitted" and "must not be" read as prohibitions
 * to a human and fire on steps like "rejects the prohibited actions", which is an act.
 *
 * A step caught here is repaired like any other unstated step: the rule is folded into the
 * contract of the operation it qualifies, or the step is dropped. Rewriting the predicate is not
 * a repair — the line still states a prohibition.
 */
const PROHIBITION_PREDICATE = /\b(must not|may not|shall not|cannot|must never)\b/i;

function checkS32() {
  let offenders = 0;
  for (const s of readJsonl(SEQUENCE_STEPS)) {
    if (PROHIBITION_PREDICATE.test(String(s.predicate ?? ''))) {
      offenders += 1;
      report('S32', `${s.seq} step ${s.step}`, 'the predicate states a prohibition, not an act');
    }
  }
  return { offenders };
}

/**
 * S33 — a folded sentence was folded FROM a line that states a rule.
 *
 * 303 steps were repaired by folding: the step was not a step, and the line it cited was a
 * condition on an operation, so the sentence moved onto that operation's contract instead of
 * disappearing. The receiving step records where each sentence came from, in `folded_from`.
 *
 * A fold is only as good as the line it came from, and there is a way for it to be wrong that no
 * reading catches reliably: citing an INVENTORY line. A formula opener, a schema heading, a table
 * row and a fence marker all sit next to the rule they introduce, and a reader working quickly
 * reaches for the line above the sentence they wanted. One fold in 303 did exactly that — the
 * seeding-basis rule was folded from `AssetScore_{realbase}(node,F)=`, the formula's opening line,
 * when the rule is stated two lines above it at 1764.
 *
 * The rule is the same one S27 applies to steps and S31 to rules: a line a reader can open, that
 * is not an inventory entry. One in 303 is a small rate and it is the rate that matters: the class
 * is invisible to every check that reads a fold's CONTENT, because the content was right.
 */
const FORMULA_OPENER = /^\s*(?:[-*]\s*)?`?[A-Za-z_][A-Za-z0-9_]*`?\s*(?:_\{[^}]*\})?\s*(?:\([^)]*\))?\s*(?:=|:=)\s*$/;

function checkS33(lines) {
  const fenced = fencedLines(lines);
  let folds = 0; let bad = 0;
  for (const s of readJsonl(SEQUENCE_STEPS)) {
    for (const f of s.folded_from ?? []) {
      folds += 1;
      const n = f.line;
      const why = !Number.isInteger(n) || n < 1 || n > lines.length ? `line ${n} is out of range`
        : !isOpenableLine(lines, n) ? `line ${n} is a blank line or a fence marker`
          : (!fenced[n] && /^\s*\|/.test(lines[n - 1])) ? `line ${n} is a Markdown table row`
            : FORMULA_OPENER.test(lines[n - 1]) ? `line ${n} is a formula opener, not the rule it introduces`
              : null;
      if (why) { bad += 1; report('S33', `${s.seq} step ${s.step}`, `a folded sentence cites ${why}`); }
    }
  }
  return { folds, bad };
}

/**
 * S34 — a step decomposition belongs to an entry that is still a sequence.
 *
 * S26 checks the entries that name operations. That is the direction that asks whether a sequence
 * is satisfied. It cannot see the other one: a step decomposition whose entry no longer names any
 * operation is not checked by anything. S26 skips it (no `maps_to`, nothing to be satisfied
 * against), S24 skips it (an entry that is not realized and carries an adjudication is excused),
 * and S20's census counts sections, not steps. The steps simply sit there.
 *
 * That matters now because the repair can produce exactly that debris. An entry whose every step
 * turns out not to be a step is not a sequence, and the honest outcome is to withdraw the
 * decomposition and adjudicate the entry — at which point its steps must go with it. Leaving them
 * behind would make a withdrawn reading look like a live one.
 *
 * The check is stated as a property of the step set rather than of the entries, so it needs no
 * list of which entries have been withdrawn and cannot fall out of date.
 */
function checkS34(manifest) {
  const named = new Map(manifest.map((m) => [m.id, (m.maps_to ?? []).length]));
  const seen = new Set();
  let orphans = 0;
  for (const s of readJsonl(SEQUENCE_STEPS)) {
    if (seen.has(s.seq)) continue;
    seen.add(s.seq);
    if (!named.has(s.seq)) {
      orphans += 1;
      report('S34', s.seq, 'the step decomposition belongs to an entry the manifest does not carry');
    } else if (!named.get(s.seq)) {
      orphans += 1;
      report('S34', s.seq, 'the entry names no operation and still carries a step decomposition');
    }
  }
  return { entries: seen.size, orphans };
}

/**
 * S16 — gate placement in the mandated execution order.
 *
 * Line 14147 fixes the order in which a state-changing CoreOperation runs its validations,
 * "at least" thirteen numbered steps. A gate the specification states elsewhere but does not
 * place in that order leaves the emitted reject code undetermined when two violations hold at
 * once. Each gate below is declared with the token that would appear in the order if the
 * specification placed it; an absent token requires an emergent manifest row to claim the gate
 * through `gates_unplaced`.
 *
 * The gate list is judgment and is reviewed as such. What is mechanical is the comparison:
 * whether the token occurs in the order text, and whether a claim exists.
 */
const EXECUTION_ORDER_GATES = [
  { gate: 'session_binding', token: /SessionBinding/ },
  { gate: 'authority_and_lease', token: /DeviceIncarnation/ },
  { gate: 'transfer_freeze', token: /transfer freeze/ },
  { gate: 'health_state', token: /health|TemporalHealth/i },
  { gate: 'communication_health_attachment', token: /CommunicationHealthAttachment/ },
];

function checkS16(manifest, lines) {
  const order = lines[14146] ?? '';
  const claimed = new Set();
  for (const m of manifest) for (const g of m.gates_unplaced ?? []) claimed.add(g);
  for (const { gate, token } of EXECUTION_ORDER_GATES) {
    if (token.test(order)) continue;
    if (!claimed.has(gate)) {
      report('S16', gate, 'gate is not placed in the 14147 execution order and no manifest row claims it');
    }
  }
}

/**
 * S14 — emergent sequences.
 *
 * A `specified` scenario is one the specification enumerates. An `emergent` scenario is one
 * judgment surfaced: a situation the described space requires but no chapter defines. It is
 * not a failure for such a scenario to exist — it is the point of the exercise that it is
 * seen. It IS a failure for one to be recorded with neither a resolution nor a reason, and a
 * resolution that names a kind must name one that exists.
 */
function checkS14(manifest, rows) {
  const kinds = new Set(rows.map((r) => r.kind));
  for (const m of manifest) {
    if (m.kind !== 'emergent') continue;
    if (m.maps_to === null || m.maps_to === undefined) {
      if (!m.reason || !String(m.reason).trim()) {
        report('S14', m.id, 'emergent sequence with neither a resolution nor a reason');
      }
      continue;
    }
    for (const k of [].concat(m.maps_to)) {
      if (!kinds.has(k)) report('S14', m.id, `emergent sequence resolves to a kind with no registry row: ${k}`);
    }
  }
}

function checkS2(rows, manifest) {
  const positioned = new Set();
  for (const m of manifest) for (const k of [].concat(m.maps_to ?? [])) positioned.add(k);
  for (const r of rows) {
    if (r.disposition === 'excluded') continue;
    if (r.position === 'unsequenced') {
      if (!r.evidence?.note) report('S2', r.kind, 'unsequenced without a note');
      continue;
    }
    if (!positioned.has(r.kind)) report('S2', r.kind, 'no sequence position and not marked unsequenced');
  }
}

function checkS3(rows, lines) {
  const kinds = new Set(rows.map((r) => r.kind));
  for (const key of ['allowedWhenNotHealthy', 'transferSafe', 'forbiddenDuringFreeze']) {
    for (const name of fencedIdentifiers(lines, key)) {
      if (!kinds.has(name)) report('S3', name, `${key} names a kind with no registry row`);
    }
  }
}

/**
 * S3b — allowlist composition.
 *
 * Two gates apply to a body independently: §14.8's health allowlist and §16.7.2's freeze
 * allowlist. The specification states neither how they compose nor that they agree, and they
 * do not agree — four operations are freeze-only and two are health-only. This check computes
 * the symmetric difference itself and requires every name in it to be claimed by an emergent
 * manifest row, so the disagreement can never be dropped silently and so a future composition
 * rule that resolves it shows up as a manifest row gaining a resolution.
 */
function checkS3b(manifest, lines) {
  const health = new Set(fencedIdentifiers(lines, 'allowedWhenNotHealthy'));
  const freeze = new Set(fencedIdentifiers(lines, 'transferSafe'));
  const disagreement = [...new Set([
    ...[...freeze].filter((n) => !health.has(n)),
    ...[...health].filter((n) => !freeze.has(n)),
  ])];
  const claimed = new Set();
  for (const m of manifest) for (const n of m.allowlist_disagreement ?? []) claimed.add(n);
  for (const name of disagreement) {
    if (!claimed.has(name)) {
      report('S3b', name, 'permitted by one gate and not the other, and no manifest row accounts for it');
    }
  }
}

/**
 * S3c — the independent gates must each be non-empty and disjoint from the freeze-forbidden set.
 * A name both permitted by the freeze gate and forbidden during freeze is a self-contradiction.
 */
function checkS3c(lines) {
  const freeze = new Set(fencedIdentifiers(lines, 'transferSafe'));
  for (const name of fencedIdentifiers(lines, 'forbiddenDuringFreeze')) {
    if (freeze.has(name)) report('S3c', name, 'permitted and forbidden during freeze at once');
  }
}

/**
 * S5 — object type coverage.
 *
 * An object type is covered either by an operation that produces it, or by an excluded row
 * that names it and gives the reason it has no producer: externally produced, derived, baked
 * in, or a field rather than an object.
 */
function checkS5(rows, objectTypes) {
  const produced = new Set();
  const accounted = new Set();
  for (const r of rows) {
    if (r.disposition === 'excluded') {
      if (r.evidence?.note) for (const o of r.result_object_classes ?? []) accounted.add(o);
      continue;
    }
    for (const o of r.result_object_classes ?? []) produced.add(o);
  }
  for (const t of objectTypes) {
    if (!produced.has(t) && !accounted.has(t)) {
      report('S5', t, 'object type has neither a producing operation nor an excluded row with a reason');
    }
  }
}

function checkS6(rows) {
  for (const r of rows) {
    if (r.disposition === 'excluded') continue;
    const m = r.allowed_status_transitions;
    if (!m || typeof m !== 'object') { report('S6', r.kind, 'no transition map'); continue; }
    if (!OPERATION_STATUS.includes(r.initial_status)) {
      report('S6', r.kind, `initial_status ${r.initial_status} is not an OperationStatus`);
    }
    for (const [from, tos] of Object.entries(m)) {
      if (!OPERATION_STATUS.includes(from)) report('S6', r.kind, `transition key ${from} unknown`);
      for (const to of tos) {
        if (!OPERATION_STATUS.includes(to)) report('S6', r.kind, `transition target ${to} unknown`);
      }
      if (TERMINAL_STATUS.includes(from) && tos.length) {
        report('S6', r.kind, `terminal status ${from} has outgoing transitions`);
      }
    }
    const seen = new Set([r.initial_status]);
    const stack = [r.initial_status];
    while (stack.length) {
      for (const to of m[stack.pop()] ?? []) if (!seen.has(to)) { seen.add(to); stack.push(to); }
    }
    for (const s of Object.keys(m)) {
      if (s !== r.initial_status && !seen.has(s)) {
        report('S6', r.kind, `${s} unreachable from ${r.initial_status}`);
      }
    }
  }
}

function checkS7(rows) {
  for (const r of rows) {
    if (r.disposition === 'excluded') continue;
    if (r.mutates_protocol_state && (!r.required_authority || r.required_authority === 'none')) {
      report('S7', r.kind, 'mutates state but declares no authority');
    }
    if (r.required_authority && !AUTHORITY.includes(r.required_authority)) {
      report('S7', r.kind, `authority ${r.required_authority} is outside the closed vocabulary`);
    }
  }
}

function checkS8(rows, lines) {
  const methodZone = zone(lines, 'websocketMethods').join('\n');
  const methods = (methodZone.match(/`[a-z][a-z0-9_.]*`/g) ?? []).map((s) => s.slice(1, -1));
  const restZone = zone(lines, 'restEndpoints').join('\n');
  const paths = (restZone.match(/`(?:GET|POST) \/v1\/[^`]*`/g) ?? []).map((s) => s.slice(1, -1));
  if (!paths.length) report('S8', '-', 'no REST endpoint paths parsed from the specification');
  if (!methods.length) report('S8', '-', 'no WebSocket methods parsed from the specification');
  for (const r of rows) {
    if (r.disposition === 'excluded') continue;
    if (!r.rest?.path || !r.rest?.method) report('S8', r.kind, 'missing REST mapping');
    if (!r.websocket) report('S8', r.kind, 'missing WebSocket mapping');
    else if (!methods.includes(r.websocket)) report('S8', r.kind, `websocket ${r.websocket} is not a §14159 method`);
    if (!r.cli) report('S8', r.kind, 'missing CLI mapping');
  }
}

function checkS9(rows, claims) {
  const claimSet = new Set(claims);
  for (const r of rows) {
    if (r.disposition === 'excluded') continue;
    for (const c of r.required_proof_classes ?? []) {
      if (!claimSet.has(c)) report('S9', r.kind, `proof claim ${c} is outside §22.3`);
    }
    const has = (c) => (r.required_proof_classes ?? []).includes(c);
    if (CIVIC_QUORUM_CLAIMS.some(has) &&
        !['validator_quorum', 'civic_validator_committee'].includes(r.required_authority)) {
      report('S9', r.kind, 'requires a civic claim without validator quorum authority');
    }
    if (has('time_witness_quorum_validity') && r.external_dependency_class !== 'time_witness') {
      report('S9', r.kind, 'requires time witness quorum without the time_witness dependency');
    }
  }
}

function checkS10(rows) {
  for (const r of rows) {
    if (r.disposition === 'excluded') continue;
    const moves = (r.result_object_classes ?? []).some((o) => VALUE_MOVING.includes(o));
    if (!moves) continue;
    const p = r.finality_predicate ?? '';
    // The sections that state a conservation law: C4 at line 76, the pool at 7.17.1/2399,
    // the lineage royalty split at 7.18.5, settlement and aggregation at 18.20/18.22/8952/9121,
    // and the Civic need-score laws at 23.17/12423.
    if (!/C4|7\.17|7\.18|18\.20|18\.22|23\.17|2399|8952|9121|12423/.test(p)) {
      report('S10', r.kind, 'moves value but its finality predicate names no conservation law');
    }
  }
}

/**
 * The thirteen reject-code families of §22.2.
 *
 * Line 14173 names the field `reject_code_families`, and §22.2 supplies the families without
 * labelling them as such: it presents the codes in thirteen fenced blocks, each introduced by
 * a sentence naming what is validated. Those sentences are the family names, and their line
 * ranges are the partition. Every code falls in exactly one family and none is orphaned —
 * a fact this checker verifies rather than assumes.
 */
const CODE_FAMILIES = [
  ['core_authority_time_soul_ekyc_payment', 9881, 10020],
  ['transfer', 10026, 10070],
  ['lineage_royalty', 10076, 10102],
  ['discovery_storage_encryption', 10108, 10171],
  ['marketing', 10177, 10209],
  ['publication', 10215, 10245],
  ['publication_units', 10253, 10262],
  ['core_operation_framework', 10268, 10308],
  ['time_witness', 10314, 10318],
  ['civic', 10324, 10346],
  ['cross_forum_policy', 10352, 10361],
  ['forum_ekyc', 10367, 10380],
  ['transport_seam', 10386, 10403],
];

function familyOfLine(line) {
  for (const [name, a, b] of CODE_FAMILIES) if (line >= a && line <= b) return name;
  return null;
}

function checkS11(rows, codes, exemptions) {
  const familyNames = new Set(CODE_FAMILIES.map((f) => f[0]));
  const used = new Set();
  for (const r of rows) {
    for (const f of r.reject_code_families ?? []) {
      if (!familyNames.has(f)) report('S11', r.kind, `reject family ${f} is not one of the thirteen`);
      used.add(f);
    }
  }
  // The partition must be exact: every code in exactly one family. A body-only code carries its
  // family explicitly, because its line lies outside every §22.2 range.
  for (const { line, code, family } of codes) {
    const f = family ?? familyOfLine(line);
    if (!f) report('S11', code, `code at line ${line} belongs to no family`);
    else if (!familyNames.has(f)) report('S11', code, `code at line ${line} names an unknown family ${f}`);
  }
  for (const f of familyNames) {
    if (!used.has(f) && !exemptions.some((e) => e.family === f)) {
      report('S11', f, 'family referenced by no row and not exempted');
    }
  }
  for (const e of exemptions) {
    if (!e.reason) report('S11', e.family ?? e.code, 'exemption without a reason');
  }
}

function checkS12(rows) {
  for (const r of rows) {
    if (r.disposition === 'excluded') continue;
    if (!r.idempotency_scope || !String(r.idempotency_scope).trim()) {
      report('S12', r.kind, 'no idempotency scope');
    }
  }
}

function checkExternalDependency(rows) {
  for (const r of rows) {
    if (r.disposition === 'excluded') continue;
    if (!EXTERNAL_DEPENDENCY.includes(r.external_dependency_class)) {
      report('S4b', r.kind, `external_dependency_class ${r.external_dependency_class} is outside the closed vocabulary`);
    }
  }
}

function checkS13(rows, lines) {
  for (const name of NOT_OBJECT_TYPES) {
    if (!lines.some((l) => l.includes(name))) {
      report('S13', name, 'removal list names a string absent from the specification');
    }
  }
  const total = lines.length;
  for (const r of rows) {
    for (const n of r.evidence?.spec_lines ?? []) {
      if (!Number.isInteger(n) || n < 1 || n > total) {
        report('S13', r.kind, `evidence line ${n} is out of range`);
      }
    }
  }
}

// ---------------------------------------------------------------- main

const args = parseArgs(process.argv.slice(2));
if (!existsSync(args.spec)) fail(`specification not found at ${args.spec}`);
const lines = readFileSync(args.spec, 'utf8').split('\n');

const objectTypes = [...new Set([
  ...backtickedPascal(zone(lines, 'objectTable31').join('\n')),
  ...backtickedPascal(zone(lines, 'objectRegistry221').join('\n')),
  ...backtickedPascal(zone(lines, 'objectRegistryFramework').join('\n')),
  ...backtickedPascal(zone(lines, 'objectRegistryCivic').join('\n')),
])].filter((t) => !NOT_OBJECT_TYPES.includes(t));

const claimVocabulary = fencedIdentifiers(lines, 'proofClaims').map((s) => s.toLowerCase());
/**
 * Reject codes the body uses but §22.2 never lists.
 *
 * §22.2 presents itself as the code vocabulary, but five codes are used only in the body —
 * `IndeterminateNumeric` at 1713, `EquivocatedAssetVersion` at 1794, and `InvalidAssetLineage`,
 * `MissingParentAsset` and `UnauthorizedCommercialDerivative` at 3263. Treating §22.2 as the
 * whole vocabulary made S11 blind to them. The verification campaign found this; the list is
 * extended here so that a row may cite them, and a future code found the same way belongs here
 * too.
 */
const BODY_ONLY_REJECT_CODES = [
  { line: 1713, code: 'IndeterminateNumeric', family: 'publication_units' },
  { line: 1794, code: 'EquivocatedAssetVersion', family: 'lineage_royalty' },
  { line: 3263, code: 'InvalidAssetLineage', family: 'lineage_royalty' },
  { line: 3263, code: 'MissingParentAsset', family: 'lineage_royalty' },
  { line: 3263, code: 'UnauthorizedCommercialDerivative', family: 'lineage_royalty' },
];

const codeVocabulary = [
  ...fencedIdentifiersWithLines(lines, 'rejectCodes'),
  ...tableFirstColumnWithLines(lines, 'rejectTransportTable'),
  ...BODY_ONLY_REJECT_CODES,
];

// Pinned counts make a silent change to the specification visible as a checker failure
// rather than as a quietly smaller reference vocabulary.
const EXPECTED_PROOF_CLAIMS = 38;
const MINIMUM_REJECT_CODES = 400;

if (!objectTypes.length) fail('object inventory is empty — the zones or the extraction are wrong');
if (claimVocabulary.length !== EXPECTED_PROOF_CLAIMS) {
  fail(`expected ${EXPECTED_PROOF_CLAIMS} proof claims, read ${claimVocabulary.length}`);
}
if (codeVocabulary.length < MINIMUM_REJECT_CODES) {
  fail(`expected at least ${MINIMUM_REJECT_CODES} reject codes, read ${codeVocabulary.length}`);
}

if (!existsSync(args.registry)) {
  // Reading the manifest here keeps the surfaced-but-undefined scenarios visible even while
  // the registry is unwritten; they are the part of the work a machine cannot produce.
  const earlyManifest = readJsonl(MANIFEST);
  const earlyEmergent = earlyManifest.filter((m) => m.kind === 'emergent');
  const earlyOpen = earlyEmergent.filter((m) => m.maps_to === null || m.maps_to === undefined);
  console.error(`check-registry: registry not found at ${args.registry}`);
  console.error('  This is the expected RED state: the checks are written, the registry is not.');
  console.error(`  reference vocabularies read: ${objectTypes.length} object types, ` +
    `${claimVocabulary.length} proof claims, ${codeVocabulary.length} reject codes`);
  console.error(`  sequences specified=${earlyManifest.length - earlyEmergent.length} ` +
    `emergent=${earlyEmergent.length} emergentOpen=${earlyOpen.length}`);
  for (const m of earlyOpen) console.error(`    OPEN  ${m.id}`);
  process.exit(1);
}
const registryText = readFileSync(args.registry, 'utf8');
const block = jsonlBlock(registryText);
if (block === null) fail('no fenced jsonl block in the registry');
const rows = block.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));

const manifest = readJsonl(MANIFEST);
const exemptions = readJsonl(EXEMPTIONS);

checkS1(rows, manifest);
checkS2(rows, manifest);
checkS3(rows, lines);
checkS3b(manifest, lines);
checkS3c(lines);
checkS5(rows, objectTypes);
checkS6(rows);
checkS7(rows);
checkS8(rows, lines);
checkS9(rows, claimVocabulary);
checkS10(rows);
checkS11(rows, codeVocabulary, exemptions);
checkS12(rows);
checkS13(rows, lines);
checkS14(manifest, rows);
checkS16(manifest, lines);
checkS17(manifest, lines);
const bullet = checkS18(manifest, lines);
checkS19(manifest, lines);
const census = checkS20(manifest, lines);
checkS21(rows, manifest);
const settled = checkS22(manifest, lines);
const totality = checkS23(rows, claimVocabulary);
const realized = checkS24(manifest, rows, DECOMPOSED, lines);
const placement = checkS25(rows, lines, registryText);
const decomposed = checkS26(manifest, rows, lines, DECOMPOSED);
const grounded = checkS27(manifest, lines, DECOMPOSED);
const rules = checkS28(manifest, lines, registryText);
const audited = checkS29(manifest, DECOMPOSED);
const grounding = checkS30(rows, lines);
const undefinable = checkS31(rows, lines, registryText);
const predicates = checkS32();
const folds = checkS33(lines);
const orphan = checkS34(manifest);
checkExternalDependency(rows);

const counts = rows.reduce((a, r) => ({ ...a, [r.disposition]: (a[r.disposition] ?? 0) + 1 }), {});
const specified = manifest.filter((m) => m.kind !== 'emergent').length;
const emergent = manifest.filter((m) => m.kind === 'emergent');
// The open-emergent predicate lives with S28, which is the check that acts on it. One
// definition, so the summary and the check cannot disagree about what "open" means.
const openEmergent = openEmergentOf(manifest).length;
console.log(`rows=${rows.length} active=${counts.active ?? 0} excluded=${counts.excluded ?? 0} framework=${counts.framework ?? 0}`);
console.log(`objectTypes=${objectTypes.length} proofClaims=${claimVocabulary.length} rejectCodes=${codeVocabulary.length}`);
console.log(`sequences specified=${specified} emergent=${emergent.length} emergentOpen=${openEmergent} ` +
  `emergentDecided=${settled.decided} codeExemptions=${exemptions.length}`);
// The two numbers that say how much of the sequence space is still unread. They are not
// failures; they are the honest size of the backlog, and they must not be zero by accident.
console.log(`sequenceCoverage numberedRuns=${numberedProcedureRuns(lines).length} ` +
  `bulletSections=${bullet.sections} bulletSectionsUnclassified=${bullet.uncovered}`);
console.log(`sectionCoverage sections=${census.sections} fullySpanned=${census.full} ` +
  `partiallySpanned=${census.part} notSpanned=${census.none} unadjudicated=${census.unadjudicated}`);
// The two directions of the totality guarantee. sequencesRealized is the direction that matters
// for "are the operations defined": a sequence that names no operation and no neighbour names one
// either must be adjudicated, and `excused` counts those judgments.
console.log(`sequenceRealization direct=${realized.direct} viaNeighbour=${realized.viaNeighbour} ` +
  `adjudicatedNonSequence=${realized.excused} adjudicationsSuperseded=${realized.superseded} ` +
  `entryReadings=${realized.readings}`);
console.log(`totalityReached claims=${totality.claims} rejectFamilies=${totality.families} ` +
  `authorities=${totality.authorities} statuses=${totality.statuses} exempted=${totality.exempted}`);
// Every operation is now accounted for in one of two ways, and the pair is the closure. An earlier
// version printed "operationsUnpositioned" as a backlog; the 16 it counted are single-step
// operations whose whole procedure is their section's validity rules, recorded with the section
// that defines them. A backlog number that never reaches zero is not a measure of anything.
console.log(`operationsPositioned=${placement.positioned} operationsSingleStep=${placement.singleStep} ` +
  `operationsWithSuppliedRule=${placement.suppliedRule} ` +
  `of ${rows.filter((r) => r.disposition !== 'excluded').length}`);
// The composition itself: ordered steps, each with an actor, an act, an object and a contract, and
// a one-to-one binding to the operations the sequence names.
console.log(`sequenceSteps decomposed=${decomposed.decomposed} steps=${decomposed.steps} ` +
  `subSteps=${decomposed.substeps}`);
// The grounding of the composition: how many step citations the specification actually states.
// A step whose line is a table row, in an inventory section, or outside the entry's own span is
// an operation taken from the entry's index rather than from its text, and the count is the size
// of that class.
console.log(`stepGrounding examined=${grounded.examined} groundedInProse=${grounded.quoted}`);
// The closure of the gaps the specification does not close: each open gap's rule is written into
// the registry, and the two records of the decision are held to each other.
console.log(`silentGaps open=${rules.open} rulesRecorded=${rules.recorded}`);
// The audit of the composition: how many steps the line actually states, and how many it does not.
console.log(`stepAudit examined=${audited.examined} ` +
  STEP_GROUNDING_VERDICTS.map((v) => `${v}=${audited.counts[v] ?? 0}`).join(' '));
// The other direction: what each row's existence rests on.
console.log(`evidenceGrounding ${EVIDENCE_GROUNDING.map((c) => `${c}=${grounding.counts[c] ?? 0}`).join(' ')} ` +
  `unresolved=${grounding.unresolved}`);
// The acts the specification names and never defines. They are not gaps in the registry: the
// design decides them, the decision is written at 4.2, and this pair is how many rows carry one.
console.log(`unnamedActs rows=${undefinable.supplied} rulesRecorded=${undefinable.recorded} ` +
  `aliases=${undefinable.aliases}`);
// A step states an act. A prohibition is a contract on an act, and S29 could not see the
// difference: the line does state the prohibition, so the reader answered `stated` and was right
// about the question it was asked.
console.log(`stepPredicates prohibitionSteps=${predicates.offenders}`);
// Every fold records the line its sentence came from, and that line must be one that states a
// rule: an inventory entry or a table row is not a condition on an operation.
console.log(`foldedSentences sentences=${folds.folds} badSourceLines=${folds.bad}`);
// A decomposition outlives the reading that made it unless something checks. Every entry
// carrying steps must still be a sequence that names operations.
console.log(`stepOwnership entries=${orphan.entries} orphans=${orphan.orphans}`);

if (violations.length) {
  const byCheck = violations.reduce((a, v) => { (a[v.check] ??= []).push(v); return a; }, {});
  for (const [check, list] of Object.entries(byCheck).sort()) {
    console.error(`\n${check}: ${list.length} violation(s)`);
    for (const v of list.slice(0, 40)) console.error(`  ${v.kind}: ${v.detail}`);
    if (list.length > 40) console.error(`  ... and ${list.length - 40} more`);
  }
  console.error(`\nFAILED: ${violations.length} violation(s)`);
  process.exit(1);
}
console.log('OK: every check passed');
process.exit(0);
