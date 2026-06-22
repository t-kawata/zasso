# M8-4: test-run.rs 再構成 実装サマリ

## 変更ファイル
| ファイル | 種別 | 内容 |
|----------|------|------|
| src/binary/test-run.rs | 変更 | 全面書き換え（~900行→~870行） |

## 主な変更点
1. **CLI 引数パースの分離**: CliArgs 構造体 + parse_args() 関数で一元管理
   - --engine (os/openai, default: os)
   - --locale (ja/en, default: ja)
   - --openai-key / --base-url
2. **main() の3段階構成**: CLI解析 → テスト実行(失敗時exit(1)) → Voiput構築+イベントループ
3. **test_hotkeys() 削除**: standalone ホットキーテストを削除し、Voiput::enable_hotkeys() イベントループに統合
4. **test_voiput() 整理**: ホットキー関連表示除去、InputMode確認追加
5. **test_* 関数群は維持**: 全 11 テスト関数を run_all_tests() に統合

## 削除されたもの
- --hotkeys 引数 (Voiput イベントループ内で自動処理)
- test_hotkeys() 関数 (同上)
- standalone ホットキー関連の use 文

## 動作確認
- `cargo run --bin test-run`: 全テスト通過 → イベントループ起動
- cargo test: 全 155 テスト通過
- コンパイル警告ゼロ

## Boy Scout 改善
- main() 3段階構成で責務を明確に分離 ✅
- CLI引数パースを parse_args() に分離 ✅
- test_audio の不要な `let mut ok = true` を除去 ✅
