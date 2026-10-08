
import fs from 'node:fs';
import path from 'node:path';
const FENCE = String.fromCharCode(96).repeat(3);
const ROOT = '/Users/kawata/shyme/gaia';
const W = '/tmp/seqwork';
const SPEC = path.join(ROOT, 'GaiaSekkeiShiyousho_v32.md');
const REG = path.join(ROOT, 'crates/protocol/gaia-operation/docs/procedure-registry.md');

const lines = fs.readFileSync(SPEC, 'utf8').split('\n');
const regText = fs.readFileSync(REG, 'utf8');
const rows = regText.slice(regText.indexOf(FENCE + 'jsonl') + 8, regText.lastIndexOf(FENCE)).trim().split('\n').map((l) => JSON.parse(l));
const vocab = new Map(rows.map((r) => [r.kind, r]));

const problems = [];
const notes = [];
const ok = [];
const batchNums = process.argv.slice(2);

for (const nn of batchNums) {
  const batch = fs.readFileSync(path.join(W, 'batch-' + nn + '.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const outPath = path.join(W, 'out-' + nn + '.jsonl');
  if (!fs.existsSync(outPath)) { problems.push([nn, '*', 'no output file']); continue; }
  const got = new Map();
  for (const raw of fs.readFileSync(outPath, 'utf8').trim().split('\n')) {
    if (!raw.trim()) continue;
    let o; try { o = JSON.parse(raw); } catch (e) { problems.push([nn, '?', 'unparseable: ' + raw.slice(0, 80)]); continue; }
    got.set(o.id, o);
  }
  for (const b of batch) {
    const o = got.get(b.id);
    if (!o) { problems.push([nn, b.id, 'missing from output']); continue; }
    const sl = Array.isArray(o.spec_lines) && o.spec_lines.length ? o.spec_lines : b.spec_lines;
    const lo = Math.min(...sl), hi = Math.max(...sl);
    if (lo < 1 || hi > lines.length) { problems.push([nn, b.id, 'spec_lines out of range']); continue; }
    const steps = o.steps || [];
    if (!steps.length) { problems.push([nn, b.id, 'no steps']); continue; }
    const seen = new Set();
    let bad = 0;
    steps.forEach((s, i) => {
      if (s.step !== i + 1) { problems.push([nn, b.id, 'numbering gap at ' + (i + 1)]); bad++; }
      for (const f of ['subject', 'predicate', 'object', 'contract']) {
        if (!String(s[f] == null ? '' : s[f]).trim()) { problems.push([nn, b.id, 'step ' + s.step + ' empty ' + f]); bad++; }
      }
      if (!Number.isInteger(s.line) || s.line < 1 || s.line > lines.length) {
        problems.push([nn, b.id, 'step ' + s.step + ' bad line ' + s.line]); bad++; return;
      }
      if (s.line < lo || s.line > hi) { problems.push([nn, b.id, 'step ' + s.step + ' line ' + s.line + ' outside [' + lo + ',' + hi + ']']); bad++; }
      const q = String(s.quote == null ? '' : s.quote);
      if (!q.trim()) { problems.push([nn, b.id, 'step ' + s.step + ' empty quote']); bad++; }
      else if (!lines[s.line - 1].includes(q)) { problems.push([nn, b.id, 'step ' + s.step + ' QUOTE NOT IN LINE ' + s.line + ': ' + q.slice(0, 60)]); bad++; }
      const op = s.operation;
      if (op !== null && op !== undefined && op !== '') {
        if (!vocab.has(op)) { problems.push([nn, b.id, 'step ' + s.step + ' unknown op ' + op]); bad++; }
        else if (vocab.get(op).disposition === 'excluded') { problems.push([nn, b.id, 'step ' + s.step + ' binds EXCLUDED ' + op]); bad++; }
        if (seen.has(op)) notes.push([nn, b.id, 'step ' + s.step + ' repeats op ' + op]);
        seen.add(op);
      }
    });
    if (!seen.size) problems.push([nn, b.id, 'no operation bound in any step']);
    ok.push([nn, b.id, steps.length, seen.size, (o.gaps || []).length, bad]);
  }
  for (const id of got.keys()) if (!batch.find((b) => b.id === id)) problems.push([nn, id, 'output entry not in batch']);
}
console.log('entries accepted:', ok.length, '| steps:', ok.reduce((a, r) => a + r[2], 0), '| bound ops:', ok.reduce((a, r) => a + r[3], 0), '| gaps:', ok.reduce((a, r) => a + r[4], 0));
console.log('NOTES:', notes.length, notes.map(n=>n[1]+':'+n[2]).slice(0,20).join(' | '));
console.log('PROBLEMS:', problems.length);
for (const p of problems.slice(0, 100)) console.log('  [' + p[0] + '] ' + p[1] + ' -- ' + p[2]);
