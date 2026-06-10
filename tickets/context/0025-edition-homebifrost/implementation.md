# 実装サマリー: EDITION_HOME導入とbifrostバイナリの自動展開

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src-tauri/Cargo.toml` | 修正 | `flate2`, `tar`, `tempfile`(dev) 追加 |
| `src-tauri/src/consts/edition.rs` | 修正 | `OnceLock` + `init_edition_home()` / `edition_home()` + テスト追加 |
| `src-tauri/src/consts/mod.rs` | 修正 | 上記2関数を re-export |
| `src-tauri/src/bifrost/deploy.rs` | 新規 | バージョン照合 + tar.gz展開 + 実行権限 + テスト5件 |
| `src-tauri/src/bifrost/mod.rs` | 修正 | `mod deploy;` + `ensure_bifrost_binary` 再公開 |
| `src-tauri/src/lib.rs` | 修正 | `setup()` フックに `init_edition_home()` + `ensure_bifrost_binary()` 追加 |

## 実装詳細

### EDITION_HOME (consts/edition.rs)
- `OnceLock<PathBuf>` の静的変数にエディションホームの絶対パスをキャッシュ
- `init_edition_home()`: setup() で呼び出し、editions.json からパスを計算して設定
- `edition_home()`: どこからでも絶対パスを `&'static PathBuf` で取得可能

### bifrost 展開 (bifrost/deploy.rs)
- `ensure_bifrost_binary(home)`: 以下を順に実行
  1. `EDITION_HOME/bifrost/` ディレクトリ作成
  2. `.version` ファイルを照合 → 一致すればスキップ
  3. 不一致/不在ならバンドル済み tar.gz を展開 (flate2 + tar)
  4. Unix では 0755 実行権限付与
  5. `.version` に `BIFROST_VERSION` を書き込み

### テスト結果
- 5 tests passed (3 deploy tests + 2 edition tests)
- 0 failed

## 検証
- `make check` — pass
- `make test` — pass (5/5)
