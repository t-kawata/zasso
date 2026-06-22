# 計画: #71 health_check 完全実装

## 要件
1. Voiput::health_check() を recognizer.health_check() に委譲
2. Windows: native::win_ffi::health_check_result() の値を返す
3. macOS/非対応OS: 0 を返す
4. test-run.rs のスタブ予告メッセージ更新

## 変更ファイル
| ファイル | 種別 | 内容 |
|----------|------|------|
| src/recognizer.rs | 追加 | pub(crate) fn health_check() — cfg-gated |
| src/voiput.rs | 修正 | return 0 → self.recognizer.health_check() |
| src/binary/test-run.rs | 修正 | スタブ予告削除 |

## 実装手順
1. recognizer.rs: SpeechRecognizer::health_check() 追加（Windows: win_ffi / 他: 0）
2. voiput.rs: 委譲 + スタブコメント削除
3. test-run.rs: スタブ予告メッセージ削除
4. cargo test 確認

## 検証
- cargo test --package voiput 全通過
- health_check が委譲していること（grep recognizer.health_check）
- test-run.rs にスタブ予告が残っていないこと
