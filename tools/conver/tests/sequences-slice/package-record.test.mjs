// A package record is keyed by the package's path relative to the workspace's package
// root. A caller may hand the projection either an absolute package directory or one
// relative to the workspace root, and both must reach the same record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { packageRecordFor } from '../../.claude/scripts/sequences-slice/lib/project-package.mjs';

const ROOT = path.resolve('/workspace');
const RECORD = { assignments: [{ unit: 'seq-S-1', ground: 'grounded' }] };
const RECORDS = new Map([['protocol/gaia-forum', RECORD]]);

test('an absolute package directory resolves to its record', () => {
  const record = packageRecordFor(RECORDS, ROOT, path.join(ROOT, 'crates/protocol/gaia-forum'));
  assert.equal(record, RECORD);
});

test('a package directory relative to the workspace root resolves to the same record', () => {
  const record = packageRecordFor(RECORDS, ROOT, 'crates/protocol/gaia-forum');
  assert.equal(record, RECORD);
});

test('a package with no record resolves to null rather than an invented entry', () => {
  assert.equal(packageRecordFor(RECORDS, ROOT, 'crates/protocol/gaia-forum-absent'), null);
});
