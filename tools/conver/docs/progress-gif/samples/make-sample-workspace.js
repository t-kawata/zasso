#!/usr/bin/env node
// make-sample-workspace.js <dir> : synthetic conver workspace (14 packages, mixed stages) for draw-progress-gif tests
'use strict';
const fs = process.getBuiltinModule('fs'), path = process.getBuiltinModule('path');
const root = path.resolve(process.argv[2] || './sample-workspace');
fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
const D = (y, m, d, h = 9, mi = 0) => new Date(y, m - 1, d, h, mi, 0);
const iso = dt => dt.toISOString();
const ymd = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
const stamp = dt => { const p = n => String(n).padStart(2, '0'); return dt.getFullYear() + p(dt.getMonth() + 1) + p(dt.getDate()) + p(dt.getHours()) + p(dt.getMinutes()) + p(dt.getSeconds()); };
const W = (rel, content, when) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content, null, 1)); if (when) fs.utimesSync(f, when, when); };
const names = ['foundation','ports','invariants','soul','network','asset','codec','store','auth','policy','cli','api','sim','ui'];
const pk = names.map((n, i) => ({ id: 'pkg-' + String(i + 1).padStart(2, '0'), name: 'gaia-' + n, path: 'crates/' + (i < 4 ? 'core' : i < 9 ? 'mid' : 'edge') + '/gaia-' + n, layer: i < 4 ? 'core' : i < 9 ? 'mid' : 'edge', seed_required: true }));
// stage depth per package: 0 explain only ... 13 drill done
const depth = [13, 12, 10, 9, 8, 7, 6, 6, 6, 6, 5, 4, 3, 2];
W('spec.md', '# spec\n');
W('WORKSPACIFY-TREE-MANIFEST.json', { artifact_kind: 'workspacify-tree-manifest', status: 'COMPLETE', input: { spec_path: 'spec.md', source_hash: 'abc' }, workspace: { packages: pk }, integrity: { manifest_hash: 'h-tree' } });
W('WORKSPACIFY-ALLOCATE-MANIFEST.json', { artifact_kind: 'workspacify-allocate-manifest', status: 'COMPLETE', completion_decision: 'COMPLETE', semantic_review: { status: 'APPROVED' },
  input_tree_manifest: { hash: 'h-tree', spec: { sha256: 'abc' } }, seed_index: pk.map(p => ({ package: p.id, path: p.path + '/RFC-SEED.md', sha256: 'x' })),
  implementation_order: { serial: pk.map(p => p.id), levels: [pk.slice(0, 4).map(p => p.id), pk.slice(4, 9).map(p => p.id), pk.slice(9).map(p => p.id)] } });
W('spec-sequences.json', { schema_version: 3, spec: { path: 'spec.md', sha256: 'abc' } }, D(2026, 7, 20, 18, 30));
W('educe-sequences/status.json', { generation: 3, generationStartedAt: iso(D(2026, 7, 18, 10, 5)), phases: Array.from({ length: 18 }, (_, i) => ({ id: i + 1, status: 'done' })) });
W('smooth-sequences/status.json', { schemaVersion: 2, generation: 12, measuredAt: iso(D(2026, 8, 4, 15, 42)), verdict: { exitCode: 0, findings: 0, blocked: 0, readings: 0, withheld: 0 } });
W('smooth-sequences/COMPLETION-CERTIFICATE.json', { status: 'complete', obligations: { total: 640, closed: 640 } });
pk.forEach((p, i) => {
  const d = depth[i], base = new Date(2026, 7, 6 + i * 2, 10 + (i % 5), 7 * i % 60);
  const at = (days, h = 0) => new Date(base.getTime() + days * 864e5 + h * 36e5);
  W(p.path + '/RFC-SEED.md', '# seed\n');
  W(p.path + '/INFO-RFC-SEED.md', '# info\n', at(0));
  const facts = { schema: 'explain-seed-facts-v1', sections: {} }; for (let e = 1; e <= 7; e++) facts.sections['E' + e] = { digest: 'd', facts: [] };
  W(p.path + '/EXPLAIN-RFC-SEED.md', '# explain\n<!-- explain-seed:facts\n' + JSON.stringify(facts) + '\n-->\n', at(0, 3));
  if (d < 1) return;
  const nodes = Array.from({ length: 8 }, (_, k) => ({ id: 'Q' + (k + 1), title: 't', status: 'resolved', questions: [{ resolvedAt: iso(at(1 + k * 0.3, k)), answer: 'a' }], children: [] }));
  W(p.path + '/RFC.md', '# rfc\n'); W(p.path + '/DesignTree.json', { version: 1, updatedAt: iso(at(3)), nodes });
  W(p.path + '/Status.json', { state: 'DONE', createdAt: iso(at(1)), updatedAt: iso(at(3.2)), completedAt: iso(at(3.2)) });
  if (d < 2) return;
  const rid = ms => String(ms) + '000000-4242';
  W(p.path + '/RFC-GRAPH.json', { sourceFile: 'RFC.md', nodes: [], edges: [] }, at(4));
  W(p.path + '/RFC-GRAPHIFY-Status.json', { currentStep: 6, steps: { 0: 'done', 1: 'done', 2: 'done', 3: 'done', 4: 'done', 5: 'done' }, generation: 1, runs: 1, runId: rid(at(4).getTime()) });
  if (d < 3) return;
  W(p.path + '/RFC-Dirs-Tree.json', { generatedAt: iso(at(4.6)), trees: {} });
  W(p.path + '/RFC-BOUNDIFY-Status.json', { currentStep: 4, steps: { 0: 'done', 1: 'done', 2: 'done', 3: 'done' }, runId: rid(at(4.6).getTime()) });
  if (d < 4) return;
  const T = 10, impl = new Date(2026, 8, 12 + i * 3);
  const lvl = d - 4; // 0 split only .. 9 all reviewed
  const tickets = Array.from({ length: T }, (_, k) => {
    const day = (n) => ymd(new Date(impl.getTime() + (k * 0.8 + n) * 864e5));
    const frac = (k + 1) / T; let status = 'todo';
    const prog = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 }; // make/plan/start/review coverage
    const target = lvl <= 0 ? 0 : lvl <= 1 ? 1 : lvl <= 2 ? 2 : lvl <= 3 ? 3 : 4;
    if (target >= 1 && frac <= prog[Math.min(4, target)] + (target === 4 ? 0 : 0)) status = ['', 'made', 'planned', 'done', 'reviewed'][target];
    if (target === 4) status = 'reviewed';
    if (lvl >= 8 && k === 3) status = 'remanded';
    const r = ['todo', 'made', 'planned', 'done', 'reviewed', 'remanded'].indexOf(status);
    const t = { id: k + 1, phaseId: k < 5 ? 0 : 1, status, title: 't' + k };
    if (r >= 1) { t.created_at = day(0); t.updated_at = day(0.2); }
    if (r >= 2) t.updated_at = day(0.6);
    if (r >= 3 || status === 'remanded') { t.startedAt = day(1); t.updated_at = day(1.5); }
    if (r === 4 || status === 'remanded') t.completedAt = day(2);
    return t;
  });
  W(p.path + '/Tickets.json', { title: 'x', round: 1, metadata: { generatedAt: ymd(new Date(impl.getTime() - 864e5)) }, phases: [{ id: 0, name: 'a', tickets: tickets.slice(0, 5) }, { id: 1, name: 'b', tickets: tickets.slice(5) }] }, at(5));
  W(p.path + '/RFC-SPLIT-Status.json', { currentStep: '6', steps: { '0-1': 'done', '0-2': 'done', 1: 'done', 2: 'done', 3: 'done', '4-1': 'done', '4-2': 'done', '5-1': 'done', '5-2': 'done', '5-3': 'done', 6: 'done' }, runId: rid(impl.getTime() - 864e5 + 36e5) });
  if (d >= 8) {
    W(p.path + '/Malfeasance.json', { version: 1, records: [1, 2, 3, 4].map(n => ({ id: n, file: 'src/a.rs', line: n, description: 'x', detected_at: iso(new Date(impl.getTime() + 9 * 864e5)), status: n < 4 ? 'resolved' : 'open', resolved_at: n < 4 ? iso(new Date(impl.getTime() + (10 + n) * 864e5)) : undefined })) });
  }
  if (d >= 9) W(p.path + '/OMISSIONS-' + stamp(new Date(impl.getTime() + 16 * 864e5 + 15 * 36e5)) + '.json', { title: 'o', phases: [] });
  if (d >= 11) { W(p.path + '/CRYSTALIZE-Status.json', { currentStep: 4, steps: { 0: 'done', 1: 'done', 2: 'done', 3: 'done' }, grill: { tocApproved: true, toc: { nodes: [{ id: 'H1', status: 'confirmed' }, { id: 'H2', status: 'confirmed' }] }, sections: [{ id: 'H1', state: 'complete' }, { id: 'H2', state: 'residue' }] } }, new Date(impl.getTime() + 20 * 864e5)); }
  if (d >= 12) { W(p.path + '/drills/Status.json', { state: d >= 13 ? 'DONE' : 'RUN', currentStep: d >= 13 ? '1-12' : '1-7', updatedAt: iso(new Date(impl.getTime() + 24 * 864e5)) }); W(p.path + '/drills/DesignTree.json', { nodes: [1, 2, 3].map(n => ({ id: 'Q' + n, status: 'resolved', questions: [{ resolvedAt: iso(new Date(impl.getTime() + (22 + n) * 864e5)) }], children: [] })) }); }
});
console.log('sample workspace:', root);
