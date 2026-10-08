
const fs = require('fs');
let s = fs.readFileSync('/tmp/seqwork/merge.mjs', 'utf8');
const OLD = [
'  if (r.position && r.position !== \'unsequenced\') lostPosition.push(r.kind + \'(\' + r.position + \')\');',
'  const sec = String(r.evidence && r.evidence.defining_section || \'\').trim();',
'  if (sec) { singleStep += 1; continue; }',
'  const defLine = (r.evidence && r.evidence.spec_lines && r.evidence.spec_lines[0]) || null;',
'  const h = defLine ? governingSection(defLine) : null;',
'  if (!h) { noSection.push(r.kind); continue; }',
'  r.evidence.defining_section = \'section \' + h.num + \' (\' + r.kind + \')\';',
'  r.position = \'unsequenced\';',
'  derived += 1; singleStep += 1;',
].join('\n');
const NEW = [
'  // The operation is placed in no sequence. Its own procedure is therefore the validity rules of',
'  // the section that DEFINES it, which is a reading recorded in out-lost.jsonl, not the governing',
'  // heading of whatever line the registry happened to cite: for several of these kinds the cited',
'  // line is a prohibition list that names the operation as forbidden at that moment, and deriving',
'  // a section from it would record the operation as defined by a section that forbids it.',
'  if (r.position && r.position !== \'unsequenced\') lostPosition.push(r.kind + \'(\' + r.position + \')\');',
'  const lost = lostIndex.get(r.kind);',
'  if (!lost) { noSection.push(r.kind); continue; }',
'  r.evidence.defining_section = lost.defining_section;',
'  if (lost.evidence_is_a_mention) {',
'    r.evidence.spec_lines = [lost.definition_line];',
'    const prior = String(r.evidence.note || \'\').trim();',
'    r.evidence.note = \'evidence re-grounded: the former citation named a line that mentions or \' +',
'      \'forbids the operation, not the line that defines it. \' + prior;',
'    regrounded += 1;',
'  }',
'  r.position = \'unsequenced\';',
'  singleStep += 1;',
].join('\n');
if (!s.includes(OLD)) { console.error('ANCHOR NOT FOUND'); process.exit(1); }
s = s.replace(OLD, NEW);
s = s.replace("const MODE = process.argv[2] || 'dry';",
  "const MODE = process.argv[2] || 'dry';\nconst readJsonl2 = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim().split('\\n').filter(Boolean).map((l) => JSON.parse(l)) : []);");
s = s.replace("let positioned = 0, singleStep = 0, lostPosition = [], gained = [], derived = 0, noSection = [];",
  "let positioned = 0, singleStep = 0, lostPosition = [], gained = [], regrounded = 0, noSection = [];\nconst lostIndex = new Map();\nfor (const l of readJsonl2(path.join(W, 'out-lost.jsonl'))) lostIndex.set(l.kind, l);");
s = s.replace("console.log('registry: positioned=' + positioned + ' singleStep=' + singleStep + ' derivedSections=' + derived + ' noSection=' + noSection.length);",
  "console.log('registry: positioned=' + positioned + ' singleStep=' + singleStep + ' regrounded=' + regrounded + ' noSection=' + noSection.length + (noSection.length ? ' -> ' + noSection.join(' ') : ''));");
fs.writeFileSync('/tmp/seqwork/merge.mjs', s);
console.log('merge.mjs patched');
