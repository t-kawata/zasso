// @verifies C010
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
// @verifies C013
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
/**
 * The locator, and the two properties that make it a tool rather than an oracle.
 *
 * It has to show the author the cell and the source the cell's basis rests on, bounded,
 * so the comparison the judgement needs is two lines rather than a search. And it has to
 * stop there: the moment its output contained a verdict about whether a statement is true
 * of the code, the author would be reading a judgement instead of the evidence for one,
 * which is precisely the division of labour the Step is built on.
 *
 * The spec read here is built the way a run builds one, so the matrix rows come from
 * `## Packages` and the readings from the claims that carry a `semantics_item` — which is
 * also what makes the locator able to tell a written cell from an unwritten one by
 * reading the published document alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildOriginSpec, validateOriginSpec } from '../../../.claude/scripts/workspacify-reverse/lib/origin-spec.mjs';
import {
  SOURCE_WINDOW_FOR_TEST,
  renderCoverageTable,
  renderReadingsView,
  readSourceWindow,
} from '../../../.claude/scripts/workspacify-reverse/lib/readings-view.mjs';
import { SEMANTICS_ITEMS } from '../../../.claude/scripts/workspacify-reverse/lib/design-semantics-schema.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const TREE = Object.freeze({
  'src/api/login.rs': ['use crate::model::User;', '', 'pub fn login(user: &User) -> bool {', '    !user.name.is_empty()', '}', ''].join('\n'),
  'src/state/mod.rs': 'pub struct Session;\n',
});

const MEASURED = Object.freeze([
  {
    claim_id: 'clm-login-boundary_crossing-1',
    claim_type: 'observed',
    scope: 'src/api',
    statement: 'src/api consumes src/model through the reference at src/api/login.rs:1',
    falsification: 'remove the reference at src/api/login.rs:1 and observe whether the consumer still resolves',
    evidence: [{ source_span: { file: 'src/api/login.rs', line: 1 }, evidence_mode: 'source_static' }],
    basis: [],
  },
]);

/** One authored reading, carried the way the merge carries it. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function authoredClaim(scope, item) {
  return {
    claim_id: `clm-design-${scope.replace(/\W/g, '')}${item}`.slice(0, 24),
    claim_type: 'inferred',
    scope,
    statement: `${scope} answers ${item} in the terms the code states it`,
    falsification: 'remove the condition at src/api/login.rs:4 and observe whether any test fails',
    semantics_item: item,
    evidence: [],
    basis: [MEASURED[0].claim_id],
  };
}

/** A spec built the way a run builds one, over the tree the evidence points at. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
/** A spec carrying the declines the run recorded, in the shape the section publishes. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function specWithDeclines(declinedCells) {
  const tree = createSyntheticTree(TREE);
  const spec = validateOriginSpec(
    buildOriginSpec({
      root: tree.root,
      ledger: { claims: [...MEASURED] },
      treeHash: 'deadbeef',
      sections: {
        packages: { scopes: ['src/api'] },
        design_semantics: {
          content: {
            source: '/tmp/readings.json',
            coverage: {
              packages: 1,
              cells: 21,
              written: 0,
              declined: declinedCells.length,
              rows: [{ scope: 'src/api', written: 0, declined: declinedCells.length }],
              declinedCells,
            },
          },
        },
      },
      scopes: ['src/api'],
    }),
    { root: tree.root },
  );
  return { spec, tree };
}

// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function specOver({ written = [['src/api', 'identity']], packages = ['src/api', 'src/state'] } = {}) {
  const tree = createSyntheticTree(TREE);
  const spec = validateOriginSpec(
    buildOriginSpec({
      root: tree.root,
      ledger: { claims: [...MEASURED, ...written.map(([scope, item]) => authoredClaim(scope, item))] },
      treeHash: 'deadbeef',
      sections: { packages: { scopes: packages } },
      scopes: packages,
    }),
    { root: tree.root },
  );
  return { spec, tree };
}

test('C010 precondition: the matrix rows come from the published document, not from the file', () => {
  const { spec, tree } = specOver();
  try {
    assert.deepEqual(spec.sections.packages.scopes, ['src/api', 'src/state']);
    assert.equal(spec.claims.filter((claim) => claim.semantics_item === 'identity').length, 1);
  } finally {
    tree.dispose();
  }
});

test('C010 postcondition: the requested cell is shown with its basis and a bounded window of the file', () => {
  const { spec, tree } = specOver();
  try {
    const { markdown } = renderReadingsView({ spec, scope: 'src/api', item: 'identity', root: tree.root });

    assert.match(markdown, /### src\/api — identity/);
    assert.match(markdown, /- state: \[entry\]/);
    assert.match(markdown, /src\/api\/login\.rs:1/, 'the anchor the basis names is printed');
    assert.match(markdown, /#### src\/api\/login\.rs:1 \(±\d+\)/, 'with the window it was read through');

    const window = /#### src\/api\/login\.rs:1 \(±\d+\)\n\n([\s\S]*?)\n\n/.exec(markdown)[1];
    const sourceLines = TREE['src/api/login.rs'].split('\n');
    assert.equal(window.includes('use crate::model::User;'), true, 'and the lines printed are the file\'s');
    assert.ok(window.split('\n').length <= sourceLines.length, 'the window never exceeds the file');
  } finally {
    tree.dispose();
  }
});

test('C010 invariant: the locator prints no verdict about the code', () => {
  const { spec, tree } = specOver();
  try {
    const { markdown } = renderReadingsView({ spec, scope: null, item: null, root: tree.root });

    assert.doesNotMatch(markdown, /\b(is|are) (true|false|correct|incorrect|wrong|right)\b/i,
      'no line asserts a statement to be true or false of the code');
    assert.doesNotMatch(markdown, /\bthe code (does|does not|should|must)\b/i);
    assert.doesNotMatch(markdown, /\b(good|bad|weak|strong|poor) (design|reading|semantics)\b/i);
  } finally {
    tree.dispose();
  }
});

test('C010 boundary: --scope and --item narrow, and a cell that does not exist is named', () => {
  const { spec, tree } = specOver({ written: [['src/api', 'identity'], ['src/api', 'origin']] });
  try {
    const one = renderReadingsView({ spec, scope: 'src/api', item: 'identity', root: tree.root }).markdown;
    assert.equal((one.match(/^### /gm) ?? []).length, 1, 'exactly the cell asked for');

    const scoped = renderReadingsView({ spec, scope: 'src/api', item: null, root: tree.root }).markdown;
    assert.equal((scoped.match(/^### /gm) ?? []).length, SEMANTICS_ITEMS.length, 'one package is a whole row');

    const all = renderReadingsView({ spec, scope: null, item: null, root: tree.root }).markdown;
    assert.equal((all.match(/^### /gm) ?? []).length, SEMANTICS_ITEMS.length * 2, 'unnarrowed is the whole matrix');

    assert.match(renderReadingsView({ spec, scope: 'src/absent', item: null, root: tree.root }).markdown, /src\/absent/,
      'a scope that is not a row is reported rather than silently empty');
    assert.match(renderReadingsView({ spec, scope: null, item: 'not-an-item', root: tree.root }).markdown, /not-an-item/,
      'and so is an item outside the set');
  } finally {
    tree.dispose();
  }
});

test('C010 boundary: an unwritten cell says what has to be written', () => {
  const { spec, tree } = specOver({ written: [] });
  try {
    const { markdown, findings } = renderReadingsView({ spec, scope: 'src/api', item: 'concurrency', root: tree.root });

    assert.match(markdown, /- state: unwritten/);
    assert.match(markdown, /What has to be written is:/);
    assert.equal(findings.some((finding) => finding.includes('concurrency')), true, 'and it is a finding');
  } finally {
    tree.dispose();
  }
});

test('C013: the locator rebuilds which cells are written from the published spec alone', () => {
  const { spec, tree } = specOver({ written: [['src/api', 'identity'], ['src/state', 'origin']] });
  try {
    const { markdown } = renderReadingsView({ spec, scope: null, item: null, root: tree.root });
    const written = (markdown.match(/- state: \[entry\]/g) ?? []).length;

    assert.equal(written, 2, 'the two cells the spec carries as claims, and no others');
  } finally {
    tree.dispose();
  }
});

test('C013 invariant: a basis that no longer resolves is a finding, not a crash', () => {
  const { spec, tree } = specOver();
  try {
    const orphaned = structuredClone(spec);
    orphaned.claims = orphaned.claims.map((claim) => (claim.semantics_item === undefined
      ? claim
      : { ...claim, basis: ['clm-gone-1'] }));

    const { markdown, findings } = renderReadingsView({ spec: orphaned, scope: 'src/api', item: 'identity', root: tree.root });

    assert.equal(findings.some((finding) => finding.includes('clm-gone-1')), true, 'the missing basis is named');
    assert.match(markdown, /Findings \(deterministic\)/, 'and the findings are labelled as the machine\'s');
  } finally {
    tree.dispose();
  }
});

test('C010: a cell closed by a decline is not an omission', () => {
  // The case a measurement-poor package produces: nothing to infer from, so every cell is
  // declined. A locator that counted a decline as an open cell would report twenty-one
  // omissions and refuse the Step its exit 0 — the opposite of what the author did.
  const declined = SEMANTICS_ITEMS.map((entry) => ({ scope: 'src/api', item: entry.key, reason: `nothing measured to rest a ${entry.key} reading on` }));
  const { spec, tree } = specWithDeclines(declined);
  try {
    const { markdown, findings } = renderReadingsView({ spec, scope: null, item: null, root: tree.root });

    assert.deepEqual(findings, [], 'a fully declined matrix is closed, not open');
    assert.match(markdown, /- state: declined/);
    assert.match(markdown, /- reason: nothing measured to rest a identity reading on/);
    assert.doesNotMatch(markdown, /- state: unwritten/);
  } finally {
    tree.dispose();
  }
});

test('C010 boundary: a cell that is neither written nor declined is still an omission', () => {
  const partial = SEMANTICS_ITEMS.slice(1).map((entry) => ({ scope: 'src/api', item: entry.key, reason: 'nothing to state' }));
  const { spec, tree } = specWithDeclines(partial);
  try {
    const { findings } = renderReadingsView({ spec, scope: null, item: null, root: tree.root });

    assert.equal(findings.length, 1, 'the one cell left open is the one finding');
    assert.match(findings[0], /identity/);
    assert.match(findings[0], /neither a reading nor a decline/);
  } finally {
    tree.dispose();
  }
});

test('C010 boundary: source that is no longer in the tree is reported rather than thrown', () => {
  const tree = createSyntheticTree({ 'placeholder.txt': '\n' });
  try {
    assert.equal(readSourceWindow({ root: tree.root, file: 'src/gone.rs', line: 1 }), null);
  } finally {
    tree.dispose();
  }
});

test('C010 surface: the coverage table counts written against the whole matrix', () => {
  const { spec, tree } = specOver({ written: [['src/api', 'identity']] });
  try {
    const table = renderCoverageTable(spec).join('\n');
    assert.match(table, /\| src\/api \| 1 \| 20 \|/);
    assert.match(table, new RegExp(`\\| src/state \\| 0 \\| ${SEMANTICS_ITEMS.length} \\|`));
  } finally {
    tree.dispose();
  }
});

test('C010 surface: the window size is a named constant, not a literal', () => {
  assert.equal(typeof SOURCE_WINDOW_FOR_TEST, 'number');
  assert.ok(SOURCE_WINDOW_FOR_TEST > 0);
});
