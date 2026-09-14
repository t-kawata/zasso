// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
// P22-12 @verifies C003
// A3 and A6: the authoring packet must hand over what *uses* this package.
//
// Without the incoming-dependency excerpt, a session authoring a seed sees
// a symbol with no visible callers and has to guess at its purpose. That guess is
// the input condition for a ratification RFC — a document that blesses whatever
// the code happens to do. The excerpt is what makes the reason the symbol exists
// visible, so the author can say whether the behaviour is intended or accidental.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOCATE_MODES,
  REVERSE_GATE_IDS,
  assertIncomingDependencyExcerpt,
} from '../../../.claude/scripts/workspacify-allocate/lib/reverse-mode.mjs';
import { buildAuthoringPacket } from '../../../.claude/scripts/workspacify-allocate/lib/seed-authoring-packet.mjs';
import { GATE_STATUS } from '../../../.claude/scripts/workspacify-tree/lib/errors.mjs';
import { buildValidManifest, DEFAULT_SPEC_TEXT } from '../helpers/build-valid-manifest.mjs';
import { FIXTURE_SOURCE_FILES, buildReverseManifest, incomingImplementationsFrom } from './helpers/reverse-fixture.mjs';

// ---------------------------------------------------------------------------
// C003 precondition — a packet is generated, and forward is untouched
// ---------------------------------------------------------------------------

test('C003 precondition: a packet is generated, and a forward packet carries no reverse field', () => {
  const { manifest } = buildValidManifest();

  const forwardPacket = buildAuthoringPacket({ manifest, sourceText: DEFAULT_SPEC_TEXT, packageId: 'pkg-a' });
  assert.equal(
    Object.prototype.hasOwnProperty.call(forwardPacket, 'incoming_dependency_excerpts'),
    false,
    'a forward packet carries no reverse-only field',
  );

  const reversePacket = buildAuthoringPacket({
    manifest,
    sourceText: DEFAULT_SPEC_TEXT,
    packageId: 'pkg-a',
    reverse: { mode: ALLOCATE_MODES.REVERSE },
  });
  assert.ok(Array.isArray(reversePacket.incoming_dependency_excerpts));
});

test('C003 precondition: a forward packet is byte-identical whichever way it is asked for', () => {
  const { manifest } = buildValidManifest();
  const implicit = buildAuthoringPacket({ manifest, sourceText: DEFAULT_SPEC_TEXT, packageId: 'pkg-a' });
  const explicit = buildAuthoringPacket({
    manifest,
    sourceText: DEFAULT_SPEC_TEXT,
    packageId: 'pkg-a',
    reverse: { mode: ALLOCATE_MODES.FORWARD },
  });

  assert.deepEqual(explicit, implicit, 'declaring forward changes nothing about a forward packet');
});

// ---------------------------------------------------------------------------
// C003 postcondition — the incoming excerpt is present and non-empty
// ---------------------------------------------------------------------------

test('C003 postcondition: a non-empty incoming-dependency excerpt is included for every package', () => {
  const { manifest } = buildValidManifest();
  // pkg-b consumes pkg-a, so pkg-a's incoming dependencies are non-empty.
  const packet = buildAuthoringPacket({
    manifest,
    sourceText: DEFAULT_SPEC_TEXT,
    packageId: 'pkg-a',
    reverse: {
      mode: ALLOCATE_MODES.REVERSE,
      incomingImplementations: incomingImplementationsFrom(manifest, FIXTURE_SOURCE_FILES),
    },
  });

  assert.ok(packet.incoming_dependency_excerpts.length > 0, 'the provider sees who consumes it');
  for (const excerpt of packet.incoming_dependency_excerpts) {
    assert.equal(excerpt.counterpart_package.id, 'pkg-b');
    assert.match(excerpt.file_path, /crates\/protocol\/beta\//, 'the excerpt is the consumer\'s own code');
    assert.ok(excerpt.text.trim().length > 0, 'an excerpt is never emitted empty');
    assert.ok(excerpt.line_end >= excerpt.line_start);
  }
});

test('C003: the excerpt is bounded, so the packet hands over context rather than a whole file', () => {
  const { manifest } = buildValidManifest();
  const longConsumer = {
    'crates/protocol/beta/mod.rs': Array.from({ length: 400 }, (_, index) => `// line ${index + 1}`).join('\n'),
  };
  const packet = buildAuthoringPacket({
    manifest,
    sourceText: DEFAULT_SPEC_TEXT,
    packageId: 'pkg-a',
    windowLines: 3,
    reverse: { mode: ALLOCATE_MODES.REVERSE, incomingImplementations: incomingImplementationsFrom(manifest, longConsumer) },
  });

  assert.ok(packet.incoming_dependency_excerpts.length > 0);
  for (const excerpt of packet.incoming_dependency_excerpts) {
    assert.ok(excerpt.line_end - excerpt.line_start < 400, 'the window is bounded, not the whole file');
    assert.ok(excerpt.text.length < 400 * 8);
  }
});

test('C003 postcondition: the gate passes when every seed-bearing packet carries an excerpt', () => {
  const { manifest } = buildReverseManifest();
  const incomingImplementations = incomingImplementationsFrom(manifest, FIXTURE_SOURCE_FILES);
  const packets = (manifest.workspace?.packages ?? [])
    .filter((pkg) => pkg.seed_required !== false)
    .map((pkg) =>
      buildAuthoringPacket({
        manifest,
        sourceText: DEFAULT_SPEC_TEXT,
        packageId: pkg.id,
        reverse: { mode: ALLOCATE_MODES.REVERSE, incomingImplementations },
      }),
    );

  const record = assertIncomingDependencyExcerpt({ packets, mode: ALLOCATE_MODES.REVERSE });
  assert.equal(record.gateId, REVERSE_GATE_IDS.A3);
  assert.equal(record.status, GATE_STATUS.PASS);
  assert.deepEqual(record.packagesWithoutExcerpt, []);
});

test('C003 error case: a packet that drops the excerpt it owes is BLOCKED, and the package is named', () => {
  const dropped = assertIncomingDependencyExcerpt({
    packets: [{ package: { id: 'pkg-a' }, incoming_boundary_count: 1, incoming_dependency_excerpts: [] }],
    mode: ALLOCATE_MODES.REVERSE,
  });

  assert.equal(dropped.status, GATE_STATUS.BLOCKED);
  assert.deepEqual(dropped.packagesWithoutExcerpt, ['pkg-a']);
  assert.match(dropped.reasons.join('\n'), /pkg-a/);
  assert.match(dropped.reasons.join('\n'), /why .* functions exist/i, 'the reason states what the excerpt is for');
});

test('C003 boundary: a leaf package nothing consumes is recorded, not failed', () => {
  // In the plain two-package fixture pkg-b is a leaf: nothing consumes it. Every
  // finite dependency graph has a leaf, so failing here would mean a reverse run
  // could never succeed. The fact is reported instead.
  const { manifest } = buildValidManifest();
  const leafPacket = buildAuthoringPacket({
    manifest,
    sourceText: DEFAULT_SPEC_TEXT,
    packageId: 'pkg-b',
    reverse: { mode: ALLOCATE_MODES.REVERSE, incomingImplementations: incomingImplementationsFrom(manifest, FIXTURE_SOURCE_FILES) },
  });

  assert.equal(leafPacket.incoming_boundary_count, 0);
  assert.deepEqual(leafPacket.incoming_dependency_excerpts, []);

  const leafRecord = assertIncomingDependencyExcerpt({ packets: [leafPacket], mode: ALLOCATE_MODES.REVERSE });
  assert.equal(leafRecord.status, GATE_STATUS.PASS, 'a leaf is not a defect in the packet');
  assert.deepEqual(leafRecord.packagesWithoutConsumers, ['pkg-b']);
  assert.deepEqual(leafRecord.packagesWithoutExcerpt, []);
  assert.match(leafRecord.reasons.join('\n'), /recorded, not failed/);
});

// ---------------------------------------------------------------------------
// C003 boundary — an empty excerpt set is reported, never emitted empty
// ---------------------------------------------------------------------------

test('C003 boundary: an empty excerpt set is reported explicitly rather than passed as an empty section', () => {
  const record = assertIncomingDependencyExcerpt({ packets: [], mode: ALLOCATE_MODES.REVERSE });

  assert.equal(record.status, GATE_STATUS.BLOCKED);
  assert.match(record.reasons.join('\n'), /no packet|nothing to hand over/i);
  assert.deepEqual(record.packagesWithoutExcerpt, []);
});

// ---------------------------------------------------------------------------
// A6 folds into A3 — and A3 does not fire in forward mode
// ---------------------------------------------------------------------------

test('A6 is A3: the provider-side context is judged by the same gate', () => {
  const { manifest } = buildValidManifest();
  // pkg-b is the consumer, so its incoming set is empty by construction; the gate
  // must still judge the packets it is given, and the fixture drives that here.
  const packet = buildAuthoringPacket({
    manifest,
    sourceText: DEFAULT_SPEC_TEXT,
    packageId: 'pkg-b',
    reverse: { mode: ALLOCATE_MODES.REVERSE },
  });
  const record = assertIncomingDependencyExcerpt({ packets: [packet], mode: ALLOCATE_MODES.REVERSE });
  assert.equal(record.gateId, REVERSE_GATE_IDS.A3);
  assert.ok(Array.isArray(packet.incoming_dependency_excerpts));
});

test('A3 does not fire in forward mode: the reverse fields are unreachable from the forward rotation', () => {
  const forwardRecord = assertIncomingDependencyExcerpt({ packets: [], mode: ALLOCATE_MODES.FORWARD });

  assert.equal(forwardRecord.status, GATE_STATUS.PASS, 'forward mode has no incoming-excerpt obligation');
  assert.match(forwardRecord.reasons.join('\n'), /forward/);
});
