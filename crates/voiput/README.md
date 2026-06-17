# voiput — ポータブル音声認識

**voiput** は macOS・Windows・OpenAI Whisper API・Qwen3-ASR（ローカル）の4バックエンドを統一的に扱うポータブル音声認識（STT）Rust クレートです。
zasso プロジェクト内で `crates/voiput/` として開発されており、Tauri v2 アプリケーションから依存クレートとして利用することを前提としています。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│  zasso (Tauri App)                                       │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  voiput crate                                        │ │
│  │  ┌──────────┐ ┌────────────┐ ┌──────────────────┐  │ │
│  │  │  Hotkey  │ │  Voiput    │ │  SpeechRecognizer│  │ │
│  │  │  Monitor │→│  (public   │→│  (orchestrator)  │  │ │
│  │  │ CGEventTa│ │  API)      │ │  ┌────────────┐  │  │ │
│  │  │ WH_KB_LL │ │ next_event │ │  │OpenAI B/E  │  │  │ │
│  │  └──────────┘ │ SttEvent   │ │  │Mac B/E     │  │  │ │
│  │               │ Flushed    │ │  │Win B/E     │  │  │ │
│  │               └────────────┘ │  └────────────┘  │  │ │
│  │                              └──────────────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 対応プラットフォーム

| バックエンド | プラットフォーム | 認識方式 | 必要環境 |
|-------------|----------------|---------|---------|
| macOS ネイティブ | macOS 15+ | SFSpeechRecognizer / Tahoe (macOS 26+) | マイク・音声認識権限、`libSpeechHelper.a` |
| Windows ネイティブ | Windows 10+ | WinRT SpeechRecognizer (Native AOT DLL) | マイク権限、`SpeechHelper.dll + .lib` |
| OpenAI Whisper | 全プラットフォーム | REST API (async-openai) | API キー |
| Local（Qwen3-ASR） | 全プラットフォーム | sherpa-onnx OfflineRecognizer（ローカルONNX推論） | モデルファイル (`build.rs` 自動DL) |

## クイックスタート

### Cargo.toml

```toml
[dependencies]
voiput = { path = "crates/voiput" }
tokio = { version = "1", features = ["full"] }
```

### 最小コード（OS ネイティブ認識）

```rust,no_run
use voiput::{Voiput, VoiputConfig, SttEngine, LocaleCode, VadModelPaths, SttEvent};

let config = VoiputConfig::builder()
    .engine(SttEngine::Os)
    .locale(LocaleCode::Ja)
    .vad_model_paths(VadModelPaths {
        silero: "models/silero_vad.onnx".into(),
        ten: "models/ten_vad.onnx".into(),
        gtcrn: String::new(),
    })
    .build().unwrap();

let mut voiput = Voiput::new(config).unwrap();
voiput.enable_hotkeys();  // Ctrl+Option / Option ダブルタップを有効化

// イベントループ（別タスクで駆動）
// while let Some(event) = voiput.next_event().await { ... }
```

### OpenAI モード

```rust,no_run
let config = VoiputConfig::builder()
    .engine(SttEngine::OpenAI)
    .locale(LocaleCode::En)
    .openai_config(OpenAiConfig {
        base_url: "https://api.openai.com/v1".into(),
        api_key: std::env::var("OPENAI_API_KEY").unwrap(),
        model: "gpt-4o-mini-transcribe".into(),
    })
    .vad_model_paths(VadModelPaths {
        silero: "models/silero_vad.onnx".into(),
        ten: "models/ten_vad.onnx".into(),
        gtcrn: "models/gtcrn.onnx".into(),
    })
    .build().unwrap();
```

### Local モード（Qwen3-ASR）

```rust,no_run
let config = VoiputConfig::builder()
    .engine(SttEngine::Local { backend: LocalAsrKind::Qwen3Asr })
    .locale(LocaleCode::Ja)
    .qwen3_asr_config(Qwen3AsrConfig {
        model_paths: Qwen3AsrModelPaths {
            encoder: "models/qwen3-asr/encoder.int8.onnx".into(),
            decoder: "models/qwen3-asr/decoder.int8.onnx".into(),
            conv_frontend: "models/qwen3-asr/conv_frontend.onnx".into(),
            tokenizer_dir: "models/qwen3-asr/tokenizer".into(),
        },
        provider: "cpu".into(),
        // auto_num_threads(): システム論理コア数の半分（最小1）。例: 12→6, 8→4
        num_threads: std::thread::available_parallelism()
            .map(|n| (n.get() / 2).max(1) as i32)
            .unwrap_or(1),
        debug: false,
    })
    .vad_model_paths(VadModelPaths {
        silero: "models/silero_vad.onnx".into(),
        ten: "models/ten_vad.onnx".into(),
        gtcrn: "models/gtcrn.onnx".into(),
    })
    .build().unwrap();
```

事後補正（PostCorrection）に OpenAI API を使用する場合、`post_correction_openai_config()` を追加します。
この設定はエンジン非依存で、Local モードでも有効です。

```rust,no_run
.post_correction_openai_config(OpenAiConfig {
    base_url: "https://api.openai.com/v1".into(),
    api_key: std::env::var("OPENAI_API_KEY").unwrap(),
    model: "gpt-4o-mini".into(),
})
```

## SttEvent — イベント体系

`Voiput::next_event().await` で受信できる全イベントです。
zasso 側のイベントループで match して処理します。

### ライフサイクルイベント

```rust
SttEvent::Started              // 認識開始
SttEvent::Ready                // 録音準備完了（マイクオープン直後）
SttEvent::Stopped              // 認識停止
SttEvent::Error(String)        // エラー発生
```

### 認識結果イベント

```rust
SttEvent::PartialResult(String, u64)  // 部分認識結果（上書きされる可能性あり）
SttEvent::FinalResult(String, u64)    // 確定認識結果
SttEvent::Flushed(String)             // フラッシュ完了（OrchestratorInput / 遅延フラッシュ時）
```

- `PartialResult` は認識中に逐次到着します。`current_text` を更新し、UI に表示します。
- `FinalResult` は確定テキストです。`buffer` に追記されます。
- `Flushed` は Ctrl+Option（OrchestratorInput）または遅延フラッシュ時に発行されます。このテキストを zasso が AI エージェントに送信することを想定しています。

### PostCorrection イベント

```rust
SttEvent::PostCorrectionStarted   // LLM 事後補正開始
SttEvent::PostCorrectionFinished  // LLM 事後補正完了
```

LLM によるテキスト補正（ChatGPT API）の開始と完了を通知します。
PostCorrection 中は `is_post_correcting = true` になります。

### デコレーションイベント（発話中アニメーション用）

```rust
SttEvent::SttPending               // ASR API 呼び出し中（発話検出 → 結果待ち）
SttEvent::SttCompleted             // 発話単位の処理完了
SttEvent::DecorationPartial(String) // デコレーションフレーム（"... " / "? " のトグル）
SttEvent::ForceClearDecoration     // 異常時デコレーション強制クリア
```

これらは `current_text` や `buffer` を更新しません。UI のオーバーレイ表示に使用します。

### イベントフロー図

```
発話区間:
  SttPending → [DecorationPartial × N] → PartialResult → SttCompleted
                                           ↓（発話終了）
                                         FinalResult → SttCompleted
                                           ↓（無音継続）
                                         PostCorrectionStarted → ... → PostCorrectionFinished
                                           ↓
                                         FinalResult(補正後) + SttCompleted

BufferFlush (Option ダブルタップ):
  → build_flush_text() → クリップボードペースト + commit_sound → SttEvent::Stopped

OrchestratorInput (Ctrl+Option):
  → build_flush_text() → SttEvent::Flushed(text) + commit_sound → SttEvent::Stopped
```

## ホットキーシステム

voiput は macOS と Windows でグローバルホットキーをサポートします。

### 有効化

```rust
voiput.enable_hotkeys();  // 内部でプラットフォームのフックを開始
// イベントループ内で定期的に:
voiput.handle_hotkey_events();
```

### macOS（CGEventTap）

アクセシビリティ権限が必要です。システム設定 → プライバシーとセキュリティ → アクセシビリティ でアプリを許可してください。

| 操作 | アクション | 動作 |
|------|-----------|------|
| Option ダブルタップ | `Start` | 録音開始（非録音時） |
| Option ダブルタップ | `BufferFlush` | 録音停止 → テキストをカーソルにペースト（録音中） |
| Ctrl + Option | `OrchestratorInput` | 非録音時 → 録音開始。録音中 → 停止 + `Flushed` イベント発行 |

### Windows（WH_KEYBOARD_LL + rdev + GetAsyncKeyState）

| 操作 | アクション | 動作 |
|------|-----------|------|
| Alt ダブルタップ | `Start` | 録音開始（非録音時） |
| Alt ダブルタップ | `BufferFlush` | 録音停止 → テキストをカーソルにペースト（録音中） |
| Ctrl + Alt | `OrchestratorInput` | 非録音時 → 録音開始。録音中 → 停止 + `Flushed` イベント発行 |

### 遅延フラッシュ

デコレーション中（`is_stt_pending`）または PostCorrection 中（`is_post_correcting`）に
BufferFlush / OrchestratorInput が来た場合、即時実行せず `pending_flush = true` を設定し、
SttCompleted または PostCorrectionFinished 到着時に自動実行されます。
`pending_flush_is_orchestrator` フラグにより、ペースト先（clipboard / Flushed イベント）が正しく選択されます。

## VoiputConfig 設定項目

```rust
VoiputConfig::builder()
    .engine(SttEngine::OpenAI)           // 認識エンジン（OpenAI / Os / Local）
    .locale(LocaleCode::Ja)              // 言語ロケール
    .openai_config(OpenAiConfig { ... }) // OpenAI API 設定（OpenAI 時必須）
    .qwen3_asr_config(Qwen3AsrConfig {   // Qwen3-ASR 設定（Local 時必須）
        model_paths: Qwen3AsrModelPaths { ... },
        provider: "cpu".into(),
        provider: "cpu".into(),
        // auto_num_threads(): システム論理コア数の半分（最小1）
        // 例: 12→6, 8→4, 4→2, 2→1
        num_threads: std::thread::available_parallelism()
            .map(|n| (n.get() / 2).max(1) as i32)
            .unwrap_or(1),
        debug: false,
    })
    .post_correction_openai_config(OpenAiConfig { // 事後補正 OpenAI API（エンジン非依存）
        base_url: "...", api_key: "...",
        model: "gpt-4o-mini".into(),
    })
    .vad_model_paths(VadModelPaths {     // VAD モデルパス（必須）
        silero: "...", ten: "...", gtcrn: "...",
    })
    .vad(VadConfig {                      // VAD パラメータ（省略可）
        threshold: 0.5,
        min_silence_duration: 0.2,
        min_speech_duration: 0.05,
        max_speech_duration: 25.0,
        asr_stagnation_threshold_secs: 3.0,  // ASR 停滞検出（秒）
        pre_padding_ms: 200,
        utterance_min_ms: 300,
        num_threads: 4,
        ..Default::default()
    })
    .denoiser(DenoiserConfig {            // GTCRN ノイズ除去（省略可）
        enabled: true,
    })
    .signal_filter(SignalFilterConfig {   // 信号品質フィルタ（省略可）
        enabled: true,
        rms_threshold: 0.005,
        occupancy_ratio: 0.15,
    })
    .post_correction(PostCorrectionConfig {
        sentence_count_threshold: 3,
        min_text_length: 10,
        interval_ms: 2000,
    })
    .model_dir("/path/to/models")         // モデルファイルのベースディレクトリ
    .build().unwrap();
```

## Voiput 公開メソッド

| メソッド | 説明 |
|---------|------|
| `new(config)` | VoiputConfig から認識器を構築 |
| `start()` | 認識を開始 |
| `stop()` | 認識を停止 |
| `next_event().await` | 次の SttEvent を非同期待機 |
| `flush().await` | 停止 → 残余イベント収集 → 再開。最終テキストを返す |
| `request_flush()` | 非同期フラッシュ要求（oneshot でテキスト受取） |
| `enable_hotkeys()` | ホットキー監視を開始 |
| `handle_hotkey_events()` | 保留中のホットキーアクションを処理 |
| `set_engine(engine)` | エンジン種別を変更（動作中は停止 → 切替 → 再開） |
| `set_locale(locale)` | 言語ロケールを変更 |
| `update_replaces(map)` | 置換辞書を更新 |
| `paste_at_cursor(text)` | テキストをカーソル位置にペースト |
| `engine()` | 現在のエンジン種別 |
| `is_running()` | 認識中かどうか |
| `health_check()` | バックエンドの状態確認（0 = 正常） |
| `input_mode()` | 現在の入力モード（Buffered / RealTime） |
| `set_input_mode(mode)` | 入力モードを設定 |
| `request_permissions().await` | 音声認識権限を確認・要求 |

## 権限設定

### macOS

`Info.plist` に以下を追加:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>音声認識のためにマイクを使用します</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>音声認識のために音声データを処理します</string>
```

macOS 14+ では初回起動時にマイク・音声認識・アクセシビリティの各許可が求められます。
`request_permissions().await` でプログラムからも権限確認・要求できます。

### Windows

アプリケーションマニフェスト（または Tauri の capabilities）に以下を追加:

```xml
<Capabilities>
  <Capability Name="internetClient" />
  <Capability Name="microphone" />
</Capabilities>
```

## ネイティブライブラリと Tauri バンドル設定

voiput は macOS・Windows のネイティブバックエンドを使用するために
以下のプリビルドライブラリとランタイムライブラリを必要とします。
zasso の Tauri インストーラーがこれらを同封できるよう、voiput crate 内の
該当パスを以下に示します。

### macOS 用ライブラリ

`crates/voiput/prebuilt/macos/` に配置:

| ファイル | 説明 | 必須 | パス |
|---------|------|------|------|
| `libSpeechHelper.a` | Swift SpeechHelper 静的ライブラリ（macOS ネイティブ認識FFI） | ✅ | `prebuilt/macos/libSpeechHelper.a` |

`crates/voiput/libs/macos/` に build.rs が収集:

| ファイル | 説明 | 必須 | パス |
|---------|------|------|------|
| `libsherpa-onnx-c-api.dylib` | Sherpa-ONNX C API（VAD・ノイズ除去） | ✅ | `libs/macos/libsherpa-onnx-c-api.dylib` |
| `libonnxruntime.dylib` | ONNX Runtime（VAD モデル推論） | ✅ | `libs/macos/libonnxruntime.dylib` |
| `libonnxruntime.1.24.4.dylib` | ONNX Runtime（バージョン付き） | 実質必須 | `libs/macos/libonnxruntime.1.24.4.dylib` |

**Tauri bundler 設定例（`tauri.conf.json`）:**

```json
{
  "bundle": {
    "macOS": {
      "frameworks": [],
      "files": {
        "libs/macos/libsherpa-onnx-c-api.dylib": "libsherpa-onnx-c-api.dylib",
        "libs/macos/libonnxruntime.dylib": "libonnxruntime.dylib",
        "libs/macos/libonnxruntime.1.24.4.dylib": "libonnxruntime.1.24.4.dylib"
      }
    }
  }
}
```

macOS フレームワーク（システム標準、同封不要）:
- `Foundation`, `AVFoundation`, `Speech`, `CoreFoundation`
- Swift ランタイム（macOS 15+ では dyld 共有キャッシュ内に存在）

### Windows 用ライブラリ

`crates/voiput/prebuilt/windows/` に配置:

| ファイル | 説明 | 必須 | パス |
|---------|------|------|------|
| `SpeechHelper.dll` | C# Native AOT DLL（Windows ネイティブ認識FFI） | ✅ | `prebuilt/windows/SpeechHelper.dll` |
| `SpeechHelper.lib` | 同上のインポートライブラリ | ✅ | `prebuilt/windows/SpeechHelper.lib` |

`crates/voiput/libs/windows/` に build.rs が収集:

| ファイル | 説明 | 必須 | パス |
|---------|------|------|------|
| `sherpa-onnx-c-api.dll` | Sherpa-ONNX C API（VAD・ノイズ除去） | ✅ | `libs/windows/sherpa-onnx-c-api.dll` |
| `onnxruntime.dll` | ONNX Runtime | ✅ | `libs/windows/onnxruntime.dll` |
| `SpeechHelper.dll` | SpeechHelper DLL（prebuilt からコピー） | ✅ | `libs/windows/SpeechHelper.dll` |
| `vcruntime140.dll` | VC++ 再頒布可能 | ✅ | `libs/windows/vcruntime140.dll` |
| `vcruntime140_1.dll` | VC++ 再頒布可能 | ✅ | `libs/windows/vcruntime140_1.dll` |
| `msvcp140.dll` | VC++ 再頒布可能 | ✅ | `libs/windows/msvcp140.dll` |

**Tauri bundler 設定例:**

```json
{
  "bundle": {
    "windows": {
      "wix": {
        "componentGroupRefs": ["voiput_libs"]
      },
      "files": {
        "libs/windows/sherpa-onnx-c-api.dll": "sherpa-onnx-c-api.dll",
        "libs/windows/onnxruntime.dll": "onnxruntime.dll",
        "libs/windows/SpeechHelper.dll": "SpeechHelper.dll",
        "libs/windows/vcruntime140.dll": "vcruntime140.dll",
        "libs/windows/vcruntime140_1.dll": "vcruntime140_1.dll",
        "libs/windows/msvcp140.dll": "msvcp140.dll"
      }
    }
  }
}
```

### 全プラットフォーム共通: ONNX モデルファイル

`crates/voiput/models/` に build.rs が自動ダウンロード:

| ファイル | 説明 | 必須 |
|---------|------|------|
| `silero_vad.onnx` | Silero VAD（高精度） | ✅ |
| `silero_vad.int8.onnx` | Silero VAD（軽量INT8） | 省略可 |
| `ten_vad.onnx` | TEN VAD（軽量） | ✅ |
| `ten-vad.int8.onnx` | TEN VAD（軽量INT8） | 省略可 |
| `gtcrn.onnx` | GTCRN ノイズ除去 | ✅（OpenAI モード推奨） |
| `tokens.txt` | Lindera IPADIC トークナイザー | ✅ |

### Qwen3-ASR モデル（`models/qwen3-asr/`）

| ファイル | 説明 | 必須 |
|---------|------|------|
| `encoder.int8.onnx` | Qwen3-ASR エンコーダ（約174MB） | ✅ |
| `decoder.int8.onnx` | Qwen3-ASR デコーダ（約722MB） | ✅ |
| `conv_frontend.onnx` | Qwen3-ASR フロントエンド（約42MB） | ✅ |
| `tokenizer/vocab.json` | BPE トークナイザー語彙ファイル | ✅ |
| `tokenizer/merges.txt` | BPE トークナイザーマージファイル | ✅ |
| `tokenizer/tokenizer_config.json` | トークナイザー設定 | ✅ |

モデルダウンロード元: [huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8](https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8)
VAD・ノイズ除去モデル: [huggingface.co/t-kawata/mycute](https://huggingface.co/t-kawata/mycute)

## モデルファイルビルド時の自動ダウンロード

`build.rs` が初回ビルド時に HuggingFace から `models/` へ自動ダウンロードします。
VAD モデル・ノイズ除去モデルに加え、Qwen3-ASR モデル（encoder/decoder/conv_frontend/tokenizer）も
自動ダウンロードされます。
ダウンロードに失敗した場合でも、ビルドはスタブリンクで成功しますが
VAD 処理および Qwen3-ASR 認識は利用不可になります。

## 開発用デモ（test-run）

```bash
# 全テスト実行
cargo test --package voiput

# 開発用デモ
cargo run --bin test-run                                    # OS 標準モード（日本語）
cargo run --bin test-run -- --engine openai --openai-key=sk-xxx  # OpenAI モード
cargo run --bin test-run -- --engine local --openai-key=sk-xxx   # Local（Qwen3-ASR）+ 事後補正

# Makefile ターゲット
make run             # OS 標準モード
make run-openai      # OpenAI モード（KEY=sk-xxx 必須）
make run-local       # Local Qwen3-ASR モード（KEY=sk-xxx で事後補正有効）
make run-local-no-denoiser  # Local + Denoiser オフ

# auto_num_threads()
# Qwen3-ASR 推論と VAD のスレッド数は auto_num_threads() により
# システムの論理コア数の半分に自動調整されます（最小1）。
# 例: 12コア→6, 8コア→4, 4コア→2, 2コア→1

# オプション
--audio-verify    # 音声再生テスト
--no-denoiser     # GTCRN ノイズ除去を無効化
--locale en       # 英語ロケール
--base-url <URL>  # OpenAI API ベースURL変更
```

## ビルドシステム

`build.rs` が処理するビルド依存関係の概要:

### macOS

1. `native/swift/build.sh` — Swift ソースから `libSpeechHelper.a` をビルド
2. ビルド失敗時 → C スタブにフォールバック（全ての FFI 関数が -1 を返す）
3. `collect_runtime_libs_macos()` — `libsherpa-onnx-c-api.dylib` 等を収集
4. `swiftc -print-target-info` — Swift ランタイムパスを動的解決

### Windows

1. `native/cs/build.ps1` — C# ソースから `SpeechHelper.dll + .lib` を Native AOT ビルド
2. ビルド失敗時 → C スタブにフォールバック（`cl.exe` + `lib.exe` 経由）
3. `collect_runtime_libs_windows()` — DLL 群を収集
4. VC++ 再頒布可能 DLL をシステムから探索

## Copyright

Copyright (c) 2026 Toshimi Kawata
