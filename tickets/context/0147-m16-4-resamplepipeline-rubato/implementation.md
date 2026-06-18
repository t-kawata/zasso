# #147 実装サマリ

## 変更ファイル
`src/audio/resampler.rs` のみ

## 実装内容
- rubato::Fft<f64> リサンプラー統合（FixedSync::Input モード）
- i16→f64→rubato→f64→i16 変換パイプライン
- 同一レートはパススルー
- 異なるレートは rubato FFT リサンプリング
- [::STUB::] マーカー削除
- #[allow(dead_code)] 削除
- 新規テスト 4 件追加（upsample, downsample, empty, reset_continues）

## 検証結果
| コマンド | 結果 |
|---------|------|
| cargo test -p siprs | ✅ 392 passed（+2 新規） |
| cargo fmt --check | ✅ |
| make check-be | ✅ |
| resampler.rs [::STUB::] 除去 | ✅ |
