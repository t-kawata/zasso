# ログ基盤導入と sidecar 出力の統合パイプ — 実装計画

## 要件の再確認

1. `tracing` + `tracing-subscriber` を導入し構造化ログ基盤を確立する
2. sidecar（bifrost）の出力をログに統合する（現在は破棄されている）
3. procreg ライブラリの独立性は維持する
4. watchdog の `eprintln!` は rustc 直接ビルドの制約により維持する

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src-tauri/Cargo.toml` | 変更 | `cargo add tracing tracing-subscriber` |
| `src-tauri/src/lib.rs` | 変更 | `setup()` 冒頭のログ初期化 + bifrost 出力パイプ |

## Boy Scout 改善（スコープ外の翻訳可能性修正）

- `setup()` のコメントに新しい Step 0 と Step 5 を追加
- watchdog の定数（`Duration::from_secs(1)`）はマジックナンバーではあるが、rustc 直接ビルドの制約により本チケットでは対応せず後続に委ねる

## テスト計画

### ユニットテスト計画

| 対象 | 内容 |
|------|------|
| `lib.rs` のログ初期化関数（新規） | `tracing_subscriber` の初期化がパニックせず完了すること |

### ユニットテスト不可能な項目

| 項目 | 理由 |
|------|------|
| Tauri `setup()` の実行確認 | Tauri ランタイムが必要 |
| sidecar 出力の実キャプチャ | bifrost-http バイナリが必要 |
| `pipe_output_to` の動作 | process-registry の既存テストでカバー済み |

## 実装手順

1. `cargo add tracing tracing-subscriber`（features: env-filter, fmt）
2. `lib.rs` にログ初期化（`setup()` 冒頭）
3. `lib.rs` に bifrost 出力パイプ（`start_all()` 直後）
4. モジュールドキュメント更新
5. `make check` / `make test`

## 物理的レビュー方法

1. `make check` でコンパイル確認
2. `make test` で既存テスト全件通過確認
3. grep で `unwrap()` が新規コードにないこと確認
4. procreg の Cargo.toml に tracing/log が追加されていないこと確認

## リスク

| リスク | 影響 | 対策 |
|--------|------|------|
| `tracing_subscriber` の二重初期化 | パニック | `try_init()` で保護 |
| チャネル容量超過 | bifrost 出力行の欠落 | 現行 capacity 2048 で実用十分 |
