# M19-1 実装計画

## 要件の再確認

build.rs に三段階戦略（prebuilt優先 → source build fallback → stub）を実装し、--features pjsip で PJSIP リンク済みビルドが可能になるようにする。

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| crates/siprs/Cargo.toml | 修正 | cmake = "0.1" build-dependency 追加 |
| crates/siprs/build.rs | 修正 | 三段階フロー + 5 関数分割 |
| crates/siprs/vendor/.gitkeep | 新規 | vendor/ ディレクトリ構造管理 |
| crates/siprs/.gitignore | 新規 | vendor/pjsip/ vendor/prebuilt/*/ を git 除外 |
| crates/siprs/src/ffi/media.rs | 修正 | cfg(pjsip) 条件分岐追加 |
| crates/siprs/src/ffi/pjsua_backend.rs | 修正 | コメントアウト impl ブロック有効化 |

## 実装手順

1. vendor/ ディレクトリ構造 + .gitignore 作成
2. Cargo.toml に cmake build-dependency 追加
3. build.rs 再構成（関数分割 + 三段階フロー）
4. media.rs: cfg 条件分岐
5. pjsua_backend.rs: コメントアウト有効化
6. 検証: cargo check → cargo test → make check-be

## テスト計画

build.rs は #[cfg(test)] に非対応。以下で検証:
- cargo check -p siprs（スタブフォールバック）
- cargo test -p siprs（全 390 テスト通過）
- cargo check -p siprs --features pjsip（vendor/pjsip 不在→エラーメッセージ確認）
- make check-be（プロジェクト全体への影響確認）

## 物理的レビュー方法

1. cargo fmt --check
2. cargo check -p siprs
3. cargo test -p siprs
4. make check-be
5. run-quality-checks.js
6. 翻訳可能性 grep（関数名が動詞句か、main() が一文として読めるか）
