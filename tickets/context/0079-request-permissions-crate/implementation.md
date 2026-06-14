# #79 権限ガイド実装 サマリ

## 変更ファイル
| ファイル | 種別 | 内容 |
|----------|------|------|
| src/voiput.rs | 変更 | request_permissions に権限ガイド表示 + 設定画面起動追加 |

## 修正内容
1. show_permission_guide_macos(): log:warn! で3つの設定パス表示 + open で設定画面起動
2. show_permission_guide_windows(): log:warn! でマイク設定パス表示 + start ms-settings:
3. 非対応OS: log:warn! で案内メッセージ（既存の Ok(false) に追加）

## 動作確認
- cargo check: 警告ゼロ
- cargo test: 全 158 テスト通過
- 品質チェック: 0 issues

## 実機確認
cargo run --bin test-run で request_permissions() が false を返した際に
log:warn! 表示 + 設定画面が開くことを確認
