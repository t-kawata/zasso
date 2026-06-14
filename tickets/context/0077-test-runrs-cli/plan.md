# M8-4: test-run.rs 再構成 実装計画

## 要件
test-run.rs をテスト実行→Voiput構築→イベントループの3段階に再構成。CLI引数パースをparse_args()に分離。ホットキーをVoiput::enable_hotkeys()経由で統合。テスト失敗時exit(1)。

## 変更ファイル
| ファイル | 種別 | 内容 |
| src/binary/test-run.rs | 変更 | main()再構成, parse_args(), Voiput統合イベントループ, test_hotkeys削除 |

## Boy Scout
- main() 3段階構成（テスト/Voiput/イベントループ）
- CLI引数パース分離（parse_args()）
- test_hotkeys() 削除（Voiput統合で代替）
- test_voiput() 整理（ホットキー表示除去）

## 実装手順
1. parse_args() + CliArgs 構造体
2. main() 3段階構成
3. test_hotkeys() 削除
4. test_voiput() 整理
5. cargo check + cargo test
