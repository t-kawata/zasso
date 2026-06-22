//! ggufrs サーバー結合テスト
//!
//! 実モデルは使用せず、空設定の GgufEngine を起動してサーバーの
//! ライフサイクル・ルーティング・エラーレスポンスを検証する。
//!
//! # 注意
//!
//! - 全シナリオを1つのテスト関数に統合している（ポート競合回避のため）。
//! - 実ハンドラロジックの詳細な動作確認は M4-1 のユニットテストでカバー済み。
//! - 結合テストは ggufrs crate の公開 API のみを使用する。

use std::sync::Arc;
use std::time::Duration;

use ggufrs::*;

/// 結合テストで使用する固定ポート番号
///
/// 18401: zasso の管理ポート範囲（3900-3919）外の未使用領域。
const TEST_PORT: u16 = 18401;

/// テスト用のサーバー設定を生成する
fn test_server_config() -> ServerConfig {
    ServerConfig {
        bind: format!("127.0.0.1:{TEST_PORT}").parse().unwrap(),
        models: vec![],
        auto_start_server: false,
    }
}

/// テスト用の GPU 設定を生成する
fn test_gpu_config() -> GpuConfig {
    GpuConfig {
        provider: GpuProvider::Cpu,
        cpu_only: true,
    }
}

/// テストサーバーを起動して JoinHandle を返す
///
/// 空設定（モデル0個）で GgufEngine を初期化し、固定ポートで HTTP サーバーを起動する。
async fn start_test_server() -> tokio::task::JoinHandle<Result<(), GgufError>> {
    let config = GgufConfig {
        models: vec![],
        server: test_server_config(),
        gpu: test_gpu_config(),
    };
    let engine = Arc::new(GgufEngine::new(config.clone()).await.unwrap());
    let handle = engine.start_server(config.server).await.unwrap();
    // サーバー起動待機
    tokio::time::sleep(Duration::from_millis(200)).await;
    handle
}

/// テストサーバーを停止する
async fn stop_test_server(handle: tokio::task::JoinHandle<Result<(), GgufError>>) {
    handle.abort();
    let result = handle.await;
    match &result {
        Ok(Ok(())) => { /* 正常完了 */ }
        Ok(Err(e)) => panic!("server task failed: {e}"),
        Err(e) if e.is_cancelled() => { /* abort 成功 */ }
        Err(e) => panic!("unexpected join error: {e}"),
    }
}

/// サーバー結合テスト（全シナリオ）
///
/// 1つのテスト関数で全シナリオを実行する（ポート競合防止）。
#[tokio::test]
async fn test_server_integration() {
    // ----------------------------------------------------------------
    // 準備: サーバー起動
    // ----------------------------------------------------------------
    let handle = start_test_server().await;
    let client = reqwest::Client::new();
    let base_url = format!("http://127.0.0.1:{TEST_PORT}");

    // ----------------------------------------------------------------
    // 1. サーバーライフサイクル: GET /v1/models で稼働確認
    // ----------------------------------------------------------------
    let response = client
        .get(format!("{base_url}/v1/models"))
        .send()
        .await
        .expect("GET /v1/models should succeed");
    assert_eq!(response.status(), 200, "/v1/models should return 200");

    // ----------------------------------------------------------------
    // 2. GET /v1/models: レスポンス形式
    // ----------------------------------------------------------------
    let models_body: serde_json::Value = response
        .json()
        .await
        .expect("/v1/models response should be valid JSON");
    assert_eq!(models_body["object"], "list");
    assert!(models_body["data"].is_array());

    // ----------------------------------------------------------------
    // 3. POST /v1/chat/completions: 実モデル不在 → 404
    // ----------------------------------------------------------------
    let chat_body = serde_json::json!({
        "model": "nonexistent-model",
        "messages": [
            {"role": "user", "content": "Hello"}
        ]
    });
    let response = client
        .post(format!("{base_url}/v1/chat/completions"))
        .json(&chat_body)
        .send()
        .await
        .expect("POST /v1/chat/completions should return");
    // ModelNotFound → GgufError::ModelNotFound → AppError: 404
    assert_eq!(
        response.status(),
        404,
        "nonexistent model returns 404 (ModelNotFound)"
    );
    let error_body: serde_json::Value = response
        .json()
        .await
        .expect("error response should be valid JSON");
    assert!(
        error_body.get("error").is_some(),
        "error response should contain 'error' field"
    );

    // ----------------------------------------------------------------
    // 4. POST /v1/chat/completions: 空ボディ → 422（デシリアライズ失敗）
    // ----------------------------------------------------------------
    let response = client
        .post(format!("{base_url}/v1/chat/completions"))
        .header("content-type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("POST with empty body should return");
    // empty body lacks required 'messages' field → Axum deserialization error → 422
    assert_eq!(
        response.status(),
        422,
        "request with empty body returns 422 (missing required messages field)"
    );

    // ----------------------------------------------------------------
    // 5. POST /anthropic/v1/messages: ルート不在 → 404
    // ----------------------------------------------------------------
    let response = client
        .post(format!("{base_url}/anthropic/v1/messages"))
        .header("content-type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("POST /anthropic/v1/messages should return");
    // Anthropic エンドポイントは削除済みのため 404
    assert_eq!(
        response.status(),
        404,
        "Anthropic endpoint returns 404 (route removed)"
    );

    // ----------------------------------------------------------------
    // 後処理: サーバー停止
    // ----------------------------------------------------------------
    stop_test_server(handle).await;
}
