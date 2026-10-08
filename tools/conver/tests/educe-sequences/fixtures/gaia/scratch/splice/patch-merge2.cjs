
const fs = require('fs');
let s = fs.readFileSync('/tmp/seqwork/merge.mjs', 'utf8');
const OLD = [
'  const m = byId.get(id);',
'  if (!m) throw new Error(\'output for unknown entry \' + id);',
].join('\n');
const NEW = [
'  let m = byId.get(id);',
'  if (!m) {',
'    // A sequence the second reading wave found in a section no entry had entered. It is a',
'    // specified sequence: the specification states it, the manifest had simply never recorded it.',
'    m = { id, kind: \'specified\', spec_lines: (o.spec_lines || []).slice(), subject: o.subject,',
'      observed: null, maps_to: null, reason: null };',
'    manifest.push(m);',
'    byId.set(id, m);',
'  }',
].join('\n');
if (!s.includes(OLD)) { console.error('ANCHOR NOT FOUND'); process.exit(1); }
s = s.replace(OLD, NEW);
fs.writeFileSync('/tmp/seqwork/merge.mjs', s);
console.log('merge.mjs now accepts entries the manifest does not yet hold');
