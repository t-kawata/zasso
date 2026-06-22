# 計画: Windows: sidecar テストが拡張子 .exe で失敗する問題の修正

## 要件
`src-tauri/src/sidecar.rs` のテスト `bifrost_def_program_path_ends_with_bifrost_http` が Windows で失敗する問題を修正する。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `src-tauri/src/sidecar.rs` | 修正 | テスト内 expected_suffix を `binary_filename()` に変更（123行目） |
| 同上 | 更新 | テストコメントを正確な動作に更新（107行目） |
| 同上 | 更新 | エラーメッセージに動的期待値を含める（126行目） |

## Boy Scout 改善（スコープ内）
- ハードコード値 `"bifrost-http"` を `binary_filename()` 呼び出しに置き換え
- コメントを正確な動作を反映する記述に更新
- エラーメッセージに動的期待値を含める

## テスト計画
- 新規テスト追加不要。修正したテスト自体が検証
- Windows: `cargo test --lib -- sidecar` で全テストパス
- Unix: 同コマンドでリグレッションなし確認

## 実装手順
1. expected_suffix を `binary_filename()` で生成するよう修正
2. テストコメントを更新
3. エラーメッセージを動的に
4. `cargo fmt` + `make check-be` でコンパイル確認
5. `cargo test --lib -- sidecar` でテスト確認

## 物理的レビュー方法
- `cargo fmt` → `make check-be` → `cargo test --lib -- sidecar`
- `run-quality-checks.js` による品質チェック

## リスク
- 低: テストコードの1行＋コメントのみの修正。プロダクションコードへの影響なし
