// The rule this file pins: a path that leaves the process names no machine.
//
// `priorScan` records where each decision was read from, and those records are written
// into `DesignTree.json`, which is committed beside the RFC. A record holding
// `/Users/<someone>/...` therefore makes the tree a function of the machine that produced
// it: the same package scanned on two hosts produces two artefacts, and the second host's
// records name a directory it does not have. The rule, its reason and the converter are
// PX-231's — `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
//
// The emitter reached every run of both commands and no test asked it the question, which
// is why the defect accumulated rather than being caught: the scan records are a property
// of an object that travels from `prior-decisions.mjs` into `settle-run.js`, and the
// interpolation-based convention scan cannot see a path that is never interpolated. This
// file asks the question where the artefact is produced.
//
// Every case injects the home directory rather than using the real one. Node reads
// `process.env.HOME` on POSIX at each call to `os.homedir()`, so a fixture can be placed
// under a home no machine has; a test leaning on the real home would pass on the machine
// that wrote it and mean nothing on another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { priorScan } from '../../../.claude/scripts/question-gate/prior-decisions.mjs';
import { fromHomeRelative, toHomeRelative } from '../../../.claude/scripts/lib/path-utils.js';
import { DRILL_SETTLE_RUN, GRILL_INIT, GRILL_SETTLE_RUN, runCommand } from '../helpers/fixture-workspace.mjs';

/** A home no machine has, so a conversion that read the real one would be visible. */
const INJECTED_HOME = '/tmp/px-home-relative-injected';

/** A package directory beneath it: what the reader opens, and what the record keeps. */
const PACKAGE = join(INJECTED_HOME, 'shyme', 'gaia', 'crates', 'protocol', 'gaia-heat');
const PACKAGE_RECORDED = '~/shyme/gaia/crates/protocol/gaia-heat';

const RFC_NAME = 'RFC-AUTH.md';
const RFC_TEXT = '# RFC-AUTH\n\n## Design\n\nThe store is a file.\n';

const CONTENT = {
  [`${PACKAGE}/${RFC_NAME}`]: RFC_TEXT,
  [`${PACKAGE}/RFC-SEED.md`]: '## §1 Identity/Position\n\nThe soul side owns the key.\n',
};

const reader = (path) => CONTENT[path] ?? null;
const lister = (directory) => (directory === PACKAGE ? [RFC_NAME, 'RFC-SEED.md'] : []);

/**
 * Run `subject` with the home directory the converter will read set to `home`.
 *
 * Restoring in `finally` matters more than it looks: a leaked home would leave every later
 * test in the file measuring against it, and the failure would surface in whichever test
 * ran next rather than in the one that leaked.
 */
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

/** The scan of the package directory, taken under the injected home. */
const scanUnderInjectedHome = () =>
  withInjectedHome(INJECTED_HOME, () => priorScan({ directory: PACKAGE, readFile: reader, listDirectory: lister }));

test('postcondition: a record names the artifact home-relative, not the machine that read it', () => {
  const scanned = scanUnderInjectedHome();

  assert.ok(scanned.entries.length > 0, 'the package decides something, so there is a record to ask about');
  for (const entry of scanned.entries) {
    assert.equal(entry.source, `${PACKAGE_RECORDED}/${entry.artifact}`);
    assert.ok(!entry.source.includes(INJECTED_HOME), `${entry.source} names the machine's home`);
  }
});

test('postcondition: a ground built from the source is home-relative with it', () => {
  const scanned = scanUnderInjectedHome();
  const fromCanon = scanned.entries.find((entry) => entry.artifact === RFC_NAME);

  assert.equal(fromCanon.ground, `${PACKAGE_RECORDED}/${RFC_NAME}#Design`);
});

test('invariant: the reader is handed the absolute path, because a tilde names no file', () => {
  const reads = [];
  withInjectedHome(INJECTED_HOME, () =>
    priorScan({
      directory: PACKAGE,
      readFile: (path) => {
        reads.push(path);
        return CONTENT[path] ?? null;
      },
      listDirectory: lister,
    }),
  );

  assert.ok(reads.length > 0, 'the artifacts are read');
  assert.ok(
    reads.every((path) => path.startsWith(PACKAGE)),
    `the reader opened a path it cannot open: ${reads.find((path) => !path.startsWith(PACKAGE))}`,
  );
});

test('boundary: a directory outside the home is recorded as it stands', () => {
  const scanned = priorScan({ directory: '/fixture/pkg', readFile: (path) => (path === '/fixture/pkg/RFC-AUTH.md' ? RFC_TEXT : null), listDirectory: () => [RFC_NAME] });

  assert.equal(scanned.entries[0].source, '/fixture/pkg/RFC-AUTH.md', 'a path the rule does not reach is not rewritten');
});

test('invariant: a reader of the record recovers the file the scan opened', () => {
  const scanned = scanUnderInjectedHome();

  for (const entry of scanned.entries) {
    assert.equal(
      withInjectedHome(INJECTED_HOME, () => fromHomeRelative(entry.source)),
      join(PACKAGE, entry.artifact),
      'the record round-trips, so the path is stored rather than lost',
    );
  }
});

// ---------------------------------------------------------------------------
// The artefact, not only the function
// ---------------------------------------------------------------------------

/**
 * A package directory and its tree, both beneath a home this test controls.
 *
 * The three machine artifacts are written by the command's own `init.js` rather than
 * described here, because the tree is the artefact under test and a hand-written one would
 * freeze a description of it. The home has to be the fixture's parent: a package under the
 * real temporary directory would leave every record outside the home, and the case would
 * pass whatever the emitter did.
 */
function materializeHomeFixture() {
  const home = mkdtempSync(join(tmpdir(), 'px-home-relative-'));
  const rfcDir = join(home, 'pkg');
  mkdirSync(rfcDir, { recursive: true });

  const researchPath = join(home, 'research.md');
  writeFileSync(researchPath, '# research\n', 'utf8');
  const initialized = runCommand(GRILL_INIT, [rfcDir, researchPath], { env: { ...process.env, HOME: home } });
  assert.equal(initialized.status, 0, `the fixture session could not be initialized: ${initialized.stderr}`);

  writeFileSync(join(rfcDir, RFC_NAME), RFC_TEXT, 'utf8');
  return { home, rfcDir, treePath: join(rfcDir, 'DesignTree.json') };
}

for (const [command, script] of [
  ['/grill-me-for-rfc', GRILL_SETTLE_RUN],
  ['/drill-rfc-down', DRILL_SETTLE_RUN],
]) {
  test(`postcondition: ${command} writes a tree that names no home directory`, () => {
    const fixture = materializeHomeFixture();
    try {
      // The command is spawned with the injected home, so both the process that converts
      // and the process that reads the fixture agree on where the home is.
      const result = runCommand(script, [fixture.rfcDir, 'prior'], { env: { ...process.env, HOME: fixture.home } });
      assert.equal(result.status, 0, `${command} prior failed: ${result.stderr}`);

      const written = readFileSync(fixture.treePath, 'utf8');
      assert.ok(!written.includes(fixture.home), 'the committed artefact names the machine that produced it');

      const scan = JSON.parse(written).priorScan;
      assert.deepEqual(scan.directories, ['~/pkg'], 'the directories read are recorded the same way');
      assert.ok(scan.decisions.length > 0, 'the RFC decides something, so the record carries decisions');
      for (const entry of scan.decisions) {
        assert.ok(entry.source.startsWith('~/'), `${entry.source} names the machine`);
        assert.ok(!entry.ground.includes(fixture.home), `${entry.ground} names the machine`);
      }
    } finally {
      rmSync(fixture.home, { recursive: true, force: true });
    }
  });
}

test('boundary: the converter leaves an already-recorded tilde path alone', () => {
  withInjectedHome(INJECTED_HOME, () => {
    assert.equal(toHomeRelative(join(INJECTED_HOME, 'pkg', RFC_NAME)), '~/pkg/RFC-AUTH.md');
  });
});
