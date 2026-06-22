# 実装サマリ: Ticket #1 — ビルド時のエディション/OS情報注入

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `src-tauri/build.rs` | 変更 | EDITION_SLUG + CARGO_CFG_TARGET_OS → OUT_DIR/generated_constants.rs 生成 |
| `src-tauri/src/consts/mod.rs` | 新規 | include!() + include_str!() + mod edition 宣言 + 再公開 |
| `src-tauri/src/consts/edition.rs` | 新規 | EditionConfig 構造体 + current_edition() -> Result 関数 |
| `src-tauri/src/consts/constants.rs` | 削除 | 空ファイル削除（OUT_DIR に移譲） |
| `src-tauri/src/lib.rs` | 変更 | mod consts; 追加 |
| `Makefile` | 変更 | build ターゲット追加（OS自動検出）、settings.ts 自動生成 |
| `fe/src/configs/settings.ts` | 生成対象化 | EDITION_KEY → EDITION_SLUG 改名、Makefile 書き出し |
| `fe/.gitignore` | 変更 | /src/configs/settings.ts 追記 |

## アーキテクチャ

```
make build (EDITION=zasso)
  ├─→ fe/src/configs/settings.ts  生成（EDITION_SLUG + OS_TYPE）
  └─→ cargo tauri build
        ├─→ build.rs → OUT_DIR/generated_constants.rs
        └─→ consts/mod.rs → include!() + include_str!(editions.json)
              └─→ consts/edition.rs → current_edition() -> Result
```

## 制約遵守

- .gitignore に constants.rs なし（OUT_DIR に出力）
- unwrap/expect（ゼロ。既存の Tauri スキャフォールド .expect() はスコープ外）
- make build EDITION=??? で全OS自動対応（OS自動検出→dmg/nsis/appimage）
- Result + ? によるエラー安全伝播
