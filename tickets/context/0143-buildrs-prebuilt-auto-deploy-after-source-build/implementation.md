# #143 実装サマリ

## 変更ファイル
`build.rs` のみ

## 追加した関数
- `deploy_prebuilt()`: cmake ビルド成功後、全 .a ファイルと include ディレクトリを vendor/prebuilt/{TARGET}/ へコピー
- `copy_dir_recursive()`: ディレクトリ再帰コピーのヘルパー

## main() への追加
source build 成功パス末尾に 1 行: `let _ = deploy_prebuilt(&install_prefix, &target);`

## 検証結果
| 項目 | 結果 |
|------|------|
| 初回: cmake ビルド → 自動配置 | ✅ 18 個の .a が vendor/prebuilt/aarch64-apple-darwin/lib/ に配置 |
| 2回目: prebuilt 検出 → cmake スキップ | ✅ "Using prebuilt PJSIP" 表示、ビルド時間 20.76s→3.58s |
| cargo test -p siprs (--features pjsip) | ✅ 389 passed |
| cargo test -p siprs (PJSIPなし) | ✅ 390 passed |
| make check-be | ✅ 成功 |
| cargo fmt --check | ✅ 通過 |
