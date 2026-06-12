---
id: 55
title: "Voiput 公開API + test-run.rs [Voiput]（バッファ＆フラッシュ）"
status: reviewed
ticket_ref: "M5-2"
created_at: "2026-06-12"
updated_at: 2026-06-12
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0055-voiput-api-test-runrs-voiput/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0055-voiput-api-test-runrs-voiput/review.md
---

## 背景 (Background)

### 現状の課題

これまでの実装（M0〜M5-1）により、voiput crate の内部構造は完成している：

- **型定義**: `VoiputConfig`, `SttEvent`, `SttEngine`, `LocaleCode`, `OpenAiConfig` 等の全公開型
- **パイプライン**: VAD → Denoiser → SignalFilter → ASR → Punctuation → PostCorrection
- **3バックエンド**: OpenAI, macOS, Windows の全バックエンド実装完了
- **認識器統括**: `SpeechRecognizer`（バックエンド一元管理 + インターセプタータスク）

しかし、**crate 利用者が直接触れる公開API（Voiput 構造体）が未実装**である。現在の `lib.rs` の使用方法の例示コードは `VoiputConfig` の構築のみで、実際の認識処理の開始・停止・イベント取得・フラッシュを行う手段を提供していない。

### 必要なもの

`Voiput` という単一の公開構造体を通じて、以下の操作を crate 利用者に提供する：

1. **`Voiput::new(config)`** — 設定から認識器を構築
2. **`start()` / `stop()`** — 認識の開始・停止
3. **`next_event()`** — 非同期イベントストリーム（`async fn`、`Option<SttEvent>` を返す）
4. **`flush()`** — 停止 → 残余イベント収集 → 再開、最後のテキストを返す
5. **`set_engine()` / `set_locale()` / `update_replaces()`** — 実行時設定変更
6. **`health_check()`** — OS バックエンドのヘルスチェック
7. **`Drop`** — リソース解放

### 移植元

MYCUTE `MycuteManager` の STT 制御部分（start/stop/engine 切替、request_flush）および `SpeechRecognizer` のラッパー層。

### 現状のソースコード状況 (Investigation)

#### `lib.rs` (`crates/voiput/src/lib.rs`)

- 42-43行目: `// M5-2 で実装` / `// mod voiput;` — コメントアウト状態。M5-2 で有効化する
- 49-76行目: 豊富な `pub use` による内部型の再公開。`Voiput` 型もここに追加する
- `pub use recognizer::SpeechRecognizer;` — 内部型が直接公開されている。M5-2 で `Voiput` 経由の利用を推奨する（`SpeechRecognizer` の公開自体は互換性のために維持）

#### `recognizer.rs` (`crates/voiput/src/recognizer.rs`)

- `SpeechRecognizer` 構造体: 全バックエンドを初期化保持、インターセプタータスク起動済み
- コンストラクタ: `SpeechRecognizer::new(tx, engine, locale, openai_config, vad_config, replaces_map)` — 引数が多い
- `start()`, `stop()`, `set_locale()`, `set_engine()`, `update_config()`, `cleanup()`, `tick()` の全メソッド実装済み
- `Drop` impl: `stop() + cleanup()` を自動呼び出し
- `rebuild_pc_backend()`: PostCorrectionBackend 再構築ヘルパー（内部関数）

#### `lib.rs` の公開型

- `VoiputConfig`, `VoiputConfigBuilder` — 利用者向け設定
- `VoiputError` — thiserror エラー型（6 variant）
- `SttEvent` — 11 variant のイベント型
- `SttEngine`, `LocaleCode` — 基本enum

#### `test-run.rs` (`crates/voiput/src/binary/test-run.rs`)

- 705行のファイル
- 10個のテスト関数: config, resampler, post_correct, signal_filter, interceptor, vad, punctuation, audio, streamer, openai
- macOS/Windows 用の cfg ガード付きテストあり
- `decode_wav_to_f32()` ユーティリティ関数あり
- M5-2用の `test_voiput()` 関数は未実装

### Acceptance Criteria

1. `Voiput::new(config)` が `VoiputConfig` のバリデーションをパスした場合に正常構築されること
2. `start()` 後、`next_event().await` で `SttEvent::Started` が受信できること
3. `stop()` 後、`next_event().await` で `SttEvent::Stopped` が受信できること
4. `flush()` が `stop → 残余イベント収集 → start` のアトミックシーケンスを実行すること
5. `set_engine(SttEngine::OpenAI)` がエラーなく呼び出せること
6. `set_locale(LocaleCode::En)` がエラーなく呼び出せること
7. `Drop` でリソースが適切に解放されること（コンパイル時検証）
8. `test-run.rs` の `test_voiput()` セクションが上記メソッドを全てデモ表示すること
9. すべての既存テスト（90個）が引き続き通過すること

## スコープ (Scope)

### 実装範囲（やること）

- **`crates/voiput/src/voiput.rs`** — `Voiput` 公開構造体の新規作成
- **`crates/voiput/src/lib.rs`** — `mod voiput;` の有効化 + `pub use voiput::Voiput;` の追加
- **`crates/voiput/src/binary/test-run.rs`** — `test_voiput()` 関数の追加、main() への追加
- **`crates/voiput/Tickets.md`** — M5-2 のステータス更新（実装済み＋レビュー済みへ）

### 実装範囲外（やらないこと）

- M6 で扱う内容: プリビルドライブラリ、統合テスト（`tests/`）、README
- `SpeechRecognizer` の内部実装変更（既存のものをそのまま利用）
- 既存の `pub use recognizer::SpeechRecognizer;` の削除（互換性維持）
- `apply_replaces` の修正
- `test_openai` の実際の API 呼び出し部分の変更

## 設計 (Design)

### Voiput 構造体

```rust
/// voiput crate の公開エントリポイント。
///
/// 利用者はこの構造体を通じて音声認識の全操作を行う。
pub struct Voiput {
    /// 内部認識器
    recognizer: SpeechRecognizer,
    /// イベント受信チャネル（インターセプター通過後）
    event_rx: mpsc::Receiver<SttEvent>,
    /// イベント送信チャネル（SpeechRecognizer への入力）
    event_tx: mpsc::Sender<SttEvent>,
    /// 置換辞書（SpeechRecognizer と共有）
    replaces_map: Arc<RwLock<IndexMap<String, Vec<String>>>>,
}
```

### メソッド設計

| メソッド | シグネチャ | 動作 |
|---------|-----------|------|
| `new` | `pub fn new(config: VoiputConfig) -> Result<Self, VoiputError>` | Config バリデーション後に SpeechRecognizer 構築。`mpsc::channel(100)` でイベントチャネル作成。 |
| `start` | `pub fn start(&mut self) -> Result<(), VoiputError>` | `recognizer.start()` を呼び出し。 |
| `stop` | `pub fn stop(&mut self) -> Result<(), VoiputError>` | `recognizer.stop()` を呼び出し。 |
| `next_event` | `pub async fn next_event(&mut self) -> Option<SttEvent>` | `event_rx.recv().await` で次のイベントを待機。 |
| `flush` | `pub async fn flush(&mut self) -> Result<String, VoiputError>` | `stop()` → 残余イベント収集 → `start()` → 最終テキスト。 |
| `engine` | `pub fn engine(&self) -> SttEngine` | 現在のエンジン種別を返す。 |
| `set_engine` | `pub fn set_engine(&mut self, engine: SttEngine) -> Result<(), VoiputError>` | 動作中なら停止→切替→再開。 |
| `set_locale` | `pub fn set_locale(&mut self, locale: LocaleCode)` | `recognizer.set_locale()` に委譲。 |
| `update_replaces` | `pub fn update_replaces(&self, replaces: IndexMap<String, Vec<String>>)` | 置換辞書を書き換え。 |
| `health_check` | `pub fn health_check(&self) -> u32` | 0=Ok, 非0=要回復（Windows用）。 |
| `is_running` | `pub fn is_running(&self) -> bool` | 認識中かどうか。 |

### flush() の詳細設計

```rust
pub async fn flush(&mut self) -> Result<String, VoiputError> {
    // 1. 認識を停止（現在の発話を確定させる）
    self.stop()?;

    // 2. 残余イベントを収集（最後のテキストを取得）
    let mut final_text = String::new();
    loop {
        match self.event_rx.try_recv() {
            Ok(SttEvent::FinalResult(text, _)) | Ok(SttEvent::PartialResult(text, _)) => {
                final_text = text;
            }
            Ok(_) => { /* 制御イベントは無視 */ }
            Err(mpsc::error::TryRecvError::Empty) => break,
            Err(mpsc::error::TryRecvError::Disconnected) => break,
        }
    }

    // 3. 認識を再開
    self.start()?;
    Ok(final_text)
}
```

### new() の詳細設計

```rust
pub fn new(config: VoiputConfig) -> Result<Self, VoiputError> {
    let (tx, rx) = mpsc::channel(100);
    let replaces_map = Arc::new(RwLock::new(IndexMap::new()));

    let openai_config = config.openai_config.clone();
    let vad_config = Some(convert_vad_config(&config.vad, &config.vad_model_paths, &config.model_dir));

    let recognizer = SpeechRecognizer::new(
        tx.clone(),
        config.engine,
        config.locale,
        openai_config,
        vad_config,
        replaces_map.clone(),
    ).map_err(|e| VoiputError::InitError(e))?;

    Ok(Self { recognizer, event_rx: rx, event_tx: tx, replaces_map })
}
```

VAD 設定の変換（`crate::types::VadConfig` → `crate::pipeline::vad::VadConfig`）は、`VoiputConfig.vad_model_paths` のパス解決を含む。`model_dir` が設定されている場合、相対パスは `model_dir` との結合で解決する。

### test-run.rs の test_voiput() デモセクション

`test_voiput()` 関数は以下のデモを実行する：

1. **最小構成**: Os エンジン + Ja ロケールで Voiput::new() 成功
2. **OpenAI 構成**: OpenAI 設定付きで Voiput::new() 成功
3. **start/stop ライフサイクル**: start() → (Startedイベント確認) → stop() → (Stoppedイベント確認)
4. **flush 呼び出し**: flush() の正常呼び出し（内部で stop/start が呼ばれることを確認）
5. **エンジン切り替え**: set_engine(OpenAI) → set_engine(Os) の切り替え
6. **ロケール変更**: set_locale(En) → set_locale(Ja) の切り替え
7. **置換辞書更新**: update_replaces の呼び出し
8. **ヘルスチェック**: health_check() の呼び出し（戻り値表示）

## テスト計画 (Test Plan)

### ユニットテスト計画

`#[cfg(test)] mod tests` を `voiput.rs` の末尾に記述する：

| # | テスト名 | 種別 | 内容 |
|---|---------|------|------|
| 1 | `test_voiput_new_minimal` | 正常系 | Os エンジン + Ja ロケール + vad_model_paths で Voiput::new() 成功 |
| 2 | `test_voiput_new_with_openai` | 正常系 | OpenAI 設定付きで Voiput::new() 成功 |
| 3 | `test_voiput_new_rejects_missing_vad_paths` | 異常系 | vad_model_paths 未指定でエラー |
| 4 | `test_voiput_start_stop_lifecycle` | 正常系 | start → stop のライフサイクル（イベント検証は mpsc で） |
| 5 | `test_voiput_set_engine` | 正常系 | set_engine(OpenAI) 呼び出し |
| 6 | `test_voiput_set_locale` | 正常系 | set_locale(En) → set_locale(Ja) 呼び出し |
| 7 | `test_voiput_update_replaces` | 正常系 | update_replaces 呼び出し |
| 8 | `test_voiput_health_check` | 正常系 | health_check() が 0 を返すこと |
| 9 | `test_voiput_flush_stop_start_called` | 正常系 | flush() 呼び出しが stop/start を呼ぶこと（間接検証） |
| 10 | `test_voiput_drop_cleanup` | 正常系 | Drop でパニックしないこと |

### ユニットテスト不可能な項目（例外）

- **flush() の実際のテキスト収集**: インターセプタースレッド経由の非同期通信が必要なため、ユニットテストではメッセージパッシングの確認に留める。実際のテキスト収集は test-run.rs のデモで確認する。
- **非同期 next_event()**: `#[tokio::test]` でのランタイムが必要。`#[tokio::test]` が利用可能であればテスト可能だが、既存のテストは同期テストのみ（tokio::test 未導入）。新規に導入するかどうかは設計判断とする。

### 既存テストの回帰確認

```bash
make test TEST_ARGS="--package voiput"
```

90個の既存テストがすべて通過することを確認する。M5-2 の追加により 100〜105 個程度に増加する見込み。

## 実装手順 (Implementation Steps)

### Step 1: `src/voiput.rs` の作成

- `Voiput` 構造体の定義（4フィールド）
- `impl Voiput` ブロック: `new()`, `start()`, `stop()`, `next_event()`, `flush()`, `engine()`, `set_engine()`, `set_locale()`, `update_replaces()`, `health_check()`, `is_running()`
- `impl Drop for Voiput`
- VAD設定変換ヘルパー（`types::VadConfig` → `pipeline::vad::VadConfig`）
- `#[cfg(test)] mod tests` に10個のユニットテスト

### Step 2: `lib.rs` の更新

- `// mod voiput;` → `mod voiput;`
- `pub use voiput::Voiput;` の追加

### Step 3: `test-run.rs` の更新

- `use voiput::Voiput;` のインポート追加
- `test_voiput()` 関数の実装
- `main()` への `test_voiput();` 呼び出し追加
- Stage 表記を `Stage 7/7 — Phase 4 公開API` に更新

### Step 4: ビルド確認 + テスト実行

```bash
cd /Users/kawata/shyme/zasso
make check-be
make test TEST_ARGS="--package voiput"
```

### Step 5: Tickets.md の更新

M5-2 を実装済みとしてマーク。

## 物理的レビュー方法 (Review Method)

1. **コンパイル確認**: `cargo check --package voiput` が通ること
2. **テスト実行**: `cargo test --package voiput` の全テスト通過（既存90個 + 新規10個 = 100個程度）
3. **品質チェック**: `.claude/scripts/tickets/review/run-quality-checks.js` で変更ファイルをチェック
4. **構造整合性**: `.claude/scripts/tickets/validate-structure.js` で構造チェック
5. **翻訳可能性チェック**:
   - `grep -n 'pub fn \|pub async fn' src/voiput.rs` → 関数名がすべて動詞句であること
   - `grep -n 'fn [a-z](' src/voiput.rs` → 1文字関数名がないこと
   - `grep -n '\.unwrap()\|\.expect(' src/voiput.rs` → 実務コードに unwrap/expect がないこと（テスト除く）
6. **test-run.rs 実行**: `cargo run --bin test-run -- --help` 相当の確認（`test_voiput` セクションが表示されること）

## リスク (Risks)

| リスク | 確率 | 影響 | 対策 |
|-------|------|------|------|
| `SpeechRecognizer::new()` の引数変更 | 低 | 高 | 既存コードを変更せず、現在のシグネチャに合わせてラップする |
| `VoiputConfig` のフィールド追加 | 低 | 中 | M5-2 の `new()` は `config.xxx` でアクセスするため、新フィールドが追加されても影響を受けない |
| `mpsc::channel` のバッファサイズ問題 | 低 | 低 | 100 で十分だが、必要に応じて調整可能 |

## Boy Scout Rule — 翻訳可能性計画

### スコープ内

- `voiput.rs`（新規）: すべての関数名を動詞句で命名（`new`, `start`, `stop`, `flush`, `set_engine` 等）
- `test-run.rs`（修正）: 関数名 `test_voiput` は「テストする」の意図が明確なため適切
- `lib.rs`（修正）: コメントアウト行の有効化のみで新たな翻訳可能性の問題は発生しない

### スコープ外（注意点）

現時点でスコープ外だが認識しておくべき項目（次回以降のチケットで改善）:
- `lib.rs` の `pub use` リストが長く一覧性に欠ける（M6-3 README 整備時に検討）
- `recognizer.rs` の `SpeechRecognizer::new()` が多数の引数を持つ → M5-2 で Voiput がラップすることで利用者側の問題は解消される
