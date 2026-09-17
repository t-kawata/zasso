// @verifies C006
// @verifies C007
// @verifies C008
// @verifies C009
// @verifies C012
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
/**
 * The authoring route, driven through the entrance rather than through the library.
 *
 * P26-4 built the validation and left the option unread: `analyze` advertised
 * `--semantics`, parsed it, and then returned a branch that did not carry it, so a file
 * that had to be refused published instead. The library path was green throughout, which
 * is exactly why nothing caught it — the suite proved the function and never the
 * entrance. Every assertion here therefore goes through `run.mjs`, and the library is
 * only ever reached the way an operator reaches it.
 *
 * The sequence also has an ordering the design discovered late: the entrance erases the
 * destination before it writes, and `DECISIONS.json` is not a published document, so a
 * re-run removes the Step 5 artefact. The rotation closes by writing it again, and the
 * test asserts both the loss and the repair — a Step that left a later Step's gate red
 * would be a procedure nobody could follow to the end.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SEMANTICS_ITEMS } from '../../../.claude/scripts/workspacify-reverse/lib/design-semantics-schema.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

/** The packages the operator declares, which is where the matrix rows come from. */
const PACKAGES = Object.freeze(['src/api', 'src/model']);

const PROJECT_ROOT = join(import.meta.dirname, '..', '..', '..');
const RUNNER = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');
const DESTINATION = 'workspacify/reverse';

/** A tree with two packages, one crossing in each, so the matrix has two rows. */
const TREE = Object.freeze({
  'src/api/login.rs': [
    'use crate::model::User;',
    '',
    'pub fn login(user: &User) -> Result<(), Error> {',
    '    assert!(!user.name.is_empty());',
    '    Ok(())',
    '}',
    '',
  ].join('\n'),
  'src/model.rs': 'pub struct User { pub name: String }\n',
});

/** Run the entrance and return what it did. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function runRunner(args, cwd) {
  return spawnSync(process.execPath, [RUNNER, ...args], { cwd, encoding: 'utf8' });
}

const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/**
 * The six answers, named from the surface itself so a renamed decision cannot drift past.
 *
 * `package_boundary` carries the packages because that is the half of the matrix the
 * operator owns: a package with no measurements of its own is still a row, and the run
 * cannot know it was meant to be one.
 */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function answers() {
  return {
    package_boundary: {
      packages: PACKAGES.map((path) => ({ path, name: path.replace(/^src\//, '') })),
      rationale: 'two packages, one per concern the tree separates',
    },
    owner_assignment: PACKAGES.map((path) => ({ package: path, owns: [`the ${path} concern`] })),
    layer_estimation: PACKAGES.map((path) => ({ package: path, layer: 'domain' })),
    contract_meaning: PACKAGES.map((path) => ({ contract: path, meaning: `what ${path} promises its callers` })),
    over_splitting: { decision: 'not-split', rationale: 'the two packages differ by concern and by nothing else' },
    proposition_classification: [{ claim: 'the reference at src/api/login.rs:1', class: 'observed' }],
  };
}

/** A file in each package, so a falsification can name a place a reader could go to. */
const FILE_IN = Object.freeze({ 'src/api': 'src/api/login.rs', 'src/model': 'src/model.rs' });

/** Every cell of every package, written, resting on a measured crossing of its own scope. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function readingsFor({ ledger, packages = PACKAGES }) {
  const crossings = new Map();
  for (const claim of ledger.claims) {
    if (!claim.claim_id.includes('boundary_crossing')) continue;
    crossings.set(claim.scope, [...(crossings.get(claim.scope) ?? []), claim.claim_id]);
  }
  return packages.flatMap((scope) => SEMANTICS_ITEMS.map((entry) => ({
    scope,
    item: entry.key,
    statement: `${scope} answers ${entry.key} in its own terms, which the measurement at ${scope} cannot state`,
    falsification: `remove the condition at ${FILE_IN[scope]}:1 and observe whether any test fails`,
    basis: crossings.get(scope) ?? [...crossings.values()].flat(),
  })));
}

/** A scratch tree with a run behind it, and the paths the sequence needs. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function prepared() {
  const tree = createSyntheticTree(TREE);
  const scratch = createSyntheticTree({});
  const answersPath = join(scratch.root, 'answers.json');
  writeJson(answersPath, answers());
  return {
    tree,
    scratch,
    answersPath,
    readingsPath: join(scratch.root, 'readings.json'),
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
    dispose() { tree.dispose(); scratch.dispose(); },
  };
}

test('C007/C012/IT: the authoring route, end to end through the entrance', () => {
  const stage = prepared();
  try {
    assert.equal(runRunner(['analyze'], stage.tree.root).status, 0, 'the first run publishes');

    // The matrix rows come from the partition the operator decides, so the semantics
    // cannot be authored before Step 5 has run.
    assert.equal(runRunner(['decide', `--answers=${stage.answersPath}`], stage.tree.root).status, 0);
    assert.equal(existsSync(join(stage.tree.root, DESTINATION, 'DECISIONS.json')), true);

    const ledger = readJson(join(stage.tree.root, DESTINATION, 'CLAIM-LEDGER.json'));
    writeJson(stage.readingsPath, { readings: readingsFor({ ledger }), declined: [] });

    const authored = runRunner(['analyze', `--semantics=${stage.readingsPath}`], stage.tree.root);
    assert.equal(authored.status, 0, `the entrance admits a closed file: ${authored.stderr}`);

    const spec = readJson(join(stage.tree.root, DESTINATION, 'ORIGIN-LONG-SPEC.json'));
    const authoredClaims = spec.claims.filter((claim) => claim.claim_id.startsWith('clm-design-'));
    assert.equal(authoredClaims.length, PACKAGES.length * SEMANTICS_ITEMS.length, 'every cell became a reading');
    for (const claim of authoredClaims) {
      assert.equal(claim.claim_type, 'inferred');
      assert.equal(SEMANTICS_ITEMS.some((entry) => entry.key === claim.semantics_item), true,
        'and each says which item it answers');
    }
  } finally {
    stage.dispose();
  }
});

test('C007/IT: a file that must be refused is refused by the entrance, and nothing is published', () => {
  const stage = prepared();
  try {
    assert.equal(runRunner(['analyze'], stage.tree.root).status, 0);
    const before = readFileSync(join(stage.tree.root, DESTINATION, 'ORIGIN-LONG-SPEC.json'), 'utf8');

    writeJson(stage.readingsPath, {
      readings: [{
        scope: 'src/api',
        item: 'identity',
        statement: 'src/api owns the lifecycle, which no measurement states',
        falsification: 'remove the guard at src/api/login.rs:4 and observe whether a test fails',
        basis: ['clm-absent-1'],
      }],
      declined: [],
    });

    const refused = runRunner(['analyze', `--semantics=${stage.readingsPath}`], stage.tree.root);
    assert.equal(refused.status, 1, 'the entrance refuses what the library refuses');
    assert.match(refused.stderr, /clm-absent-1/, 'and names the id it could not resolve');
    assert.equal(readFileSync(join(stage.tree.root, DESTINATION, 'ORIGIN-LONG-SPEC.json'), 'utf8'), before,
      'the destination is byte-identical, so no partial merge exists');
  } finally {
    stage.dispose();
  }
});

test('C007/IT: a file leaving a cell unclosed is refused and the cell is named', () => {
  const stage = prepared();
  try {
    assert.equal(runRunner(['analyze'], stage.tree.root).status, 0);
    // The partition has to be decided first: the second row is a package the operator
    // declared, so before Step 5 the matrix has only the scopes the claims carry.
    assert.equal(runRunner(['decide', `--answers=${stage.answersPath}`], stage.tree.root).status, 0);
    const ledger = readJson(join(stage.tree.root, DESTINATION, 'CLAIM-LEDGER.json'));
    const readings = readingsFor({ ledger })
      .filter((entry) => !(entry.scope === 'src/model' && entry.item === 'concurrency'));
    writeJson(stage.readingsPath, { readings, declined: [] });

    const refused = runRunner(['analyze', `--semantics=${stage.readingsPath}`], stage.tree.root);
    assert.equal(refused.status, 1, 'one hole is not a smaller semantics');
    assert.match(refused.stderr, /src\/model/);
    assert.match(refused.stderr, /concurrency/);
  } finally {
    stage.dispose();
  }
});

test('C009/IT: an unauthored semantics is stated as not-authored, never as a stage that did not run', () => {
  const stage = prepared();
  try {
    assert.equal(runRunner(['analyze'], stage.tree.root).status, 0);

    const scope = readJson(join(stage.tree.root, DESTINATION, 'ANALYSIS-SCOPE.json'));
    const markdown = readFileSync(join(stage.tree.root, DESTINATION, 'ORIGIN-LONG-SPEC.md'), 'utf8');
    const section = /^## Design semantics$([\s\S]*?)(?=^## )/m.exec(`${markdown}\n## end`)[1];

    assert.equal(scope.stages_run.includes('r8'), true, 'precondition: R8 ran in this run');
    assert.match(section, /not-authored/);
    assert.doesNotMatch(section, /did not run/, 'the document no longer states a falsehood about its own run');
  } finally {
    stage.dispose();
  }
});

test('C008/IT: the two authored sections are recorded once their material exists', () => {
  const stage = prepared();
  try {
    assert.equal(runRunner(['analyze'], stage.tree.root).status, 0);
    assert.equal(runRunner(['decide', `--answers=${stage.answersPath}`], stage.tree.root).status, 0);

    const ledger = readJson(join(stage.tree.root, DESTINATION, 'CLAIM-LEDGER.json'));
    writeJson(stage.readingsPath, {
      readings: readingsFor({ ledger }),
      declined: [],
    });
    assert.equal(runRunner(['analyze', `--semantics=${stage.readingsPath}`], stage.tree.root).status, 0);

    const spec = readJson(join(stage.tree.root, DESTINATION, 'ORIGIN-LONG-SPEC.json'));
    assert.equal(spec.sections.decisions.status, 'recorded', 'the decisions are a record, not an absence');
    assert.equal(spec.sections.design_semantics.status, 'recorded');
    assert.equal(spec.sections.design_semantics.content.coverage.written, PACKAGES.length * SEMANTICS_ITEMS.length,
      'and the coverage is carried');

    const markdown = readFileSync(join(stage.tree.root, DESTINATION, 'ORIGIN-LONG-SPEC.md'), 'utf8');
    assert.match(markdown, /^\*\*Coverage\*\*$/m, 'the section renders the coverage table');
    assert.match(markdown, /^## Decisions$/m);
    assert.match(markdown, /- authored_from: /);
  } finally {
    stage.dispose();
  }
});

test('C012/IT: the re-run erases the decisions and the closing decide restores them', () => {
  const stage = prepared();
  try {
    assert.equal(runRunner(['analyze'], stage.tree.root).status, 0);
    assert.equal(runRunner(['decide', `--answers=${stage.answersPath}`], stage.tree.root).status, 0);
    assert.equal(runRunner(['gate'], stage.tree.root).status, 0, 'the gate is green before the re-run');

    const ledger = readJson(join(stage.tree.root, DESTINATION, 'CLAIM-LEDGER.json'));
    writeJson(stage.readingsPath, { readings: readingsFor({ ledger }), declined: [] });
    assert.equal(runRunner(['analyze', `--semantics=${stage.readingsPath}`], stage.tree.root).status, 0);

    const decisionsPath = join(stage.tree.root, DESTINATION, 'DECISIONS.json');
    assert.equal(existsSync(decisionsPath), false, 'the entrance erases the destination before it writes');
    assert.equal(runRunner(['gate'], stage.tree.root).status, 1, 'so the gate is red until the write is redone');

    const restored = readJson(join(stage.tree.root, DESTINATION, 'ORIGIN-LONG-SPEC.json'));
    assert.equal(restored.sections.decisions.status, 'recorded', 'while the document kept them');

    assert.equal(runRunner(['decide', `--answers=${stage.answersPath}`], stage.tree.root).status, 0);
    assert.equal(runRunner(['gate'], stage.tree.root).status, 0, 'and green once the closing write has run');
    assert.deepEqual(readJson(decisionsPath), answers(), 'to the same answers the operator wrote');
  } finally {
    stage.dispose();
  }
});

test('C010/IT: the locator runs against a published destination and judges nothing', () => {
  const stage = prepared();
  try {
    assert.equal(runRunner(['analyze'], stage.tree.root).status, 0);

    const located = runRunner(['readings'], stage.tree.root);
    assert.equal(located.status, 1, 'an unwritten matrix is a finding, so the exit is non-zero');
    assert.match(located.stdout, /^# Design semantics — the matrix$/m);
    assert.match(located.stdout, /Findings \(deterministic\)/);
    assert.match(located.stdout, /neither a reading nor a decline closes this cell/);

    const narrowed = runRunner(['readings', '--scope=src/api', '--item=identity'], stage.tree.root);
    assert.match(narrowed.stdout, /### src\/api — identity/);
    assert.doesNotMatch(narrowed.stdout, /### src\/model/);
  } finally {
    stage.dispose();
  }
});

test('C010/IT: with the matrix closed the locator exits 0', () => {
  const stage = prepared();
  try {
    assert.equal(runRunner(['analyze'], stage.tree.root).status, 0);
    assert.equal(runRunner(['decide', `--answers=${stage.answersPath}`], stage.tree.root).status, 0);

    const ledger = readJson(join(stage.tree.root, DESTINATION, 'CLAIM-LEDGER.json'));
    writeJson(stage.readingsPath, { readings: readingsFor({ ledger }), declined: [] });
    assert.equal(runRunner(['analyze', `--semantics=${stage.readingsPath}`], stage.tree.root).status, 0);

    const located = runRunner(['readings'], stage.tree.root);
    assert.equal(located.status, 0, `a closed matrix locates cleanly: ${located.stdout.slice(-400)}`);
    assert.match(located.stdout, /Every cell is closed — by a reading or by a decline — and every basis resolves/);
  } finally {
    stage.dispose();
  }
});
