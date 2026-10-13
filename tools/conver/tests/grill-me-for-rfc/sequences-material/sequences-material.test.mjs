// PX-256 @verifies C001
// PX-256 @verifies C004
// The detector's whole value is that it cannot fail. A tolerant reader that can exit
// non-zero is a strict reader with better manners, and the ordering this ticket exists to
// establish would rest on nothing. So every case here asserts the exit status as well as
// the answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  DETECTOR,
  DRILL_DETECTOR,
  SOURCE_ARTIFACT_NAME,
  VIEW_JSON_NAME,
  VIEW_MARKDOWN_NAME,
  digestDirectory,
  makeDrillSession,
  makeGrillSession,
  runDetector,
  withScratch,
} from './fixtures/session-tree.mjs';

const SOURCE_ARTIFACT_TEXT = JSON.stringify({ schema_version: 2, sequences: [], steps: [], operations: [] });

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 a session with no sequences material answers absence and exits 0', () => {
  withScratch('px256-det-', (root) => {
    const packageDir = makeGrillSession(path.join(root, 'pkg'));
    const result = runDetector(packageDir);
    assert.equal(result.status, 0);
    assert.equal(result.answer.present, false);
    assert.equal(result.answer.source, null);
    assert.equal(result.answer.view, null);
    assert.equal(result.answer.viewExists, false);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 a recorded source artifact is reported with present true and its path', () => {
  withScratch('px256-det-', (root) => {
    const sourcePath = path.join(root, SOURCE_ARTIFACT_NAME);
    fs.writeFileSync(sourcePath, SOURCE_ARTIFACT_TEXT);
    const packageDir = makeGrillSession(path.join(root, 'pkg'), { material: [sourcePath] });
    const result = runDetector(packageDir);
    assert.equal(result.status, 0);
    assert.equal(result.answer.present, true);
    assert.equal(result.answer.source, sourcePath);
    assert.equal(result.answer.view, null);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 a recorded view name reports the view without mistaking it for a source', () => {
  withScratch('px256-det-', (root) => {
    const packageDir = path.join(root, 'pkg');
    makeGrillSession(packageDir);
    fs.writeFileSync(path.join(packageDir, VIEW_MARKDOWN_NAME), '# sequences\n');
    fs.writeFileSync(path.join(packageDir, VIEW_JSON_NAME), '{}\n');
    const result = runDetector(packageDir);
    assert.equal(result.status, 0);
    assert.equal(result.answer.source, null);
    assert.equal(result.answer.view, path.join(packageDir, VIEW_MARKDOWN_NAME));
    assert.equal(result.answer.viewExists, true);
    assert.equal(result.answer.present, true);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 a record with no materialPaths falls back to the single researchPath', () => {
  withScratch('px256-det-', (root) => {
    const sourcePath = path.join(root, SOURCE_ARTIFACT_NAME);
    fs.writeFileSync(sourcePath, SOURCE_ARTIFACT_TEXT);
    const packageDir = makeGrillSession(path.join(root, 'pkg'), { material: [sourcePath] });
    // A record written before materialPaths existed carries the one path it was given.
    const status = JSON.parse(fs.readFileSync(path.join(packageDir, 'Status.json'), 'utf8'));
    delete status.materialPaths;
    status.researchPath = sourcePath;
    fs.writeFileSync(path.join(packageDir, 'Status.json'), JSON.stringify(status, null, 2));
    const result = runDetector(packageDir);
    assert.equal(result.status, 0);
    assert.equal(result.answer.source, sourcePath);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 a record with neither field answers absence rather than throwing', () => {
  withScratch('px256-det-', (root) => {
    const packageDir = makeGrillSession(path.join(root, 'pkg'));
    const status = JSON.parse(fs.readFileSync(path.join(packageDir, 'Status.json'), 'utf8'));
    delete status.materialPaths;
    status.researchPath = '';
    fs.writeFileSync(path.join(packageDir, 'Status.json'), JSON.stringify(status, null, 2));
    const result = runDetector(packageDir);
    assert.equal(result.status, 0);
    assert.equal(result.answer.present, false);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 a recorded path that has been deleted is reported stale and the detector still exits 0', () => {
  withScratch('px256-det-', (root) => {
    const deletedPath = path.join(root, 'gone', 'GaiaSekkeiShiyousho_v9-sequences.json');
    fs.mkdirSync(path.dirname(deletedPath), { recursive: true });
    fs.writeFileSync(deletedPath, SOURCE_ARTIFACT_TEXT);
    const packageDir = makeGrillSession(path.join(root, 'pkg'), { material: [deletedPath] });
    fs.rmSync(deletedPath);
    const result = runDetector(packageDir);
    assert.equal(result.status, 0);
    assert.equal(result.answer.present, false);
    assert.equal(result.answer.source, null);
    assert.deepEqual(result.answer.staleMaterialPaths, [deletedPath]);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 an absent record, a malformed record and a deleted path all exit 0', () => {
  withScratch('px256-det-', (root) => {
    const absentDir = path.join(root, 'absent');
    fs.mkdirSync(absentDir, { recursive: true });
    assert.equal(runDetector(absentDir).status, 0);
    assert.equal(runDetector(absentDir).answer.present, false);

    const malformedDir = path.join(root, 'malformed');
    makeGrillSession(malformedDir);
    fs.writeFileSync(path.join(malformedDir, 'Status.json'), '{ not json');
    const malformed = runDetector(malformedDir);
    assert.equal(malformed.status, 0);
    assert.equal(malformed.answer.present, false);
    assert.ok(malformed.answer.searched.some((entry) => entry.readable === false && entry.reason !== null));

    const deletedDir = path.join(root, 'deleted');
    makeGrillSession(deletedDir);
    const status = JSON.parse(fs.readFileSync(path.join(deletedDir, 'Status.json'), 'utf8'));
    status.materialPaths = [path.join(root, 'never-existed.json')];
    fs.writeFileSync(path.join(deletedDir, 'Status.json'), JSON.stringify(status, null, 2));
    assert.equal(runDetector(deletedDir).status, 0);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 the answer carries every field a caller branches on', () => {
  withScratch('px256-det-', (root) => {
    const packageDir = makeGrillSession(path.join(root, 'pkg'));
    const answer = runDetector(packageDir).answer;
    for (const field of ['present', 'source', 'view', 'viewExists', 'materialPaths', 'staleMaterialPaths', 'searched']) {
      assert.ok(Object.hasOwn(answer, field), `the answer has no ${field}`);
    }
    assert.equal(typeof answer.present, 'boolean');
    assert.ok(answer.source === null || typeof answer.source === 'string');
    assert.ok(answer.view === null || typeof answer.view === 'string');
    assert.ok(Array.isArray(answer.searched));
    assert.ok(answer.searched.every((entry) => typeof entry.path === 'string' && typeof entry.readable === 'boolean'));
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C001 the detector writes nothing: the tree is byte-identical before and after', () => {
  withScratch('px256-det-', (root) => {
    const sourcePath = path.join(root, SOURCE_ARTIFACT_NAME);
    fs.writeFileSync(sourcePath, SOURCE_ARTIFACT_TEXT);
    const packageDir = makeGrillSession(path.join(root, 'pkg'), { material: [sourcePath] });
    const sessionDir = makeDrillSession(packageDir);
    const before = digestDirectory(root);
    runDetector(packageDir);
    runDetector(packageDir, { sessionDir });
    assert.deepEqual(digestDirectory(root), before);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C004 a drill session record is searched first and the RFC_DIR record second', () => {
  withScratch('px256-det-', (root) => {
    const packageDir = makeGrillSession(path.join(root, 'pkg'));
    const sessionDir = makeDrillSession(packageDir);
    const result = runDetector(packageDir, { sessionDir });
    assert.equal(result.status, 0);
    assert.deepEqual(result.answer.searched.map((entry) => entry.path), [
      path.join(sessionDir, 'Status.json'),
      path.join(packageDir, 'Status.json'),
    ]);
    assert.equal(result.answer.searched[0].readable, true);
    assert.equal(result.answer.searched[1].readable, true);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C004 a session directory that does not exist is reported unreadable rather than skipped', () => {
  withScratch('px256-det-', (root) => {
    const packageDir = makeGrillSession(path.join(root, 'pkg'));
    const result = runDetector(packageDir, { sessionDir: path.join(packageDir, 'no-such-session') });
    assert.equal(result.status, 0);
    assert.equal(result.answer.searched[0].path, path.join(packageDir, 'no-such-session', 'Status.json'));
    assert.equal(result.answer.searched[0].readable, false);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C004 the drill session record carrying no materialPaths falls through to the view', () => {
  withScratch('px256-det-', (root) => {
    const packageDir = makeGrillSession(path.join(root, 'pkg'));
    const sessionDir = makeDrillSession(packageDir);
    assert.equal(runDetector(packageDir, { sessionDir }).answer.present, false);
    fs.writeFileSync(path.join(packageDir, VIEW_MARKDOWN_NAME), '# sequences\n');
    const found = runDetector(packageDir, { sessionDir });
    assert.equal(found.answer.present, true);
    assert.equal(found.answer.view, path.join(packageDir, VIEW_MARKDOWN_NAME));
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C004 the search order changes nothing a caller can observe when the view exists', () => {
  withScratch('px256-det-', (root) => {
    const packageDir = makeGrillSession(path.join(root, 'pkg'));
    fs.writeFileSync(path.join(packageDir, VIEW_MARKDOWN_NAME), '# sequences\n');
    const sessionDir = makeDrillSession(packageDir);
    const withSession = runDetector(packageDir, { sessionDir }).answer;
    const withoutSession = runDetector(packageDir).answer;
    assert.equal(withSession.present, withoutSession.present);
    assert.equal(withSession.view, withoutSession.view);
    assert.equal(withSession.source, withoutSession.source);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C004 both entry points answer identically, so the two commands cannot diverge', () => {
  withScratch('px256-det-', (root) => {
    const packageDir = makeGrillSession(path.join(root, 'pkg'));
    const sessionDir = makeDrillSession(packageDir);
    fs.writeFileSync(path.join(packageDir, VIEW_MARKDOWN_NAME), '# sequences\n');

    const fromGrill = runDetector(packageDir, { sessionDir, entryPoint: DETECTOR }).answer;
    const fromDrill = runDetector(packageDir, { sessionDir, entryPoint: DRILL_DETECTOR }).answer;
    assert.deepEqual(fromDrill, fromGrill);
    assert.equal(fromDrill.present, true);

    // The drill's Step 1 may call only $DRILL_DIR scripts and may not name the grill, so
    // the shared rule lives in one place and each command owns its own entry point. These
    // two answers being equal is what keeps that from becoming two policies.
    assert.equal(DETECTOR.includes('grill-me-for-rfc'), true);
    assert.equal(DRILL_DETECTOR.includes('drill-rfc-down'), true);
  });
});
