// PX-263
// The criterion runs only when something asks it to, and a tree that never runs the grill is never
// asked. This hook is the asking, at the point where work leaves the workspace. It is advisory by
// construction: a reporter that could fail would be a second blocking point, and the blocking
// decision belongs to one place, the grill Step 8 gate, where the run has already declared that it
// intends to establish the guarantee.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HOOK = path.join(process.cwd(), '.claude/scripts/grill-me-for-rfc/guard-obligation-on-commit.js');

/** The hook's stdin contract: the tool input Claude Code passes to a PreToolUse hook. */
// [::TICKET::] PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-263 --for-spec --no-implementation-order`.
function runHook(rawInput, cwd = process.cwd()) {
  const result = spawnSync(process.execPath, [HOOK], { encoding: 'utf8', input: rawInput, cwd });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// [::TICKET::] PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-263 --for-spec --no-implementation-order`.
function bashInput(command) {
  return JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
}

test('PX-263 a git commit runs the criterion and reports what it found', () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px263-hook-'));
  try {
    const result = runHook(bashInput('git commit -m "x"'), root);

    assert.equal(result.status, 0);
    assert.match(result.stderr, /obligation/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-263 a git push runs the criterion too', () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px263-hook-'));
  try {
    assert.match(runHook(bashInput('git push origin HEAD'), root).stderr, /obligation/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-263 a command that is not a git form is left alone, and nothing is printed for it', () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px263-hook-'));
  try {
    for (const command of ['ls -la', 'git status', 'git log --oneline', 'node --test tests/x.test.mjs']) {
      const result = runHook(bashInput(command), root);
      assert.equal(result.status, 0);
      assert.equal(result.stderr.trim(), '', `"${command}" reaches no check`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-263 the hook exits 0 on every path, including input it cannot parse', () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px263-hook-'));
  try {
    const shapes = [
      ['empty input', ''],
      ['input that is not JSON', 'not json at all'],
      ['JSON that is not an object', '42'],
      ['an object with no tool_input', JSON.stringify({ tool_name: 'Bash' })],
      ['a tool_input with no command', JSON.stringify({ tool_name: 'Bash', tool_input: {} })],
      ['the git form', bashInput('git commit -m "x"')],
    ];
    for (const [label, raw] of shapes) {
      const result = runHook(raw, root);
      assert.equal(result.status, 0, `${label} exits 0`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-263 the hook states that it does not block, so a reader is not left to infer it from the exit code', () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'px263-hook-'));
  try {
    assert.match(runHook(bashInput('git commit -m "x"'), root).stderr, /never blocks/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PX-263 the hook names on stderr why it could not read its input, and still exits 0', () => {
  const result = runHook('not json at all');

  assert.equal(result.status, 0);
  assert.match(result.stderr, /\[obligation-guard\] could not read/);
});

test('PX-263 the hook writes nothing to stdout on any path, so a decision the harness reads is never malformed', () => {
  for (const raw of ['', 'not json', bashInput('git commit -m "x"'), bashInput('ls')]) {
    assert.equal(runHook(raw).stdout, '', 'stdout is the decision channel and this hook never uses it');
  }
});
