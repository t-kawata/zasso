// @verifies C001
// @verifies C002
/**
 * R2.5's dynamic half — the static/dynamic coupling difference, and the three
 * states a mechanism may be in.
 *
 * The subject of these tests is the honesty of a negative result. A static
 * reading lists the entrances to dynamic behaviour and cannot say which binding
 * runs; a session can say what it ran and cannot say what it did not. The
 * record this module publishes therefore never states that a mechanism is
 * absent from the program — only that this session did not exercise it, or that
 * this channel structurally cannot see it. The tests below assert both halves
 * of that: that the three states partition the list, and that a mechanism the
 * session did not touch is never reported as a finding about the program.
 *
 * The difference between the two surfaces is where the design's F1 rule bites:
 * an empty `dynamicOnly` set is a signal, not a clean result. That emptiness is
 * asserted in the JSON and in the prose a reader decides from, because a JSON
 * key nobody reads is not a caveat.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createSyntheticTree, hashTree } from '../helpers/scratch.mjs';

import {
  DYNAMIC_CHANNEL_REACH,
  DYNAMIC_CHANNEL_REASONS,
  DYNAMIC_COUPLING_CAVEAT,
  DYNAMIC_DIFFERENCE_SETS,
  DYNAMIC_MECHANISM_STATUSES,
  diffSurfaces,
  disposeAndReport,
  buildDynamicAttemptRows,
  measureDynamicCoupling,
  observeDynamically,
  renderDynamicCoupling,
} from '../../../.claude/scripts/workspacify-reverse/lib/dynamic-coupling.mjs';
import {
  DYNAMIC_CONSTRUCT_KINDS,
  buildDynamicSurface,
} from '../../../.claude/scripts/workspacify-reverse/lib/dynamic-surface.mjs';
import { MECHANISM_KINDS } from '../../../.claude/scripts/workspacify-reverse/lib/execution-surface.mjs';
import {
  ATTEMPT_PHASES,
  buildAttemptLedger,
  recordAttempt,
} from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';

/**
 * A start plan runs through cargo. A test that cannot run its subject is
 * reported as skipped rather than red, because the failure would belong to the
 * environment and not to the code under test.
 */
const CARGO_MISSING_SKIP =
  spawnSync('cargo', ['--version'], { encoding: 'utf8' }).status === 0
    ? false
    : 'cargo is not on PATH, so no start plan can be executed';

const STARTABLE_TREE = Object.freeze({
  'Cargo.toml': '[package]\nname = "coupling"\nversion = "0.1.0"\nedition = "2021"\n',
  'src/lib.rs': 'pub fn ping() -> bool {\n    true\n}\n',
});

/** The session identifier a built record names, so the runtime evidence is traceable. */
const SESSION_ID = 'ses-0123456789abcdef';

/** One static mechanism, in the shape `measureExecutionSurface` emits. */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function mechanism(kind, file, line) {
  return { id: `${kind}:${file}:${line}`, kind, file, line, spelling: '', note: `${kind} at ${file}:${line}` };
}

/** A dynamic record holding the runtime constructs a session declared it observed. */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function recordOf(kinds, { runtime = true } = {}) {
  return buildDynamicSurface({
    observations: kinds.map((kind) => ({
      kind,
      evidence_mode: runtime ? 'runtime_dynamic' : 'build_semantic',
      statement: `the session observed a ${kind} construct`,
    })),
    unobservedChannels: [],
    runs: [{ name: 'start', command: 'cargo', args: ['metadata'], exitCode: 0, evidence_mode: 'build_semantic' }],
    sandboxId: 'sbx-test',
    session: { sessionId: SESSION_ID, sandboxId: 'sbx-test' },
  });
}

/** Twenty generated static lists, so a partition property is asserted over a population. */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function generatedMechanismLists(count) {
  const kinds = [...MECHANISM_KINDS];
  return Array.from({ length: count }, (_, listIndex) => {
    const length = (listIndex * 7) % 11;
    return Array.from({ length }, (_, itemIndex) => {
      const kind = kinds[(listIndex + itemIndex) % kinds.length];
      return mechanism(kind, `src/module${(listIndex * 3 + itemIndex) % 5}.rs`, itemIndex + 1);
    });
  });
}

/** The runtime constructs the static list leaves unaccounted for, in the order the record holds them. */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function unaccountedConstructs(staticMechanisms, dynamicRecord) {
  const reachable = new Set(
    staticMechanisms.map((item) => DYNAMIC_CHANNEL_REACH[item.kind].construct).filter((kind) => kind !== null),
  );
  const seen = new Map();
  for (const observation of dynamicRecord.observations) {
    if (observation.evidence_mode !== 'runtime_dynamic') continue;
    if (reachable.has(observation.kind)) continue;
    if (!seen.has(observation.kind)) seen.set(observation.kind, observation);
  }
  return [...seen.entries()];
}

// ---------------------------------------------------------------------------
// C001 — the three states, and the one a negative result is never reported as
// ---------------------------------------------------------------------------

test('C001 precondition — the reachability table consumes the shared vocabulary rather than inventing one', () => {
  for (const kind of MECHANISM_KINDS) {
    const reach = DYNAMIC_CHANNEL_REACH[kind];
    assert.ok(reach, `${kind} must be declared by the channel reachability table`);
    if (reach.construct === null) {
      assert.ok(reach.reason.length > 0, `${kind} is unreachable and must state why`);
      continue;
    }
    assert.ok(
      DYNAMIC_CONSTRUCT_KINDS.includes(reach.construct),
      `${kind} names the construct "${reach.construct}", which must be one of the shared kinds`,
    );
  }
});

test('C001 precondition — a subject with no manifest any ecosystem row names creates no sandbox and says which precondition failed', () => {
  const barren = createSyntheticTree({ 'README.md': '# nothing to start\n' }, { prefix: 'wsp-p23-6-barren-' });
  try {
    const channel = observeDynamically({ root: barren.root, sandboxOptions: {} });
    assert.equal(channel.ran, false);
    assert.equal(channel.reason, DYNAMIC_CHANNEL_REASONS.noStartPlan);
    assert.equal(channel.sessionId, null);
    assert.equal(channel.record, null);
  } finally {
    barren.dispose();
  }
});

test(
  'C001 precondition — a startable subject produces a session identifier and a validated record',
  { skip: CARGO_MISSING_SKIP },
  () => {
    const tree = createSyntheticTree(STARTABLE_TREE, { prefix: 'wsp-p23-6-start-' });
    try {
      const channel = observeDynamically({ root: tree.root, sandboxOptions: {} });
      assert.equal(channel.ran, true, channel.reason ?? 'the channel must start a session over a startable subject');
      assert.match(channel.sessionId, /^ses-[0-9a-f]{16}$/);
      assert.equal(channel.record.session.sessionId, channel.sessionId);
      assert.equal(channel.replay.sessionId, channel.sessionId);
    } finally {
      tree.dispose();
    }
  },
);

test('C001 postcondition — an observed mechanism carries runtime_dynamic evidence and names the session that observed it', () => {
  const dynamicRecord = recordOf(['extern_binding']);
  const { mechanisms } = diffSurfaces([mechanism('ffi', 'src/api/login.rs', 7)], dynamicRecord);

  assert.equal(mechanisms.length, 1);
  assert.equal(mechanisms[0].dynamic.status, 'observed_dynamically');
  assert.equal(mechanisms[0].dynamic.evidence.evidence_mode, 'runtime_dynamic');
  assert.equal(mechanisms[0].dynamic.evidence.sessionId, SESSION_ID);
  assert.equal(mechanisms[0].dynamic.observationCount, 1);
});

test('C001 postcondition — a build_semantic observation does not promote a mechanism to observed', () => {
  const { mechanisms } = diffSurfaces([mechanism('ffi', 'src/api/login.rs', 7)], recordOf(['extern_binding'], { runtime: false }));

  assert.equal(mechanisms[0].dynamic.status, 'not_exercised_in_session');
});

test('C001 postcondition — a mechanism whose kind no construct names is reported as unreachable by this channel, with the reason', () => {
  const compileTime = mechanism('conditional_compilation', 'src/lib.rs', 3);
  assert.equal(DYNAMIC_CHANNEL_REACH.conditional_compilation.construct, null);

  const { mechanisms } = diffSurfaces([compileTime], recordOf(['extern_binding']));
  assert.equal(mechanisms[0].dynamic.status, 'not_reachable_by_channel');
  assert.equal(mechanisms[0].dynamic.reason, DYNAMIC_CHANNEL_REACH.conditional_compilation.reason);
});

test('C001 invariant — a mechanism the session did not exercise is never reported as absent from the program', () => {
  const staticMechanisms = [
    mechanism('dynamic_dispatch', 'src/a.rs', 1),
    mechanism('reflection', 'src/b.rs', 2),
    mechanism('macro_expansion', 'src/c.rs', 3),
  ];
  const { mechanisms } = diffSurfaces(staticMechanisms, recordOf([]));

  assert.deepEqual(
    Object.fromEntries(mechanisms.map((item) => [item.id, item.dynamic.status])),
    {
      'dynamic_dispatch:src/a.rs:1': 'not_exercised_in_session',
      'reflection:src/b.rs:2': 'not_exercised_in_session',
      'macro_expansion:src/c.rs:3': 'not_reachable_by_channel',
    },
  );
  for (const item of mechanisms) {
    assert.ok(DYNAMIC_MECHANISM_STATUSES.includes(item.dynamic.status));
    assert.notEqual(item.dynamic.status, 'absent');
  }
  assert.ok(
    !JSON.stringify(mechanisms).match(/absent|does not (do|contain|have)|there is no/i),
    'a session that did not exercise a mechanism has no negative finding to report about the program',
  );
});

test('C001 invariant, as a property — the three status counts sum to the static list length over twenty generated lists', () => {
  for (const staticMechanisms of generatedMechanismLists(20)) {
    const { mechanisms } = diffSurfaces(staticMechanisms, recordOf(['extern_binding', 'reflective_name']));
    const counts = Object.fromEntries(DYNAMIC_MECHANISM_STATUSES.map((status) => [status, 0]));
    for (const item of mechanisms) counts[item.dynamic.status] += 1;

    const total = DYNAMIC_MECHANISM_STATUSES.reduce((sum, status) => sum + counts[status], 0);
    assert.equal(total, staticMechanisms.length, 'every mechanism carries exactly one of the three states');
    assert.equal(mechanisms.length, staticMechanisms.length);
  }
});

// ---------------------------------------------------------------------------
// C002 — the difference, and which of its emptinesses is a signal
// ---------------------------------------------------------------------------

test('C002 postcondition — the difference is three named sets, each with its members and its count', () => {
  const { difference } = diffSurfaces([mechanism('ffi', 'src/a.rs', 1)], recordOf(['extern_binding']));

  assert.deepEqual([...DYNAMIC_DIFFERENCE_SETS], ['both', 'staticOnly', 'dynamicOnly']);
  for (const name of DYNAMIC_DIFFERENCE_SETS) {
    assert.ok(Array.isArray(difference[name].members), `${name} carries its members`);
    assert.equal(typeof difference[name].count, 'number', `${name} carries its count`);
    assert.equal(difference[name].count, difference[name].members.length, `${name}'s count is its member count`);
  }
});

test('C002 postcondition — five static mechanisms with three observed give both 3, staticOnly 2 and an empty dynamicOnly', () => {
  const staticMechanisms = [
    mechanism('ffi', 'src/a.rs', 1),
    mechanism('ffi', 'src/a.rs', 2),
    mechanism('ffi', 'src/a.rs', 3),
    mechanism('reflection', 'src/b.rs', 1),
    mechanism('reflection', 'src/b.rs', 2),
  ];
  const { difference } = diffSurfaces(staticMechanisms, recordOf(['extern_binding']));

  assert.equal(difference.both.count, 3);
  assert.equal(difference.staticOnly.count, 2, 'the two reflective sites were not exercised by this session');
  assert.equal(difference.dynamicOnly.count, 0);
  assert.deepEqual(
    difference.staticOnly.members.map((item) => item.id).sort(),
    ['reflection:src/b.rs:1', 'reflection:src/b.rs:2'],
  );
});

test('C002 postcondition — a construct the static list has no mechanism for appears in dynamicOnly with the evidence that observed it', () => {
  const { difference } = diffSurfaces([mechanism('ffi', 'src/a.rs', 1)], recordOf(['dynamic_load']));

  assert.equal(difference.both.count, 0);
  assert.equal(difference.staticOnly.count, 1);
  assert.equal(difference.dynamicOnly.count, 1);
  assert.deepEqual(difference.dynamicOnly.members.map((item) => item.kind), ['dynamic_load']);
  assert.equal(difference.dynamicOnly.members[0].evidence.evidence_mode, 'runtime_dynamic');
  assert.equal(difference.dynamicOnly.members[0].evidence.sessionId, SESSION_ID);
});

test('C002 precondition — an observation naming a construct the static list does account for leaves no unmatched entry', () => {
  const diff = diffSurfaces([mechanism('runtime_loading', 'src/a.rs', 9)], recordOf(['dynamic_load']));

  assert.deepEqual(diff.difference.both.members.map((item) => item.id), ['runtime_loading:src/a.rs:9']);
  assert.equal(diff.difference.staticOnly.count, 0);
  assert.equal(diff.difference.dynamicOnly.count, 0);
  assert.deepEqual(diff.unmatched, []);
});

test('C002 invariant — with no start plan the document reports the channel did not run and publishes three empty sets', () => {
  const barren = createSyntheticTree({ 'README.md': '# nothing to start\n' }, { prefix: 'wsp-p23-6-unrun-' });
  try {
    const measurement = measureDynamicCoupling({
      root: barren.root,
      staticMechanisms: [mechanism('ffi', 'src/a.rs', 1)],
      sandboxOptions: {},
    });

    assert.equal(measurement.dynamicChannel.ran, false);
    assert.equal(measurement.dynamicChannel.sessionId, null);
    assert.ok(measurement.dynamicChannel.reason.length > 0, 'an unrun channel names the reason it did not run');
    for (const name of DYNAMIC_DIFFERENCE_SETS) {
      assert.deepEqual(measurement.difference[name].members, [], `${name} is published as empty, never omitted`);
      assert.equal(measurement.difference[name].count, 0);
    }
    assert.equal(
      measurement.mechanisms.length,
      0,
      'an unrun channel has looked at nothing, so it carries no per-mechanism row to misread as a finding',
    );
    assert.match(measurement.caveat, /did not run|looked at nothing/i);
    assert.match(renderDynamicCoupling(measurement), /looked at nothing/i);
  } finally {
    barren.dispose();
  }
});

test('C002 invariant — an empty dynamicOnly set is published with its count and its prose says the emptiness is a signal', () => {
  const dynamicRecord = recordOf(['extern_binding']);
  const measurement = {
    stage: 'r2.5',
    dynamicChannel: { ran: true, reason: null, sessionId: SESSION_ID },
    ...diffSurfaces([mechanism('ffi', 'src/a.rs', 1)], dynamicRecord),
    caveat: 'a difference of zero can be a signal rather than a health report',
  };

  assert.equal(measurement.difference.dynamicOnly.count, 0);
  const prose = renderDynamicCoupling(measurement);
  assert.match(prose, /signal/i, 'the third set being empty is a signal rather than a clean result');
  assert.doesNotMatch(prose, /falsely|no mechanism hides/i, 'the emptiness must not be sold as proof that nothing hides');
});

test('C002 boundary — an empty static list yields a record with no rows and a three-part empty difference', () => {
  const { mechanisms, difference } = diffSurfaces([], recordOf(['dynamic_load']));

  assert.deepEqual(mechanisms, []);
  assert.equal(difference.both.count, 0);
  assert.equal(difference.staticOnly.count, 0);
  assert.equal(difference.dynamicOnly.count, 1, 'the session observed a construct the empty list cannot account for');
});

test('C002 invariant, as a property — the three sets are pairwise disjoint and cover the static list plus the unaccounted constructs', () => {
  for (const staticMechanisms of generatedMechanismLists(20)) {
    const dynamicRecord = recordOf(['extern_binding', 'reflective_name', 'dynamic_load']);
    const { difference } = diffSurfaces(staticMechanisms, dynamicRecord);
    const ids = (name) => difference[name].members.map((item) => item.id);

    for (const [left, right] of [['both', 'staticOnly'], ['both', 'dynamicOnly'], ['staticOnly', 'dynamicOnly']]) {
      assert.deepEqual(
        ids(left).filter((id) => ids(right).includes(id)),
        [],
        `${left} and ${right} must be pairwise disjoint`,
      );
    }

    const staticIds = staticMechanisms.map((item) => item.id);
    assert.deepEqual(
      [...new Set([...ids('both'), ...ids('staticOnly')])].sort(),
      [...new Set(staticIds)].sort(),
      'both and staticOnly together are exactly the static list',
    );
    assert.deepEqual(
      ids('dynamicOnly').sort(),
      unaccountedConstructs(staticMechanisms, dynamicRecord).map(([kind]) => `dynamic:${kind}`).sort(),
      'dynamicOnly holds exactly the constructs the static reading has no mechanism for',
    );
  }
});

test('C002 boundary — a mechanism observed once and one observed a thousand times both record as observed', () => {
  const staticMechanisms = [mechanism('ffi', 'src/a.rs', 1)];
  const once = diffSurfaces(staticMechanisms, recordOf(['extern_binding']));
  const many = diffSurfaces(
    staticMechanisms,
    buildDynamicSurface({
      observations: Array.from({ length: 1000 }, () => ({
        kind: 'extern_binding',
        evidence_mode: 'runtime_dynamic',
        statement: 'the session observed an extern binding',
      })),
      unobservedChannels: [],
      runs: [],
      sandboxId: 'sbx-test',
      session: { sessionId: SESSION_ID, sandboxId: 'sbx-test' },
    }),
  );

  assert.equal(once.mechanisms[0].dynamic.status, 'observed_dynamically');
  assert.equal(many.mechanisms[0].dynamic.status, 'observed_dynamically', 'the count does not change the status');
  assert.equal(once.mechanisms[0].dynamic.observationCount, 1);
  assert.equal(many.mechanisms[0].dynamic.observationCount, 1000);
});

// ---------------------------------------------------------------------------
// The measurement end to end, and the subject it must not touch
// ---------------------------------------------------------------------------

test(
  'the whole measurement leaves the subject byte-identical',
  { skip: CARGO_MISSING_SKIP },
  () => {
    const tree = createSyntheticTree(STARTABLE_TREE, { prefix: 'wsp-p23-6-untouched-' });
    try {
      const before = hashTree(tree.root);
      const measurement = measureDynamicCoupling({
        root: tree.root,
        staticMechanisms: [mechanism('ffi', 'src/lib.rs', 1)],
        sandboxOptions: {},
      });

      assert.equal(measurement.stage, 'r2.5');
      assert.equal(measurement.dynamicChannel.ran, true, measurement.dynamicChannel.reason ?? '');
      assert.deepEqual(hashTree(tree.root), before, 'the session ran inside the sandbox copy, and the subject did not move');
      assert.equal(measurement.mechanisms.length, 1);
      assert.ok(DYNAMIC_MECHANISM_STATUSES.includes(measurement.mechanisms[0].dynamic.status));
    } finally {
      tree.dispose();
    }
  },
);

test('the measurement reports a channel that did not run rather than propagating the sandbox failure', () => {
  const barren = createSyntheticTree({ 'README.md': '# nothing to start\n' }, { prefix: 'wsp-p23-6-refuse-' });
  try {
    let measurement;
    assert.doesNotThrow(() => {
      measurement = measureDynamicCoupling({ root: barren.root, staticMechanisms: [], sandboxOptions: {} });
    });
    assert.equal(measurement.dynamicChannel.ran, false);
    assert.ok(DYNAMIC_CHANNEL_REASONS.noStartPlan.length > 0);
  } finally {
    barren.dispose();
  }
});

// ---------------------------------------------------------------------------
// The attempt ledger — the dynamic channel appears where every other attempt does
// ---------------------------------------------------------------------------

test('the dynamic attempt rows land in the same ledger as the static rows, and a channel that did not run is skipped rather than failed', () => {
  const ran = buildDynamicAttemptRows({ root: '/tmp/subject', ran: true, reason: null, observedCount: 2, subjectFiles: 3 });
  for (const row of ran) {
    assert.ok(ATTEMPT_PHASES.includes(row.phase), `the phase "${row.phase}" must be one the ledger declares`);
    assert.equal(row.phase, 'execute', 'a run is the phase the static phases cannot reach');
    assert.match(row.tool, /start-plan/, 'the tool names the command shape the session ran');
    assert.match(row.configuration, /sandboxed-session/, 'the configuration is how a reader finds the dynamic channel');
  }
  assert.ok(ran.some((row) => row.extracted_count === 2), 'how many mechanisms the session observed travels with the row');

  const unrun = buildDynamicAttemptRows({ root: '/tmp/barren', ran: false, reason: 'no-start-plan', observedCount: 0, subjectFiles: 0 });
  assert.equal(unrun[0].status, 'skipped');
  assert.equal(unrun[0].reason, 'no-start-plan');

  const staticRows = [recordAttempt({ target: 'src/a.rs', configuration: 'syntax-only', tool: 'tree-sitter-rust' })];
  const ledger = buildAttemptLedger([...staticRows, ...ran]);
  assert.equal(ledger.rows.length, staticRows.length + ran.length);
  assert.equal(buildAttemptLedger(unrun).couldNotRunCount, 0, 'a channel that did not run is skipped, not a failed attempt');
});

test('the shared vocabulary the channel declares is the one the ledger already reads', () => {
  assert.equal(ATTEMPT_PHASES.includes('execute'), true, 'the ledger must be able to name the phase a dynamic attempt reached');
});

test('the real probe lists 792 mechanisms, and every one of them is placed by the reachability table', () => {
  const surface = JSON.parse(
    readFileSync(new URL('../analysis/EXECUTION-SURFACE.json', import.meta.url), 'utf8'),
  );
  assert.equal(surface.mechanisms.length, 792, 'the measurement this ticket was written against');

  const placed = surface.mechanisms.filter((item) => DYNAMIC_CHANNEL_REACH[item.kind] !== undefined);
  assert.equal(placed.length, surface.mechanisms.length, 'no mechanism kind may be left out of the table');

  const unreachable = placed.filter((item) => DYNAMIC_CHANNEL_REACH[item.kind].construct === null);
  assert.ok(
    unreachable.length > 0 && unreachable.length < placed.length,
    'both states must occur on the real instrument, or one of them is decoration',
  );
});

// ---------------------------------------------------------------------------
// The contract that survives every failure: a reason, never an exception
// ---------------------------------------------------------------------------

test('a failure that is not a SandboxError is reported as a reason rather than escaping the analysis', () => {
  const tree = createSyntheticTree(STARTABLE_TREE, { prefix: 'wsp-p23-6-rawfail-' });
  const scratch = createSyntheticTree({ 'not-a-directory.txt': 'x' }, { prefix: 'wsp-p23-6-scratch-' });
  try {
    // A scratch root that is a file rather than a directory makes the copy fail
    // with a plain filesystem error. The analysis is read-only over its subject
    // and the dynamic channel is its optional half, so a machine that cannot
    // host the sandbox must still publish a report that says so.
    let measurement;
    assert.doesNotThrow(() => {
      measurement = measureDynamicCoupling({
        root: tree.root,
        staticMechanisms: [mechanism('ffi', 'src/lib.rs', 1)],
        sandboxOptions: { scratchRoot: join(scratch.root, 'not-a-directory.txt') },
      });
    });

    assert.equal(measurement.dynamicChannel.ran, false);
    assert.equal(measurement.dynamicChannel.reason, DYNAMIC_CHANNEL_REASONS.sessionFailed);
    assert.match(measurement.dynamicChannel.detail, /EEXIST|ENOTDIR/, 'the reason names the failure that happened');
    assert.equal(measurement.mechanisms.length, 0);
  } finally {
    tree.dispose();
    scratch.dispose();
  }
});

test('disposeAndReport reports a copy that could not be removed instead of throwing out of a cleanup path', () => {
  const forged = { sandboxId: 'sbx-never-created', sandboxDir: '/tmp/wsp-p23-6-never-created' };
  const verdict = disposeAndReport(forged);

  assert.equal(verdict.disposed, false);
  assert.match(verdict.reason, /sandbox-not-observed/, 'the refusal that cannot remove anything is the reported one');
  assert.equal(existsSync(forged.sandboxDir), false, 'the refused handle deletes nothing on its way out');
});

test(
  'a session that ran records that its copy was removed, and a channel with no sandbox records nothing to remove',
  { skip: CARGO_MISSING_SKIP },
  () => {
    const tree = createSyntheticTree(STARTABLE_TREE, { prefix: 'wsp-p23-6-disposal-' });
    const barren = createSyntheticTree({ 'README.md': '# nothing\n' }, { prefix: 'wsp-p23-6-nodisposal-' });
    try {
      const ran = observeDynamically({ root: tree.root, sandboxOptions: {} });
      assert.equal(ran.disposal.disposed, true);

      const never = observeDynamically({ root: barren.root, sandboxOptions: {} });
      assert.equal('disposal' in never, false, 'no sandbox was created, so there is nothing to report as removed');
    } finally {
      tree.dispose();
      barren.dispose();
    }
  },
);

test('the prose states how a mechanism comes to be marked observed, so the join is not read as a per-site run', () => {
  const measurement = {
    stage: 'r2.5',
    root: '/tmp/subject',
    dynamicChannel: { ran: true, reason: null, detail: null, sessionId: SESSION_ID },
    ...diffSurfaces([mechanism('ffi', 'src/a.rs', 1)], recordOf(['extern_binding'])),
    caveat: DYNAMIC_COUPLING_CAVEAT,
  };

  const prose = renderDynamicCoupling(measurement);
  assert.match(prose, /construct kind/i, 'the join is by construct kind and the reader is told so');
  assert.match(prose, /every listed mechanism|not .* observed directly|line itself/i);
});
