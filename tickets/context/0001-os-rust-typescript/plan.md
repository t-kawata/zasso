# Plan Ticket #1: ビルド時のエディション/OS情報を Rust 定数と TypeScript 設定に同時注入する

## 変更ファイル一覧

| # | ファイル | 種別 | 内容 |
|---|----------|------|------|
| 1 | `src-tauri/build.rs` | 変更 | EDITION_SLUG + CARGO_CFG_TARGET_OS から OUT_DIR/generated_constants.rs 生成 |
| 2 | `src-tauri/src/consts/mod.rs` | 新規 | include!() + include_str!() + current_edition() -> Result |
| 3 | `src-tauri/src/lib.rs` | 変更 | mod consts; 追加 |
| 4 | `Makefile` | 変更 | build ターゲット追加（OS自動検出）、settings.ts 自動生成 |
| 5 | `fe/src/configs/settings.ts` | 生成対象化 | EDITION_KEY → EDITION_SLUG 改名 |
| 6 | `fe/.gitignore` | 新規/追記 | settings.ts を管理対象外に |
| 7 | `src-tauri/src/consts/constants.rs` | 削除 | 空ファイル削除（OUT_DIR に移譲） |

## 制約遵守
- .gitignore に constants.rs を入れない（OUT_DIR 方式）
- unwrap/expect 禁止（Result + ? + unwrap_or_else）
- make build EDITION=??? で全OS対応

## 検証
1. make build が成功する
2. make build EDITION=mycute で mycute ビルド
3. current_edition() が Result を返す
4. 両ファイルの値が一致
