// @verifies C002
// @verifies C003
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
/**
 * The spec's sections, and the reading order that makes a package readable.
 *
 * Two properties are proved here, and they are the ones the absorption rests on.
 *
 * The round trip is unchanged and now covers every section: the Markdown is what the
 * next rotation reads, so a section the renderer can write and the parser cannot read
 * would be a document that merely looks complete.
 *
 * The grouping is a view rather than a second claim set: each claim appears once, under
 * the subsection of its scope, and the parser reconstructs the flat list. A grouping
 * that dropped, duplicated or reordered a claim would change what the spec says while
 * looking like a change of layout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertRoundTrip,
  buildOriginSpec,
  parseOriginSpec,
  renderOriginSpec,
  validateOriginSpec,
} from '../../../.claude/scripts/workspacify-reverse/lib/origin-spec.mjs';
import { sectionHeadings, SPEC_SECTIONS } from '../../../.claude/scripts/workspacify-reverse/lib/spec-sections.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const SPEC_TREE = Object.freeze({
  'src/api/login.rs': 'pub fn login() -> bool { true }\n',
});

/** One located claim per scope, so the grouping has something to group. */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
function ledgerClaims() {
  return [
    {
      claim_id: 'clm-login-boundary_crossing-1',
      claim_type: 'observed',
      scope: 'src/api',
      statement: 'src/api consumes src/model through the reference at src/api/login.rs:1',
      falsification: 'remove the reference at src/api/login.rs:1 and observe whether the consumer still resolves',
      evidence: [{ source_span: { file: 'src/api/login.rs', line: 1 }, evidence_mode: 'source_static' }],
      basis: [],
    },
    {
      claim_id: 'clm-login-invariant-2',
      claim_type: 'inferred',
      scope: 'src/api',
      statement: 'the condition asserted at src/api/login.rs:2 holds',
      falsification: 'mutate the asserted condition at src/api/login.rs:2 and observe whether any test fails',
      evidence: [{ source_span: { file: 'src/api/login.rs', line: 2 }, evidence_mode: 'source_static' }],
      basis: ['the assertion at src/api/login.rs:2 exists in the text'],
    },
    {
      claim_id: 'clm-model-type-3',
      claim_type: 'observed',
      scope: 'src/model',
      statement: 'src/model declares a type at src/model.rs:1',
      falsification: 'delete the declaration at src/model.rs:1 and observe whether the tree still builds',
      evidence: [{ source_span: { file: 'src/model.rs', line: 1 }, evidence_mode: 'source_static' }],
      basis: [],
    },
  ];
}

/** A spec built the way the run builds one, over the tree the evidence points at. */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
function specOver(claims, { sections = {} } = {}) {
  const tree = createSyntheticTree({
    ...SPEC_TREE,
    'src/model.rs': 'pub struct Model;\n',
  });
  const spec = validateOriginSpec(
    buildOriginSpec({ root: tree.root, ledger: { claims }, treeHash: 'deadbeef', sections }),
    { root: tree.root },
  );
  return { spec, tree };
}

test('C002 precondition: the spec this file renders carries every registered section', () => {
  const { spec, tree } = specOver(ledgerClaims(), {
    sections: { boundary: { 'PATTERN.json': { pattern: 'pattern-1' } } },
  });

  try {
    assert.deepEqual(
      SPEC_SECTIONS.map((section) => section.heading).filter((heading) => !sectionHeadings().includes(heading)),
      [],
      'the registry is the list of headings the spec must carry',
    );
    assert.equal(sectionHeadings().length > 0, true);
    assert.equal(typeof spec.sections, 'object', 'the spec carries its sections as data');
  } finally {
    tree.dispose();
  }
});

test('C002 postcondition: a spec carrying every section re-parses to itself', () => {
  const { spec, tree } = specOver(ledgerClaims(), {
    sections: {
      boundary: { 'PATTERN.json': { pattern: 'pattern-1', evidence: [{ source: 'RFC-ROOT.md', present: true }] } },
      gaps: { 'GAPS.json': { gaps: [], count: 0 } },
      capability: { 'CAPABILITY-PROFILE.json': { dimensions: [], verdict: null } },
    },
  });

  try {
    const markdown = renderOriginSpec(spec);

    for (const heading of sectionHeadings()) {
      assert.match(markdown, new RegExp(`^## ${heading}$`, 'm'), `${heading} is rendered`);
    }
    assert.equal(assertRoundTrip(spec).equal, true, 'the Markdown re-parses to the sidecar exactly');
    assert.deepEqual(parseOriginSpec(markdown), spec, 'by deep equality, not by a second render');
  } finally {
    tree.dispose();
  }
});

test('C002 invariant: the proof modifies neither the spec nor the text it rendered', () => {
  const { spec, tree } = specOver(ledgerClaims(), { sections: { gaps: { 'GAPS.json': { gaps: [] } } } });

  try {
    const before = JSON.stringify(spec);
    const markdown = renderOriginSpec(spec);
    const proof = assertRoundTrip(spec);

    assert.equal(proof.equal, true);
    assert.equal(JSON.stringify(spec), before, 'proving the round trip does not rewrite the spec');
    assert.equal(renderOriginSpec(spec), markdown, 'and rendering it twice yields the same text');
  } finally {
    tree.dispose();
  }
});

test('C002 boundary: a section whose stage did not run is an explicit absence, not a missing heading', () => {
  const { spec, tree } = specOver(ledgerClaims(), {
    sections: { gaps: null },
    // A run that stopped before R5 says so; the shape of the document does not change
    // with the depth of the run.
  });

  try {
    const markdown = renderOriginSpec(spec);
    const gaps = /^## Gaps$([\s\S]*?)(?=^## )/m.exec(`${markdown}\n## end`)[1];

    assert.match(markdown, /^## Gaps$/m, 'the heading survives the stage not running');
    assert.match(gaps, /R5/, 'and names the stage that did not run');
    assert.equal(assertRoundTrip(spec).equal, true, 'the absence round-trips like everything else');
  } finally {
    tree.dispose();
  }
});

test('C003 precondition: the claims carry the scopes the grouping reads', () => {
  const { spec, tree } = specOver(ledgerClaims());

  try {
    assert.equal(new Set(spec.claims.map((claim) => claim.scope)).size, 2, 'two scopes, one of them shared');
  } finally {
    tree.dispose();
  }
});

test('C003 postcondition: each claim appears once, under the subsection of its scope', () => {
  const { spec, tree } = specOver(ledgerClaims());

  try {
    const markdown = renderOriginSpec(spec);
    const entryIds = [...markdown.matchAll(/^#{2,6} Claim `([^`]+)`$/gm)].map(([, id]) => id);

    assert.deepEqual(
      [...entryIds].sort(),
      spec.claims.map((claim) => claim.claim_id).sort(),
      'every claim appears exactly once, and none appears twice',
    );
    assert.equal(entryIds.length, spec.claims.length, 'the grouping drops nothing');

    for (const scope of ['src/api', 'src/model']) {
      const section = new RegExp(`^### ${scope}$([\\s\\S]*?)(?=^### |^## )`, 'm').exec(`${markdown}\n## end`)[1];
      const owned = spec.claims.filter((claim) => claim.scope === scope).map((claim) => claim.claim_id);
      for (const id of owned) {
        assert.ok(section.includes(`Claim \`${id}\``), `${scope} carries ${id}`);
      }
    }
  } finally {
    tree.dispose();
  }
});

test('C003 invariant: the grouping is a view, and the flat claim list comes back in claim_id order', () => {
  const { spec, tree } = specOver(ledgerClaims());

  try {
    const reparsed = parseOriginSpec(renderOriginSpec(spec));

    assert.deepEqual(
      reparsed.claims.map((claim) => [claim.claim_id, claim.claim_type]).sort(),
      spec.claims.map((claim) => [claim.claim_id, claim.claim_type]).sort(),
      'the grouping is not a new claim set',
    );
    assert.deepEqual(
      reparsed.claims.map((claim) => claim.claim_id),
      [...spec.claims.map((claim) => claim.claim_id)].sort(),
      'and the reader sees them in the one order the sidecar declares',
    );
  } finally {
    tree.dispose();
  }
});

test('C003 boundary: a scope holding no claim is still rendered, with an explicit statement', () => {
  const { spec, tree } = specOver(ledgerClaims(), {
    // A scope the run measured and found nothing publishable in: its claims were all
    // demoted, so the package survives the ledger but holds nothing to print.
    sections: { packages: { scopes: ['src/api', 'src/empty'] } },
  });

  try {
    const markdown = renderOriginSpec(spec);

    assert.match(markdown, /^### src\/empty$/m, 'the empty package does not vanish');
    assert.match(
      new RegExp('^### src/empty$([\\s\\S]*?)(?=^### |^## )', 'm').exec(`${markdown}\n## end`)[1],
      /No claim/,
      'and says that it holds none',
    );
    assert.equal(assertRoundTrip(spec).equal, true);
  } finally {
    tree.dispose();
  }
});

test('C003 boundary: a scope the caller did not declare still carries its own claims', () => {
  // The declared scopes are a reading order, not a filter. A claim whose scope nobody
  // listed must still be printed: a document that silently dropped it would look
  // complete while having lost content, which is the failure this whole ticket is about.
  const { spec, tree } = specOver(ledgerClaims(), {
    sections: { packages: { scopes: ['src/api'] } },
  });

  try {
    const markdown = renderOriginSpec(spec);
    const entryIds = [...markdown.matchAll(/^#{2,6} Claim `([^`]+)`$/gm)].map(([, id]) => id);

    assert.deepEqual(
      [...entryIds].sort(),
      spec.claims.map((claim) => claim.claim_id).sort(),
      'every claim is printed, including the ones under a scope the caller never named',
    );
    assert.match(markdown, /^### src\/model$/m, 'and the scope it belongs to is rendered');
    assert.equal(assertRoundTrip(spec).equal, true);
  } finally {
    tree.dispose();
  }
});

test('C002 boundary: an empty ledger still produces a spec whose every section is present', () => {
  const { spec, tree } = specOver([]);

  try {
    const markdown = renderOriginSpec(spec);

    for (const heading of sectionHeadings()) {
      assert.match(markdown, new RegExp(`^## ${heading}$`, 'm'), `${heading} is present for an empty run`);
    }
    assert.equal(assertRoundTrip(spec).equal, true);
  } finally {
    tree.dispose();
  }
});
