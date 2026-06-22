# 実装計画: テスト用サンプル音声ファイルの配置 (M7-2 / #120)

## 変更ファイル一覧
- `crates/voiput/tests/fixtures/sample-voice.wav`: COPY (src/wav/ から)
- `crates/voiput/tests/fixtures/mod.rs`: NEW (WAV読み込みユーティリティ)

## 実装手順
1. tests/fixtures/ ディレクトリ作成
2. sample-voice.wav をコピー
3. mod.rs に load_sample_wav() 実装
4. cargo check 確認

## テスト方針（M8-1）
- キーワードベース部分一致（「天気」「散歩」「こんにちは」）
- モデル不在時はエラー（スキップしない）
