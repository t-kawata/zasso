// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyScaffold, renderScaffoldMarkdown, validatePlan } from '../scripts/lib/scaffold.mjs';
import { explainRule, loadRuleMap } from '../scripts/lib/law-bundle.mjs';
import { discoverWorkspace, mapCanonicalRoles } from '../scripts/lib/autoconfig.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cli = join(root, 'scripts/cli.mjs');
const ruleMap = loadRuleMap(join(root, 'source/rule-concepts.json'));
const knownRules = new Set(ruleMap.byRule.keys());

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'law-scaffold-'));
  mkdirSync(join(repo, 'crates/app-rest/src'), { recursive: true });
  writeFileSync(join(repo, 'crates/app-rest/src/lib.rs'), '// [::LAW-SCAFFOLD::] modules\n');
  return repo;
}

function makePlan() {
  return {
    schema: 'rust-interface-law.scaffold/v1',
    package: 'crates/app-rest',
    interface: 'rest',
    unit: 'app-rest',
    files: [
      {
        path: 'crates/app-rest/src/state.rs',
        mode: 'create',
        rules: ['REST-01'],
        content: '// RULE: REST-01\npub struct RestState;\n',
      },
      {
        path: 'crates/app-rest/src/lib.rs',
        mode: 'append',
        marker: '// [::LAW-SCAFFOLD::] modules',
        rules: ['REST-01'],
        content: 'pub mod state; // RULE: REST-01\n',
      },
    ],
  };
}

test('scaffold dry-run validates and writes nothing', () => {
  const repo = makeRepo();
  try {
    const result = validatePlan({ root: repo, plan: makePlan(), knownRules });
    assert.equal(result.ok, true);
    assert.equal(existsSync(join(repo, 'crates/app-rest/src/state.rs')), false);
    assert.match(renderScaffoldMarkdown(result), /No files written/);
    assert.match(renderScaffoldMarkdown(result), /\| create \| `crates\/app-rest\/src\/state\.rs` \| REST-01 \|/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('scaffold writes creates and marker appends with backups', () => {
  const repo = makeRepo();
  try {
    const plan = makePlan();
    const result = applyScaffold({ root: repo, plan, write: true, knownRules });
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(repo, 'crates/app-rest/src/state.rs')));
    const lib = readFileSync(join(repo, 'crates/app-rest/src/lib.rs'), 'utf8');
    assert.match(lib, /\[::LAW-SCAFFOLD::\] modules\npub mod state;/);
    assert.ok(existsSync(join(repo, 'target/law/scaffold-manifest.json')));
    assert.ok(result.backups.length > 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('scaffold rejects overwrite, traversal, package mismatch, and unmarked stubs', () => {
  const repo = makeRepo();
  try {
    const overwrite = makePlan();
    overwrite.files[0].path = 'crates/app-rest/src/lib.rs';
    overwrite.files[0].mode = 'create';
    assert.equal(validatePlan({ root: repo, plan: overwrite, knownRules }).ok, false);

    const traversal = makePlan();
    traversal.files[0].path = 'crates/app-rest/../escape.rs';
    assert.equal(validatePlan({ root: repo, plan: traversal, knownRules }).ok, false);

    const mismatch = makePlan();
    mismatch.files[0].path = 'crates/app-grpc/src/state.rs';
    assert.equal(validatePlan({ root: repo, plan: mismatch, knownRules }).ok, false);

    const unmarked = makePlan();
    unmarked.files[0].content = '// RULE: REST-01\npub fn ready() { todo!() }\n';
    assert.equal(validatePlan({ root: repo, plan: unmarked, knownRules }).ok, false);

    const missingRule = makePlan();
    missingRule.files[0].rules = ['ZZ-99'];
    assert.equal(validatePlan({ root: repo, plan: missingRule, knownRules }).ok, false);

    const placeholder = makePlan();
    placeholder.files[0].content = '// RULE: REST-01\nuse operation-contract::Dispatcher;\n';
    const placeholderResult = validatePlan({ root: repo, plan: placeholder, knownRules });
    assert.equal(placeholderResult.ok, false);
    assert.match(JSON.stringify(placeholderResult.errors), /canonical placeholder crate/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('scaffold CLI is dry-run by default and --write applies the package plan', () => {
  const repo = makeRepo();
  const state = mkdtempSync(join(tmpdir(), 'law-scaffold-state-'));
  try {
    const planPath = join(state, 'plan.json');
    writeFileSync(planPath, JSON.stringify(makePlan()));

    const preview = execFileSync(process.execPath, [
      cli, 'scaffold', '--plan', planPath, '--root', repo,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.match(preview, /# Scaffold/);
    assert.equal(existsSync(join(repo, 'crates/app-rest/src/state.rs')), false);

    execFileSync(process.execPath, [
      cli, 'scaffold', '--plan', planPath, '--root', repo, '--write',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.ok(existsSync(join(repo, 'crates/app-rest/src/state.rs')));
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(state, { recursive: true, force: true });
  }
});

test('explain returns the requirement and one-hop context for a rule', async () => {
  const text = await explainRule({ ruleId: 'WS-01', ruleMap, skillRoot: root });
  assert.match(text, /# Rule WS-01/);
  assert.match(text, /one-time ticket/i);
  assert.match(text, /## Sources/);
  await assert.rejects(() => explainRule({ ruleId: 'NOPE-99', ruleMap, skillRoot: root }), /unknown rule/);
});

test('canonical roles map to project crate names', () => {
  const repo = mkdtempSync(join(tmpdir(), 'law-roles-'));
  try {
    for (const crate of ['app-core', 'app-operation', 'app-ports']) {
      mkdirSync(join(repo, 'crates', crate, 'src'), { recursive: true });
    }
    const roles = mapCanonicalRoles(discoverWorkspace(repo).units);
    assert.equal(roles['identity-core'], 'app-core');
    assert.equal(roles['operation-contract'], 'app-operation');
    assert.equal(roles['interface-contract'], 'app-ports');
    assert.equal(roles['contract-macros'], null);

    const protocol = mapCanonicalRoles([
      { id: 'p-protocol-evaluation-plan', role: 'core' },
      { id: 'p-protocol-types', role: 'core' },
      { id: 'p-operation', role: 'operation' },
    ]);
    assert.equal(protocol['interface-contract'], 'p-protocol-types');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('explain keeps the rule identity stable', async () => {
  const text = await explainRule({ ruleId: 'WS-01', ruleMap, skillRoot: root });
  assert.match(text, /\| Concept \| `rules\/c\/ws-01` \|/);
});

test('explain names the source document', async () => {
  const text = await explainRule({ ruleId: 'WS-01', ruleMap, skillRoot: root });
  assert.match(text, /31-WEBSOCKET\.md/);
});
