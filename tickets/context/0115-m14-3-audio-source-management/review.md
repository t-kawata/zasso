# レビュー報告書: #115 M14-3 音声ソース管理 API

## チェック結果

| チェック項目 | 結果 |
|-------------|------|
| コンパイル | ✅ 0 errors, 0 warnings |
| テスト (341 + 2 doc-tests) | ✅ 全PASS |
| 静的品質 | ✅ 5 false positives（既知、doc例コード）|
| 構造整合性 | ⚠️ 既存 issues のみ |
| 翻訳可能性 | ✅ 問題なし |

## Acceptance Criteria

- [x] add_audio_source() / remove_audio_source() / set_audio_source_gain() / mute_audio_source()
- [x] 負の gain → InvalidConfig（test_set_gain_negative 確認済み）

## スタブ評価
- ErasedAudioSource (source.rs): 保留妥当 → M15-1 (#116) で AudioMixer が使用開始
- SipClient::add_audio_source の _source 引数: 保留妥当 → M15-1 (#116) で AudioMixer 登録
