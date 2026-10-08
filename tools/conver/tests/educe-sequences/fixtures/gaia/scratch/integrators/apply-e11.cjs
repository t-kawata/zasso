/**
 * Records the last two rulings, and the falsifying reader who upheld each.
 *
 * Called once by me from Bash: `node /tmp/seqwork3/apply-e11.cjs`. Nothing imports it.
 *
 * R-9176 and R-12883 were realized by neighbours — A-9163 and A-12880 — until the acceptance pass
 * read those neighbours and found them not to be sequences. Each then had no path: it names no
 * operation, no neighbour reads its lines, and nobody had ruled on the entry itself. They were read,
 * ruled not sequences, and put to a falsifying reader, who upheld both.
 *
 * R-9176 also carries a `superseded` flag written before that pass. It said the entry was covered by
 * a neighbour and the ruling no longer stated its disposition. That neighbour is the one the pass
 * withdrew, so the flag now says the opposite of what is true, and S24 reads a live ruling as a
 * retraction.
 */
const fs = require('fs');

const DOCS = '/Users/kawata/shyme/gaia/crates/conformance/gaia-conformance/docs';
const WORK = '/tmp/seqwork3';
const DATE = '2026-10-08';

const readJsonl = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rows = readJsonl(`${DOCS}/sequence-adjudications.jsonl`);
const byEntry = new Map(rows.map((r) => [r.entry, r]));

const falsified = new Map(readJsonl(`${WORK}/out-F-34.jsonl`).map((a) => [a.seq, a]));
let applied = 0;
const rejected = [];
for (const a of readJsonl(`${WORK}/out-E-11.jsonl`)) {
  if (a.is_sequence !== false) { rejected.push({ seq: a.seq, why: 'the reading says the entry is a sequence, which no clause here can carry' }); continue; }
  const f = falsified.get(a.seq);
  if (!f || f.upholds !== true) { rejected.push({ seq: a.seq, why: 'no falsifying reader upheld the ruling' }); continue; }
  const row = {
    entry: a.seq,
    category: a.category,
    reason: String(a.reason).trim(),
    states: a.states ?? [],
    audit: {
      date: DATE,
      confirmed: true,
      line: a.line,
      note: `Withdrawn by the entry-level reading of the acceptance pass, after the neighbour that had been realising this entry was itself read and found not to state an ordered procedure. The ${(a.states ?? []).length} statement(s) it does make are recorded here.`,
      adversarial: { date: DATE, upholds: true, line: f.line, note: String(f.note).trim() },
    },
  };
  if (byEntry.has(a.seq)) Object.assign(byEntry.get(a.seq), row);
  else { rows.push(row); byEntry.set(a.seq, row); }
  if (byEntry.get(a.seq).superseded) delete byEntry.get(a.seq).superseded;
  applied += 1;
}

if (rejected.length) {
  console.log('REJECTED — nothing written.');
  for (const r of rejected) console.log(`  ${r.seq}: ${r.why}`);
  process.exit(1);
}
fs.writeFileSync(`${DOCS}/sequence-adjudications.jsonl`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`rulings recorded: ${applied}`);
