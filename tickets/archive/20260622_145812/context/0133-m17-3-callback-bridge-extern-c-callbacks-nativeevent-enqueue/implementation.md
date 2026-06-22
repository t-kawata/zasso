# M17-3: Callback bridge — 実装サマリ

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/ffi/callbacks.rs` | 新規 | NativeEvent(16 variant) + PjsuaCallback(14 fields) + global_runtime(OnceLock+Mutex) + catch_callback_panic + enqueue_native_event + register_callbacks + 13 extern "C" functions + 9 tests |
| `src/ffi/mod.rs` | 変更 | pub mod callbacks; 追加 |
| `src/runtime/reactor.rs` | 変更 | spawn() 内で set_global_runtime() 呼び出し |
| `src/runtime/handle.rs` | 変更 | #[derive(Debug)] 追加（callback 橋渡し用） |
| `src/client.rs` | 変更 | テストに clear_global_runtime() 追加（並列実行対策） |

## 検証結果
- ✅ `cargo check -p siprs` — 成功（dead_code は #![allow] で許容）
- ✅ `cargo test` — 369 PASS（360→369、+9 テスト）
- ✅ `cargo fmt --check` — 通過
- ✅ 品質チェック — 4 issues（全て Mutex::lock().unwrap()、標準パターンのため許容）
- ✅ 翻訳可能性 — 1文字変数/マジックナンバー/デバッグ出力なし

## 主要コンポーネント
1. **NativeEvent**: 16 variant の内部イベント enum（Debug + Clone）
2. **global_runtime**: OnceLock<Mutex<Option<RuntimeHandle>>> によるスレッドセーフなグローバルアクセス
3. **catch_callback_panic**: catch_unwind ラッパー（パニック時 tracing::error 出力）
4. **PjsuaCallback**: 14 フィールドの #[repr(C)] 手動定義構造体
5. **register_callbacks**: 全 14 callback の関数ポインタ設定
6. **extern "C" 関数**: 13 個の callback 実装（一部引数は M17-4 で具体化）
7. **9 テスト**: NativeEvent / catch_unwind / register_callbacks / global_runtime / レイアウト確認

## 既知の制約
- §46.1 4 ステップクリーンアップはパニック捕捉まで実装。完全な cleanup は M17-4
- on_call_state, on_nat_detect 等の引数展開は M17-4 で具体化（[::STUB::] マーカー記載）
- 未対応 callback（on_mwi_info, on_pager 等）は MVP 範囲外
