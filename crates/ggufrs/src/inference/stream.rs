//! ストリーミング生成ユーティリティ
//!
//! llama-cpp-2 の同期推論を `tokio::sync::mpsc` チャネルで
//! `futures::Stream` に変換する。
//!
//! # データフロー
//!
//! ```text
//! spawn_blocking: 手動ループ（サンプル→デコード→mpsc送信→次のバッチデコード）
//!   → mpsc::Sender (blocking_send で各トークンを非同期的に送信)
//!   → mpsc::Receiver (非同期受信)
//!   → ReceiverStream (futures::Stream に変換)
//!   → Pin<Box<dyn Stream<Item = Result<String, GgufError>>>>
//! ```

use std::num::NonZeroU32;
use std::pin::Pin;

use futures::Stream;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::AddBos;
use llama_cpp_2::sampling::LlamaSampler;

use crate::error::GgufError;
use crate::inference::generate::InferenceParams;

/// mpsc チャネルのデフォルト容量
///
/// 64: 背圧によるトークン生成の抑制とメモリ使用量のバランスを取る値。
/// チャネルが満杯の場合 `blocking_send` がブロックされ、結果として
/// llama-cpp-2 のサンプリングループもブロックされる → 背圧として機能する。
const STREAM_CHANNEL_CAPACITY: usize = 64;

/// 同期的にストリーミング推論を実行し、トークンを mpsc チャネルに送信する
///
/// `spawn_blocking` 内で呼び出される同期関数。llama-cpp-2 の同期推論を実行し、
/// 生成された各トークンを mpsc チャネルに送信する。
///
/// `generate.rs` の `run_inference_blocking()` と同様の手順だが、以下の点が異なる：
/// - 各トークン生成後に `tx.blocking_send()` で送信する
/// - 戻り値は `()`（結果はチャネル経由で非同期的に受け取る）
/// - エラー時はチャネルにエラー文字列を送信して return する
///
/// # 引数
/// - `model`: ロード済み LlamaModel
/// - `backend`: llama-cpp-2 バックエンド
/// - `prompt`: 入力プロンプト
/// - `params`: 生成パラメータ
/// - `tx`: トークン送信用 mpsc Sender（容量 64）
pub(crate) fn run_inference_stream_blocking(
    model: &llama_cpp_2::model::LlamaModel,
    backend: &llama_cpp_2::llama_backend::LlamaBackend,
    prompt: &str,
    params: &InferenceParams,
    tx: mpsc::Sender<Result<String, GgufError>>,
) {
    // ── 1. プロンプトをトークン化 ──
    let tokens = match model.str_to_token(prompt, AddBos::Always) {
        Ok(tokens) => tokens,
        Err(e) => {
            send_error(&tx, format!("トークン化エラー: {e}"));
            return;
        }
    };

    if tokens.is_empty() {
        return;
    }

    // ── 2. 推論コンテキスト作成 ──
    let n_ctx = tokens.len() + params.max_tokens as usize;
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(n_ctx.max(512) as u32));
    let mut ctx = match model.new_context(backend, ctx_params) {
        Ok(ctx) => ctx,
        Err(e) => {
            send_error(&tx, format!("推論コンテキスト作成エラー: {e}"));
            return;
        }
    };

    // ── 3. プロンプトバッチをデコード ──
    let mut batch = LlamaBatch::new(tokens.len(), 1);
    if let Err(e) = batch.add_sequence(&tokens, 0, false) {
        send_error(&tx, format!("バッチシーケンス追加エラー: {e}"));
        return;
    }
    if let Err(e) = ctx.decode(&mut batch) {
        send_error(&tx, format!("プロンプトデコードエラー: {e}"));
        return;
    }

    // ── 4. LlamaSampler チェーン構築 ──
    //
    // チェーン末尾には選択用サンプラー（greedy）が必須。
    let mut sampler_chain: Vec<LlamaSampler> = Vec::new();
    sampler_chain.push(LlamaSampler::temp(params.temperature));
    if let Some(p) = params.top_p {
        sampler_chain.push(LlamaSampler::top_p(p, 1));
    }
    sampler_chain.push(LlamaSampler::greedy());
    let mut sampler = LlamaSampler::chain_simple(sampler_chain);

    // ── 5. トークン生成ループ（サンプル → デコード → mpsc送信 → 次のバッチデコード） ──
    let mut generated: i32 = 0;
    let n_prompt_tokens: i32 = match tokens.len().try_into() {
        Ok(n) => n,
        Err(e) => {
            send_error(&tx, format!("トークン数変換エラー: {e}"));
            return;
        }
    };

    loop {
        // サンプリング
        let token = sampler.sample(&ctx, -1);

        // EOS チェック
        if model.is_eog_token(token) || generated >= params.max_tokens {
            break;
        }

        // トークンをバイト列にデコード
        let piece = match crate::inference::generate::decode_token(model, token) {
            Ok(bytes) => bytes,
            Err(e) => {
                send_error(&tx, format!("トークンデコードエラー: {e}"));
                return;
            }
        };

        // mpsc チャネルに送信（レシーバがドロップされたら終了）
        let text = String::from_utf8(piece).unwrap_or_default();
        if tx.blocking_send(Ok(text)).is_err() {
            // レシーバがドロップされた → ストリームがキャンセルされた
            return;
        }
        generated += 1;

        // 次のトークンをデコードするためのバッチ（単一トークン）
        let pos = n_prompt_tokens + generated - 1;
        let mut next_batch = LlamaBatch::new(1, 1);
        if let Err(e) = next_batch.add(token, pos, &[0], true) {
            send_error(&tx, format!("次のトークン追加エラー: {e}"));
            return;
        }
        if let Err(e) = ctx.decode(&mut next_batch) {
            send_error(&tx, format!("次のトークンデコードエラー: {e}"));
            return;
        }
    }
}

/// エラーメッセージを mpsc チャネルに送信するヘルパー
///
/// チャネルが閉じている場合（レシーバドロップ）はエラーを無視する。
fn send_error(tx: &mpsc::Sender<Result<String, GgufError>>, message: String) {
    let err = GgufError::InferenceFailed(Box::new(std::io::Error::other(message)));
    let _ = tx.blocking_send(Err(err));
}

/// 非同期ストリーム生成関数（内部実装）
///
/// mpsc チャネルを作成し、`spawn_blocking` で `run_inference_stream_blocking` を実行、
/// `ReceiverStream` でラップして `Pin<Box<dyn Stream>>` として返す。
///
/// モデルロードやパラメータ変換は呼び出し元（`generate.rs`）で完了しているため、
/// この関数は純粋に非同期ストリームのラップのみを行う。
pub(crate) async fn generate_stream_inner(
    model: std::sync::Arc<llama_cpp_2::model::LlamaModel>,
    backend: &'static llama_cpp_2::llama_backend::LlamaBackend,
    prompt: String,
    params: InferenceParams,
) -> Result<Pin<Box<dyn Stream<Item = Result<String, GgufError>> + Send>>, GgufError> {
    let (tx, rx) = mpsc::channel::<Result<String, GgufError>>(STREAM_CHANNEL_CAPACITY);
    let rx_stream = ReceiverStream::new(rx);

    tokio::task::spawn_blocking(move || {
        run_inference_stream_blocking(&model, backend, &prompt, &params, tx);
    });

    Ok(Box::pin(rx_stream))
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::StreamExt;

    /// ストリームから全チャンクが正しい順序で収集できる
    #[tokio::test]
    async fn stream_from_iter_collects_all_chunks() {
        let chunks = vec!["Hello", " world", "!"];
        let stream = futures::stream::iter(
            chunks
                .iter()
                .map(|c| Ok::<String, GgufError>(c.to_string())),
        );
        let results: Vec<String> = stream
            .filter_map(|r| async move { r.ok() })
            .collect()
            .await;
        assert_eq!(results, vec!["Hello", " world", "!"]);
    }

    /// 空のストリームが即座に None を返す
    #[tokio::test]
    async fn empty_stream_ends_immediately() {
        let stream = futures::stream::iter::<Vec<Result<String, GgufError>>>(vec![]);
        let results: Vec<Result<String, GgufError>> = stream.collect().await;
        assert!(results.is_empty());
    }

    /// sender drop により ReceiverStream が終了する
    #[tokio::test]
    async fn receiver_stream_drop_ends_stream() -> Result<(), GgufError> {
        let (tx, rx) = mpsc::channel::<Result<String, GgufError>>(64);
        let mut rx_stream = tokio_stream::wrappers::ReceiverStream::new(rx);

        tx.send(Ok("chunk1".into()))
            .await
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;
        drop(tx); // sender をドロップ

        let result = rx_stream.next().await;
        assert!(result.is_some(), "first chunk should be received");
        let next = rx_stream.next().await;
        assert!(next.is_none(), "stream should end after sender drop");
        Ok(())
    }

}
