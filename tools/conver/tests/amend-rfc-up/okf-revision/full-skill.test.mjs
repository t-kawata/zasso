// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
// @verifies C003
// @verifies C009
// @verifies C011
// @verifies C013
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyOkfSkill } from '../../../.claude/scripts/amend-rfc-up/verify-okf-skill.mjs';
import { applyOkfRevision } from '../../../.claude/scripts/amend-rfc-up/okf-revision/apply.mjs';
import { loadOkfBaseline } from '../../../.claude/scripts/amend-rfc-up/okf-revision/baseline.mjs';
import { buildDocumentMap } from '../../../.claude/scripts/amend-rfc-up/revision/document.mjs';
import { inferRevisionContext, validateRevisionContext } from '../../../.claude/scripts/amend-rfc-up/revision/context.mjs';
import { installWithRollback } from '../../../.claude/scripts/amend-rfc-up/revision/install.mjs';
import { sha256Tree } from '../../../.claude/scripts/amend-rfc-up/revision/determinism.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');
const okfSkillRoot = join(repositoryRoot, '.claude/skills/natenv-okf');

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

test('C003/C009/C011/C013: the OKF adapter produces a full skill that passes dev and installed v4', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'okf-full-skill-'));
  try {
    const staged = join(workspace, 'staged', 'natenv-okf');
    const aliasPath = join(workspace, 'staged', 'natenv-okf.path-alias.json');
    const revisionPath = join(workspace, 'sources', 'REFERENCE-2026-11-18.md');
    const text = [
      '# Reference',
      '',
      '## Session binding',
      '',
      'Session tokens are bound to the tunnel endpoint for 24 hours.',
      '',
    ].join('\n');
    writeText(revisionPath, text);
    const sourceAlias = 'sources/REFERENCE-2026-11-18.md';
    const documentMap = buildDocumentMap({ text, alias: sourceAlias });
    const plan = {
      schema: 'revision-plan/v1',
      skill: 'natenv-okf',
      role: 'okf-reference',
      adapter: 'okf',
      revision: { sha256: documentMap.sha256 },
      operations: [
        {
          op: 'add-source',
          source_alias: sourceAlias,
          concept_prefix: 'pages',
          heading: 'Session binding',
          body: 'Session tokens are bound to the tunnel endpoint for 24 hours.',
          evidence: { line: 5, line_sha256: documentMap.lineHashes[4] },
        },
      ],
      interpretations: [],
      coherence: {
        required: ['body', 'source', 'graph', 'index', 'log', 'freshness', 'trust', 'asset'],
        dispositions: {
          body: { op: 'add-source' },
          source: { op: 'add-source' },
          graph: { op: 'add-source' },
          index: { op: 'add-source' },
          log: { op: 'add-source' },
          freshness: { op: 'add-source' },
          trust: { unchanged: 'the reference article carries no trust-tier change' },
          asset: { unchanged: 'the reference article is not an execution asset' },
        },
      },
    };
    const baseline = loadOkfBaseline({ baselineSkill: okfSkillRoot });
    const context = inferRevisionContext({
      skillName: 'natenv-okf',
      adapter: 'okf',
      documentMap,
      baseline,
      plan,
      ticket: { date: '2026-11-18' },
      env: {},
    });
    assert.equal(context.role, 'okf-reference');
    validateRevisionContext(context);
    await applyOkfRevision({
      baselineSkill: okfSkillRoot,
      role: context.role,
      plan,
      documentMap,
      context,
      outDir: staged,
      sourceText: text,
      sourceAlias,
      sourceRoot: workspace,
      revisionPath,
      aliasPath,
    });

    const preamblePath = join(staged, 'okf/pages/reference-2026-11-18/preamble.md');
    const sectionPath = join(staged, 'okf/pages/reference-2026-11-18/session-binding.md');
    assert.ok(existsSync(preamblePath));
    assert.ok(existsSync(sectionPath));
    assert.match(readFileSync(sectionPath, 'utf8'), /bound to the tunnel endpoint/);
    const inventory = readJson(join(staged, 'source/concept-inventory.json'));
    const ids = new Set(inventory.entries.map((entry) => entry.id));
    assert.equal(ids.has('pages/reference-2026-11-18/preamble'), true);
    assert.equal(ids.has('pages/reference-2026-11-18/session-binding'), true);
    const lock = readJson(join(staged, 'atoms.lock.json'));
    assert.equal(lock.concepts.length, inventory.entries.length);
    const baselineDocument = readFileSync(join(okfSkillRoot, 'source/source.baseline.md'), 'utf8');
    const combined = readFileSync(join(staged, 'source/source.baseline.md'), 'utf8');
    assert.ok(combined.length > baselineDocument.length);
    assert.match(combined, /## Session binding/);
    assert.equal(readFileSync(join(staged, 'source/source-view.md'), 'utf8'), combined);
    const manifest = readFileSync(join(staged, 'source/manifest.toml'), 'utf8');
    assert.equal((manifest.match(/\[\[file\]\]/g) ?? []).length, 1);
    assert.match(manifest, new RegExp(sha256(combined)));
    assert.equal(readFileSync(join(staged, 'PRE-OKF-ORIGINAL.md'), 'utf8'), text);
    assert.equal(readJson(join(staged, 'source/pre-okf-original.json')).sha256, documentMap.sha256);

    const dev = await verifyOkfSkill({
      skillPath: staged,
      root: repositoryRoot,
      sourceRoot: workspace,
      pathAlias: aliasPath,
      mode: 'dev',
      kind: 'update',
    });
    const devFailures = dev.required_checks.filter((name) => dev.checks[name]?.status !== 'machine_verified');
    assert.deepEqual(devFailures, [], JSON.stringify(dev.checks, null, 2));

    const installedSkill = join(workspace, 'installed', '.claude/skills/natenv-okf');
    installWithRollback({ staging: staged, target: installedSkill, backupRoot: join(workspace, 'backup') });
    const installed = await verifyOkfSkill({
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
