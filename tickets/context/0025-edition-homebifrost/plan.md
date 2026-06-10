# 計画: EDITION_HOME導入とbifrostバイナリの自動展開 (Ticket #25)

## 要件の再確認

起動時に以下を保証する：
1. エディションホーム（例: `~/.zasso/zasso`）の絶対パスを OnceLock でキャッシュ → `consts::edition_home()` でアクセス
2. `EDITION_HOME/bifrost/` ディレクトリを作成
3. バンドル済み tar.gz から bifrost-http を展開（`.version` マーカーで照合・更新検知）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src-tauri/src/consts/edition.rs` | 修正 | `OnceLock` + `init_edition_home()` / `edition_home()` 追加 |
| `src-tauri/src/consts/mod.rs` | 修正 | 上記2関数を re-export |
| `src-tauri/src/bifrost/deploy.rs` | 新規 | バージョン照合 + tar.gz展開 + 実行権限 |
| `src-tauri/src/bifrost/mod.rs` | 修正 | `mod deploy;` + `ensure_bifrost_binary` 再公開 |
| `src-tauri/src/lib.rs` | 修正 | `setup()` フックに初期化呼び出し追加 |
| `src-tauri/Cargo.toml` | 修正 | `flate2` + `tar` 追加 |

## Boy Scout 改善（スコープ外の翻訳可能性修正）

- なし。スコープ内の新規コード（deploy.rs）は翻訳可能性を考慮して設計する。
- 既存コードのうち触る部分（edition.rs, mod.rs, lib.rs）は最小限の追加のみで、既存の命名や構造を尊重する。

## テスト計画

### ユニットテスト計画

**`consts::edition_home()` 関連（正常系）:**
- `init_edition_home()` 呼び出し後、`edition_home()` が `Some(path)` を返す
- 複数回の `edition_home()` が同一パスを返す

**`consts::init_edition_home()` 関連（異常系）:**
- 二重初期化: 2回呼んで2回目がエラー

**`bifrost::deploy::ensure_bifrost_binary()`:**
- 正常系: 初回 → ディレクトリ作成 + 展開 + `.version` 書き込み
- 正常系: 2回目（`.version` 一致）→ スキップ
- 正常系: `.version` 不一致 → 再展開
- 異常系: 書き込み権限不足 → エラー

### ユニットテスト不可能な項目（例外）

- Tauri ランタイム依存の `setup()` フック → 手動テスト
- クロスプラットフォームの実行権限付与 → 当該OSでのみテスト可能

## 実装手順

1. **依存追加**: `cargo add flate2 tar --manifest-path src-tauri/Cargo.toml`
2. **edition.rs 編集**: ファイル末尾に `OnceLock` 静的変数 + 初期化/アクセス関数を追加
3. **mod.rs 編集**: 2関数を re-export
4. **deploy.rs 作成**: `ensure_bifrost_binary()` を実装（バージョン照合 → 展開 → 権限 → マーカー書き込み）
5. **bifrost/mod.rs 編集**: `mod deploy;` + re-export
6. **lib.rs 編集**: `setup()` に `init_edition_home()` + `ensure_bifrost_binary()` 追加
7. **検証**: `make check` でコンパイル確認

## 物理的レビュー方法

1. `make check` — コンパイルエラーなし
2. `make test` — 既存テストが全てパス
3. コードレビュー（翻訳可能性）:
   - 関数名が動詞句になっているか
   - マジック文字列が定数化されているか
   - コメントが「なぜ」を説明しているか

## リスク

- `tar::Archive::unpack()` はアーカイブ内の全エントリを展開する。bifrost の tar.gz は単一エントリだが、悪意あるアーカイブが混入した場合のケアは将来的な課題とする（現在は自前ビルドのためリスク低）
- `std::sync::OnceLock` は Rust 1.70 以上が必要（プロジェクトの edition 2021 で問題なし）
