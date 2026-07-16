/**
 * Malfeasance 操作スクリプト統合テスト
 *
 * テスト用の一時データを CWD の Malfeasance.json に配置し、
 * 各操作スクリプトを子プロセスとして実行して出力 JSON を検証する。
 * テスト終了後は元の状態に復元する。
 *
 * 使用法:
 *   node tests/malfeasance/test-malfeasance.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ============================================================
// パス設定
// ============================================================

const SCRIPTS_DIR = path.resolve(__dirname, '../..');
const LIB_DIR = path.resolve(__dirname, '../../../lib');
const MALFEASANCE_PATH = path.resolve(process.cwd(), 'Malfeasance.json');

// バックアップとテストデータ
const BACKUP_PATH = MALFEASANCE_PATH + '.bak';

// テスト結果集計
let passed = 0;
let failed = 0;
const failures = [];

// ============================================================
// ヘルパー
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
// テストケース
// ============================================================

function runAllTests() {
  console.log('\n=== Malfeasance Operation Script Tests ===\n');

  // ---- validate-malfeasance.js の直接テスト ----
  console.log('[validate-malfeasance.js]');
  const { validateRecords, validateSchema } = require(path.join(LIB_DIR, 'validate-malfeasance'));

  assert('正常な空データは valid', () => {
    const r = validateRecords({ version: 1, records: [] });
    if (!r.valid) throw new Error(`Expected valid, got: ${r.errors.join(', ')}`);
  });

  assert('正常なレコードは valid', () => {
    const r = validateRecords({
      version: 1,
      records: [{
        id: 1, file: 'src/main.rs', line: 42,
        description: 'テスト犯罪', detected_at: '2026-06-21T12:00:00.000Z',
        status: 'open',
      }],
    });
    if (!r.valid) throw new Error(`Expected valid, got: ${r.errors.join(', ')}`);
  });

  assert('不正な status は invalid', () => {
    const r = validateRecords({
      version: 1,
      records: [{
        id: 1, file: 'a', line: 1, description: 'd',
        detected_at: '2026-06-21T12:00:00.000Z', status: 'invalid_status',
      }],
    });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('id フィールド欠落は invalid', () => {
    const r = validateRecords({
      version: 1,
      records: [{
        file: 'a', line: 1, description: 'd',
        detected_at: '2026-06-21T12:00:00.000Z', status: 'open',
      }],
    });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('status=resolved で resolved_at なしは invalid', () => {
    const r = validateRecords({
      version: 1,
      records: [{
        id: 1, file: 'a', line: 1, description: 'd',
        detected_at: '2026-06-21T12:00:00.000Z', status: 'resolved',
      }],
    });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('status=resolved で resolved_at ありは valid', () => {
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

  assert('不正な日付形式は invalid', () => {
    const r = validateRecords({
      version: 1,
      records: [{
        id: 1, file: 'a', line: 1, description: 'd',
        detected_at: 'not-a-date', status: 'open',
      }],
    });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('version が 0 は invalid', () => {
    const r = validateRecords({ version: 0, records: [] });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('重複 ID は invalid', () => {
    const r = validateRecords({
      version: 1,
      records: [
        { id: 1, file: 'a', line: 1, description: 'd1', detected_at: '2026-06-21T12:00:00.000Z', status: 'open' },
        { id: 1, file: 'b', line: 2, description: 'd2', detected_at: '2026-06-21T12:00:00.000Z', status: 'open' },
      ],
    });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('version 不足は invalid', () => {
    const r = validateRecords({ records: [] });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('records 不足は invalid', () => {
    const r = validateRecords({ version: 1 });
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('null ルートは invalid', () => {
    const r = validateRecords(null);
    if (r.valid) throw new Error('Expected invalid');
  });

  assert('validSchema: 正常なスキーマは valid', () => {
    const r = validateSchema({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
    });
    if (!r.valid) throw new Error(`Expected valid, got: ${r.errors.join(', ')}`);
  });

  // ---- ensure-malfeasance.js のテスト ----
  console.log('\n[ensure-malfeasance.js]');

  (function testEnsure() {
    const ENSURE_SCRIPT = path.join(SCRIPTS_DIR, 'ensure-malfeasance.js');
    if (!fs.existsSync(ENSURE_SCRIPT)) {
      console.log('  ⚠ ensure-malfeasance.js not found, skipping');
      return;
    }

    backupRealDb();

    try {
      // テスト1: 存在しない場合 → 作成
      if (fs.existsSync(MALFEASANCE_PATH)) {
        fs.unlinkSync(MALFEASANCE_PATH);
      }

      assert('ensure: 不在時 → action=created', () => {
        const child = spawnSync('node', [ENSURE_SCRIPT], { encoding: 'utf8', timeout: 5000 });
        const r = JSON.parse(child.stdout.trim());
        if (!r.success || r.action !== 'created') throw new Error(`Expected created, got: ${JSON.stringify(r)}`);
        if (!fs.existsSync(MALFEASANCE_PATH)) throw new Error('File was not created');
        const content = JSON.parse(fs.readFileSync(MALFEASANCE_PATH, 'utf8'));
        if (content.version !== 1 || !Array.isArray(content.records) || content.records.length !== 0) {
          throw new Error(`Expected {version:1, records:[]}, got: ${JSON.stringify(content)}`);
        }
      });

      // テスト2: 既存の場合 → スキップ
      assert('ensure: 既存時 → action=skipped', () => {
        const child = spawnSync('node', [ENSURE_SCRIPT], { encoding: 'utf8', timeout: 5000 });
        const r = JSON.parse(child.stdout.trim());
        if (!r.success || r.action !== 'skipped') throw new Error(`Expected skipped, got: ${JSON.stringify(r)}`);
        // 内容が変更されていないこと
        const content = JSON.parse(fs.readFileSync(MALFEASANCE_PATH, 'utf8'));
        if (content.version !== 1) throw new Error(`Content was modified!`);
      });

      // テスト3: スキーマ不在時 → エラー
      assert('ensure: スキーマ不在 → エラー', () => {
        const schemaPath = path.join(SCRIPTS_DIR, '..', '..', 'scripts', 'tickets', 'malfeasance-schema.json');
        // スキーマを退避
        const schemaTmp = schemaPath + '.tmp';
        if (fs.existsSync(schemaPath)) {
          fs.renameSync(schemaPath, schemaTmp);
        }
        try {
          const child = spawnSync('node', [ENSURE_SCRIPT], { encoding: 'utf8', timeout: 5000 });
          const r = JSON.parse(child.stdout.trim());
          if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
        } finally {
          // スキーマを復元
          if (fs.existsSync(schemaTmp)) {
            fs.renameSync(schemaTmp, schemaPath);
          }
        }
      });
    } finally {
      restoreRealDb();
    }
  })();

  // ---- 操作スクリプトの統合テスト ----
  // 実DBをバックアップし、テストデータで置き換え
  console.log('\n[Operation Script Integration Test]');
  backupRealDb();

  try {
    // 空のテストDBで開始
    writeTestDb([]);

    // malfeasance-all.js
    console.log('  [malfeasance-all.js]');

    assert('all: 空DBで全件取得 → count=0', () => {
      const r = runScript('malfeasance-all.js', []);
      if (!r.success || r.count !== 0) throw new Error(`Expected success+count=0, got: ${JSON.stringify(r)}`);
    });

    assert('all: 不正フィルタでエラー', () => {
      const r = runScript('malfeasance-all.js', ['invalid']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    // malfeasance-create.js
    console.log('  [malfeasance-create.js]');

    assert('create: 正常作成', () => {
      const r = runScript('malfeasance-create.js', ['src/test.rs', '10', 'テスト犯罪です']);
      if (!r.success || !r.record || r.record.id !== 1) throw new Error(`Expected success+id=1, got: ${JSON.stringify(r)}`);
    });

    assert('create: 2件目作成 → id=2', () => {
      const r = runScript('malfeasance-create.js', ['src/test2.rs', '20', '2件目の犯罪']);
      if (!r.success || r.record.id !== 2) throw new Error(`Expected success+id=2, got: ${JSON.stringify(r)}`);
    });

    assert('create: 同一ファイル+同一行の重複 → エラー', () => {
      const r = runScript('malfeasance-create.js', ['src/test.rs', '10', '重複犯罪']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('create: 引数不足 → エラー', () => {
      const r = runScript('malfeasance-create.js', ['src/test.rs']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('create: note 付き作成', () => {
      const r = runScript('malfeasance-create.js', ['src/test3.rs', '30', 'note付き', 'これは備考です']);
      if (!r.success || r.record.note !== 'これは備考です') throw new Error(`Expected note, got: ${JSON.stringify(r)}`);
    });

    // malfeasance-get.js
    console.log('  [malfeasance-get.js]');

    assert('get: 存在するID → 取得成功', () => {
      const r = runScript('malfeasance-get.js', ['1']);
      if (!r.success || !r.record || r.record.id !== 1) throw new Error(`Expected record id=1, got: ${JSON.stringify(r)}`);
    });

    assert('get: 存在しないID → Record not found', () => {
      const r = runScript('malfeasance-get.js', ['999']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('get: 引数なし → エラー', () => {
      const r = runScript('malfeasance-get.js', []);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    // malfeasance-search.js
    console.log('  [malfeasance-search.js]');

    assert('search: status=open 検索', () => {
      const r = runScript('malfeasance-search.js', ['status', 'open']);
      if (!r.success || r.count < 3) throw new Error(`Expected count>=3, got: ${JSON.stringify(r)}`);
    });

    assert('search: file 部分一致', () => {
      const r = runScript('malfeasance-search.js', ['file', 'test2']);
      if (!r.success || r.count !== 1) throw new Error(`Expected count=1, got: ${JSON.stringify(r)}`);
    });

    assert('search: キー省略（全フィールド検索）', () => {
      const r = runScript('malfeasance-search.js', ['', 'テスト犯罪']);
      if (!r.success || r.count < 1) throw new Error(`Expected count>=1, got: ${JSON.stringify(r)}`);
    });

    assert('search: id 完全一致', () => {
      const r = runScript('malfeasance-search.js', ['id', '2']);
      if (!r.success || r.count !== 1 || r.records[0].id !== 2) throw new Error(`Expected id=2, got: ${JSON.stringify(r)}`);
    });

    // malfeasance-update.js
    console.log('  [malfeasance-update.js]');

    assert('update: status 変更 open→resolved', () => {
      const r = runScript('malfeasance-update.js', ['1', 'status', 'resolved']);
      if (!r.success || r.record.status !== 'resolved') throw new Error(`Expected resolved, got: ${JSON.stringify(r)}`);
      if (!r.record.resolved_at) throw new Error(`Expected resolved_at to be auto-set, got: ${JSON.stringify(r)}`);
    });

    assert('update: 存在しないID → エラー', () => {
      const r = runScript('malfeasance-update.js', ['999', 'status', 'resolved']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('update: 禁止フィールド（id）→ エラー', () => {
      const r = runScript('malfeasance-update.js', ['1', 'id', '999']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('update: resolved_at 単独設定 → エラー', () => {
      const r = runScript('malfeasance-update.js', ['1', 'resolved_at', '2026-01-01T00:00:00Z']);
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('update: note 更新', () => {
      const r = runScript('malfeasance-update.js', ['2', 'note', '更新された備考']);
      if (!r.success || r.record.note !== '更新された備考') throw new Error(`Expected note updated, got: ${JSON.stringify(r)}`);
    });

    assert('update: resolved_by_ticket 設定', () => {
      const r = runScript('malfeasance-update.js', ['2', 'resolved_by_ticket', '178']);
      if (!r.success || r.record.resolved_by_ticket !== 178) throw new Error(`Expected resolved_by_ticket=178, got: ${JSON.stringify(r)}`);
    });

    // malfeasance-delete.js
    console.log('  [malfeasance-delete.js]');

    assert('delete: 削除確認キャンセル → エラー', () => {
      const r = runScript('malfeasance-delete.js', ['3'], 'n\n');
      if (r.success !== false) throw new Error(`Expected error (cancelled), got: ${JSON.stringify(r)}`);
    });

    assert('delete: 存在しないID → エラー', () => {
      const r = runScript('malfeasance-delete.js', ['999'], 'y\n');
      if (r.success !== false) throw new Error(`Expected error, got: ${JSON.stringify(r)}`);
    });

    assert('delete: 正常削除', () => {
      const r = runScript('malfeasance-delete.js', ['3'], 'y\n');
      if (!r.success || !r.deleted || r.deleted.id !== 3) throw new Error(`Expected deleted id=3, got: ${JSON.stringify(r)}`);
      // 削除後に id=3 が存在しないことを確認
      const getResult = runScript('malfeasance-get.js', ['3']);
      if (getResult.success !== false) throw new Error('Expected get after delete to fail');
    });

    // malfeasance-all フィルタリング
    console.log('  [malfeasance-all.js filtered]');

    assert('all: filter=resolved → 解決済みのみ', () => {
      const r = runScript('malfeasance-all.js', ['resolved']);
      if (!r.success || r.count < 1) throw new Error(`Expected count>=1 (resolved), got: ${JSON.stringify(r)}`);
      const allResolved = r.records.every(rec => rec.status === 'resolved');
      if (!allResolved) throw new Error('Not all records have status=resolved');
    });

    assert('all: filter=open → 未解決のみ', () => {
      const r = runScript('malfeasance-all.js', ['open']);
      if (!r.success || r.count < 1) throw new Error(`Expected count>=1 (open), got: ${JSON.stringify(r)}`);
      const allOpen = r.records.every(rec => rec.status === 'open');
      if (!allOpen) throw new Error('Not all records have status=open');
    });

  } finally {
    // 必ず元の状態に復元
    restoreRealDb();
  }

  // ---- 結果表示 ----
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
