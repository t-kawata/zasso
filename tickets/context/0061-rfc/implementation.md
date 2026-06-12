# 実装: #61 RFC整合性修正 — ドキュメント更新＋軽微な実装修正

## 変更内容

### 修正ファイル
1. docs/rfc-stt-portable-crate.md — RFC 文書の13項目の乖離を修正
2. crates/voiput/README.md — ライセンス表記を MIT → MIT OR Apache-2.0 に修正
3. crates/voiput/Cargo.toml — include 設定を追加（プリビルドライブラリ配布用）

### RFC 更新箇所詳細
| § | 内容 |
|---|------|
| §6.1 | build.sh コードブロック: ユニバーサルバイナリ→現在の arm64 最小版 |
| §6.2 | build.ps1 コードブロック: 詳細フラグ→現在の簡略版 |
| §7.6 | denoiser.rs コードブロック: sherpa_rs_sys unsafe FFI→sherpa_onnx safe API |
| §8 | 依存関係: sherpa-rs/sherpa-rs-sys 削除→sherpa-onnx 追加。全バージョン更新 |
| §9 | build.rs: 50行の単純版→現在の789行の概要説明（自動ビルド・スタブ・ランタイム収集） |
| §4.3 | VoiputConfig/Builder: model_dir: Option<String> 追加 |
| 全体 | SttEngine::OpenAi→SttEngine::OpenAI（enum variant）、libspeech_helper→libSpeechHelper（ファイル名）、channel(256)→channel(100)、update_replaces(&mut self)→(&self) |

## 検証結果
- cargo test --package voiput: ✅ 全124テストパス
- sherpa_onnx 参照: ✅ 4（0より大）
- sherpa-rs 参照: ✅ 3（すべて歴史的記述のみ）
- SttEngine::OpenAi（誤）: ✅ 0件
- libspeech_helper（誤）: ✅ 0件
- channel(256): ✅ 0件
- update_replaces(&mut self): ✅ 0件（public API）
- MIT OR Apache  in README: ✅ 確認
- include in Cargo.toml: ✅ 確認
- 品質チェック: ✅ issues 0
