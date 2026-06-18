# #143 実装計画

## 要件
source build 成功後、自動的に vendor/prebuilt/{TARGET}/lib/ へ全 .a とヘッダをコピーする。

## 変更ファイル
| ファイル | 種別 | 内容 |
|---------|------|------|
| build.rs | 修正 | deploy_prebuilt() + copy_dir_recursive() 追加、main() に 1 行 |

## 実装手順
1. build.rs に deploy_prebuilt() 追加（find で .a 検索 → copy）
2. build.rs に copy_dir_recursive() 追加（include コピー用）
3. main() の source build 成功パスに 1 行追加
4. 検証: cargo build → cargo build（2回目）→ cargo test → make check-be
