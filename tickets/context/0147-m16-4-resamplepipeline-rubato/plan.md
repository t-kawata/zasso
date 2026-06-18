# #147 実装計画

## 要件
ResamplePipeline に rubato::FftFixedIn<f64> 統合。resampler.rs の [::STUB::] + #[allow(dead_code)] 削除。

## 変更ファイル
| ファイル | 種別 | 内容 |
|---------|------|------|
| resampler.rs | 修正 | rubato 統合 + スタブ削除 |

## 実装手順
1. 構造体に resampler + chunk_size 追加
2. new() で FftFixedIn 生成（同一レートは None）
3. process_in/process_out で i16→f64→rubato→f64→i16
4. reset() で rubato リセット
5. [::STUB::] + #[allow(dead_code)] 削除
6. テスト追加・検証
