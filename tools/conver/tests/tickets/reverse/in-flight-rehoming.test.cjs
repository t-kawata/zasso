// P23-9 @verifies C001
/**
 * Pattern 2's first obligation — the interrupted cycle's work in flight.
 *
 * A four-layer cycle that was running has tickets at `planned` or `made`, and
 * re-partitioning redraws the boundaries underneath them. §3.3: "in-flight items can
 * end up belonging to no package in the new partition. This must not be silent." Either
 * the work is re-homed under the new partition, or it is named as re-homed-nowhere with
 * its key and its lifecycle status.
 *
 * The population this reads is not the population S1-S6 read. S1-S6 address *tests
 * without tickets*; this addresses *tickets with work in flight*. §7.2 measured that
 * only the first had a gate. The two are counted separately, and no ticket moves from
 * one count to the other — which is why `readDeclaredTicketKeys` is left alone and a
 * second reader is added beside it for the question it was never asked.
 *
 * Every absence is a state of its own. A ticket set nobody read, a partition nobody
 * offered and a set that declares no ticket are three different zeroes, and each is
 * stated rather than rendered as "no work in flight".
 *
 * Run: node --test "tests/tickets/reverse/*.test.cjs"
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const {
  ALL_TICKETS_TERMINAL_REASON,
  EMPTY_DECLARED_TICKET_SET_REASON,
  NO_DECLARED_TICKET_SET_REASON,
  NO_IMPLEMENTATION_FILE_REASON,
  NO_PARTITION_REASON,
  STATUS_NOT_DECLARED,
  TERMINAL_TICKET_STATUSES,
  TICKETS_FILE_NAME,
  planInFlightRehoming,
  planReverseSplit,
  readDeclaredTicketKeys,
  readTicketLifecycles,
  renderInFlightReport,
  renderMappingReport,
  serializeTicketSet,
} = require('../../../.claude/scripts/tickets/lib/reverse-split.js');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CLI_PATH = path.join(PROJECT_ROOT, '.claude/scripts/tickets/lib/reverse-split.js');
const ORACLE_BUNDLE_PATH = path.join(PROJECT_ROOT, 'tests/workspacify-reverse/oracle/ORACLE-BUNDLE.json');

/** A scratch tree, disposed by the caller's `finally`. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function createTree(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/** Write a `{ 'relative/path': contents }` map under a root. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function writeTree(root, layout) {
  for (const [relativePath, contents] of Object.entries(layout)) {
    const absolute = path.join(root, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
}

/** A declared ticket document, as `Tickets.json` writes it. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function ticketsDocument(tickets, phaseId = 7) {
  return JSON.stringify({ phases: [{ id: phaseId, tickets }] });
}

/** A lifecycle document assembled directly, for the tests that do not need a file. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function lifecycleDocument(tickets) {
  return { present: true, source: TICKETS_FILE_NAME, reason: null, tickets };
}

/**
 * A ticket set and a partition, generated deterministically from a seed.
 *
 * The generator is seeded rather than random so a failure is reproducible, and it
 * deliberately produces the awkward shapes: a ticket with no files, a ticket naming a
 * file no package holds, a ticket naming two files in different packages, and terminal
 * tickets mixed in among the in-flight ones.
 */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function generateTicketSetAndPartition(seed) {
  const packages = [{ id: 'root', path: '.' }, { id: 'a', path: 'src/a' }, { id: 'b', path: 'src/b' }];
  const implementations = new Map([
    ['root', ['build.rs']],
    ['a', ['src/a/lib.rs', 'src/a/api.rs']],
    ['b', ['src/b/lib.rs']],
  ]);

  const statuses = ['made', 'planned', 'reviewed', 'done', null, 'in_progress'];
  const fileChoices = [
    [],
    ['src/a/lib.rs'],
    ['src/b/lib.rs'],
    ['src/a/lib.rs', 'src/b/lib.rs'],
    ['src/a/lib.rs', 'src/gone.rs'],
    ['docs/absent.md'],
  ];

  const count = (seed % 5) + 1;
  const tickets = [];
  for (let index = 0; index < count; index += 1) {
    tickets.push({
      key: `P7-${index + 1}`,
      status: statuses[(seed + index) % statuses.length],
      title: `ticket ${index + 1}`,
      files: fileChoices[(seed + index * 3) % fileChoices.length],
    });
  }

  return { tickets, packages, implementations };
}

/** Whether a ticket is in flight, using the module's own vocabulary. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function isNonTerminal(ticket) {
  return !TERMINAL_TICKET_STATUSES.includes(ticket.status);
}

describe('C001 — the in-flight population', () => {
  it('UT-1: a non-terminal ticket is re-homed to the package owning the files it names', () => {
    const tree = createTree('p23-9-inflight-');
    try {
      const ticketsPath = path.join(tree.root, TICKETS_FILE_NAME);
      writeFileSync(ticketsPath, ticketsDocument([
        { id: 1, status: 'made', title: 'a', default_files: ['src/a/lib.rs'] },
        { id: 2, status: 'planned', title: 'b', default_files: ['src/b/lib.rs'] },
        { id: 3, status: 'reviewed', title: 'c', default_files: ['src/c/lib.rs'] },
        { id: 4, status: 'in_progress', title: 'd', default_files: ['src/gone.rs'] },
      ]), 'utf8');

      const lifecycles = readTicketLifecycles(ticketsPath);
      assert.equal(lifecycles.present, true);
      assert.deepEqual(lifecycles.tickets.map((ticket) => ticket.key), ['P7-1', 'P7-2', 'P7-3', 'P7-4']);
      assert.deepEqual(lifecycles.tickets[0].files, ['src/a/lib.rs'], 'the files the ticket names travel with it');

      const packages = [{ id: 'root', path: '.' }, { id: 'a', path: 'src/a' }, { id: 'b', path: 'src/b' }];
      const implementations = new Map([['root', []], ['a', ['src/a/lib.rs']], ['b', ['src/b/lib.rs']]]);
      const inFlight = planInFlightRehoming({ tickets: lifecycles.tickets, packages, implementations });

      assert.deepEqual(TERMINAL_TICKET_STATUSES, ['done', 'reviewed'], 'the vocabulary is the module\'s, never a literal');
      assert.equal(inFlight.counts.nonTerminal, 3, 'a reviewed ticket is terminal and is not in flight');
      assert.deepEqual(inFlight.rehomed.map((entry) => entry.key), ['P7-1', 'P7-2']);
      assert.deepEqual(inFlight.rehomed[0].owningPackages, ['a']);
      assert.deepEqual(inFlight.rehomedNowhere.map((entry) => entry.key), ['P7-4']);
      assert.equal(inFlight.rehomedNowhere[0].status, 'in_progress');
      assert.match(inFlight.rehomedNowhere[0].reason, /src\/gone\.rs/);
      assert.equal(inFlight.counts.rehomed + inFlight.counts.rehomedNowhere, inFlight.counts.nonTerminal);
    } finally {
      tree.dispose();
    }
  });

  it('UT-2: the re-homed entry names the boundary the new partition actually drew', () => {
    const packages = [{ id: 'root', path: '.' }, { id: 'src', path: 'src' }, { id: 'a', path: 'src/a' }];
    const implementations = new Map([
      ['root', ['build.rs']],
      ['src', ['src/lib.rs']],
      ['a', ['src/a/lib.rs']],
    ]);

    const inFlight = planInFlightRehoming({
      tickets: [{ key: 'P7-1', status: 'made', title: 'a', files: ['src/a/lib.rs'] }],
      packages,
      implementations,
    });

    assert.equal(inFlight.rehomed.length, 1);
    assert.deepEqual(inFlight.rehomed[0].owningPackages, ['a'], 'the most specific owner, not the root');
    assert.equal(inFlight.counts.rehomed, 1);
    assert.equal(inFlight.counts.rehomedNowhere, 0);
    assert.match(renderInFlightReport(inFlight), /P7-1[\s\S]*src\/a/);

    // Work spanning a boundary is reported with both packages rather than forced into
    // one: which package inherits it is the operator's decision, and this record is the
    // material the decision is taken on.
    const spanning = planInFlightRehoming({
      tickets: [{ key: 'P7-2', status: 'planned', title: 'span', files: ['src/a/lib.rs', 'src/b/lib.rs'] }],
      packages: [...packages, { id: 'b', path: 'src/b' }],
      implementations: new Map([...implementations, ['b', ['src/b/lib.rs']]]),
    });
    assert.deepEqual(spanning.rehomed[0].owningPackages, ['a', 'b']);
    assert.equal(spanning.counts.rehomedNowhere, 0);
    assert.ok(spanning.rehomed[0].reason.length > 0, 'a spanning entry states the question it raises');
  });

  it('UT-3: the lifecycle read changes neither the mapping coverage nor the S1-S6 counts', () => {
    const tree = createTree('p23-9-populations-');
    try {
      writeTree(tree.root, {
        'tests/alpha.rs': '// P7-1\n#[test]\nfn works() {}\n',
        'tests/beta.rs': '// P7-2\n#[test]\nfn other() {}\n',
        [TICKETS_FILE_NAME]: ticketsDocument([
          { id: 1, status: 'made', title: 'a', default_files: ['src/a/lib.rs'] },
          { id: 2, status: 'planned', title: 'b', default_files: ['src/b/lib.rs'] },
        ]),
      });

      const base = {
        root: tree.root,
        testDir: path.join(tree.root, 'tests'),
        declaredTicketKeys: ['P7-1', 'P7-2'],
        absentRedContracts: [],
        planEntries: [],
      };
      const withoutRead = planReverseSplit({ ...base });
      const withRead = planReverseSplit({
        ...base,
        ticketLifecycles: readTicketLifecycles(path.join(tree.root, TICKETS_FILE_NAME)),
        packages: [{ id: 'a', path: 'src/a' }, { id: 'b', path: 'src/b' }],
        implementations: new Map([['a', ['src/a/lib.rs']], ['b', ['src/b/lib.rs']]]),
      });

      assert.deepEqual(withRead.mappingCoverage, withoutRead.mappingCoverage, 'the two populations are measured separately');
      assert.equal(withRead.absence.absenceCount, withoutRead.absence.absenceCount);
      assert.deepEqual(withRead.gates.map((gate) => gate.counts), withoutRead.gates.map((gate) => gate.counts));
      assert.deepEqual(withRead.tests.map((test) => test.path), withoutRead.tests.map((test) => test.path));

      assert.equal(withRead.inFlight.declared, true, 'the lifecycle read is what makes the block a reading');
      assert.equal(withoutRead.inFlight.declared, false, 'a read nobody offered is absent, never zero');
      assert.equal(withRead.inFlight.counts.nonTerminal, 2, 'this fixture has work in flight, so the block is a reading');
      assert.equal(withoutRead.inFlight.counts.nonTerminal, 0);
    } finally {
      tree.dispose();
    }
  });

  it('UT-4: an absent status is reported as absent, never defaulted to terminal', () => {
    const inFlight = planInFlightRehoming({
      tickets: [{ key: 'P7-1', status: null, title: 'no status', files: ['src/a/lib.rs'] }],
      packages: [{ id: 'a', path: 'src/a' }],
      implementations: new Map([['a', ['src/a/lib.rs']]]),
    });

    assert.equal(STATUS_NOT_DECLARED, 'status not declared');
    assert.equal(inFlight.counts.nonTerminal, 1, 'an absent status is not a terminal one');
    assert.equal(inFlight.rehomed[0].status, STATUS_NOT_DECLARED);
    assert.equal(inFlight.counts.statusesNotDeclared, 1, 'the count is reported rather than folded into the total');
    assert.match(renderInFlightReport(inFlight), /status not declared/);
  });

  it('UT-5: the same name in both populations stays two entries', () => {
    const tree = createTree('p23-9-overlap-');
    try {
      writeTree(tree.root, {
        'tests/alpha.rs': '// P7-1\n#[test]\nfn works() {}\n',
        'src/a/lib.rs': 'pub fn f() {}\n',
      });

      const plan = planReverseSplit({
        root: tree.root,
        testDir: path.join(tree.root, 'tests'),
        declaredTicketKeys: ['P7-1'],
        absentRedContracts: [],
        planEntries: [],
        ticketLifecycles: lifecycleDocument([{ key: 'P7-1', status: 'made', title: 'a', files: ['src/a/lib.rs'] }]),
        packages: [{ id: 'a', path: 'src/a' }],
        implementations: new Map([['a', ['src/a/lib.rs']]]),
      });

      assert.equal(plan.mappingCoverage.tests, 1, 'the test is counted once, in the mapping');
      assert.equal(plan.mappingCoverage.mapped, 1);
      assert.equal(plan.inFlight.counts.nonTerminal, 1, 'the ticket is counted once, in the flight block');
      assert.equal(plan.tests.filter((test) => test.path === 'tests/alpha.rs').length, 1);
      assert.equal(plan.mappingCoverage.mapped + plan.inFlight.counts.rehomed, 2);

      // Adding the lifecycle read moves nothing into the mapping, and removing it moves
      // nothing out: the counts are separate because the populations are.
      const withoutRead = planReverseSplit({
        root: tree.root,
        testDir: path.join(tree.root, 'tests'),
        declaredTicketKeys: ['P7-1'],
        absentRedContracts: [],
        planEntries: [],
      });
      assert.equal(withoutRead.mappingCoverage.mapped, 1);
      assert.equal(plan.mappingCoverage.mapped - withoutRead.mappingCoverage.mapped, 0);
      assert.equal(plan.inFlight.counts.rehomed - withoutRead.inFlight.counts.rehomed, 1);
    } finally {
      tree.dispose();
    }
  });

  it('UT-6: a file no package holds is named by path, never attributed by nearest match', () => {
    const inFlight = planInFlightRehoming({
      tickets: [{ key: 'P7-9', status: 'planned', title: 'stray', files: ['docs/design.md', 'src/a/lib.rs'] }],
      packages: [{ id: 'a', path: 'src/a' }],
      implementations: new Map([['a', ['src/a/lib.rs']]]),
    });

    // Not partly re-homed and not approximated: a loss half-attributed reads as a success.
    assert.deepEqual(inFlight.rehomed, []);
    assert.equal(inFlight.rehomedNowhere.length, 1);
    assert.equal(inFlight.rehomedNowhere[0].key, 'P7-9');
    assert.deepEqual(inFlight.rehomedNowhere[0].unattributedPaths, ['docs/design.md']);
    assert.match(inFlight.rehomedNowhere[0].reason, /docs\/design\.md/);
    assert.equal(inFlight.counts.unattributedPaths, 1);
    assert.equal(inFlight.counts.rehomed + inFlight.counts.rehomedNowhere, inFlight.counts.nonTerminal);
  });

  it('UT-7: the two zeroes are distinguished — no declared set, and every ticket terminal', () => {
    const packages = [{ id: 'a', path: 'src/a' }];
    const implementations = new Map([['a', ['src/a/lib.rs']]]);

    const absent = planInFlightRehoming({ tickets: null, packages, implementations });
    assert.equal(absent.declared, false);
    assert.equal(absent.counts.nonTerminal, 0);
    assert.equal(absent.reason, NO_DECLARED_TICKET_SET_REASON);

    const allTerminal = planInFlightRehoming({
      tickets: [{ key: 'P7-1', status: 'reviewed', title: 'a', files: ['src/a/lib.rs'] }],
      packages,
      implementations,
    });
    assert.equal(allTerminal.declared, true);
    assert.equal(allTerminal.counts.nonTerminal, 0);
    assert.equal(allTerminal.reason, ALL_TICKETS_TERMINAL_REASON);

    const absentReport = renderInFlightReport(absent);
    const terminalReport = renderInFlightReport(allTerminal);
    assert.match(absentReport, /no declared ticket set was present/);
    assert.doesNotMatch(absentReport, /every ticket is terminal/);
    assert.match(terminalReport, /every ticket is terminal/);
    assert.doesNotMatch(terminalReport, /no declared ticket set/);
  });

  it('UT-8: a ticket naming no files is re-homed-nowhere, not attributed to the root package', () => {
    const inFlight = planInFlightRehoming({
      tickets: [{ key: 'P7-5', status: 'made', title: 'unfiled', files: [] }],
      packages: [{ id: 'root', path: '.' }],
      implementations: new Map([['root', ['build.rs', 'src/lib.rs']]]),
    });

    // The root package owns every path, which is exactly why an unfiled ticket must not
    // reach it: the attribution would be true and would say nothing.
    assert.deepEqual(inFlight.rehomed, []);
    assert.equal(inFlight.rehomedNowhere.length, 1);
    assert.equal(inFlight.rehomedNowhere[0].reason, NO_IMPLEMENTATION_FILE_REASON);
    assert.equal(NO_IMPLEMENTATION_FILE_REASON, 'the ticket names no implementation file');
    assert.equal(inFlight.counts.unfiled, 1);

    // A ticket that carries no file list at all is the same finding as one that declares
    // none: the attribution reports it rather than failing on the missing field.
    const missingField = planInFlightRehoming({
      tickets: [{ key: 'P7-6', status: 'made', title: 'no field' }],
      packages: [{ id: 'root', path: '.' }],
      implementations: new Map([['root', ['build.rs']]]),
    });
    assert.equal(missingField.counts.nonTerminal, 1);
    assert.equal(missingField.rehomedNowhere[0].reason, NO_IMPLEMENTATION_FILE_REASON);
    assert.equal(missingField.counts.rehomed + missingField.counts.rehomedNowhere, missingField.counts.nonTerminal);
  });

  it('UT-9: over twenty generated sets, every non-terminal ticket appears exactly once', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const { tickets, packages, implementations } = generateTicketSetAndPartition(seed);
      const inFlight = planInFlightRehoming({ tickets, packages, implementations });

      const nonTerminal = tickets.filter(isNonTerminal);
      assert.equal(inFlight.counts.nonTerminal, nonTerminal.length, `seed ${seed}`);
      assert.equal(
        inFlight.counts.rehomed + inFlight.counts.rehomedNowhere,
        nonTerminal.length,
        `seed ${seed}: the two outcomes account for the population`,
      );

      const keys = [...inFlight.rehomed, ...inFlight.rehomedNowhere].map((entry) => entry.key);
      assert.equal(new Set(keys).size, keys.length, `seed ${seed}: a ticket appears exactly once`);
      assert.deepEqual([...keys].sort(), nonTerminal.map((ticket) => ticket.key).sort(), `seed ${seed}: nobody is dropped`);
      assert.equal(
        inFlight.counts.unattributedPaths,
        inFlight.rehomedNowhere.reduce((total, entry) => total + entry.unattributedPaths.length, 0),
        `seed ${seed}: every unattributed path is counted`,
      );
      assert.equal(
        inFlight.counts.unfiled,
        nonTerminal.filter((ticket) => ticket.files.length === 0).length,
        `seed ${seed}: every unfiled ticket is counted`,
      );
    }
  });

  it('UT-10: readDeclaredTicketKeys keeps its message, and the new read is additive', () => {
    const tree = createTree('p23-9-bare-');
    try {
      const bare = path.join(tree.root, TICKETS_FILE_NAME);
      writeFileSync(bare, JSON.stringify({ title: 'no keys anywhere' }), 'utf8');

      assert.throws(
        () => readDeclaredTicketKeys(bare),
        /carries neither a "phases" array nor an "artefacts\.tickets\.ticketKeys" array/,
        'S1 keeps the message it had, because S1-S6 depend on it',
      );

      const lifecycles = readTicketLifecycles(bare);
      assert.equal(lifecycles.present, true);
      assert.deepEqual(lifecycles.tickets, [], 'a document that declares no ticket is read as declaring none');
    } finally {
      tree.dispose();
    }
  });

  it('UT-11: a document that is not there is reported as not there, never as an empty block', () => {
    const tree = createTree('p23-9-absent-');
    try {
      const lifecycles = readTicketLifecycles(path.join(tree.root, 'not-written', TICKETS_FILE_NAME));
      assert.equal(lifecycles.present, false);
      assert.deepEqual(lifecycles.tickets, []);
      assert.equal(lifecycles.reason, NO_DECLARED_TICKET_SET_REASON);
    } finally {
      tree.dispose();
    }
  });

  it('UT-12: the serialized ticket set carries the block beside the counts it belongs with', () => {
    const plan = {
      root: '/subject',
      stage: 'S1-S6',
      language: 'rust',
      mappingCoverage: { tests: 0, mapped: 0, unmapped: 0, total: true },
      absence: { absenceCount: 0, unclassified: [], absentRedContracts: [] },
      gates: [],
      tests: [],
      mapped: [],
      unmapped: [],
      tickets: [],
      refused: [],
      inFlight: planInFlightRehoming({
        tickets: [{ key: 'P7-1', status: 'made', title: 'a', files: ['src/a/lib.rs'] }],
        packages: [{ id: 'a', path: 'src/a' }],
        implementations: new Map([['a', ['src/a/lib.rs']]]),
      }),
    };

    const serialized = serializeTicketSet(plan);
    // The existing keys stay at their existing paths: the reverse-split assertions pin them.
    for (const key of ['root', 'stage', 'language', 'mappingCoverage', 'absenceCount', 'gates', 'tickets', 'refused', 'unclassified']) {
      assert.ok(Object.hasOwn(serialized, key), `${key} keeps its path`);
    }
    assert.equal(serialized.mappingCoverage.tests, 0);
    assert.equal(serialized.inFlight.counts.rehomed, 1, 'the new block has one obvious home');
    assert.equal(serialized.inFlight.counts.rehomedNowhere, 0);

    const report = renderMappingReport(plan);
    assert.match(report, /## In-flight work/);
    assert.match(report, /P7-1/);
  });

  it('UT-13: the CLI report over a subject with a partition names every non-terminal ticket', () => {
    const tree = createTree('p23-9-cli-');
    const outDir = mkdtempSync(path.join(tmpdir(), 'p23-9-cli-out-'));
    try {
      writeTree(tree.root, {
        'src/a/lib.rs': 'pub fn f() {}\n',
        'src/b/lib.rs': 'pub fn g() {}\n',
        'tests/alpha.rs': '// P7-1\n#[test]\nfn works() {}\n',
        [TICKETS_FILE_NAME]: ticketsDocument([
          { id: 1, status: 'made', title: 'a', default_files: ['src/a/lib.rs'] },
          { id: 2, status: 'reviewed', title: 'b', default_files: ['src/b/lib.rs'] },
        ]),
        'PARTITION.json': JSON.stringify({ packages: [{ id: 'root', path: '.' }, { id: 'a', path: 'src/a' }] }),
      });

      const result = spawnSync(process.execPath, [
        CLI_PATH,
        `--root=${tree.root}`,
        `--tickets=${path.join(tree.root, TICKETS_FILE_NAME)}`,
        `--partition=${path.join(tree.root, 'PARTITION.json')}`,
        `--out=${outDir}`,
      ], { encoding: 'utf8' });

      assert.equal(result.stderr, '', 'the run completes rather than crashing');
      assert.match(result.stdout, /## In-flight work/);

      const written = JSON.parse(readFileSync(path.join(outDir, 'reverse-split-tickets.json'), 'utf8'));
      assert.equal(written.inFlight.counts.nonTerminal, 1, 'the reviewed ticket is terminal');
      assert.equal(written.inFlight.rehomed.length, 1);
      assert.equal(written.inFlight.rehomed[0].key, 'P7-1');
      assert.deepEqual(written.inFlight.rehomed[0].owningPackages, ['a']);
    } finally {
      tree.dispose();
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('UT-14: without a partition every in-flight ticket is named as re-homed-nowhere, and why', () => {
    const tree = createTree('p23-9-nopartition-');
    try {
      writeTree(tree.root, {
        'src/a/lib.rs': 'pub fn f() {}\n',
        'tests/alpha.rs': '// P7-1\n#[test]\nfn works() {}\n',
        [TICKETS_FILE_NAME]: ticketsDocument([{ id: 1, status: 'made', title: 'a', default_files: ['src/a/lib.rs'] }]),
      });

      const wrote = spawnSync(process.execPath, [
        CLI_PATH,
        `--root=${tree.root}`,
        `--tickets=${path.join(tree.root, TICKETS_FILE_NAME)}`,
      ], { encoding: 'utf8' });

      assert.equal(wrote.stderr, '');
      assert.match(wrote.stdout, /## In-flight work/);
      assert.match(wrote.stdout, /no partition was offered/);

      const inFlight = planInFlightRehoming({
        tickets: [{ key: 'P7-1', status: 'made', title: 'a', files: ['src/a/lib.rs'] }],
        packages: null,
        implementations: null,
      });
      assert.equal(inFlight.partitionPresent, false);
      assert.equal(inFlight.reason, NO_PARTITION_REASON);
      assert.deepEqual(inFlight.rehomed, [], 'no partition means no home to follow a ticket to');
      assert.deepEqual(inFlight.rehomedNowhere.map((entry) => entry.key), ['P7-1'], 'and the ticket is named rather than dropped');
      assert.equal(inFlight.counts.rehomed + inFlight.counts.rehomedNowhere, inFlight.counts.nonTerminal);
    } finally {
      tree.dispose();
    }
  });

  it('UT-15: a set that declares no ticket is a third zero, stated as itself', () => {
    const inFlight = planInFlightRehoming({
      tickets: [],
      packages: [{ id: 'a', path: 'src/a' }],
      implementations: new Map([['a', []]]),
    });

    assert.equal(inFlight.declared, true);
    assert.equal(inFlight.counts.nonTerminal, 0);
    assert.equal(inFlight.reason, EMPTY_DECLARED_TICKET_SET_REASON);
    assert.notEqual(EMPTY_DECLARED_TICKET_SET_REASON, ALL_TICKETS_TERMINAL_REASON);
    assert.match(renderInFlightReport(inFlight), /declares no ticket/);
  });

  it('UT-16: the oracle run keeps the mapping counts it had, and gains the flight block', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'p23-9-oracle-'));
    try {
      const result = spawnSync(process.execPath, [
        CLI_PATH,
        `--root=${path.join(PROJECT_ROOT, 'siprs-for-reverse')}`,
        `--tickets=${ORACLE_BUNDLE_PATH}`,
        `--out=${outDir}`,
      ], { encoding: 'utf8' });

      assert.equal(result.status, 1, 'this target leaves a remainder, so the run reports not proved');
      const written = JSON.parse(readFileSync(path.join(outDir, 'reverse-split-tickets.json'), 'utf8'));
      const s1 = written.gates.find((gate) => gate.gateId === 'S1');
      assert.equal(s1.counts.unmapped, 6, 'the frozen mapping is what this target leaves');
      assert.equal(s1.counts.mapped, 10);
      assert.equal(written.inFlight.declared, true, 'the frozen oracle bundle declares ticket keys, so the read happens');
      assert.equal(written.inFlight.counts.nonTerminal, 0, 'the bundle carries keys only, so no ticket declares a status');
      assert.equal(written.inFlight.reason, EMPTY_DECLARED_TICKET_SET_REASON);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
