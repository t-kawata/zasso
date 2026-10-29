/**
 * path-utils.test.cjs — Unit tests for toHomeRelative / fromHomeRelative
 *
 * Covers: normal, error, boundary, and round-trip invariant cases.
 */
const assert = require('assert');
const os = require('os');
const path = require('path');
const {
  toHomeRelative,
  fromHomeRelative,
  toHomeRelativeText,
  toHomeRelativeDeep,
} = require('../.claude/scripts/lib/path-utils');

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

// [Normal] Text conversion: a home path inside prose
test('toHomeRelativeText converts every home path embedded in a text', () => {
  const home = path.join(HOME, 'shyme', 'zasso');
  const text = `validated on ${home}/a.md and again on ${home}/b.md`;
  assert.strictEqual(
    toHomeRelativeText(text),
    'validated on ~/shyme/zasso/a.md and again on ~/shyme/zasso/b.md',
  );
});

// [Boundary] A sibling directory that merely shares the prefix
test('toHomeRelativeText leaves a directory that only shares the home prefix', () => {
  const sibling = HOME + '2/file.md';
  assert.strictEqual(toHomeRelativeText(sibling), sibling);
});

// [Boundary] Already home-relative and non-home absolute paths are untouched
test('toHomeRelativeText is idempotent for ~ and outside-home paths', () => {
  assert.strictEqual(toHomeRelativeText('see ~/shyme/zasso/a.md'), 'see ~/shyme/zasso/a.md');
  assert.strictEqual(toHomeRelativeText('see /opt/some/file.md'), 'see /opt/some/file.md');
});

// [Normal] Deep conversion over the ticket fields a writer persists
test('toHomeRelativeDeep converts strings at every depth and keeps other values', () => {
  const home = path.join(HOME, 'shyme', 'zasso');
  const input = {
    notes: `read ${home}/specs/PX-1.md`,
    nested: { files: [`${home}/src/a.ts`], count: 2, flag: true, empty: null },
  };
  const output = toHomeRelativeDeep(input);
  assert.deepStrictEqual(output, {
    notes: 'read ~/shyme/zasso/specs/PX-1.md',
    nested: { files: ['~/shyme/zasso/src/a.ts'], count: 2, flag: true, empty: null },
  });
  assert.strictEqual(input.notes, `read ${home}/specs/PX-1.md`, 'the input object is not mutated');
});

console.log('');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed' + (failed === 0 ? ' ✅' : ' ❌'));
process.exit(failed > 0 ? 1 : 0);
