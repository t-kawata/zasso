# 計画: process-registry ポート競合検出（チケット #27）

## 要件
crates/procreg にポート競合検出を追加し、ReadyCondition::TcpPort のプロセスを spawn する前に、
対象ポートが既に使用中かを確認する。使用中なら RegistryError::PortInUse を返し起動を中断する。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
| crates/procreg/src/error.rs | 修正 | PortInUse バリアント追加 |
| crates/procreg/src/port.rs | 新規 | is_port_free() 関数 + テスト5件 |
| crates/procreg/src/spawn.rs | 修正 | spawn_one() 先頭にポートチェック追加 |
| crates/procreg/src/lib.rs | 修正 | pub mod port; 宣言追加 |

## 実装手順
1. error.rs: PortInUse { host, port } 追加
2. port.rs: is_port_free() + テスト
3. spawn.rs: spawn_one() に if let ReadyCondition::TcpPort ガード + チェック
4. lib.rs: mod port; 宣言
5. cargo test --lib 確認

## レビュー方法
- run-quality-checks.js
- 翻訳可能性 grep
- 全テストパス（既存76 + 新規7 = 83件）
