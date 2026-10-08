/**
 * Applies the re-homing readings: what each unplaced operation actually is.
 *
 * Called once by me from Bash: `node /tmp/seqwork3/integrate-r.cjs`. Nothing imports it.
 *
 * An operation whose only placement was an entry that turned out not to be a sequence has no claim
 * left about its procedure. The reading in out-R-NN.jsonl says which of the three the row is now:
 * single-step (its own section states its validity rules), supplied-rule (the specification uses
 * the act and never defines it), positioned (another sequence entry should carry it), or withdrawn
 * (it is not an act at all).
 *
 * The registry is a Markdown document whose enumeration is a fenced block of one JSON object per
 * line, so a row is replaced by replacing its line. Every field the checker tests is proved here
 * before anything is written: S2 wants an unsequenced row to carry a note, S25 wants a defining
 * section that is a real heading or a rule at 4.2 that S31 will hold the row to.
 */
const fs = require('fs');

const REGISTRY = '/Users/kawata/shyme/gaia/crates/protocol/gaia-operation/docs/procedure-registry.md';
const SPEC = '/Users/kawata/shyme/gaia/GaiaSekkeiShiyousho_v32.md';
const WORK = '/tmp/seqwork3';
const DATE = '2026-10-08';

const readJsonl = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const specLines = fs.readFileSync(SPEC, 'utf8').split('\n');
const headings = specLines.map((l, i) => ({ line: i + 1, text: l })).filter((h) => /^#{3,5} /.test(h.text));

const isOpenable = (n) => Number.isInteger(n) && n >= 1 && n <= specLines.length
  && String(specLines[n - 1]).trim() !== '' && !/^\s*```/.test(specLines[n - 1])
  && !/^\s*\|/.test(specLines[n - 1]);

const lines = fs.readFileSync(REGISTRY, 'utf8').split('\n');
const rowLine = new Map();
lines.forEach((l, i) => {
  const t = l.trim();
  if (!t.startsWith('{"kind"')) return;
  try { rowLine.set(JSON.parse(t).kind, i); } catch { /* a line that is not a row */ }
});

// The operations that actually lost their placement: a row whose `position` names an entry that no
// surviving manifest entry names any more. The worklist was built from a wider test — "no manifest
// entry names it" — which swept in seventy-two rows already marked `unsequenced`, whose procedure
// is already accounted for by a section or by a rule at 4.2. A reader answered about those too; the
// answers are discarded here rather than applied, because applying one would rewrite a row that is
// already right and append a second rule for an act that already has one.
const manifest = readJsonl('/Users/kawata/shyme/gaia/crates/conformance/gaia-conformance/docs/sequence-manifest.jsonl');
const placed = new Set(manifest.flatMap((m) => m.maps_to ?? []));
const orphans = new Set();
for (const [kind, at] of rowLine) {
  const r = JSON.parse(lines[at].trim());
  if (!['active', 'framework'].includes(r.disposition)) continue;
  if (!r.position || r.position === 'unsequenced') continue;
  if (placed.has(kind)) continue;
  orphans.add(kind);
}

const asked = new Set();
for (const f of fs.readdirSync(WORK).filter((x) => /^R-batch-\d+\.jsonl$/.test(x))) {
  for (const r of readJsonl(`${WORK}/${f}`)) if (orphans.has(r.kind)) asked.add(r.kind);
}
const answers = new Map();
const rejected = [];
const setAside = [];
for (const f of fs.readdirSync(WORK).filter((x) => /^out-R-\d+\.jsonl$/.test(x)).sort()) {
  for (const a of readJsonl(`${WORK}/${f}`)) {
    // An answer about an operation that was never unplaced. The worklist's test was wider than the
    // question, so these came back; they are set aside rather than applied, because the row already
    // stands on its own section or its own rule at 4.2 and applying a second one would give one act
    // two rules. Set aside is not rejected: nothing is wrong with the answer, only with the asking.
    if (!orphans.has(a.kind)) { setAside.push(a.kind); continue; }
    if (!asked.has(a.kind)) { rejected.push({ kind: a.kind, why: 'an operation that was in no worklist' }); continue; }
    if (answers.has(a.kind)) { rejected.push({ kind: a.kind, why: 'the operation is answered twice' }); continue; }
    answers.set(a.kind, a);
  }
}
for (const k of asked) if (!answers.has(k)) rejected.push({ kind: k, why: 'no answer returned' });
console.log(`operations asked ${asked.size}, answered ${answers.size}, rejected ${rejected.length}`);

// ---------------------------------------------------------------- proofs

/**
 * Three readings the integrator cannot take as written, and the line that settles each.
 *
 * Two readers put a sentence where the rule wants the specification's own string for the act. The
 * string is not a summary of the act; it is what the specification actually writes, and S31 holds
 * the rule to it by requiring the string to occur on the line the rule names. Both readings are
 * otherwise sound, so the string is taken from the line the reader cited rather than the reading
 * being thrown away.
 *
 * The third named the entry that should carry its operation, which this script refuses to do — but
 * the reader is right that the act is already placed: §18.21's step 3 carries it under the name
 * `IssueSoulTransferPaymentReservation`, which sits at A-9039, and `CreateSoulTransferPaymentReservation`
 * is a second name for one act. That is the third kind of `excluded` the registry already records —
 * a name kept and not counted — so the row is excluded with the reason written on it.
 */
const OVERRIDES = new Map([
  ['SubmitSoulTransferDispute', {
    spec_name: 'SoulTransferDispute',
    presupposition: 6789,
    note: 'Line 6789 states that cancelling a Soul Transfer is not the deletion of history but the appending of a SoulTransferDispute and a SoulTransferResolution. The specification names the object and the append; it never states who submits the dispute, with what authority, or what the submission produces. The design supplies the procedure and the rule is recorded at 4.2.',
  }],
  ['RevokeStorageContribution', {
    spec_name: '該当寄与を失効・減衰させる',
    presupposition: 9744,
    note: 'Lines 9744 and 13640 state that a failed audit starts at-risk and repair and revokes and decays the contribution in question. Both state the effect; neither names an actor, an authority, a pre-state, a produced object or a rejection. The specification contains no section defining a revocation procedure for a storage contribution.',
  }],
  ['CreateSoulTransferPaymentReservation', {
    exclude: 'the same act under a second name. Section 18.21\'s payment order carries it at step 3, line 9061, and `IssueSoulTransferPaymentReservation` already sits there at A-9039; this row is the second name for one act, kept so that a reader who looks for it finds it, and not counted.',
  }],
]);

const DISPOSITIONS = ['single_step', 'supplied_rule', 'positioned', 'withdraw', 'excluded'];
const applied = [];
const newRules = [];
for (const [kind, a] of answers) {
  const at = rowLine.get(kind);
  const fail = (why) => rejected.push({ kind, why });
  if (at === undefined) { fail('no registry row'); continue; }
  if (!DISPOSITIONS.includes(a.disposition)) { fail(`disposition ${a.disposition} is not one of the five`); continue; }
  const row = JSON.parse(lines[at].trim());
  const over = OVERRIDES.get(kind);

  if (over?.exclude) {
    row.disposition = 'excluded';
    delete row.position;
    row.evidence = { ...row.evidence, note: over.exclude, reclassified: { date: DATE, from: 'active', why: over.exclude } };
    applied.push({ kind, disposition: 'excluded' });
    lines[at] = JSON.stringify(row);
    continue;
  }
  if (over) {
    a.spec_name = over.spec_name;
    a.presupposition = over.presupposition;
    if (over.note) a.note = over.note;
  }

  if (a.disposition === 'single_step') {
    const section = String(a.defining_section ?? '').trim();
    const m = section.match(/section\s+([0-9][0-9.]*)/);
    if (!m) { fail(`defining section "${section}" names no section number`); continue; }
    if (!headings.some((h) => new RegExp(`^#{3,5} ${m[1].replace(/\./g, '\\.')}[ .]`).test(h.text))) {
      fail(`defining section ${m[1]} is not a heading of the specification`); continue;
    }
    if (!isOpenable(a.line)) { fail(`line ${a.line} is not a line a reader can open`); continue; }
    if (!String(a.note ?? '').trim()) { fail('no note'); continue; }
    row.position = 'unsequenced';
    row.evidence = {
      ...row.evidence,
      note: String(a.note).trim(),
      defining_section: section,
      grounding: {
        date: DATE,
        classification: 'definition',
        line: a.line,
        note: 'read on 2026-10-08, after the entry that named this operation was found not to state an ordered procedure.',
      },
    };
    applied.push({ kind, disposition: 'single_step', section, line: a.line });
    lines[at] = JSON.stringify(row);
    continue;
  }

  if (a.disposition === 'supplied_rule') {
    let bad = false;
    for (const f of ['presupposition', 'act', 'rule', 'why', 'override']) {
      if (!String(a[f] ?? '').trim()) { fail(`the rule states no ${f}`); bad = true; }
    }
    if (bad) continue;
    const grounds = (Array.isArray(a.grounds) ? a.grounds : []).slice().sort((x, y) => x - y);
    if (!grounds.length) { fail('the rule rests on no ground'); continue; }
    if (grounds.some((g) => !isOpenable(g))) { fail(`ground ${grounds.find((g) => !isOpenable(g))} is not a line a reader can open`); continue; }
    // S31 holds the rule and the row to each other on four points, and the presupposition is one of
    // them: it is the LINE carrying the specification's own string for the act, not a sentence about
    // it. A rule whose presupposition is prose fails the check that exists to keep it honest, so the
    // line is derived here from the ground that carries the string, and a reading that names none is
    // refused rather than written.
    const specName = String(a.spec_name ?? a.act ?? '').trim();
    const carrying = grounds.filter((g) => specLines[g - 1].includes(specName));
    const presupposition = Number.isInteger(a.presupposition) && carrying.includes(a.presupposition)
      ? a.presupposition
      : carrying[0];
    if (!presupposition) {
      fail(`the specification does not use the act "${specName}" on any of the grounds ${grounds.join(',')}`); continue;
    }
    row.position = 'unsequenced';
    if (row.evidence?.defining_section) delete row.evidence.defining_section;
    row.evidence = {
      ...row.evidence,
      spec_lines: [...new Set([...grounds, presupposition])].sort((x, y) => x - y),
      note: String(a.why).trim(),
      grounding: {
        date: DATE,
        classification: 'designer_supplied',
        line: grounds[0],
        note: `Withdrawn from its sequence position when the entry that named it was read and found not to state an ordered procedure, and re-read: a search of the whole specification for the act, rather than for the name, found no line that states it. The specification gives the string ${specName} at ${presupposition} and never states the procedure. The design supplies it and the rule is recorded at 4.2.`,
      },
    };
    newRules.push({
      kind,
      disposition: 'stated_here',
      spec_name: specName,
      presupposition,
      // `spec_name` is the string the specification itself uses for the act and `act` says what the
      // act is. The readers were asked for the string, so it stands in both fields rather than being
      // dressed up as prose: one field saying the same true thing twice is honest, and inventing a
      // sentence to fill the second is not.
      act: specName,
      rule: String(a.rule).trim(),
      grounds,
      why: String(a.why).trim(),
      override: String(a.override).trim(),
    });
    applied.push({ kind, disposition: 'supplied_rule', grounds });
    lines[at] = JSON.stringify(row);
    continue;
  }

  if (a.disposition === 'positioned') {
    fail("a reader named a sequence entry to carry this operation; planting a row in another entry's decomposition is not a re-homing — it is a new reading of that entry, which is its own pass");
    continue;
  }

  // withdraw / excluded: the row is not an act, and the registry records that rather than deleting
  // it, because a deleted row is indistinguishable from one that was never written.
  if (!String(a.reason ?? '').trim()) { fail('the withdrawal states no reason'); continue; }
  row.disposition = 'excluded';
  delete row.position;
  row.evidence = {
    ...row.evidence,
    note: String(a.reason).trim(),
    reclassified: { date: DATE, from: 'active', why: String(a.reason).trim() },
  };
  applied.push({ kind, disposition: a.disposition });
  lines[at] = JSON.stringify(row);
}

if (rejected.length) {
  console.log('REJECTED — nothing written. Resolve these and re-run.');
  for (const r of rejected) console.log(`  ${r.kind}: ${r.why}`);
  process.exit(1);
}

// ---------------------------------------------------------------- the 4.2 block

if (newRules.length) {
  const start = lines.findIndex((l) => l.includes('### 4.2 Rules this design supplies'));
  const open = lines.findIndex((l, i) => i > start && /^```jsonl/.test(l));
  const close = lines.findIndex((l, i) => i > open && /^```\s*$/.test(l));
  if (start < 0 || open < 0 || close < 0) {
    console.log('the 4.2 block is not where it was; nothing written.');
    process.exit(1);
  }
  lines.splice(close, 0, ...newRules.map((r) => JSON.stringify(r)));
  console.log(`rules added to 4.2: ${newRules.length}`);
}

fs.writeFileSync(REGISTRY, lines.join('\n'));
console.log(`operations re-homed: ${applied.length}`);
for (const a of applied) {
  console.log(`  ${a.kind}  ${a.disposition}${a.section ? '  ' + a.section : ''}${a.grounds ? '  lines ' + a.grounds.join(',') : ''}`);
}
