
const fs = require('fs');
let s = fs.readFileSync('/tmp/seqwork/merge.mjs', 'utf8');
const OLD = [
'  const all = [].concat(m.spec_lines || [], o.spec_lines || [], steps.map((s) => s.line));',
'  m.spec_lines = [Math.min(...all), Math.max(...all)];',
].join('\n');
const NEW = [
'  // spec_lines is the entry\'s OWN region and must be contiguous. Taking min/max over every cited',
'  // line was wrong: an entry whose procedure sits in one section and whose anchor sits in another',
'  // (a conformance-matrix item, say) acquired a span covering everything between the two, and that',
'  // span then counted as covering thousands of lines the entry never read. Two such entries',
'  // covered 5,398 lines between them, a third of the specification.',
'  //',
'  // So the cited lines are clustered and the widest gap is cut. The cluster holding the entry\'s',
'  // steps is its region; the rest is recorded as cross_refs rather than dropped, because a citation',
'  // that is dropped is indistinguishable from one that was never made.',
'  const cited = [...new Set([].concat(m.spec_lines || [], o.spec_lines || [], steps.map((x) => x.line)))].sort((a, b) => a - b);',
'  const CLUSTER_GAP = 150;',
'  const clusters = [];',
'  for (const n of cited) {',
'    const last = clusters[clusters.length - 1];',
'    if (last && n - last[last.length - 1] <= CLUSTER_GAP) last.push(n); else clusters.push([n]);',
'  }',
'  const stepLines = new Set(steps.map((x) => x.line));',
'  const score = (c) => c.filter((n) => stepLines.has(n)).length;',
'  let best = clusters[0];',
'  for (const c of clusters) if (score(c) > score(best)) best = c;',
'  m.spec_lines = [best[0], best[best.length - 1]];',
'  const crossRefs = cited.filter((n) => n < best[0] || n > best[best.length - 1]);',
'  if (crossRefs.length) m.cross_refs = crossRefs; else delete m.cross_refs;',
].join('\n');
if (!s.includes(OLD)) { console.error('ANCHOR NOT FOUND'); process.exit(1); }
s = s.replace(OLD, NEW);
fs.writeFileSync('/tmp/seqwork/merge.mjs', s);
console.log('merge.mjs now clusters cited lines instead of taking min/max');
