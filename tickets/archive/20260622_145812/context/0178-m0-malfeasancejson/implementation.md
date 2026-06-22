# M0 (#178) 実装サマリ

## 作成したファイル

| ファイル | 内容 |
|---------|------|
| `.claude/scripts/tickets/malfeasance-schema.json` | JSON Schema (draft-07) — Malfeasance.json のスキーマ定義 |
| `.claude/scripts/lib/validate-malfeasance.js` | スキーマ検証ユーティリティ（標準 Node.js のみ） — `validateRecords()`, `validateSingleRecord()`, `validateSchema()` |
| `.claude/scripts/lib/malfeasance-utils.js` | 操作共通ユーティリティ — ファイル読み書き・パス解決・スキーマ検証統括 |
| `.claude/scripts/tickets/malfeasance-create.js` | 新規犯罪レコード作成（重複チェック＋自動採番＋スキーマ検証） |
| `.claude/scripts/tickets/malfeasance-get.js` | ID 指定でレコード取得 |
| `.claude/scripts/tickets/malfeasance-search.js` | 条件検索（フィールド指定・全フィールド部分一致） |
| `.claude/scripts/tickets/malfeasance-all.js` | 全件取得（status フィルタ付き） |
| `.claude/scripts/tickets/malfeasance-update.js` | レコード更新（ホワイトリスト＋自動 resolved_at） |
| `.claude/scripts/tickets/malfeasance-delete.js` | レコード削除（確認プロンプト必須） |
| `.claude/scripts/tickets/tests/malfeasance/test-malfeasance.js` | 統合テスト（38 ケース） |

## 修正したファイル

| ファイル | 内容 |
|---------|------|
| `.claude/scripts/tickets/README.md` | Malfeasance 操作スクリプトセクションを追加（カテゴリ一覧＋詳細ドキュメント） |
| `tickets/specs/0178-m0-malfeasancejson.md` | 調査結果セクションに実装時現状を記録 |

## 特記事項

- **ajv 未使用**: プロジェクトに npm 依存がないため、スキーマ検証はカスタムバリデータを自前実装
- **全テスト通過**: 38/38 passed（validate-malfeasance.js 13 件 + 統合テスト 25 件）
- **品質チェック**: console.log の指摘 1 件は意図的な JSON 出力機構（output() 関数）のため false positive
- **パス修正**: malfeasance-utils.js の __dirname 解決を 2 階層に修正（scripts/lib/ → .claude/）
