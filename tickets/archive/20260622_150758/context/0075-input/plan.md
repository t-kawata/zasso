# M8-2: input/ モジュール 実装計画

## 要件
voiput crate にクリップボード操作とキーボード注入を行う input/ モジュールを追加する。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
| Cargo.toml | 変更 | arboard = "3" 追加 |
| constants.rs | 変更 | キー入力関連定数6個 + テスト |
| input/mod.rs | 新規 | プラットフォーム分岐 + re-export |
| input/clipboard.rs | 新規 | arboard ラッパー (~145行) |
| input/keyboard_mac.rs | 新規 | CGEvent 注入 (~280行) |
| input/keyboard_win.rs | 新規 | SendInput 注入 (~350行) |
| lib.rs | 変更 | pub mod input 宣言 |

## Boy Scout 改善
- unwrap() → expect() に変更
- 全 unsafe に SAFETY コメント
- 定数一元管理

## テスト計画
16 ユニットテスト

## 実装手順
1. arboard 追加 + 定数追加
2. mod.rs
3. clipboard.rs
4. keyboard_mac.rs
5. keyboard_win.rs
6. lib.rs 更新
7. cargo check + cargo test

## レビュー方法
run-quality-checks.js + grep 翻訳可能性 + make test
