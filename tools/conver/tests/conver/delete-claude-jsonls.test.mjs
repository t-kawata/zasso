import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SCRIPT = path.join(REPOSITORY_ROOT, '.claude/scripts/conver/delete-claude-jsonls.js');

function createTemporaryDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createWorkspace(name = 'workspace') {
  const home = createTemporaryDirectory('conver-delete-home-');
  const workspace = path.join(home, name);
  fs.mkdirSync(workspace, { recursive: true });
  return { home, workspace };
}

function createProjectLog(configDir, projectKey) {
  const projectDir = path.join(configDir, 'projects', projectKey);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'session.jsonl'), '{"cwd":"/tmp/work"}\n');
}

function runDeleteCli({ workspace, home, configDir }) {
  return spawnSync(process.execPath, [SCRIPT, '-t', workspace, '--dry-run'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: configDir },
  });
}

test('delete-claude-jsonls reads projects from CLAUDE_CONFIG_DIR', () => {
  const { home, workspace } = createWorkspace();
  const configDir = createTemporaryDirectory('conver-delete-config-');
  const projectKey = workspace.replace(/[^a-zA-Z0-9]/g, '-');
  createProjectLog(configDir, projectKey);

  const result = runDeleteCli({ workspace, home, configDir });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /削除対象ファイル:/);
  assert.ok(result.stdout.includes(projectKey), result.stdout);
});

test('delete-claude-jsonls matches a workspace whose path contains a dot', () => {
  const { home, workspace } = createWorkspace('work.space');
  const configDir = createTemporaryDirectory('conver-delete-config-');
  const projectKey = workspace.replace(/[^a-zA-Z0-9]/g, '-');
  createProjectLog(configDir, projectKey);

  const result = runDeleteCli({ workspace, home, configDir });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /削除対象ファイル:/);
  assert.ok(result.stdout.includes(projectKey), result.stdout);
});

test('delete-claude-jsonls expands ~ inside CLAUDE_CONFIG_DIR', () => {
  const { home, workspace } = createWorkspace();
  const configDir = path.join(home, 'custom-claude');
  const projectKey = workspace.replace(/[^a-zA-Z0-9]/g, '-');
  createProjectLog(configDir, projectKey);

  const result = runDeleteCli({ workspace, home, configDir: '~/custom-claude' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /削除対象ファイル:/);
  assert.ok(result.stdout.includes(projectKey), result.stdout);
});
