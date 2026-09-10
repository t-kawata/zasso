/**
 * Integration tests for malfeasance operation scripts
 *
 * Places temporary data in CWD's Malfeasance.json, executes each
 * operation script as a child process, and validates the output JSON.
 * Restores original state after tests complete.
 *
 * Usage:
 *   node tests/malfeasance/test-malfeasance.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ============================================================
// Path configuration
// ============================================================

const SCRIPTS_DIR = path.resolve(__dirname, '../..');
const LIB_DIR = path.resolve(__dirname, '../../../lib');
const MALFEASANCE_PATH = path.resolve(process.cwd(), 'Malfeasance.json');

// Backup and test data
const BACKUP_PATH = MALFEASANCE_PATH + '.bak';

// Test result aggregation
let passed = 0;
let failed = 0;
const failures = [];

// ============================================================
// Helpers
// ============================================================

function assert(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

function runScript(scriptName, args, stdin) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const child = spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
    input: stdin || undefined,
    timeout: 5000,
  });

  if (child.error) {
    throw new Error(`${scriptName} execution error: ${child.error.message}. stderr: ${child.stderr}`);
  }

  const trimmed = child.stdout.trim();
  if (!trimmed) {
    throw new Error(`${scriptName} produced no output. stderr: ${child.stderr}`);
  }

  try {
    return JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`Failed to parse output from ${scriptName}: ${trimmed.slice(0, 500)}`);
  }
}

function writeTestDb(records) {
  const data = { version: 1, records };
  fs.writeFileSync(MALFEASANCE_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function readTestDb() {
  return JSON.parse(fs.readFileSync(MALFEASANCE_PATH, 'utf8'));
}

function backupRealDb() {
  if (fs.existsSync(MALFEASANCE_PATH)) {
    fs.copyFileSync(MALFEASANCE_PATH, BACKUP_PATH);
  }
}

function restoreRealDb() {
  if (fs.existsSync(BACKUP_PATH)) {
    fs.copyFileSync(BACKUP_PATH, MALFEASANCE_PATH);
    fs.unlinkSync(BACKUP_PATH);
  } else if (fs.existsSync(MALFEASANCE_PATH)) {
    fs.unlinkSync(MALFEASANCE_PATH);
  }
}

// ============================================================
// Test cases
// ============================================================

function runAllTests() {
  console.log('\n=== Malfeasance operation scripts test ===\n');

  // ---- Direct tests for validate-malfeasance.js ----
  console.log('[validate-malfeasance.js]');
  const { validateRecords, validateSchema } = require(path.join(LIB_DIR, 'validate-malfeasance'));

  assert('valid empty data is valid', () => {
    const r = validateRecords({ version: 1, records: [] });
    if (!r.valid) throw new Error(`Expected valid, got: ${r.errors.join(', ')}`);
  });

  assert('valid record is valid', () => {
    const r = validateRecords({
      version: 1,
      records: [{
        id: 1, file: 'src/main.rs', line: 42,
        description: 'test crime', detected_at: '2026-06-21T12:00:00.000Z',
        status: 'open',
      }],
    });
    if (!r.valid) throw new Error(`Expected valid, got: ${r.errors.join(', ')}`);
  });

  assert('invalid status is invalid', () => {
    const r = validateRecords({
      version: 1,
      records: [{
        id: 1, file: 'a', line: 1, description: 'd',
        detected_at: '2026-06-21T12:00:00.000Z', status: 'invalid_status',
      }],
    });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('missing id field is invalid', () => {
    const r = validateRecords({
      version: 1,
      records: [{
        file: 'a', line: 1, description: 'd',
        detected_at: '2026-06-21T12:00:00.000Z', status: 'open',
      }],
    });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('status=resolved without resolved_at is invalid', () => {
    const r = validateRecords({
      version: 1,
      records: [{
        id: 1, file: 'a', line: 1, description: 'd',
        detected_at: '2026-06-21T12:00:00.000Z', status: 'resolved',
      }],
    });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('status=resolved with resolved_at is valid', () => {
    const r = validateRecords({
      version: 1,
      records: [{
        id: 1, file: 'a', line: 1, description: 'd',
        detected_at: '2026-06-21T12:00:00.000Z', status: 'resolved',
        resolved_at: '2026-06-21T14:00:00.000Z',
      }],
    });
    if (!r.valid) throw new Error(`Expected valid, got: ${r.errors.join(', ')}`);
  });

  assert('invalid date format is invalid', () => {
    const r = validateRecords({
      version: 1,
      records: [{
        id: 1, file: 'a', line: 1, description: 'd',
        detected_at: 'not-a-date', status: 'open',
      }],
    });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('version 0 is invalid', () => {
    const r = validateRecords({ version: 0, records: [] });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('duplicate ID is invalid', () => {
    const r = validateRecords({
      version: 1,
      records: [
        { id: 1, file: 'a', line: 1, description: 'd1', detected_at: '2026-06-21T12:00:00.000Z', status: 'open' },
        { id: 1, file: 'b', line: 2, description: 'd2', detected_at: '2026-06-21T12:00:00.000Z', status: 'open' },
      ],
    });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('missing version is invalid', () => {
    const r = validateRecords({ records: [] });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('missing records is invalid', () => {
    const r = validateRecords({ version: 1 });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('null root is invalid', () => {
    const r = validateRecords(null);
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('validSchema: valid schema is valid', () => {
    const r = validateSchema({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
    });
    if (!r.valid) throw new Error(`Expected valid, got: ${r.errors.join(', ')}`);
  });

  // ---- Tests for ensure-malfeasance.js ----
  console.log('\n[ensure-malfeasance.js]');

  (function testEnsure() {
    const ENSURE_SCRIPT = path.join(SCRIPTS_DIR, 'ensure-malfeasance.js');
    if (!fs.existsSync(ENSURE_SCRIPT)) {
      console.log('  ⚠ ensure-malfeasance.js not found, skipping');
      return;
    }

    backupRealDb();

    try {
      // Test 1: not found → create
      if (fs.existsSync(MALFEASANCE_PATH)) {
        fs.unlinkSync(MALFEASANCE_PATH);
      }

      assert('ensure: not found → action=created', () => {
        const child = spawnSync('node', [ENSURE_SCRIPT], { encoding: 'utf8', timeout: 5000 });
        const r = JSON.parse(child.stdout.trim());
        if (!r.success || r.action !== 'created') throw new Error(`Expected created, got: ${JSON.stringify(r)}`);
        if (!fs.existsSync(MALFEASANCE_PATH)) throw new Error('File was not created');
        const content = JSON.parse(fs.readFileSync(MALFEASANCE_PATH, 'utf8'));
        if (content.version !== 1 || !Array.isArray(content.records) || content.records.length !== 0) {
          throw new Error(`Expected {version:1, records:[]}, got: ${JSON.stringify(content)}`);
        }
      });

      // Test 2: existing → skip
      assert('ensure: existing → action=skipped', () => {
        const child = spawnSync('node', [ENSURE_SCRIPT], { encoding: 'utf8', timeout: 5000 });
        const r = JSON.parse(child.stdout.trim());
        if (!r.success || r.action !== 'skipped') throw new Error(`Expected skipped, got: ${JSON.stringify(r)}`);
        // Verify content was not modified
        const content = JSON.parse(fs.readFileSync(MALFEASANCE_PATH, 'utf8'));
        if (content.version !== 1) throw new Error(`Content was modified!`);
      });

      // Test 3: schema missing → error
      assert('ensure: schema missing → error', () => {
        const schemaPath = path.join(SCRIPTS_DIR, '..', '..', 'scripts', 'tickets', 'malfeasance-schema.json');
        // Save schema temporarily
        const schemaTmp = schemaPath + '.tmp';
        if (fs.existsSync(schemaPath)) {
          fs.renameSync(schemaPath, schemaTmp);
        }
        try {
          const child = spawnSync('node', [ENSURE_SCRIPT], { encoding: 'utf8', timeout: 5000 });
          const r = JSON.parse(child.stdout.trim());
          if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
        } finally {
          // Restore schema
          if (fs.existsSync(schemaTmp)) {
            fs.renameSync(schemaTmp, schemaPath);
          }
        }
      });
    } finally {
      restoreRealDb();
    }
  })();

  // ---- Integration tests for operation scripts ----
  // Backup real DB and replace with test data
  console.log('\n[Operation script integration tests]');
  backupRealDb();

  try {
    // Start with empty test DB
    writeTestDb([]);

    // malfeasance-all.js
    console.log('  [malfeasance-all.js]');

    assert('all: empty DB returns count=0', () => {
      const r = runScript('malfeasance-all.js', []);
      if (!r.success || r.count !== 0) throw new Error(`Expected success+count=0, got: ${JSON.stringify(r)}`);
    });

    assert('all: invalid filter returns error', () => {
      const r = runScript('malfeasance-all.js', ['invalid']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    // malfeasance-create.js
    console.log('  [malfeasance-create.js]');

    assert('create: normal creation', () => {
      const r = runScript('malfeasance-create.js', ['src/test.rs', '10', 'test crime']);
      if (!r.success || !r.record || r.record.id !== 1) throw new Error(`Expected success+id=1, got: ${JSON.stringify(r)}`);
    });

    assert('create: second item → id=2', () => {
      const r = runScript('malfeasance-create.js', ['src/test2.rs', '20', 'second crime']);
      if (!r.success || r.record.id !== 2) throw new Error(`Expected success+id=2, got: ${JSON.stringify(r)}`);
    });

    assert('create: duplicate file+line → error', () => {
      const r = runScript('malfeasance-create.js', ['src/test.rs', '10', 'duplicate crime']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('create: missing arguments → error', () => {
      const r = runScript('malfeasance-create.js', ['src/test.rs']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('create: creation with note', () => {
      const r = runScript('malfeasance-create.js', ['src/test3.rs', '30', 'with note', 'this is a note']);
      if (!r.success || r.record.note !== 'this is a note') throw new Error(`Expected note, got: ${JSON.stringify(r)}`);
    });

    // malfeasance-get.js
    console.log('  [malfeasance-get.js]');

    assert('get: existing ID returns success', () => {
      const r = runScript('malfeasance-get.js', ['1']);
      if (!r.success || !r.record || r.record.id !== 1) throw new Error(`Expected record id=1, got: ${JSON.stringify(r)}`);
    });

    assert('get: non-existent ID returns Record not found', () => {
      const r = runScript('malfeasance-get.js', ['999']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('get: missing argument → error', () => {
      const r = runScript('malfeasance-get.js', []);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    // malfeasance-search.js
    console.log('  [malfeasance-search.js]');

    assert('search: status=open query', () => {
      const r = runScript('malfeasance-search.js', ['status', 'open']);
      if (!r.success || r.count < 3) throw new Error(`Expected count>=3, got: ${JSON.stringify(r)}`);
    });

    assert('search: file partial match', () => {
      const r = runScript('malfeasance-search.js', ['file', 'test2']);
      if (!r.success || r.count !== 1) throw new Error(`Expected count=1, got: ${JSON.stringify(r)}`);
    });

    assert('search: key omitted (all fields search)', () => {
      const r = runScript('malfeasance-search.js', ['', 'test crime']);
      if (!r.success || r.count < 1) throw new Error(`Expected count>=1, got: ${JSON.stringify(r)}`);
    });

    assert('search: id exact match', () => {
      const r = runScript('malfeasance-search.js', ['id', '2']);
      if (!r.success || r.count !== 1 || r.records[0].id !== 2) throw new Error(`Expected id=2, got: ${JSON.stringify(r)}`);
    });

    // malfeasance-update.js
    console.log('  [malfeasance-update.js]');

    assert('update: status change open→resolved', () => {
      const r = runScript('malfeasance-update.js', ['1', 'status', 'resolved']);
      if (!r.success || r.record.status !== 'resolved') throw new Error(`Expected resolved, got: ${JSON.stringify(r)}`);
      if (!r.record.resolved_at) throw new Error(`Expected resolved_at to be auto-set, got: ${JSON.stringify(r)}`);
    });

    assert('update: non-existent ID → error', () => {
      const r = runScript('malfeasance-update.js', ['999', 'status', 'resolved']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('update: forbidden field (id) → error', () => {
      const r = runScript('malfeasance-update.js', ['1', 'id', '999']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('update: resolved_at alone → error', () => {
      const r = runScript('malfeasance-update.js', ['1', 'resolved_at', '2026-01-01T00:00:00Z']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('update: note update', () => {
      const r = runScript('malfeasance-update.js', ['2', 'note', 'updated note']);
      if (!r.success || r.record.note !== 'updated note') throw new Error(`Expected note updated, got: ${JSON.stringify(r)}`);
    });

    assert('update: resolved_by_ticket set', () => {
      const r = runScript('malfeasance-update.js', ['2', 'resolved_by_ticket', '178']);
      if (!r.success || r.record.resolved_by_ticket !== 178) throw new Error(`Expected resolved_by_ticket=178, got: ${JSON.stringify(r)}`);
    });

    // malfeasance-delete.js
    console.log('  [malfeasance-delete.js]');

    assert('delete: confirmation cancelled → error', () => {
      const r = runScript('malfeasance-delete.js', ['3'], 'n\n');
      if (r.success !== false) throw new Error(`Expected error (cancelled), got: ${JSON.stringify(r)}`);
    });

    assert('delete: non-existent ID → error', () => {
      const r = runScript('malfeasance-delete.js', ['999'], 'y\n');
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('delete: normal deletion', () => {
      const r = runScript('malfeasance-delete.js', ['3'], 'y\n');
      if (!r.success || !r.deleted || r.deleted.id !== 3) throw new Error(`Expected deleted id=3, got: ${JSON.stringify(r)}`);
      // Verify id=3 no longer exists after deletion
      const getResult = runScript('malfeasance-get.js', ['3']);
      if (getResult.success !== false) throw new Error('Expected get after delete to fail');
    });

    // malfeasance-all filtering
    console.log('  [malfeasance-all.js filtered]');

    assert('all: filter=resolved → resolved only', () => {
      const r = runScript('malfeasance-all.js', ['resolved']);
      if (!r.success || r.count < 1) throw new Error(`Expected count>=1 (resolved), got: ${JSON.stringify(r)}`);
      const allResolved = r.records.every(rec => rec.status === 'resolved');
      if (!allResolved) throw new Error('Not all records have status=resolved');
    });

    assert('all: filter=open → open only', () => {
      const r = runScript('malfeasance-all.js', ['open']);
      if (!r.success || r.count < 1) throw new Error(`Expected count>=1 (open), got: ${JSON.stringify(r)}`);
      const allOpen = r.records.every(rec => rec.status === 'open');
      if (!allOpen) throw new Error('Not all records have status=open');
    });

  } finally {
    // Always restore original state
    restoreRealDb();
  }

  // ---- Display results ----
  console.log('\n==============================');
  console.log(`Result: ${passed} passed, ${failed} failed`);
  console.log('==============================\n');

  if (failures.length > 0) {
    console.error('Failures:');
    failures.forEach(f => console.error(`  - ${f.name}: ${f.error}`));
    process.exit(1);
  }
}

runAllTests();
