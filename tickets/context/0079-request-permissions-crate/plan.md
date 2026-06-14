# #79 権限ガイド実装 計画

## 要件
request_permissions() の false 時に log:warn! 表示 + 設定画面起動

## 変更ファイル
| ファイル | 種別 | 内容 |
| src/voiput.rs | 変更 | request_permissions 3分岐にガイド追加 |

## 実装手順
1. macOS cfg: false 時 log:warn! + open 設定画面
2. Windows cfg: false 時 log:warn! + start ms-settings
3. 非対応OS: log:warn! のみ
4. cargo check + cargo test
