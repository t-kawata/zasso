import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import {
  encodeProjectKey,
  expandHome,
  resolveConfigDir,
} from '../../.claude/scripts/conver/progress-gif/usage.js';

test('expandHome expands both POSIX and Windows home shorthand', () => {
  const home = os.homedir();

  assert.equal(expandHome('~'), home);
  assert.equal(expandHome('~/work'), path.join(home, 'work'));
  assert.equal(expandHome('~\\work'), path.join(home, 'work'));
  assert.equal(expandHome('/absolute/path'), '/absolute/path');
});

test('encodeProjectKey replaces every non-alphanumeric character', () => {
  assert.equal(encodeProjectKey('/tmp/work.space_v2'), '-tmp-work-space-v2');
});

test('resolveConfigDir prefers its argument, then the environment, then ~/.claude', () => {
  const previous = process.env.CLAUDE_CONFIG_DIR;

  try {
    process.env.CLAUDE_CONFIG_DIR = '/env/claude';
    assert.equal(resolveConfigDir('/argument/claude'), '/argument/claude');
    assert.equal(resolveConfigDir(), '/env/claude');

    process.env.CLAUDE_CONFIG_DIR = '~/custom-claude';
    assert.equal(resolveConfigDir(), path.join(os.homedir(), 'custom-claude'));

    delete process.env.CLAUDE_CONFIG_DIR;
    assert.equal(resolveConfigDir(), path.join(os.homedir(), '.claude'));
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  }
});
