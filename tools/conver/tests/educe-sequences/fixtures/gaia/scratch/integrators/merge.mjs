
import fs from 'node:fs';
import path from 'node:path';
const FENCE = String.fromCharCode(96).repeat(3);
const ROOT = '/Users/kawata/shyme/gaia';
const W = '/tmp/seqwork';
const DOCS = path.join(ROOT, 'crates/conformance/gaia-conformance/docs');
const REG = path.join(ROOT, 'crates/protocol/gaia-operation/docs/procedure-registry.md');
const SPEC = path.join(ROOT, 'GaiaSekkeiShiyousho_v32.md');
const MODE = process.argv[2] || 'dry';
const readJsonl2 = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

const specLines = fs.readFileSync(SPEC, 'utf8').split('\n');
const manRaw = fs.readFileSync(path.join(DOCS, 'sequence-manifest.jsonl'), 'utf8');
const manifest = manRaw.trim().split('\n').map((l) => JSON.parse(l));
const byId = new Map(manifest.map((m) => [m.id, m]));

const regRaw = fs.readFileSync(REG, 'utf8');
const rOpen = regRaw.indexOf(FENCE + 'jsonl') + FENCE.length + 'jsonl'.length;
const rClose = regRaw.lastIndexOf(FENCE);
const regBlock = regRaw.slice(rOpen, rClose);
const rows = regBlock.trim().split('\n').map((l) => JSON.parse(l));

// --- collect agent output
const out = new Map();
for (const f of fs.readdirSync(W).filter((f) => /^out-\d\d\.jsonl$/.test(f)).sort()) {
  for (const raw of fs.readFileSync(path.join(W, f), 'utf8').trim().split('\n')) {
    if (!raw.trim()) continue;
    const o = JSON.parse(raw);
    if (out.has(o.id)) throw new Error('duplicate entry ' + o.id + ' in ' + f);
    out.set(o.id, o);
  }
}
const work = fs.readFileSync(path.join(W, 'worklist.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const missing = work.filter((w) => !out.has(w.id)).map((w) => w.id);
if (missing.length) { console.log('STILL MISSING (' + missing.length + '):', missing.join(' ')); }

// --- headings for defining-section derivation
const HEAD = [];
specLines.forEach((t, i) => {
  const m = t.match(/^#{3,5} ([0-9][0-9.]*)[ .]/);
  if (m) HEAD.push({ line: i + 1, num: m[1], text: t });
});
const governingSection = (line) => {
  let best = null;
  for (const h of HEAD) if (h.line <= line && (!best || h.line > best.line)) best = h;
  return best;
};

// --- build new manifest + steps
const newSteps = [];
const report = { entries: 0, steps: 0, bound: 0, sub: 0, zeroOp: [], gaps: [] };
for (const [id, o] of out) {
  let m = byId.get(id);
  if (!m) {
    // A sequence the second reading wave found in a section no entry had entered. It is a
    // specified sequence: the specification states it, the manifest had simply never recorded it.
    m = { id, kind: 'specified', spec_lines: (o.spec_lines || []).slice(), subject: o.subject,
      observed: null, maps_to: null, reason: null };
    manifest.push(m);
    byId.set(id, m);
  }
  const steps = o.steps.slice().sort((a, b) => a.step - b.step);
  const ops = [];
  for (const s of steps) {
    if (s.operation) { if (!ops.includes(s.operation)) ops.push(s.operation); report.bound += 1; } else report.sub += 1;
    newSteps.push({ seq: id, step: s.step, spec_line: s.line, subject: s.subject, predicate: s.predicate, object: s.object, contract: s.contract, operation: s.operation === undefined ? null : s.operation, quote: s.quote });
  }
  if (!ops.length) { report.zeroOp.push(id); newSteps.length -= steps.length; m.maps_to = null; const all2 = [].concat(m.spec_lines || [], o.spec_lines || [], steps.map((x) => x.line)); m.spec_lines = [Math.min(...all2), Math.max(...all2)]; report.entries += 1; continue; } // zero-op entry: its steps are dropped, the entry is adjudicated as a non-sequence
  if ((o.gaps || []).length) report.gaps.push([id, o.gaps.length]);
  m.maps_to = ops.length ? ops : null;
  // spec_lines is the entry's OWN region and must be contiguous. Taking min/max over every cited
  // line was wrong: an entry whose procedure sits in one section and whose anchor sits in another
  // (a conformance-matrix item, say) acquired a span covering everything between the two, and that
  // span then counted as covering thousands of lines the entry never read. Two such entries
  // covered 5,398 lines between them, a third of the specification.
  //
  // So the cited lines are clustered and the widest gap is cut. The cluster holding the entry's
  // steps is its region; the rest is recorded as cross_refs rather than dropped, because a citation
  // that is dropped is indistinguishable from one that was never made.
  const cited = [...new Set([].concat(m.spec_lines || [], o.spec_lines || [], steps.map((x) => x.line)))].sort((a, b) => a - b);
  const CLUSTER_GAP = 150;
  const clusters = [];
  for (const n of cited) {
    const last = clusters[clusters.length - 1];
    if (last && n - last[last.length - 1] <= CLUSTER_GAP) last.push(n); else clusters.push([n]);
  }
  const stepLines = new Set(steps.map((x) => x.line));
  const score = (c) => c.filter((n) => stepLines.has(n)).length;
  let best = clusters[0];
  for (const c of clusters) if (score(c) > score(best)) best = c;
  m.spec_lines = [best[0], best[best.length - 1]];
  const crossRefs = cited.filter((n) => n < best[0] || n > best[best.length - 1]);
  if (crossRefs.length) m.cross_refs = crossRefs; else delete m.cross_refs;
  report.entries += 1; report.steps += steps.length;
}

// --- registry position
const boundBy = new Map();
for (const s of newSteps) {
  if (!s.operation) continue;
  if (!boundBy.has(s.operation)) boundBy.set(s.operation, new Set());
  boundBy.get(s.operation).add(s.seq);
}
let positioned = 0, singleStep = 0, lostPosition = [], gained = [], regrounded = 0, noSection = [];
const lostIndex = new Map();
for (const l of readJsonl2(path.join(W, 'out-lost.jsonl'))) lostIndex.set(l.kind, l);
for (const r of rows) {
  if (r.disposition === 'excluded') continue;
  const seqs = boundBy.get(r.kind);
  if (seqs && seqs.size) {
    const pick = manifest.filter((m) => seqs.has(m.id)).map((m) => m.id).sort()[0];
    if (!r.position || r.position === 'unsequenced') gained.push(r.kind);
    r.position = pick; positioned += 1;
    continue;
  }
  // The operation is placed in no sequence. Its own procedure is therefore the validity rules of
  // the section that DEFINES it, which is a reading recorded in out-lost.jsonl, not the governing
  // heading of whatever line the registry happened to cite: for several of these kinds the cited
  // line is a prohibition list that names the operation as forbidden at that moment, and deriving
  // a section from it would record the operation as defined by a section that forbids it.
  if (r.position && r.position !== 'unsequenced') lostPosition.push(r.kind + '(' + r.position + ')');
  const lost = lostIndex.get(r.kind);
  if (!lost) {
    // Already a single-step operation from the earlier census: its defining section is on the row.
    if (String(r.evidence && r.evidence.defining_section || '').trim()) { singleStep += 1; continue; }
    noSection.push(r.kind); continue;
  }
  r.evidence.defining_section = lost.defining_section;
  if (lost.evidence_is_a_mention && !String(r.evidence.note || '').startsWith('evidence re-grounded')) {
    r.evidence.spec_lines = [lost.definition_line];
    const prior = String(r.evidence.note || '').trim();
    r.evidence.note = 'evidence re-grounded: the former citation named a line that mentions or ' +
      'forbids the operation, not the line that defines it. ' + prior;
    regrounded += 1;
  }
  r.position = 'unsequenced';
  singleStep += 1;
}

console.log(JSON.stringify({ entries: report.entries, steps: report.steps, boundOps: report.bound, subSteps: report.sub, zeroOpEntries: report.zeroOp.length, gaps: report.gaps.length }, null, 0));
console.log('zero-op entries:', report.zeroOp.join(' ') || '-');
console.log('gaps by entry:', report.gaps.map((g) => g[0] + ':' + g[1]).join(' ') || '-');
console.log('registry: positioned=' + positioned + ' singleStep=' + singleStep + ' regrounded=' + regrounded + ' noSection=' + noSection.length + (noSection.length ? ' -> ' + noSection.join(' ') : ''));
console.log('lost position (' + lostPosition.length + '):', lostPosition.slice(0, 40).join(' '));
console.log('gained position:', gained.length ? gained.join(' ') : '-');
console.log('no defining section:', noSection.join(' ') || '-');

if (MODE === 'apply') {
  fs.writeFileSync(path.join(DOCS, 'sequence-manifest.jsonl'), manifest.map((m) => JSON.stringify(m)).join('\n') + '\n');
  fs.writeFileSync(path.join(DOCS, 'sequence-steps.jsonl'), newSteps.map((s) => JSON.stringify(s)).join('\n') + '\n');
  fs.writeFileSync(REG, regRaw.slice(0, rOpen) + '\n' + rows.map((r) => JSON.stringify(r)).join('\n') + '\n' + regRaw.slice(rClose));
  console.log('APPLIED');
} else console.log('dry run — nothing written');
