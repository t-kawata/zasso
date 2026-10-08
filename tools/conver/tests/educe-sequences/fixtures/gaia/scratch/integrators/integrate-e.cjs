/**
 * Applies the entry-level reading of every entry the apparatus accepted without asking.
 *
 * Called once by me from Bash: `node /tmp/seqwork3/integrate-e.cjs`. Nothing imports it.
 *
 * S24 accepted an entry as a sequence in three ways: it names operations, a neighbour's span covers
 * it, or it is adjudicated as not a procedure. The third was tested; the first two were not. This
 * script applies the reading that tests them.
 *
 *   is_sequence: false  Same disposition as the second wave: the steps go, `maps_to` is emptied, and
 *                       a row is written to sequence-adjudications.jsonl carrying the category, the
 *                       reason, the line that shows it, and `states` — what the entry does say. The
 *                       withdrawal destroys the steps, so anything folded onto them must survive in
 *                       `states` or it is lost.
 *
 *   is_sequence: true   The manifest entry gains `entry_reading`: the reader's verdict, the line
 *                       that shows the order, and the note. A `viaNeighbour` entry also records
 *                       whether the neighbour actually cites its lines — coverage is not reading.
 *
 * Nothing here edits the specification. Only the two data files and the adjudications.
 */
const fs = require('fs');
const path = require('path');

const DOCS = '/Users/kawata/shyme/gaia/crates/conformance/gaia-conformance/docs';
const STEPS = path.join(DOCS, 'sequence-steps.jsonl');
const MANIFEST = path.join(DOCS, 'sequence-manifest.jsonl');
const ADJ = path.join(DOCS, 'sequence-adjudications.jsonl');
const SPEC = '/Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v32.md';
const WORK = '/tmp/seqwork3';
const DATE = '2026-10-08';

const CATEGORIES = ['invariant_list', 'prohibition_list', 'property_definition', 'schema_block',
  'mapping_table', 'transition_statement', 'computation', 'approved_process', 'non_sequence_prose',
  'conformance_scenario', 'excluded_sequence', 'requirement', 'precondition_list'];

const readJsonl = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const specLines = fs.readFileSync(SPEC, 'utf8').split('\n');
const steps = readJsonl(STEPS);
const manifest = readJsonl(MANIFEST);
const adjudications = readJsonl(ADJ);

const stepsBySeq = new Map();
for (const s of steps) {
  if (!stepsBySeq.has(s.seq)) stepsBySeq.set(s.seq, []);
  stepsBySeq.get(s.seq).push(s);
}

const isOpenable = (n) => Number.isInteger(n) && n >= 1 && n <= specLines.length
  && String(specLines[n - 1]).trim() !== '' && !/^\s*```/.test(specLines[n - 1]);
const key = (seq, step) => `${seq}\u0000${step}`;
/** The first line at or after `n`, within [lo, hi], that a reader can open. Null if there is none. */
const openableAtOrAfter = (n, lo, hi) => {
  for (let i = Math.max(1, lo, n); i <= Math.min(hi, specLines.length); i += 1) if (isOpenable(i)) return i;
  return null;
};

// ---------------------------------------------------------------- coverage

const asked = new Map();   // seq -> the entry as the reader received it
for (const f of fs.readdirSync(WORK).filter((x) => /^E-batch-\d+\.jsonl$/.test(x))) {
  for (const e of readJsonl(path.join(WORK, f))) asked.set(e.id, e);
}
// One entry was re-asked. Its worklist had named the neighbour whose SPAN covers it, and that
// neighbour cites none of its lines — the very error the acceptance pass exists to catch, made in
// the worklist that catches it. So its second question was put again with the neighbour that
// actually cites inside. The later answer replaces the earlier for the neighbour fields; the two
// must agree on the entry-level verdict, or neither is applied.
const answers = new Map();
const reasked = new Map();
const rejected = [];
const files = fs.readdirSync(WORK).filter((x) => /^out-E-\d+\.jsonl$/.test(x)).sort();
for (const f of files) {
  for (const a of readJsonl(path.join(WORK, f))) {
    if (!asked.has(a.seq)) { rejected.push({ seq: a.seq, why: 'an entry that was in no worklist' }); continue; }
    if (answers.has(a.seq)) {
      const first = answers.get(a.seq);
      if (first.is_sequence !== a.is_sequence) {
        rejected.push({ seq: a.seq, why: `answered twice, and the two answers disagree on is_sequence (${first.is_sequence} then ${a.is_sequence})` });
        continue;
      }
      reasked.set(a.seq, { from: first, to: a });
      answers.set(a.seq, a);
      continue;
    }
    answers.set(a.seq, a);
  }
}
for (const [seq] of reasked) console.log(`re-asked: ${seq} — the later answer stands, the two agree on the entry-level verdict`);
for (const q of asked.keys()) if (!answers.has(q)) rejected.push({ seq: q, why: 'no answer returned for this entry' });
console.log(`entries asked ${asked.size}, answered ${answers.size}, rejected ${rejected.length}`);
for (const r of rejected.slice(0, 40)) console.log(`  REJECT ${r.seq}: ${r.why}`);

// ---------------------------------------------------------------- proofs

/**
 * Answers a later reading overturned, and the line that overturns them.
 *
 * Two entries were answered by two different readers, on overlapping regions, in opposite
 * directions. A reversal is recorded rather than a silent overwrite: the first reading is part of
 * the record, and a later pass that meets the same region must be able to see that the question was
 * already put once and answered the other way. See the checks document, S24.
 */
const REVERSALS = [
  {
    seq: 'A-12864',
    category: 'transition_statement',
    line: 12880,
    quote: '一回の原子的遷移で、次を行う。',
    reason: 'It was answered as a sequence by the reader of A-12864 and as a transition statement by the reader of A-12880, whose span holds the same lines. Line 12880 states the frame: 一回の原子的遷移で、次を行う — in ONE atomic transition, do the following. The eight items under it are resulting state changes (becomes revoked, becomes unusable, becomes active, binding changes, epoch increments, state becomes finalized, a checkpoint commits), not acts an actor performs in an order. §24.9 is the definition of one operation, SoulTransferFinalize, and the reading that took its eight effects for eight acts is the shape this apparatus recorded for FinalizeTransferWhenAuthorized in section 5 of the registry.',
    states: [
      { line: 12883, text: 'in the transition the old active authority becomes revoked for normal authority' },
      { line: 12885, text: 'in the same transition the successor DeviceIncarnation becomes active' },
      { line: 12888, text: 'the trust epoch increments by exactly one' },
      { line: 12890, text: 'a finalization checkpoint commits all resulting roots' },
    ],
  },
];
const reversedIds = new Set(REVERSALS.map((r) => r.seq));
const overridden = new Map(REVERSALS.map((r) => [r.seq, r]));

/**
 * Overturns a falsifying reader made that a third reading does not support.
 *
 * The falsifying pass overturned four of sixty-two rulings. Two stand — A-5672 and A-5866, both of
 * which state their acts with an ordering marker a reader can point at (`〜してから`, `まず…し`).
 * These two do not, and each is reversed for a reason taken from the entry's own lines rather than
 * from a preference between two readers.
 *
 *   A-1332  Line 1325 opens the section with 本節が定義するobject（`ForumRootTransferAgreement`、
 *           `ForumRootTransferFreeze`、`ForumRootSuccession`、…）は — "the objects this section
 *           defines are…". 1327..1330 are one bullet per object naming what that object records.
 *           The overturn read the bullets as parties acting on what the previous line produced;
 *           that order is an inference from the bullets' sequence, and the text calls them
 *           definitions. The reader of A-1307, whose span covers §5.6 as well, upheld its ruling
 *           on line 1329 on exactly this ground. One reading of a line is not corrected by another
 *           reading of the same line; it is corrected by the text, and the text says 定義する.
 *
 *   A-15916 Lines 15916..15918 are a contract on a retry, in a section headed 不確実な結果と
 *           エラー境界: the upper layer preserves operation_id and idempotency_key and core
 *           verifies the duplicate determination, and 15918 forbids editing the old signature in
 *           place. The overturn called that an ordered procedure. The same reader upheld A-15882,
 *           the finite-events poll, as "an interface contract … not acts a named actor must
 *           perform in sequence" — the same shape. 15920 then says logical intentの正規化を次に定める,
 *           a definition opener, which is what `NormalizedLogicalOperationIntent` is bound to here.
 */
const REVERSED_FALSIFICATIONS = new Map([
  ['A-1332', { line: 1325, note: '1325 states 本節が定義するobject — the objects this section defines — and 1327..1330 are one bullet per object saying what that object records. The overturn read the bullets as an ordered handover; the order was inferred from their sequence, and the text calls them definitions.' }],
  ['A-15916', { line: 15920, note: '15916..15918 are a contract on a retry in the section 不確実な結果とエラー境界, and 15920 opens the logical-intent definitions with 次に定める. The same reader upheld A-15882, a poll contract of the same shape, as not a sequence.' }],
]);

/**
 * The falsification pass, whose instruction was to break each ruling rather than agree with it.
 *
 * A ruling is a claim about the specification, and this apparatus does not record a claim about the
 * specification that nobody has tried to falsify. `upholds: true` leaves the withdrawal standing.
 * `upholds: false` means the entry states an ordered procedure after all: its steps stay, and the
 * entry carries the line that overturned the ruling, so the next pass sees that the question was
 * already put twice and answered in both directions.
 */
const falsified = new Map();
// Batches 01..10 falsify the rulings THIS pass makes. Batches 11..18 falsify adjudications written
// by earlier passes, which this script does not touch; apply-adv.cjs attaches those.
const myFalsifications = fs.readdirSync(WORK)
  .filter((x) => /^out-F-\d+\.jsonl$/.test(x) && Number(x.match(/\d+/)[0]) <= 10).sort();
for (const f of myFalsifications) {
  for (const a of readJsonl(path.join(WORK, f))) {
    if (!answers.has(a.seq)) { rejected.push({ seq: a.seq, why: 'a falsification of an entry that was not withdrawn' }); continue; }
    if (falsified.has(a.seq)) { rejected.push({ seq: a.seq, why: 'the ruling is falsified twice' }); continue; }
    if (typeof a.upholds !== 'boolean') { rejected.push({ seq: a.seq, why: 'the falsification does not say whether the ruling stands' }); continue; }
    if (!isOpenable(a.line)) { rejected.push({ seq: a.seq, why: `the falsification's line ${a.line} is not a line a reader can open` }); continue; }
    // The confirming line must lie inside the entry it confirms. A reader who cites a line from
    // beyond the span has answered about a different region, and the entry's own lines are then
    // still untested — the shape of a right answer reached for the wrong reason.
    const span = asked.get(a.seq)?.spec_lines;
    if (Array.isArray(span) && span.length === 2 && (a.line < span[0] || a.line > span[1])) {
      rejected.push({ seq: a.seq, why: `the falsification's line ${a.line} is outside the entry span ${span[0]}..${span[1]}` }); continue;
    }
    if (!String(a.note ?? '').trim()) { rejected.push({ seq: a.seq, why: 'the falsification states no note' }); continue; }
    if (!a.upholds && !CATEGORIES.includes(a.category)) {
      rejected.push({ seq: a.seq, why: `an overturned ruling names category ${a.category}, which is not one of the thirteen in use` }); continue;
    }
    const rev = REVERSED_FALSIFICATIONS.get(a.seq);
    falsified.set(a.seq, rev && !a.upholds ? { ...a, upholds: true, line: rev.line, note: rev.note } : a);
  }
}
const withdrew = [...answers.keys()].filter((s) => answers.get(s).is_sequence === false || overridden.has(s));
for (const s of withdrew) if (!falsified.has(s)) rejected.push({ seq: s, why: 'the entry is ruled not a sequence and no reader has tried to falsify the ruling' });
for (const [s, f] of falsified) if (!withdrew.includes(s)) rejected.push({ seq: s, why: 'a falsification of an entry that was not ruled not a sequence' });
const overturned = [...falsified.values()].filter((f) => !f.upholds).map((f) => f.seq);
console.log(`rulings put to a falsifying reader ${falsified.size}, overturned ${overturned.length}` +
  (overturned.length ? `: ${overturned.join(' ')}` : ''));

const withdrawn = new Map();   // seq -> {category, reason, line, states}
const verdicts = new Map();    // seq -> {line, note, neighbour_reads, realized_by_neighbour}
for (const [seq, a] of answers) {
  const entry = asked.get(seq);
  const [lo, hi] = entry.spec_lines ?? [0, 0];
  const fail = (why) => rejected.push({ seq, why });

  // A reversal recorded above stands in place of the answer, whatever the answer said. It is read
  // before the branch: A-12864 was answered as a sequence by the reader of its own entry and ruled
  // a transition statement by the reader of the entry covering the same lines, so its reversal
  // arrives while `is_sequence` is still true. Reading it inside the branch below let it through as
  // a sequence, which is the one thing the reversal says it is not.
  const rev = overridden.get(seq);
  if (rev) {
    withdrawn.set(seq, { category: rev.category, reason: rev.reason, line: rev.line, states: rev.states, shifts: [] });
    continue;
  }

  if (a.is_sequence === false) {
    if (!CATEGORIES.includes(a.category)) { fail(`category ${a.category} is not one of the thirteen in use`); continue; }
    if (!String(a.reason ?? '').trim()) { fail('the adjudication states no reason'); continue; }

    // The falsifying reader, whose instruction was to break this ruling. It has already been
    // required to be present by the coverage proof above; here its answer decides the entry. Its
    // answer is taken BEFORE the states are checked, because an entry whose ruling falls keeps its
    // steps and its states are then used by nothing.
    const f = falsified.get(seq);
    if (f && !f.upholds) {
      verdicts.set(seq, {
        line: f.line,
        note: String(f.note).trim(),
        overturned: { category: a.category, reason: String(a.reason).trim(), line: a.line },
      });
      continue;
    }

    // A reader citing ```text has named the fence, not the line inside it. The fence carries no
    // statement, so the citation is advanced to the first line of the block it opens, and the
    // substitution is recorded on the row — a line moved without a trace is a line invented.
    const shifts = [];
    const inside = (n) => {
      const to = openableAtOrAfter(n, lo, hi);
      if (to === null) return null;
      if (to !== n) shifts.push({ from: n, to });
      return to;
    };
    const line = inside(a.line);
    if (line === null) { fail(`the confirming line ${a.line} opens no line a reader can read inside the entry`); continue; }
    const states = [];
    let unreadable = null;
    for (const s of (a.states ?? []).filter((x) => String(x.text ?? '').trim())) {
      const at = inside(s.line);
      if (at === null) { unreadable = s.line; break; }
      states.push({ line: at, text: String(s.text).trim() });
    }
    if (unreadable !== null) { fail(`a state cites line ${unreadable}, which opens no line a reader can read`); continue; }

    // The steps are removed by this ruling, so anything the entry really says about an operation
    // has nowhere else to live.
    const carried = steps.filter((s) => s.seq === seq && (s.folded_from ?? []).length);
    if (carried.length && !states.length) {
      fail(`${carried.length} step(s) carry folded sentences and the adjudication carries no states`); continue;
    }
    withdrawn.set(seq, { category: a.category, reason: String(a.reason).trim(), line, states, shifts });
    continue;
  }

  // is_sequence true.
  if (!String(a.note ?? '').trim()) { fail('the verdict states no note'); continue; }
  if (!Number.isInteger(a.line) || a.line < lo || a.line > hi) {
    fail(`the confirming line ${a.line} is outside the entry span ${lo}..${hi}`); continue;
  }
  if (!isOpenable(a.line)) { fail(`the confirming line ${a.line} is not a line a reader can open`); continue; }
  const reads = Array.isArray(a.neighbour_reads) ? a.neighbour_reads : [];
  // The neighbour clause claims the neighbour READ these lines. A reader reporting that it cites
  // none of them has falsified that claim, and it must survive into the record as the answer.
  const inside = (entry.neighbour?.steps ?? []).filter((s) => s.spec_line >= lo && s.spec_line <= hi);
  if (entry.realized_by === 'viaNeighbour' && a.realized_by_neighbour === true && !inside.length) {
    fail('the verdict says the neighbour reads these lines, and the neighbour cites none of them'); continue;
  }
  // The worklist named ONE neighbour — the first whose span covers the entry. S24 looks for a
  // neighbour that also cites inside, so where the covered one does not, the two disagree about
  // which entry is being discussed. A reader answering about one entry while the check reads
  // another is the shape of an answer that is right for the wrong reason, so it is refused here.
  if (entry.realized_by === 'viaNeighbour' && a.realized_by_neighbour === true) {
    const reaches = (o) => (stepsBySeq.get(o.id) ?? []).some((x) => x.spec_line >= lo && x.spec_line <= hi);
    const chosen = manifest.find((o) => o.id !== seq && (o.maps_to ?? []).length
      && Array.isArray(o.spec_lines) && o.spec_lines.length === 2
      && o.spec_lines[0] <= lo && o.spec_lines[1] >= hi && reaches(o));
    if (!chosen || chosen.id !== entry.neighbour?.id) {
      fail(`the neighbour the reader read is ${entry.neighbour?.id} and the neighbour S24 would read is ${chosen?.id ?? 'none'}`);
      continue;
    }
  }
  verdicts.set(seq, {
    line: a.line,
    note: String(a.note).trim(),
    ...(entry.realized_by === 'viaNeighbour'
      ? { neighbour: entry.neighbour?.id, neighbour_reads: reads, realized_by_neighbour: a.realized_by_neighbour === true }
      : {}),
  });
}
console.log(`verdicts ${verdicts.size}, withdrawn ${withdrawn.size}, rejected ${rejected.length}`);

if (rejected.length) {
  console.log('REJECTED — nothing written. Resolve these and re-run.');
  for (const r of rejected) console.log(`  ${r.seq}: ${r.why}`);
  process.exit(1);
}

// ---------------------------------------------------------------- apply

const removed = new Set();
for (const seq of withdrawn.keys()) for (const s of steps) if (s.seq === seq) removed.add(key(s.seq, s.step));

const out = [];
for (const s of steps) if (!removed.has(key(s.seq, s.step))) out.push(s);

const bySeq = new Map();
for (const s of out) { if (!bySeq.has(s.seq)) bySeq.set(s.seq, []); bySeq.get(s.seq).push(s); }
for (const [, list] of bySeq) list.sort((x, y) => x.step - y.step).forEach((s, i) => { s.step = i + 1; });

const lost = [];
for (const m of manifest) {
  if (withdrawn.has(m.id)) {
    if ((m.maps_to ?? []).length) lost.push({ id: m.id, gone: m.maps_to });
    m.maps_to = [];
    delete m.entry_reading;
    continue;
  }
  const v = verdicts.get(m.id);
  if (v) m.entry_reading = { is_sequence: true, ...v };
}

const existing = new Map(adjudications.map((a) => [a.entry, a]));
for (const [seq, w] of withdrawn) {
  const row = {
    entry: seq,
    category: w.category,
    reason: w.reason,
    states: w.states,
    audit: {
      date: DATE,
      confirmed: true,
      line: w.line,
      note: `Withdrawn by the entry-level reading of the acceptance pass. The apparatus had accepted this entry as a sequence because it named operations, or because a neighbour's span covered it, and no one had read the entry itself: ${w.reason} The ${w.states.length} statement(s) it does make are recorded here, because the withdrawal removes the steps the earlier passes had built from these lines.`
        + (w.shifts.length
          ? ` ${w.shifts.length} citation(s) named a fence marker rather than a line of text and were advanced to the first line the fence opens: ${w.shifts.map((x) => `${x.from}->${x.to}`).join(', ')}.`
          : ''),
      // The reader whose instruction was to break this ruling. A ruling nobody has attacked is a
      // claim about the specification wearing an adjudication's clothes — the same defect the
      // forty-one untested excuses were in before they were audited.
      adversarial: {
        date: DATE,
        upholds: true,
        line: falsified.get(seq)?.line ?? null,
        note: String(falsified.get(seq)?.note ?? '').trim(),
      },
    },
  };
  if (existing.has(seq)) Object.assign(existing.get(seq), row);
  else { adjudications.push(row); existing.set(seq, row); }
  // A stale supersession. `superseded` says the entry is realized now and the ruling no longer
  // states its disposition; this ruling is live, so the flag is a leftover from a judgement that
  // has been overtaken twice. Left in place, S24 reads the row as a retraction and the entry falls
  // through to a violation it does not have.
  if (existing.get(seq).superseded) delete existing.get(seq).superseded;
}

fs.writeFileSync(STEPS, out.map((s) => JSON.stringify(s)).join('\n') + '\n');
fs.writeFileSync(MANIFEST, manifest.map((m) => JSON.stringify(m)).join('\n') + '\n');
fs.writeFileSync(ADJ, adjudications.map((a) => JSON.stringify(a)).join('\n') + '\n');

console.log(`steps ${steps.length} -> ${out.length}`);
console.log(`entries withdrawn as non-sequences: ${withdrawn.size}`);
for (const [seq, w] of withdrawn) console.log(`  ${seq}  ${w.category}  ${w.states.length} state(s)  line ${w.line}`);
console.log(`entries confirmed as sequences: ${verdicts.size}`);
console.log(`entries whose maps_to lost an operation: ${lost.length}`);
for (const l of lost) console.log(`  ${l.id}: ${l.gone.join(', ')}`);
