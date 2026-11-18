// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
// @verifies C003
// @verifies C011
// @verifies C012
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyLawSkill } from '../../../.claude/scripts/amend-rfc-up/verify-law-skill.mjs';
import { applyLawRevision } from '../../../.claude/scripts/amend-rfc-up/law-revision/apply.mjs';
import { loadLawBaseline } from '../../../.claude/scripts/amend-rfc-up/law-revision/baseline.mjs';
import { buildDocumentMap } from '../../../.claude/scripts/amend-rfc-up/revision/document.mjs';
import { inferRevisionContext, validateRevisionContext } from '../../../.claude/scripts/amend-rfc-up/revision/context.mjs';
import { installWithRollback } from '../../../.claude/scripts/amend-rfc-up/revision/install.mjs';
import { sha256Tree } from '../../../.claude/scripts/amend-rfc-up/revision/determinism.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');
const lawSkillRoot = join(repositoryRoot, '.claude/skills/rust-interface-law');
const baselineAliasPath = join(repositoryRoot, '.claude/skills/rust-interface-law.path-alias.json');

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

test('C003/C011/C012: the law adapter produces a full skill that passes dev and installed v4', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'law-full-skill-'));
  try {
    const staged = join(workspace, 'staged', 'rust-interface-law');
    const aliasPath = join(workspace, 'staged', 'rust-interface-law.path-alias.json');
    const revisionPath = join(workspace, 'sources', 'REVISION-2026-11-18.md');
    const text = [
      '# Revision',
      '',
      'Mutating requests accept an Idempotency-Key and pass it in WireContext with a 24 hour replay window.',
      '',
      'Replayed idempotency keys are rejected with 409 without executing the operation.',
      '',
    ].join('\n');
    writeText(revisionPath, text);
    const documentMap = buildDocumentMap({ text, alias: 'sources/REVISION-2026-11-18.md' });
    const plan = {
      schema: 'revision-plan/v1',
      skill: 'rust-interface-law',
      role: 'law-revision',
      adapter: 'law',
      revision: { sha256: documentMap.sha256 },
      operations: [
        {
          op: 'update-rule',
          target: 'REST-08',
          statement: 'REST-08 MUST accept an Idempotency-Key and pass it in WireContext with a 24 hour replay window.',
          class: 'normative',
          weakening: false,
          evidence: { line: 3, line_sha256: documentMap.lineHashes[2] },
        },
        {
          op: 'add-rule',
          id: 'REST-22',
          class: 'C',
          parent: 'REST',
          applicability: 'rest',
          statement: 'REST-22 MUST reject a replayed idempotency key with 409 and no operation execution.',
          id_rationale: 'Replay rejection is an independently testable obligation; it is not the transport of the key.',
          evidence: { line: 5, line_sha256: documentMap.lineHashes[4] },
        },
      ],
      interpretations: [],
      coherence: {
        required: ['body', 'source', 'registry', 'api', 'profile', 'conformance', 'policy', 'contract', 'test', 'template', 'index', 'asset'],
        dispositions: {
          body: { op: 'update-rule' },
          source: { op: 'update-rule' },
          registry: { op: 'add-rule' },
          index: { op: 'add-rule' },
          api: { unchanged: 'the revision changes REST behavior, not the operation API shape' },
          profile: { unchanged: 'no profile change' },
          conformance: { unchanged: 'the conformance driver already covers REST-22 through the rule table' },
          policy: { unchanged: 'no implementation-policy change' },
          contract: { unchanged: 'no implementation contract change' },
          test: { unchanged: 'no generated test obligation change beyond the rule count' },
          template: { unchanged: 'no scaffold template change' },
          asset: { unchanged: 'no execution asset change' },
        },
      },
    };
    const baseline = loadLawBaseline({ baselineSkill: lawSkillRoot });
    const context = inferRevisionContext({
      skillName: 'rust-interface-law',
      adapter: 'law',
      documentMap,
      baseline,
      plan,
      ticket: { date: '2026-11-18' },
      env: {},
    });
    validateRevisionContext(context);
    await applyLawRevision({
      baselineSkill: lawSkillRoot,
      plan,
      documentMap,
      context,
      outDir: staged,
      documentText: text,
      documentAlias: 'sources/REVISION-2026-11-18.md',
      sourceRoot: repositoryRoot,
      revisionPath,
      aliasPath,
      baselineAliasPath,
    });

    const ruleConcepts = readJson(join(staged, 'source/rule-concepts.json'));
    assert.equal(Object.keys(ruleConcepts.byRule).length, 487);
    assert.ok(existsSync(join(staged, 'okf/rules/c/rest-08.md')));
    assert.ok(existsSync(join(staged, 'okf/rules/c/rest-19.md')));
    assert.match(readFileSync(join(staged, 'okf/rules/c/rest-08.md'), 'utf8'), /24 hour replay window/);
    const lock = readJson(join(staged, 'atoms.lock.json'));
    assert.equal(lock.schema, 'law-atoms/v3');
    assert.equal(lock.rules.length, 487);
    assert.ok(lock.rules.some((rule) => rule.rule_id === 'REST-22'));
    assert.match(readFileSync(join(staged, 'okf/rules/c/index.md'), 'utf8'), /REST-22/);
    assert.equal(readJson(join(staged, 'source/pre-okf-original.json')).sha256, documentMap.sha256);

    const dev = await verifyLawSkill({
      skillPath: staged,
      root: repositoryRoot,
      sourceRoot: repositoryRoot,
      pathAlias: aliasPath,
      mode: 'dev',
      kind: 'update',
    });
    const devFailures = dev.required_checks.filter((name) => dev.checks[name]?.status !== 'machine_verified');
    assert.deepEqual(devFailures, [], JSON.stringify(dev.checks, null, 2));

    const installedSkill = join(workspace, 'installed', '.claude/skills/rust-interface-law');
    installWithRollback({ staging: staged, target: installedSkill, backupRoot: join(workspace, 'backup') });
    const installed = await verifyLawSkill({
      skillPath: installedSkill,
      root: repositoryRoot,
      pathAlias: aliasPath,
      mode: 'installed',
      kind: 'update',
    });
    const installedFailures = installed.required_checks
      .filter((name) => installed.checks[name]?.status !== 'machine_verified');
    assert.deepEqual(installedFailures, [], JSON.stringify(installed.checks, null, 2));
    assert.equal(sha256Tree(staged), sha256Tree(installedSkill));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
