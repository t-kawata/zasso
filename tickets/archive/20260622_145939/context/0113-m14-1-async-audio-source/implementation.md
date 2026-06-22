# M14-1: AsyncAudioSource trait + ErasedAudioSource blanket impl

## 変更ファイル
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/audio/source.rs | 新規 | AsyncAudioSource + ErasedAudioSource traits, blanket impl, 5 tests |
| crates/siprs/src/audio/mod.rs | 修正 | pub mod source; 追加 |

## 実装内容
- AsyncAudioSource trait: RPITIT (impl Future), Send 境界
- ErasedAudioSource trait: object-safe wrapper, Pin<Box<dyn Future>>
- Blanket impl: impl<T: AsyncAudioSource + Send> ErasedAudioSource for T
- doc example: SineSource implementation
- MockSource: test implementation in #[cfg(test)]

## テスト (5件)
| テスト | 内容 |
|--------|------|
| test_mock_source | MockSource → next_chunk が正しいサンプル数 |
| test_erased_trait_object | Box<dyn ErasedAudioSource> コンパイル確認 |
| test_blanket_impl | MockSource → ErasedAudioSource 自動変換 |
| test_erased_via_trait_object | ErasedAudioSource 経由の呼び出し一致確認 |
| test_send_sync | Send 境界充足のコンパイル時検証 |

## 検証結果
- cargo check: 0 errors, 0 warnings
- cargo test: 336 passed, 0 failed (+2 doc-tests)
- run-quality-checks.js: 5 false positives（doc例コード、修正不可能）
