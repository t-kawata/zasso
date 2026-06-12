# 計画: M6-1.6 Windows: libs/windows/ ランタイムライブラリ収集

## 要件の再確認

spec で定義された 3 つの課題を解決する:
1. `find_system_dll()` の VS redist 探索パス修正（`x64/Microsoft.VC145.CRT/` 対応）
2. 変数名の明確化（Boy Scout）
3. `target_dir` パス解決の意図をコメント化

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/voiput/build.rs` | 修正 | `find_system_dll()` の VS redist 探索パス修正、変数名改善、コメント追加 |

1ファイルのみの変更。

## Boy Scout 改善

| ファイル | 行 | 現状 | 修正 |
|---------|---|------|------|
| build.rs:786 | 変数名 candidate | system32_path に改名 |
| build.rs:802 | 変数名 candidate | redist_path に改名 |
| build.rs:727-728 | コメントなし | target_dir パス解決の意図コメントを追加 |
| build.rs:791-803 | x64 直下のみ探索 | x64/Microsoft.VC145.CRT/ まで降りて探索 |

## テスト計画

### 検証手順
1. cargo test → 111 tests passed
2. ls libs/windows/ → 6 必須 DLL 全て存在
3. VS redist 探索パスの動作確認（デバッグログ一時追加→確認後削除）
4. cargo clean -p voiput && cargo check が通る

### ユニットテスト不可能な項目
- build.rs の関数は cargo test で実行不可（Rust アーキテクチャ上の制約）
- VS redist 探索パスの全パターン網羅は不可能

## 実装手順

1. find_system_dll() の VS redist 探索ロジック修正
2. collect_runtime_libs_windows() の target_dir に説明コメント追加
3. テスト: cargo test / cargo check / cargo run --bin test-run

## 物理的レビュー方法

1. run-quality-checks.js でコード品質チェック
2. 翻訳可能性 grep: 変数名 candidate が残っていないか
3. cargo check 通過
4. cargo test 通過（111 tests）
5. cargo run --bin test-run 全セクション正常動作

## リスク

- なし（新たなリスクの追加なし、現状と同じ挙動の範囲内）
