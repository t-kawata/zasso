// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
// PX-222 @verifies C003
// PX-222 @verifies C005
// PX-222 @verifies C006
//
// A projection assembled by hand, because the frame's unit tests are about what the frame
// does with facts rather than about how facts are gathered. It carries exactly the two
// kinds of recorded open item the real manifests carry — a grill question and a risky
// boundary — plus one settled contract, one forbidden edge and one obligation, so every
// branch the frame has is reachable without a fixture the size of a real workspace.
export const SYNTHETIC_SEED_PATH = '/tmp/explain-seed-fixture/crates/protocol/alpha/RFC-SEED.md';

/** One inventory term, overlapping the owned record's line range so the glossary is not empty. */
const OVERLAPPING_TERM = {
  id: 'req-000001',
  canonical_name: '禁止',
  classification: 'prohibited',
  keyword: '禁止',
  context: '第一章の本文。AlphaRecord は alpha が所有する記録である。',
  line_start: 7,
  line_end: 7,
  source_refs: [{ line_start: 7, line_end: 7 }],
};

/** One inventory term that shares no line with anything the package owns. */
const UNRELATED_TERM = {
  id: 'req-000002',
  canonical_name: '成熟度',
  classification: 'concept',
  keyword: '成熟度',
  context: '別の章の話。',
  line_start: 400,
  line_end: 401,
  source_refs: [{ line_start: 400, line_end: 401 }],
};

/** The projection the frame is given. */
export function syntheticProjection(overrides = {}) {
  return {
    identity: {
      id: 'pkg-0001',
      name: 'alpha',
      path: 'crates/protocol/alpha',
      layer: 'protocol',
      kind: 'production-library',
      responsibilities: ['own the alpha record', 'own the alpha encoding rule'],
    },
    totals: { packages: 2, layers: 1, boundaries: 1, contracts: 1 },
    position: { wave: 1, serial_index: 1, level: 1, before: [], after: ['pkg-0002'], parallel_with: [] },
    boundaries: {
      provided: [
        { id: 'boundary-001', reason_code: 'canonical-object', contract_scope: ['input'], counterpart: 'pkg-0002' },
      ],
      consumed: [],
    },
    forbidden_edges: [
      {
        from: 'pkg-0001',
        to: 'pkg-0002',
        reason: 'the alpha layer must never read beta semantics',
        reason_code: 'layer-direction',
        alternative: 'beta consumes alpha, never the reverse',
      },
    ],
    contracts: [
      {
        contract_id: 'contract-boundary-001',
        boundary_id: 'boundary-001',
        connection_kind: 'value_only',
        direction: '提供',
        counterpart: 'pkg-0002',
        clauses: [{ name: 'canonicalization', text: 'Encoding is the provider single fixed canonical form.' }],
      },
    ],
    owned: [
      {
        id: 'obj-000001',
        category: 'object',
        label: 'オブジェクト',
        canonical_name: 'AlphaRecord',
        classification: 'record',
        review_status: 'CONFIRMED',
        quotation: { line_start: 7, line_end: 7, text: '第一章の本文。AlphaRecord は alpha が所有する記録である。' },
      },
    ],
    obligations: {
      ports: [],
      conformance: ['pkg-0001 is the conformance sink for its layer'],
      database_policy: null,
    },
    grill: {
      questions: [
        {
          residual_id: 'residual-000001',
          question: 'Does alpha refuse an over-bound record or clamp it?',
          topic: 'The alpha bound',
          why_unresolved: 'the specification states the invariant without naming the refusal',
        },
      ],
      risky_boundaries: [{ id: 'boundary-001', topic: null }],
    },
    seed_edges: [],
    ...overrides,
  };
}

/** The rendered INFO sections, keyed the way the digest module keys them. */
export function syntheticInfoSections(overrides = {}) {
  return {
    I1: '## 1. この文書が確かめたこと\n\n- workspace root: `/tmp/fixture`\n',
    I2: '## 2. 全体の中での位置\n\n全体は 2 パッケージで構成されています。\n',
    I3: '## 3. このディレクトリが担うこと\n\n- 層: protocol\n',
    I4: '## 4. 他のディレクトリとの関係\n\n- boundary-001: pkg-0002 と結合\n',
    I5: '## 5. 契約\n\n- contract-boundary-001: 提供\n',
    I6: '## 6. 所有する意味論（仕様原文つき）\n\n- obj-000001 `AlphaRecord`\n',
    I7: '## 7. 禁じられた依存と非干渉\n\n- pkg-0001 → pkg-0002 は禁止\n',
    I8: '## 8. 実装の義務\n\n- pkg-0001 is the conformance sink for its layer\n',
    I9: '## 9. grill で詰めるべき点\n\n- residual-000001: Does alpha refuse an over-bound record or clamp it?\n',
    ...overrides,
  };
}

/** Everything the frame and the gate read, in the shape `run.mjs` hands them. */
export function syntheticFacts(overrides = {}) {
  const projection = overrides.projection ?? syntheticProjection();
  const infoSections = overrides.infoSections ?? syntheticInfoSections();
  const terms = overrides.terms ?? [OVERLAPPING_TERM, UNRELATED_TERM];
  return {
    projection,
    infoSections,
    seedPath: SYNTHETIC_SEED_PATH,
    workspace: {
      root: '/tmp/explain-seed-fixture',
      specPath: '/tmp/explain-seed-fixture/spec.md',
      treeManifestPath: '/tmp/explain-seed-fixture/WORKSPACIFY-TREE-MANIFEST.json',
      allocateManifestPath: '/tmp/explain-seed-fixture/WORKSPACIFY-ALLOCATE-MANIFEST.json',
      treeManifest: { inventory: { terms } },
    },
  };
}

/** The recorded open set the frame is required to carry, derived from the projection alone. */
export function syntheticOpenIds(projection = syntheticProjection()) {
  return [
    ...projection.grill.questions.map((entry) => entry.residual_id),
    ...projection.grill.risky_boundaries.map((entry) => entry.id),
  ];
}
