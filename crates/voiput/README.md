# voiput — ポータブル音声認識

**voiput** は macOS・Windows・クラウド（OpenAI Whisper API）の3バックエンドを統一的に扱うポータブル音声認識（STT）Rust クレートです。

## 対応プラットフォーム

| バックエンド | プラットフォーム | 方式 | 必要環境 |
|-------------|----------------|------|---------|
| macOS ネイティブ | macOS 15+ | SFSpeechRecognizer (Classic) / DictationTranscriber (Tahoe, macOS 26+) | マイク許可 |
| Windows ネイティブ | Windows 10+ | WinRT SpeechRecognizer (Native AOT DLL) | マイク許可 |
| OpenAI Whisper | 全プラットフォーム | REST API (async-openai) | API キー |

## クイックスタート

### Cargo.toml

```toml
[dependencies]
voiput = { git = "https://github.com/t-kawata/zasso" }
tokio = { version = "1", features = ["full"] }
```

### 最小コード（OS ネイティブ認識）

```rust,no_run
use voiput::{Voiput, VoiputConfig, SttEngine, LocaleCode, VadModelPaths, SttEvent};
use tokio::runtime::Runtime;

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
voiput.start().unwrap();

// イベントループ（別タスクで駆動）
// while let Some(event) = voiput.next_event().await { ... }

// 現在のテキストを確定
let rt = Runtime::new().unwrap();
let text = rt.block_on(async { voiput.flush().await }).unwrap();
println!("認識結果: {}", text);

voiput.stop().unwrap();
// Drop で自動クリーンアップ
```

### OpenAI モード

```rust,no_run
use voiput::{VoiputConfig, SttEngine, LocaleCode, OpenAiConfig};

let config = VoiputConfig::builder()
    .engine(SttEngine::OpenAI)
    .locale(LocaleCode::En)
    .openai_config(OpenAiConfig {
        base_url: "https://api.openai.com/v1".into(),
        api_key: std::env::var("OPENAI_API_KEY").unwrap(),
        model: "gpt-4o-mini-transcribe".into(),
    })
    .vad_model_paths(/* ... */)
    .build().unwrap();
```

## API

### Voiput

crate の公開エントリポイント。利用者はこの構造体を通じて全操作を行う。

| メソッド | 説明 |
|---------|------|
| `Voiput::new(config)` | VoiputConfig から認識器を構築 |
| `start()` | 認識を開始 |
| `stop()` | 認識を停止 |
| `next_event().await` | 次のイベントを非同期待機（Started, PartialResult, FinalResult 等） |
| `flush().await` | 停止 → 残余イベント収集 → 再開。最後のテキストを返す |
| `set_engine(engine)` | エンジン種別を変更（動作中は停止→切替→再開） |
| `set_locale(locale)` | 言語ロケールを変更 |
| `update_replaces(map)` | 置換辞書を更新（誤認識の自動置換） |
| `engine()` | 現在のエンジン種別 |
| `is_running()` | 認識中かどうか |
| `health_check()` | バックエンドの状態確認（0 = 正常） |

### VoiputConfig

| 設定項目 | 必須 | 説明 |
|---------|------|------|
| `engine` | ✅ | `SttEngine::Os` または `SttEngine::OpenAI` |
| `locale` | ✅ | `LocaleCode::Ja` または `LocaleCode::En` |
| `vad_model_paths` | ✅ | Silero/TEN VAD モデルファイルのパス |
| `openai_config` | ⚠️（OpenAI 時） | API キー・ベースURL・モデル名 |
| `vad` | 省略可 | VAD パラメータ（閾値・タイムアウト等） |
| `post_correction` | 省略可 | LLM 事後補正パラメータ |
| `denoiser` | 省略可 | ノイズ除去設定 |
| `signal_filter` | 省略可 | 信号品質フィルタ設定 |
| `speech_timeout_sec` | 省略可 | 発話タイムアウト（デフォルト 30秒） |
| `model_dir` | 省略可 | モデルファイルのベースディレクトリ |

### SttEvent

認識エンジンから利用者に送られるイベント。

| Variant | 説明 |
|---------|------|
| `Started` | 認識開始 |
| `Stopped` | 認識停止 |
| `Ready` | 録音準備完了 |
| `PartialResult(text, seq)` | 部分認識結果（上書きされる可能性あり） |
| `FinalResult(text, seq)` | 確定認識結果 |
| `Error(msg)` | エラー発生 |
| `PostCorrectionStarted` / `PostCorrectionFinished` | LLM 事後補正中 |
| `SttPending` / `SttCompleted` | ASR API 呼び出し中/完了（装飾表示用） |
| `ForceClearDecoration` | 装飾表示の強制クリア |
| `DecorationPartial(text)` | 装飾フレーム |

## 権限設定

### macOS

`Info.plist`（アプリケーションバンドル）に以下を追加：

```xml
<key>NSMicrophoneUsageDescription</key>
<string>音声認識のためにマイクを使用します</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>音声認識のために音声データを処理します</string>
```

macOS 14+ では初回起動時にマイク・音声認識の許可ダイアログが表示されます。設定アプリの「プライバシーとセキュリティ」からも許可できます。

### Windows

アプリケーションマニフェストに以下を追加：

```xml
<Capabilities>
  <Capability Name="internetClient" />
  <Capability Name="microphone" />
</Capabilities>
```

Windows 10+ では初回起動時にマイクアクセスの許可ダイアログが表示されます。

## モデルファイル

VAD（音声区間検出）とノイズ除去には ONNX モデルファイルが必要です。
`build.rs` が初回ビルド時に HuggingFace から自動ダウンロードします。

| ファイル | 用途 | 自動DL |
|---------|------|--------|
| `silero_vad.onnx` | Silero VAD（高精度） | ✅ |
| `silero_vad.int8.onnx` | Silero VAD（軽量） | ✅ |
| `ten_vad.onnx` | TEN VAD（軽量） | ✅ |
| `ten-vad.int8.onnx` | TEN VAD（軽量INT8） | ✅ |
| `gtcrn.onnx` | GTCRN ノイズ除去 | ✅ |
| `tokens.txt` | トークナイザー | ✅ |

手動ダウンロード: [huggingface.co/t-kawata/mycute](https://huggingface.co/t-kawata/mycute)

## 開発

### テスト

```bash
# 全テスト
cargo test --package voiput

# 統合テストのみ
cargo test --test integration_test

# 特定モジュール
cargo test --package voiput -- pipeline::
```

### 開発用デモ

```bash
# 全機能デモ
cargo run --bin test-run

# 音声再生テスト
cargo run --bin test-run -- --audio-verify

# OpenAI 実認識テスト
cargo run --bin test-run -- --openai-key=sk-xxxxx

# カスタムベースURL
cargo run --bin test-run -- --openai-key=sk-xxxxx --base-url=http://localhost:8080/v1
```

test-run は各コンポーネントの動作確認を順次実行する開発用バイナリです。

### ビルド

ネイティブライブラリは `build.rs` が自動的にビルドします。
macOS では `native/swift/build.sh`、Windows では `native/cs/build.ps1` を使用します。

```bash
# macOS: 手動ビルド（必要な場合）
bash crates/voiput/native/swift/build.sh

# Windows: 手動ビルド（必要な場合）
powershell -File crates/voiput/native/cs/build.ps1
```

## ライセンス

MIT License

Copyright (c) 2026 Toshimi Kawata

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
