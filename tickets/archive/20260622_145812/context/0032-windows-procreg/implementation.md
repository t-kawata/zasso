# 実装サマリ: Windows: procreg 統合テストがフリーズする問題の調査と修正

## 変更ファイル（4ファイル）

| ファイル | 種別 | 内容 |
|----------|------|------|
| `watchdog/src/main.rs` | 修正 | process_is_alive に mpsc::recv_timeout で3秒タイムアウト追加 |
| 同上 | 修正 | kill_process のエラー握りつぶしを eprintln! 出力に変更 |
| `procreg/src/watchdog.rs` | 修正 | リトライ上限 100 を MAX_EXTRACT_ATTEMPTS 定数に抽出、デバッグログ追加 |
| `procreg/src/spawn.rs` | 追加 | test_watchdog_spawns_cmd_on_windows（Windows専用）|

## 修正内容

### 1. process_is_alive タイムアウト追加（原因A対策）
- watchdog は build.rs が rustc 直接呼び出しでコンパイルされるため stdlib のみ利用可能
- std::sync::mpsc::channel + recv_timeout(Duration::from_secs(3)) でタイムアウト実装
- タイムアウト時は安全側に倒して「生存」とみなす（false positive > false negative）
- 別スレッドで tasklist を待機 → タイムアウト後もスレッドは完了まで動作する

### 2. kill_process エラー握りつぶし解消（Boy Scout）
- let _ での握りつぶしを if let Err(e) = ... { eprintln! } に変更
- Unix（kill）も Windows（taskkill）も同様に修正

### 3. 定数抽出（Boy Scout）
- ハードコードされていたリトライ上限 `100` を `MAX_EXTRACT_ATTEMPTS` 定数に抽出
- 展開先パスをデバッグ用に eprintln! で出力

### 4. Windows 専用テスト追加
- test_watchdog_spawns_cmd_on_windows: watchdog 経由で cmd.exe /c echo hello を実行
- PROCREG_WATCHDOG_PARENT_PID 環境変数を設定して watchdog が正しく動作することを確認

## 検証結果
- cargo test --lib: 84 passed（全テスト）
- cargo test --test integration: 2 passed (test_fate_sharing は ignored)
- test_depends_on_ordering: フリーズせず完了
- Quality checks: 0 issues
PLAN_EOF
