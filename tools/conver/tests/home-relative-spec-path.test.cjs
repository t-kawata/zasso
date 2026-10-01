// PX-231 @verifies C003
//
// A record written on one machine has to resolve on another, and a path is the only field
// in the record that can prevent it. These tests drive the writer through its command line
// with a home of the test's own choosing, and the reader through the function that turns a
// stored path back into a path this machine can use.
//
// The reader half pins the old form as well as the new one. Every record written before this
// change stores an absolute path, so an expansion that only understood `~/` would break the
// records rather than repair them.
const assert = require('node:assert');
const { describe, it } = require('node:test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.resolve(__dirname, '../.claude/scripts/tickets/ensure-ticket.js');
const { resolveStoredPath } = require('../.claude/scripts/lib/path-utils');

/** A home directory no machine has, made fresh for each test that needs one. */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function makeInjectedHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'px231-home-'));
}

/** An empty Tickets.json inside `home`, so the writer's own directory lies beneath the home. */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function makeTicketsUnder(home) {
  const ticketsPath = path.join(home, 'Tickets.json');
  fs.writeFileSync(
    ticketsPath,
    `${JSON.stringify({
      title: 'Test Tickets',
      round: 1,
      phases: [{ id: -1, name: 'PX', ticketKeyPrefix: 'PX', tickets: [] }],
      metadata: { source: 'x', generatedAt: '2026-10-01' },
    }, null, 2)}\n`,
    'utf8',
  );
  return ticketsPath;
}

/** Run the writer with the home it will read, and answer with what it stored. */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function storedSpecPathFor({ home, ticketsPath, ticketKey }) {
  execFileSync(process.execPath, [SCRIPT, `--ticket-key=${ticketKey}`, '--title=Stored path', `--tickets=${ticketsPath}`], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
  });
  const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  return tickets.phases[0].tickets[0].specPath;
}

// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
describe('PX-231 a stored path names no machine', function () {
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
  it('C003 postcondition: the writer stores a spec path beneath the home it ran under, written as a tilde path', function () {
    const home = makeInjectedHome();
    try {
      const stored = storedSpecPathFor({ home, ticketsPath: makeTicketsUnder(home), ticketKey: 'P9-1' });

      assert.ok(!stored.startsWith(home), `the record names the machine that wrote it: ${stored}`);
      assert.ok(stored.startsWith('~/'), `the record must be readable elsewhere: ${stored}`);
      assert.ok(stored.endsWith('specs/P9-1.md'), `and must still name the file: ${stored}`);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
  it('C003 postcondition: the reader expands a stored tilde path beneath the home it is read under', function () {
    const readingHome = makeInjectedHome();
    const previousHome = process.env.HOME;
    process.env.HOME = readingHome;
    try {
      assert.strictEqual(
        resolveStoredPath('~/specs/P9-1.md', path.join(readingHome, 'tickets')),
        path.join(readingHome, 'specs', 'P9-1.md'),
      );
    } finally {
      process.env.HOME = previousHome;
      fs.rmSync(readingHome, { recursive: true, force: true });
    }
  });

// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
  it('C003 invariant: a record written before this change still resolves', function () {
    const readingHome = makeInjectedHome();
    const previousHome = process.env.HOME;
    process.env.HOME = readingHome;
    try {
      const absolute = path.join(readingHome, 'specs', 'PX-57.md');

      assert.strictEqual(resolveStoredPath(absolute, path.join(readingHome, 'tickets')), absolute);
    } finally {
      process.env.HOME = previousHome;
      fs.rmSync(readingHome, { recursive: true, force: true });
    }
  });

// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
  it('C003 invariant: a relative stored path is still resolved against the tickets directory', function () {
    const readingHome = makeInjectedHome();
    const previousHome = process.env.HOME;
    process.env.HOME = readingHome;
    try {
      assert.strictEqual(
        resolveStoredPath('specs/P9-1.md', path.join(readingHome, 'tickets')),
        path.join(readingHome, 'tickets', 'specs', 'P9-1.md'),
      );
    } finally {
      process.env.HOME = previousHome;
      fs.rmSync(readingHome, { recursive: true, force: true });
    }
  });

// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
  it('C003 invariant: an expanded path never reaches path.resolve as a bare tilde', function () {
    const readingHome = makeInjectedHome();
    const previousHome = process.env.HOME;
    process.env.HOME = readingHome;
    try {
      assert.strictEqual(resolveStoredPath('~/', path.join(readingHome, 'tickets')), readingHome);
    } finally {
      process.env.HOME = previousHome;
      fs.rmSync(readingHome, { recursive: true, force: true });
    }
  });
});
