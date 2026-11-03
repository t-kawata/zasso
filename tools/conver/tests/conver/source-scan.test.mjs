// PX-350 @verifies C007 @verifies C008
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.resolve(new URL('../../.claude/scripts/conver', import.meta.url).pathname);
const PROGRESS_DIR = path.join(SCRIPT_DIR, 'progress-gif');

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function sourceFiles() {
  const files = [path.join(SCRIPT_DIR, 'draw-progress-gif.js')];
  for (const name of fs.readdirSync(PROGRESS_DIR).sort()) {
    if (name.endsWith('.js')) files.push(path.join(PROGRESS_DIR, name));
  }
  return files;
}

test('no workspace-specific identifier or fixture value appears in the renderer', () => {
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!/gaia/i.test(text), file);
    assert.ok(!/0\s*\/\s*766/.test(text), file);
    assert.ok(!/29\s*(packages|pkgs)/i.test(text), file);
    assert.ok(!/66\s*tickets/i.test(text), file);
  }
});

test('the renderer uses Canvas text and additive compositing, not a bitmap font', () => {
  const engine = fs.readFileSync(path.join(PROGRESS_DIR, 'engine.js'), 'utf8');
  assert.ok(!/const\s+FONT\s*=/.test(engine));
  assert.ok(engine.includes('fillText'));
  assert.ok(engine.includes('globalCompositeOperation'));
  assert.ok(engine.includes("'lighter'"));
});
