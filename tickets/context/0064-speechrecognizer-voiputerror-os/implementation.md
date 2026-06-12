# 実装: #64 内部設計整合 — SpeechRecognizer 引数整理 + VoiputError 型修正 + 非対応OSバリデーション

## 変更内容

### recognizer.rs
1. **SpeechRecognizer::new() 引数整理**: 6引数→3引数
   - Before: `new(tx, engine, locale, openai_config, vad_config, replaces_map)`
   - After: `new(tx, config: &VoiputConfig, replaces_map)`
   - Config 分解ロジックを内部に移動
2. **build_vad_processor_config() / resolve_vad_model_path()**: voiput.rs から移動
3. **validate_config() OS チェック実装**:
   - Before: `_engine` → constant Ok(())
   - After: `#[cfg(not(any(target_os = "macos", windows)))]` → Err for Os engine
4. **テスト追加**: cfg-gated validate_config テスト3件 + VAD変換テスト6件

### voiput.rs
1. Config 分解ロジック削除（SpeechRecognizer::new に委譲）
2. build_vad_processor_config / resolve_vad_model_path 関数削除
3. 呼び出し: `SpeechRecognizer::new(tx, &config, replaces_map)` に簡略化

### 除外（既に修正済み）
- VoiputError::UnsupportedEngine → 既に名前付きフィールド準拠済みのため未実施

## 検証結果
- cargo test --package voiput: ✅ 全124テストパス
- 品質チェック: ✅ issues 0
- SpeechRecognizer::new 呼び出し: ✅ 1箇所のみ（voiput.rs）
- validate_config 実装: ✅ cfg-gated、_engine なし
