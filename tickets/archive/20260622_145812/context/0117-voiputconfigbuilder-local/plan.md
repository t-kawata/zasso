# 実装計画: VoiputConfigBuilder Local 検証 (M6-2 / #117)

## 変更ファイル一覧
- `crates/voiput/src/config.rs`: EDIT — build() Local validation
- `crates/voiput/src/recognizer.rs`: EDIT — #[allow(dead_code)] 除去

## 実装手順
1. config.rs: build() に Local 検証追加
2. recognizer.rs: #[allow(dead_code)] 2件除去
3. cargo check 0/0 + test 全通過
