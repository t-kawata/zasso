# M19-1 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| crates/siprs/Cargo.toml | 修正 | build-dependencies に cmake = "0.1" 追加 |
| crates/siprs/build.rs | 修正 | 三段階フロー（prebuilt→source→stub）+ 関数分割（14関数） |
| crates/siprs/src/ffi/media.rs | 修正 | connect_to_conference/disconnect に #[cfg(feature = "pjsip")] 分岐追加 |
| crates/siprs/src/ffi/pjsua_backend.rs | 修正 | コメントアウト cfg(pjsip) impl ブロックを有効化 |
| crates/siprs/vendor/.gitkeep | 新規 | vendor/ ディレクトリ構造管理 |
| crates/siprs/.gitignore | 新規 | vendor/pjsip/, vendor/prebuilt/*/ を git 除外 |

## 実装内容

### build.rs の新規関数

- `cfg_enabled()` — Cargo feature flag 判定ヘルパー
- `required_libraries()` — 必須 7 PJSIP ライブラリ名
- `prebuilt_available()` — prebuilt ディレクトリ確認
- `emit_link_directives()` — cargo:rustc-link-* 出力
- `emit_platform_link_directives()` — macOS/Linux システムフレームワークリンク
- `build_pjsip_from_source()` — cmake::Config 経由 CMake ビルド（PJMEDIA_WITH_VIDEO=OFF）
- `generate_bindings()` — bindgen 共通化

### main() 制御フロー

1. prebuilt 探索 → vendor/prebuilt/{target}/lib/
2. source build fallback → vendor/pjsip/ から CMake ビルド
3. PJSIP 不在 → スタブバインディング（development mode）

### スタブ解決

- build.rs 内スタブ → 完全解決（5 箇所）
- pjsua_backend.rs / media.rs → #[cfg(feature = "pjsip")] 条件付き準備
- reactor.rs AccountConfigPatch → 保留（M19-2 以降）

## 検証結果

- cargo check -p siprs → ✅ OK
- cargo check -p siprs --features pjsip → ✅ OK（スタブフォールバック）
- cargo test -p siprs → ✅ 390 passed, 0 failed
- cargo fmt --check → ✅ 通過
- make check-be → ✅ OK（プロジェクト全体影響なし）
- make test → ✅ 14 passed, 0 failed
