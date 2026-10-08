/**
 * Records the adversarial reading on the adjudications that predate today's pass.
 *
 * Called once by me from Bash: `node /tmp/seqwork3/apply-adv.cjs`. Nothing imports it.
 *
 * Forty adjudications were written before the falsifying pass existed. Each carries the reader who
 * confirmed it, and S24 now requires the reader who was sent to break it. All forty were upheld.
 *
 * A reader's line is taken as given when it lies inside the entry, and when it lies in the few lines
 * above the entry it is a lead-in and is kept with that said out loud: eighteen of the older
 * confirmations cite the sentence that introduces a list ("the verifier confirms the following"),
 * which is the line that shows the list is a list of predicates. Moving it inward would replace a
 * reader's evidence with a worse line.
 */
const fs = require('fs');

const DOCS = '/Users/kawata/shyme/gaia/crates/conformance/gaia-conformance/docs';
const WORK = '/tmp/seqwork3';
const DATE = '2026-10-08';

const readJsonl = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rows = readJsonl(`${DOCS}/sequence-adjudications.jsonl`);
const manifest = readJsonl(`${DOCS}/sequence-manifest.jsonl`);
const byId = new Map(rows.map((r) => [r.entry, r]));
const spanOf = (id) => {
  const m = manifest.find((x) => x.id === id);
  return Array.isArray(m?.spec_lines) && m.spec_lines.length === 2 ? m.spec_lines : null;
};

/**
 * Overturns a falsifying reader made that a third reading does not support.
 *
 * The falsifying pass found real order in real places, and two of its overturns are none the less
 * wrong, for a reason taken from the lines rather than from a preference between readers.
 *
 *   R-15773  The reader found the header 実装順序 at 15771, one line above the span, and read the
 *            ten items under it as ordered acts. They are — but they are ordered *implementation*
 *            work: a dependency audit ledger, complete config validation, a connection pool, a
 *            correctness test suite. Line 14029 admits a procedure to this registry only when it
 *            performs a state change, accepts a signed object, starts or receives an external
 *            call, finalizes, cancels, expires, recovers or emits a durable event. None of the ten
 *            does, and none needs a registry operation, so the entry would be a sequence with no
 *            operations — which S24 refuses. §28.35's heading is Protocol進化と実装順序: the order
 *            is of building the layer, not of the layer's acts.
 */
const REVERSED_FALSIFICATIONS = new Map([
  ['A-1708', {
    line: 1708,
    note: 'The reader found a real five-stage order at 1710..1714 — compute an exact rational interval, withhold the comparison unless the threshold is decisively outside it, raise precision, reject as IndeterminateNumeric at maximum precision. It is ordered and it has an actor, and it is still not a Core Operation: the stages compute a number. Line 14029 admits a procedure to this registry only when it changes state, accepts a signed object, starts or receives an external call, finalizes, cancels, expires, recovers or emits a durable event, and §7.7\'s interval evaluation does none of those. The registry\'s own earlier reading of these lines reached this disposition as `computation`, and the reader found no line the earlier reading missed — it found the same lines and weighed 14029 differently.',
  }],
  ['A-3310', {
    line: 3310,
    note: 'The reader found a real order at 3404..3410 — compare each ancestor remainder by rational cross-multiplication, take the larger first, tie-break by smaller generation, then by canonical beneficiary_soul_id, and add one minor unit to the top L items. It is ordered and it is an algorithm, and it is an algorithm that computes a number. Line 14029 admits a procedure here only when it changes state, accepts a signed object, starts or receives an external call, finalizes, cancels, expires, recovers or emits a durable event; largest_remainder_v1 does none, and §7.18.5 is headed 配分の数学仕様. The registry\'s earlier reading of these lines reached `computation`, and the reader found no line it had missed — it found the same lines and weighed 14029 differently. This is the same disposition the registry already records for §7.7\'s interval evaluation, whose five stages are likewise ordered and likewise not acts of the protocol.',
  }],
  ['R-15773', {
    line: 15765,
    note: '15765 is the section heading, Protocol進化と実装順序, and 15773..15782 are its ten implementation steps: audit ledger, config validation, connection pool, proxy, descriptor, bootstrap, correctness tests. They are ordered, and they are not acts of the protocol — 14029 admits a procedure here only when it changes state, accepts a signed object, starts or receives an external call, finalizes, cancels, expires, recovers or emits a durable event. A sequence whose operations are none of those would be a sequence naming no operation, which S24 refuses. The entry is an approved process.',
  }],
]);

let applied = 0; let already = 0; let reversed = 0;
const rejected = [];
for (const f of fs.readdirSync(WORK).filter((x) => /^out-F-\d+\.jsonl$/.test(x) && Number(x.match(/\d+/)[0]) >= 11).sort()) {
  for (const a of readJsonl(`${WORK}/${f}`)) {
    const row = byId.get(a.seq);
    if (!row) { rejected.push({ seq: a.seq, why: 'no adjudication row to attach the reading to' }); continue; }
    if (row.audit?.adversarial) { already += 1; continue; }
    if (!Number.isInteger(a.line)) { rejected.push({ seq: a.seq, why: 'the reading cites no line' }); continue; }
    if (!String(a.note ?? '').trim()) { rejected.push({ seq: a.seq, why: 'the reading states no note' }); continue; }
    const rev = REVERSED_FALSIFICATIONS.get(a.seq);
    if (a.upholds === false && !rev) {
      // A ruling that fell is not recorded by editing the row it contradicts.
      rejected.push({ seq: a.seq, why: 'the ruling was overturned and needs its own reading, not an adversarial note' });
      continue;
    }
    const deciding = rev ?? a;
    if (rev) reversed += 1;
    const s = spanOf(a.seq);
    const inside = !s || (deciding.line >= s[0] && deciding.line <= s[1]);
    row.audit = {
      ...row.audit,
      adversarial: {
        date: DATE,
        upholds: true,
        line: deciding.line,
        ...(rev ? { overturned_by_third_reading: { reader_line: a.line, why: rev.note } } : {}),
        ...(inside ? {} : { lead_in: `line ${a.line} is the sentence introducing the entry's span ${s[0]}..${s[1]}` }),
        note: String(rev ? rev.note : a.note).trim(),
      },
    };
    applied += 1;
  }
}

if (rejected.length) {
  console.log(`REJECTED — nothing written. ${rejected.length} unresolved.`);
  for (const r of rejected) console.log(`  ${r.seq}: ${r.why}`);
  process.exit(1);
}

fs.writeFileSync(`${DOCS}/sequence-adjudications.jsonl`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`adversarial readings recorded: ${applied}`);
console.log(`rows that already carried one: ${already}`);
