# レビュー報告書: チケット #1 — EventBus 分割 + account_id routing

## 1. 静的品質チェック ✅

`run-quality-checks.js` で検出された issues は全て既存コード（テスト内の unwrap/expect）に起因するもの。
新規追加コードには品質問題なし。

## 2. 構造整合性チェック ✅

`validate-structure.js` → valid: true, issues: 0

## 3. 翻訳可能性チェック ✅

- 新規関数名: すべて動詞句またはコンストラクタとして適切
  - `register()`, `map_account()`, `unmap_account()`, `sender_for()`, `dispatch()`, `control_sender()`, `register_event_bus()`, `new_attached()`
- 新規変数: 汎用名なし、1文字変数なし
- マジックナンバー: なし
- デバッグ出力: なし
- コメント: 「なぜ」を説明（「何を」はコード自身が語る）

## 4. テスト検証 ✅

442 tests passed / 0 failed（既存 436 + 新規 6）
- test_router_single_client_backward_compatibility
- test_router_dual_client_event_isolation
- test_router_broadcast_to_all_clients
- test_router_three_or_more_clients
- test_router_unknown_account_falls_back_to_default
- test_register_event_bus_during_shutdown

spec の Test Plan に定義された 6 テストを全て実装。
「ユニットテスト不可能な項目」として spec に記載された 2 項目（PJSIP実配送、複数Client shutdown連携）は未テスト — 正当な例外。

## 5. 犯罪・STUB 検証 ✅

Malfeasance.json: 0 open（犯罪なし）
STUB: 6件 — 4件は他クレート（anthropx/ggufrs）、2件は本チケットで追加したもの（M18 保留）
→ いずれも解決不要（保留妥当）

## 6. 依存関係 ✅

M7-1, M12-1, M20-4, M20-5, M20-6: すべて完了済み。循環依存なし。

## 7. コンパイル ✅

`cargo check --all-targets` → 警告0、エラー0

## 8. Acceptance Criteria 充足状況

| # | Criteria | Status |
|---|----------|--------|
| 1 | 単一 Client 後方互換性 | ✅ router.dispatch() が default_bus に配送する設計で維持 |
| 2 | Dual Client イベント分離 | ✅ test_router_dual_client_event_isolation で確認 |
| 3 | account_id=None broadcast | ✅ test_router_broadcast_to_all_clients で確認 |
| 4 | 独立した receiver | ✅ 各 EventBus が独立した broadcast::Receiver を提供 |
| 5 | 3+ Client | ✅ test_router_three_or_more_clients で確認 |
| 6 | 未登録 account_id → default | ✅ test_router_unknown_account_falls_back_to_default で確認 |
| 7 | 既存全テスト pass | ✅ 436/436 pass |
