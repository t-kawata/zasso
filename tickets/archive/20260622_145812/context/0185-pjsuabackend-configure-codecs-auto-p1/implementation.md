# 実装サマリ: PjsuaBackend メソッド完全化 — configure_codecs auto モード（P1）

## 変更内容

### 1. 優先度定数の逆転修正（バグ修正）
- `CODEC_PRIO_PCMU`: 255 → 254（Opus 非対応環境向けフォールバック）
- `CODEC_PRIO_OPUS`: 254 → 255（最優先）
- doc コメントも修正（"最高" → "Opus 非対応環境向けフォールバック"）
- テスト `test_codec_priority_constants` の期待値を更新 + メッセージ追加

### 2. SipBackend trait シグネチャ変更
- `fn configure_codecs(&mut self) → fn configure_codecs(&mut self, preferred: &[Codec])`
- 空スライス = auto モード、非空 = 明示指定モード

### 3. Auto モード実装（PjsuaBackend, #[cfg(feature = "pjsip")]）
- 関数抽出による翻訳可能性改善:
  - `set_opus_priority()` — Opus=255 設定（失敗時は tracing::debug でログ）
  - `set_pcmu_priority()` — PCMU=254 設定（失敗時はエラー伝播）
  - `disable_other_codecs()` — PCMU/Opus 以外を全て無効化
  - `apply_preferred_codecs()` — 明示指定モード実装
  - `codec_id_to_str()` — pj_str_t→&str 変換（unsafe 最小化）
- 各 unsafe ブロックに `// SAFETY:` コメントを付与

### 4. Reactor 結合
- `RuntimeCommand::Initialize` ハンドラに `backend.configure_codecs(&[])` を追加
- 初期化時に auto モードのコーデック設定が確定する

### 5. MockBackend / スタブ更新
- MockBackend: シグネチャ変更 + 3件の新規テスト追加（auto/明示指定/未初期化）
- 非PJSIPスタブ: シグネチャ変更

## 変更ファイル
| ファイル | 種別 | 変更 |
|----------|------|------|
| `crates/siprs/src/ffi/pjsua_backend.rs` | 修正+追加 | 定数修正、関数抽出、autoモード、明示指定モード、テスト修正 |
| `crates/siprs/src/runtime/backend.rs` | 修正+追加 | trait シグネチャ変更、MockBackend更新、テスト追加（3件） |
| `crates/siprs/src/runtime/reactor.rs` | 修正 | Initialize ハンドラ内で configure_codecs(&[]) 呼び出し追加 |

## 検証結果
- `make check-be`: ✅ 成功
- `cargo test` (siprs): ✅ 全410テスト通過
- 品質チェック: ✅ 新規 issue なし（既存の pre-existing のみ）
- 不完全実装スキャン: ✅ 問題なし
- 犯罪スキャン: ✅ 0件
