# レビュー報告書: #133 M17-3 Callback bridge

## チェック結果一覧
| 項目 | 結果 |
|------|------|
| コンパイル検証 (`cargo check -p siprs`) | ✅ OK（PJSIP スタブ警告のみ） |
| テスト (`cargo test`) | ✅ 369 + 2 doc = 371 PASS |
| メインビルド (`make check-be`) | ✅ OK |
| メインテスト (`make test`) | ✅ 14 PASS |
| 静的品質チェック | ⚠️ 4 issues（全て Mutex::lock().unwrap() — 標準パターンのため許容） |
| 翻訳可能性（関数名） | ✅ 全関数が動詞句（extern "C" は PJSIP 命名規則に従う） |
| 翻訳可能性（1文字変数） | ✅ なし |
| 翻訳可能性（マジックナンバー） | ✅ なし |
| 翻訳可能性（デバッグ出力） | ✅ なし |
| cargo fmt --check | ✅ 通過 |

## Acceptance Criteria 充足状況
- [x] `make check-be` 成功
- [x] `make test` 全 PASS
- [x] `NativeEvent` enum — 全 callback 対応 variant（16）、Debug + Clone 導出
- [x] `catch_callback_panic()` — 正常時 Some、パニック時 None
- [x] `global_runtime()` — 未設定時に panic しない
- [x] `set_global_runtime()` — 二重呼び出しが Err を返す
- [x] `register_callbacks()` — 全 14 フィールドが Some
- [x] PjsuaCallback レイアウト — 14ワード想定どおり
- [x] 9 テスト全 PASS
- [x] cargo fmt --check 通過

## テスト計画充足状況
- テスト 1: test_native_event_debug_clone ✅ 全 14 variant 確認
- テスト 2: test_catch_callback_panic_normal ✅ Some(42)
- テスト 3: test_catch_callback_panic_caught ✅ None
- テスト 4: test_register_callbacks_full ✅ 全フィールド Some
- テスト 5: test_register_callbacks_on_incoming_call ✅ 関数ポインタ一致
- テスト 6: test_global_runtime_set_and_get ✅ Some 確認
- テスト 7: test_global_runtime_double_set ✅ Err
- テスト 8: test_enqueue_native_event_no_runtime ✅ panic なし
- テスト 9: test_pjsua_callback_layout ✅ サイズ 112 bytes

## スタブ評価
既存 7 スタブ（フェーズ7）に加え、本チケットで 2 つの新規スタブを追加:
- callbacks.rs:268 — `[::STUB::] M17-4: pjsip_event から state を抽出`
- callbacks.rs:381 — `[::STUB::] M17-4: 検出結果から展開`
分類: 保留妥当（M17-4 で解決予定）。正しくマーカー付与済み。

## 依存関係クロスチェック
- #131, #132, #110, #98, #103: 全件 reviewed ✅
- 循環依存なし。本チケットの実装順序と整合。
