# 計画: Windows: procreg 統合テストがフリーズする問題の調査と修正

## 要件
crates/procreg/ の統合テストが Windows 上でフリーズする問題を調査・修正する。
原因A（tasklist タイムアウトなし）が最も確度が高い。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| watchdog/src/main.rs | 修正 | process_is_alive に stdlib の mpsc::recv_timeout でタイムアウト追加 |
| 同上 | 修正 | kill_process のエラー握りつぶし解消（warn! 出力） |
| procreg/src/watchdog.rs | 修正 | リトライ上限 100 を MAX_EXTRACT_ATTEMPTS 定数に抽出 |
| procreg/src/spawn.rs | 追加 | Windows 専用テスト test_watchdog_spawns_cmd_on_windows |
| tests/integration.rs | 修正 | 調査用に各テストにタイムアウト追加 |

## Boy Scout 改善
- kill_process の let _ 握りつぶし → warn! ログ出力
- リトライ上限 100 を MAX_EXTRACT_ATTEMPTS 定数（watchdog.rs）
- テストコード Windows 分岐コメントの日本語化

## 実装手順（3フェーズ）
Phase 1: 調査 — 統合テストタイムアウト設定、Windows 専用テスト追加
Phase 2: 原因A修正 — process_is_alive に mpsc::recv_timeout 追加
Phase 3: 原因B/C確認、定数抽出

## 物理的レビュー方法
- cargo fmt + cargo check
- cargo test -p process-registry --lib
- cargo test -p process-registry --test integration
- run-quality-checks.js

## リスク
- 調査で原因特定できない場合はデバッグログ追加
- watchdog は stdlib のみ → mpsc::recv_timeout で対応
