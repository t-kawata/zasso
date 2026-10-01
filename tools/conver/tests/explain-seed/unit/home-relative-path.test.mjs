// PX-231 @verifies C001
// PX-231 @verifies C003
//
// The rule this ticket enforces, pinned at its own boundary rather than through the
// command, so a failure here says which shape of the conversion broke rather than only
// that a document came out wrong.
//
// Every case injects the home directory instead of using the real one. Node reads
// `process.env.HOME` on POSIX at each call to `os.homedir()`, so a test can put the home
// wherever it likes and restore it afterwards. A test that leaned on the real home would
// pass on the machine that wrote it and mean nothing on another, which is the defect the
// ticket exists to remove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { toHomeRelative, fromHomeRelative } from '../../../.claude/scripts/lib/path-utils.js';

/** A home no machine has, so a conversion that used the real one would be visible. */
const INJECTED_HOME = '/tmp/px231-injected-home';

/**
 * Run `subject` with the home directory the helper will read set to `home`.
 *
 * Restoring in `finally` matters more than it looks: a test that leaks an injected home
 * would leave every later test in the file measuring against it, and the failure would
 * surface in whichever test ran next rather than in the one that leaked.
 */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function withInjectedHome(home, subject) {
  const previous = process.env.HOME;
  process.env.HOME = home;
  try {
    return subject();
  } finally {
    if (previous === undefined) delete process.env.HOME;
    else process.env.HOME = previous;
  }
}

test('C001 postcondition: a path beneath the home directory becomes a tilde path', () => {
  withInjectedHome(INJECTED_HOME, () => {
    const under = join(INJECTED_HOME, 'shyme', 'zasso', 'RFC-SEED.md');

    assert.equal(toHomeRelative(under), '~/shyme/zasso/RFC-SEED.md');
  });
});

test('C001 postcondition: the home directory itself becomes a bare tilde', () => {
  withInjectedHome(INJECTED_HOME, () => {
    assert.equal(toHomeRelative(INJECTED_HOME), '~');
  });
});

test('C001 postcondition: a path outside the home directory is returned unchanged', () => {
  withInjectedHome(INJECTED_HOME, () => {
    assert.equal(toHomeRelative('/tmp/somewhere-else/RFC-SEED.md'), '/tmp/somewhere-else/RFC-SEED.md');
  });
});

test('C001 postcondition: a path already written as a tilde path is returned unchanged', () => {
  withInjectedHome(INJECTED_HOME, () => {
    assert.equal(toHomeRelative('~/shyme/zasso'), '~/shyme/zasso', 'converting twice would produce ~/~/');
  });
});

test('C001 postcondition: an empty home directory leaves the path absolute and does not raise', () => {
  withInjectedHome('', () => {
    assert.equal(toHomeRelative('/anywhere/x'), '/anywhere/x');
  });
});

test('C001 invariant: a directory whose name merely begins with the home directory is not converted', () => {
  withInjectedHome(INJECTED_HOME, () => {
    const sibling = `${INJECTED_HOME}n/secret.md`;

    assert.equal(toHomeRelative(sibling), sibling, 'a shared name prefix is not a shared directory');
  });
});

test('C001 invariant: the character after a produced tilde is always a separator', () => {
  withInjectedHome(INJECTED_HOME, () => {
    for (const under of ['a', join('a', 'b'), join('a', 'b', 'c.md')]) {
      const converted = toHomeRelative(join(INJECTED_HOME, under));

      assert.ok(
        converted === '~' || converted[1] === '/',
        `${converted} must not be readable as the home of another account`,
      );
    }
  });
});

test('C003 invariant: a stored path round-trips through the pair', () => {
  withInjectedHome(INJECTED_HOME, () => {
    const absolute = join(INJECTED_HOME, 'shyme', 'zasso', 'specs', 'PX-231.md');

    assert.equal(fromHomeRelative(toHomeRelative(absolute)), absolute);
  });
});

test('C003 invariant: expanding a stored tilde path uses the home of the reading machine', () => {
  const stored = withInjectedHome(INJECTED_HOME, () => toHomeRelative(join(INJECTED_HOME, 'specs', 'P9-1.md')));

  assert.equal(stored, '~/specs/P9-1.md', 'the record names no machine');
  assert.equal(
    withInjectedHome('/tmp/px231-other-home', () => fromHomeRelative(stored)),
    '/tmp/px231-other-home/specs/P9-1.md',
    'and resolves beneath whatever home reads it',
  );
});
