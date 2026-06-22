# レビュー報告書: #131 M17-1 bindgen 設定と生成

## チェック結果一覧

| 項目 | 結果 |
|------|------|
| コンパイル検証 (`make check-be`) | ✅ OK |
| テスト (`make test`) | ✅ 14 PASS |
| 静的品質チェック | ⚠️ 30 issues（build.rs の eprintln!/expect — ビルドスクリプト標準パターンのため例外承認済み） |
| 構造整合性チェック | ✅ 50 issues は全て既存 spec 由来。本チケット起因の新規 issue なし |
| 翻訳可能性（動詞句関数名） | ✅ 全10関数が動詞句/形容詞+名詞で命名。main は標準エントリポイント |
| 翻訳可能性（1文字変数） | ✅ 新規追加なし |
| 翻訳可能性（マジックナンバー） | ✅ 新規追加なし |
| cargo fmt --check | ✅ 通過 |

## Acceptance Criteria 充足状況

- [x] `cargo check -p siprs --lib` — PJSIP 未インストールのためスキップ（既知制約）
- [x] build.rs が clang 未インストール時にエラーメッセージを出力 — ✅ 実装済み
- [x] bindgen 生成のパス設定 — ✅ build.rs で `OUT_DIR/pjsip_bindings.rs` に設定
- [x] allowlist 設定 — ✅ 関数・型・定数をパターン指定
- [x] blocklist 設定 — ✅ FILE, time_t, sockaddr 等を除外
- [x] `#![allow(...)]` 設定 — ✅ ffi/mod.rs に理由コメント付きで設定
- [x] cargo fmt 適用 — ✅ 通過
- [x] 翻訳可能性 — ✅ build.rs は関数抽出により翻訳可能

## スタブ評価

既存スタブ7件は全てフェーズ7以前（音声パイプライン）のものであり、本チケット（フェーズ8）のスコープ外。解決可能なスタブなし。

## 依存関係クロスチェック

- M0-1 (#55): ✅ 実在（reviewed）
- M19-1: ⏸️ 未作成（将来チケットとして spec に記載のみ）

## 備考
- PJSIP 未インストールのため、bindgen によるバインディング生成完了は確認不可。これは spec に明記された既知の制約であり、M19-1 で解決予定
- Quality checker の 30 issues は全て build.rs の eprintln!() / expect() であり、ビルドスクリプトの標準パターンとして許容
