/**
 * malfeasance-all.js — Malfeasance.json の全件取得
 *
 * 使用法:
 *   node malfeasance-all.js [filter]
 *
 * 引数:
 *   filter (任意): "open" | "resolved" | "false_positive" | 省略時=全件
 *
 * 出力:
 *   { "success": true, "count": N, "records": [...] }
 */

const { loadRecords, checkSchema, output } = require('../lib/malfeasance-utils');

function main() {
  // スキーマファイルの確認（事前チェック）
  const schemaCheck = checkSchema();
  if (!schemaCheck.success) {
    output({ success: false, error: schemaCheck.error });
    return;
  }

  // データ読み込み
  const loaded = loadRecords();
  if (!loaded.success) {
    output({ success: false, error: loaded.error });
    return;
  }

  const filter = process.argv[2];
  const allowedFilters = ['open', 'resolved', 'false_positive'];

  let filtered = loaded.data.records;
  if (filter) {
    if (!allowedFilters.includes(filter)) {
      output({ success: false, error: `Invalid filter "${filter}". Allowed: ${allowedFilters.join(', ')}` });
      return;
    }
    filtered = loaded.data.records.filter(r => r.status === filter);
  }

  output({ success: true, count: filtered.length, records: filtered });
}

if (require.main === module) main();
