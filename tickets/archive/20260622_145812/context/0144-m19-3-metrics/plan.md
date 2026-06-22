# #144 実装計画

## 要件
metrics optional feature として 8 つのカウンター/ゲージを実装。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 修正 | metrics dependecy + feature |
| src/lib.rs | 修正 | モジュール宣言 |
| src/metrics/mod.rs | 新規 | 8 計装関数 |
| runtime/reactor.rs | 修正 | 4 箇所 cfg 計装 |
| runtime/state.rs | 修正 | 1 箇所 cfg 計装 |
| audio/tap.rs | 修正 | 1 箇所 cfg 計装 |
| client.rs | 修正 | 1 箇所 cfg 計装 |
| ffi/callbacks.rs | 修正 | 2 箇所 cfg 計装 |

## 実装手順
1. Cargo.toml に metrics 追加
2. src/metrics/mod.rs 作成
3. src/lib.rs にモジュール宣言
4. 各ファイルに cfg 計装追加
5. 検証
