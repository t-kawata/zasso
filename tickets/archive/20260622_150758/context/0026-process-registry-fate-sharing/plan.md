# 計画: process-registry による宣言的サイドカー管理基盤（Fate Sharing）

## 要件
- src-tauri から process-registry クレートを利用し、ensure_bifrost_binary() 完了後に Bifrost をサイドカーとして起動
- 全サイドカーの定義は sidecar_defs() 関数の Vec<ProcessDef> に宣言的に集約
- アプリと全サイドカーは運命共同体（Fate Sharing）として動作
- 新しいサイドカー追加は sidecar_defs() に ProcessDef エントリ追加のみ

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
| src-tauri/Cargo.toml | 修正 | process-registry を path 依存として追加 |
| src-tauri/src/sidecar.rs | 新規 | サイドカーの ProcessDef を集約する宣言的モジュール |
| src-tauri/src/lib.rs | 修正 | setup() に process-registry 統合追加。mod sidecar, greet 削除 |

## Boy Scout 改善
- src-tauri/src/lib.rs: greet 関数（Tauri スキャフォールド残骸）を削除

## 実装手順
1. Cargo.toml に依存追加
2. sidecar.rs 作成（BIFROST_PORT 定数、sidecar_defs()、テスト6件）
3. lib.rs 修正（mod sidecar, setup() 統合, greet 削除）
4. process-registry 既存テスト実行確認
5. cargo build 確認

## レビュー方法
- run-quality-checks.js
- 翻訳可能性 grep
- 全テストパス確認（procreg 76 + sidecar テスト）
