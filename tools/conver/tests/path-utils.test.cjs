/**
 * path-utils.test.cjs — Unit tests for toHomeRelative / fromHomeRelative
 *
 * Covers: normal, error, boundary, and round-trip invariant cases.
 */
const assert = require('assert');
const os = require('os');
const path = require('path');
const { toHomeRelative, fromHomeRelative } = require('../.claude/scripts/lib/path-utils');

const HOME = os.homedir();
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✅ ' + name);
  } catch (e) {
    failed++;
    console.log('  ❌ ' + name + ': ' + e.message);
  }
}

console.log('path-utils unit tests');
console.log('');

// [Normal] toHomeRelative
test('toHomeRelative converts /home/user/foo.md to ~/foo.md', () => {
  assert.strictEqual(toHomeRelative(path.join(HOME, 'foo.md')), '~/foo.md');
});

test('toHomeRelative leaves ~/bar.md unchanged (already home-relative)', () => {
  assert.strictEqual(toHomeRelative('~/bar.md'), '~/bar.md');
});

// [Normal] fromHomeRelative
test('fromHomeRelative converts ~/foo.md to /home/user/foo.md', () => {
  assert.strictEqual(fromHomeRelative('~/foo.md'), path.join(HOME, 'foo.md'));
});

test('fromHomeRelative leaves /absolute/path.md unchanged (outside $HOME)', () => {
  const abs = '/absolute/path.md';
  assert.strictEqual(fromHomeRelative(abs), path.resolve(abs));
});

// [Error] Empty string
test('toHomeRelative("") returns ""', () => {
  assert.strictEqual(toHomeRelative(''), '');
});

test('fromHomeRelative("") returns ""', () => {
  assert.strictEqual(fromHomeRelative(''), '');
});

// [Error] Bare tilde
test('fromHomeRelative("~") returns os.homedir()', () => {
  assert.strictEqual(fromHomeRelative('~'), HOME);
});

// [Boundary] Exact $HOME
test('toHomeRelative with path === os.homedir() returns "~"', () => {
  assert.strictEqual(toHomeRelative(HOME), '~');
});

// [Boundary] Tilde with trailing slash — resolves to homedir (no trailing separator)
test('fromHomeRelative("~/") returns os.homedir()', () => {
  assert.strictEqual(fromHomeRelative('~/'), HOME);
});

// [Boundary] Path outside home
test('toHomeRelative with path outside home returns resolved absolute', () => {
  const outside = '/opt/some/file.txt';
  assert.strictEqual(toHomeRelative(outside), path.resolve(outside));
});

// [Invariant] Round-trip absolute
test('Round-trip: fromHomeRelative(toHomeRelative(p)) === path.resolve(p) for paths under home', () => {
  const testPaths = [
    path.join(HOME, 'a.md'),
    path.join(HOME, 'sub', 'b.txt'),
    HOME,
    '/outside/absolute.md',
    '',
  ];
  for (const p of testPaths) {
    const roundTrip = fromHomeRelative(toHomeRelative(p));
    const expected = p ? path.resolve(p) : p;
    assert.strictEqual(roundTrip, expected, 'Round-trip failed for: ' + p);
  }
});

// [Invariant] Round-trip ~/
test('Round-trip: toHomeRelative(fromHomeRelative(q)) === q for ~/-paths', () => {
  const testPaths = ['~/a.md', '~/sub/b.txt', '~'];
  for (const q of testPaths) {
    const roundTrip = toHomeRelative(fromHomeRelative(q));
    assert.strictEqual(roundTrip, q, 'Round-trip failed for: ' + q);
  }
  // ~/ and ~ are semantically equivalent: ~/ → HOME → ~
  assert.strictEqual(toHomeRelative(fromHomeRelative('~/')), '~');
});

// [Boundary] Deep path under home
test('toHomeRelative with deep subdirectory', () => {
  const deep = path.join(HOME, 'a', 'b', 'c', 'd.txt');
  assert.strictEqual(toHomeRelative(deep), '~/a/b/c/d.txt');
});

// [Boundary] fromHomeRelative with deep subdirectory
test('fromHomeRelative with deep ~/ path', () => {
  const expected = path.join(HOME, 'x', 'y', 'z');
  assert.strictEqual(fromHomeRelative('~/x/y/z'), expected);
});

console.log('');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed' + (failed === 0 ? ' ✅' : ' ❌'));
process.exit(failed > 0 ? 1 : 0);
