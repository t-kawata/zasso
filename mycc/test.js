#!/usr/bin/env node
// test.js — 6 段階検証スクリプト
// run.sh が起動した状態で実行すること
//
// 外部依存: Node.js ビルトイン http / child_process モジュールのみ（Q16）
// npm install 不要
//
// 使用例:
//   node test.js                    # 6段階テスト実行
//   node test.js --fail-fast        # 初回失敗で停止
//   MTPLX_PORT=9090 node test.js    # カスタムポート

const http = require("http");

// === Configuration ===
// 環境変数から設定を取得。未設定時はデフォルト値を使用する
const MTPLX_PORT = parseInt(process.env.MTPLX_PORT || "8080", 10);
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "8082", 10);
const MODEL_NAME =
  process.env.MODEL_NAME || "Qwen3.6-27B-MTPLX-Optimized-Speed";
const TIMEOUT = parseInt(process.env.TIMEOUT || "10000", 10);
const FAIL_FAST = process.argv.includes("--fail-fast");

let passed = 0;
let failed = 0;

// === Utility ===

// httpRequest — Promise ベース HTTP クライアント
// タイムアウト処理と JSON パース（失敗時 null）を含む
// 戻り値: { status: number, body: string, json: object|null }
function httpRequest(method, hostname, port, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port,
      path,
      method,
      timeout: TIMEOUT,
      headers: body ? { "Content-Type": "application/json" } : {},
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          /* not JSON — そのまま残す */
        }
        resolve({ status: res.statusCode, body: data, json: parsed });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// streamRequest — SSE ストリーミングリクエスト
// OpenAI /v1/chat/completions と Anthropic /v1/messages の両方に対応
// onChunk コールバックが各チャンクのテキストを受取り、Promise は完了時に解決する
function streamRequest(hostname, port, path, body, onChunk) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const options = {
      hostname,
      port,
      path,
      method: "POST",
      timeout: TIMEOUT * 6,
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
    };
    const req = http.request(options, (res) => {
      let buffer = "";
      let tokenCount = 0;

      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (
            !trimmed ||
            trimmed === "data: [DONE]" ||
            trimmed === "event: done"
          )
            continue;

          if (trimmed.startsWith("data: ")) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              let text = "";
              // OpenAI 形式: choices[0].delta.content + reasoning_content
              if (json.choices && json.choices[0] && json.choices[0].delta) {
                const d = json.choices[0].delta;
                if (d.reasoning_content) {
                  // 思考プロセスは行頭マーカーなしで逐次表示
                  text = d.reasoning_content;
                }
                if (d.content) {
                  text = d.content;
                }
              }
              // Anthropic 形式: type=content_block_delta, delta.text
              if (
                json.type === "content_block_delta" &&
                json.delta &&
                json.delta.text
              ) {
                text = json.delta.text;
              }
              if (text) {
                tokenCount++;
                if (onChunk) onChunk(text);
              }
            } catch {
              /* JSON parse error */
            }
          }
        }
      });

      res.on("end", () => {
        const elapsed = (Date.now() - startTime) / 1000;
        resolve({ elapsed, tokenCount, ok: res.statusCode === 200 });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

// findMTPLXProcess — ps で MTPLX プロセスの生存確認
// macOS Sequoia 以降では pgrep がサンドボックス制限を受けるため ps を使用する
function findMTPLXProcess() {
  const { execSync } = require("child_process");
  try {
    const out = execSync(
      'ps aux | grep -v grep | grep -c "mtplx.*serve\\|lightning-mlx.*serve"',
      { stdio: "pipe", timeout: 5000 },
    );
    return parseInt(out.toString().trim(), 10) > 0;
  } catch {
    return false;
  }
}

// findProxyProcess — ps で Proxy プロセスの生存確認
function findProxyProcess() {
  const { execSync } = require("child_process");
  try {
    const out = execSync('ps aux | grep -v grep | grep -c "uvicorn"', {
      stdio: "pipe",
      timeout: 5000,
    });
    return parseInt(out.toString().trim(), 10) > 0;
  } catch {
    return false;
  }
}

// printStage — テスト段階結果の整形表示
// n: 段階番号, label: テスト名, ok: 成否, detail: 追加情報（省略可）
function printStage(n, label, ok, detail = "") {
  const mark = ok ? "✅" : "❌";
  console.log(`Stage ${n}: ${mark} ${label}`);
  if (detail) console.log(`         ${detail}`);
}

// summarize — 集計表示 + exit
// passed と failed のカウントに基づき終了コードを決定する
function summarize() {
  const total = passed + failed;
  console.log("");
  console.log("=".repeat(50));
  console.log(`テスト結果: ${passed}/${total} passed`);
  if (failed === 0) {
    console.log("✅ 全テスト通過 — MTPLX + Proxy 正常動作");
  } else {
    console.log(`❌ ${failed} 件のテスト失敗`);
  }
  console.log("=".repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

// === Main ===
async function main() {
  console.log("=== mycc テストスクリプト ===");
  console.log(`MTPLX: 127.0.0.1:${MTPLX_PORT}  Proxy: 127.0.0.1:${PROXY_PORT}`);
  console.log(`モデル: ${MODEL_NAME}`);
  console.log(`Fail-Fast: ${FAIL_FAST ? "ON" : "OFF"}`);
  console.log("");

  // Stage 1: MTPLX プロセス生存確認
  const mtplxAlive = findMTPLXProcess();
  printStage(
    1,
    "MTPLX プロセス生存確認",
    mtplxAlive,
    mtplxAlive
      ? "プロセス稼働中"
      : "プロセスが見つかりません — run.sh を起動してください",
  );
  if (mtplxAlive) {
    passed++;
  } else {
    failed++;
    if (FAIL_FAST) {
      summarize();
      return;
    }
  }

  // Stage 2: /v1/models (OpenAI 互換)
  try {
    const res = await httpRequest("GET", "127.0.0.1", MTPLX_PORT, "/v1/models");
    const modelFound = res.json && res.json.data && res.json.data.length > 0;
    printStage(
      2,
      `GET /v1/models (${res.status})`,
      res.status === 200 && modelFound,
      res.status === 200
        ? modelFound
          ? `モデル "${MODEL_NAME}" 確認`
          : `モデル名 "${MODEL_NAME}" が応答に含まれていません`
        : `HTTP ${res.status} — MTPLX が期待通り応答していません`,
    );
    if (res.status === 200 && modelFound) {
      passed++;
    } else {
      failed++;
      if (FAIL_FAST) {
        summarize();
        return;
      }
    }
  } catch (e) {
    printStage(2, "GET /v1/models", false, `接続エラー: ${e.message}`);
    failed++;
    if (FAIL_FAST) {
      summarize();
      return;
    }
  }

  // Stage 3: /v1/chat/completions (OpenAI 互換)
  try {
    const payload = {
      model: MODEL_NAME,
      messages: [{ role: "user", content: 'Say "hello" in one word.' }],
      max_tokens: 32,
      temperature: 0.6,
    };
    const res = await httpRequest(
      "POST",
      "127.0.0.1",
      MTPLX_PORT,
      "/v1/chat/completions",
      payload,
    );
    const hasChoices =
      res.json && res.json.choices && res.json.choices.length > 0;
    printStage(
      3,
      "POST /v1/chat/completions",
      res.status === 200 && hasChoices,
      res.status === 200
        ? hasChoices
          ? `応答: "${(res.json.choices[0].message?.content || "").slice(0, 50)}..."`
          : "choices[] が空です"
        : `HTTP ${res.status}`,
    );
    if (res.status === 200 && hasChoices) {
      passed++;
    } else {
      failed++;
      if (FAIL_FAST) {
        summarize();
        return;
      }
    }
  } catch (e) {
    printStage(
      3,
      "POST /v1/chat/completions",
      false,
      `接続エラー: ${e.message}`,
    );
    failed++;
    if (FAIL_FAST) {
      summarize();
      return;
    }
  }

  // Stage 4: Proxy プロセス生存確認
  const proxyAlive = findProxyProcess();
  printStage(
    4,
    "Proxy プロセス生存確認",
    proxyAlive,
    proxyAlive ? "プロセス稼働中" : "プロセスが見つかりません",
  );
  if (proxyAlive) {
    passed++;
  } else {
    failed++;
    if (FAIL_FAST) {
      summarize();
      return;
    }
  }

  // Stage 5: GET / (Proxy)
  try {
    const res = await httpRequest("GET", "127.0.0.1", PROXY_PORT, "/");
    printStage(5, "GET Proxy /", res.status === 200, `HTTP ${res.status}`);
    if (res.status === 200) {
      passed++;
    } else {
      failed++;
      if (FAIL_FAST) {
        summarize();
        return;
      }
    }
  } catch (e) {
    printStage(5, "GET Proxy /", false, `接続エラー: ${e.message}`);
    failed++;
    if (FAIL_FAST) {
      summarize();
      return;
    }
  }

  // Stage 6: POST /v1/messages (Anthropic 互換 — proxy 経由)
  try {
    const proxyModel = "openai/" + MODEL_NAME;
    const payload = {
      model: proxyModel,
      max_tokens: 32,
      messages: [{ role: "user", content: 'Say "hello" in one word.' }],
    };
    const res = await httpRequest(
      "POST",
      "127.0.0.1",
      PROXY_PORT,
      "/v1/messages",
      payload,
    );
    const hasContent =
      res.json && res.json.content && res.json.content.length > 0;
    printStage(
      6,
      "POST /v1/messages (Anthropic)",
      res.status === 200 && hasContent,
      res.status === 200
        ? hasContent
          ? "応答あり"
          : "content が空です"
        : `HTTP ${res.status}`,
    );
    if (res.status === 200 && hasContent) {
      passed++;
    } else {
      failed++;
      if (FAIL_FAST) {
        summarize();
        return;
      }
    }
  } catch (e) {
    printStage(
      6,
      "POST /v1/messages (Anthropic)",
      false,
      `接続エラー: ${e.message}`,
    );
    failed++;
    if (FAIL_FAST) {
      summarize();
      return;
    }
  }

  // Stage 7: OpenAI ストリーミング (/v1/chat/completions, stream: true)
  console.log("");
  console.log("--- Stage 7: OpenAI ストリーミング ---");
  const STREAM_PROMPT = "減価償却について説明してください。";
  console.log("  プロンプト: " + STREAM_PROMPT);
  try {
    const streamPayload = {
      model: MODEL_NAME,
      messages: [{ role: "user", content: STREAM_PROMPT }],
      max_tokens: 128,
      temperature: 0.6,
      stream: true,
    };
    process.stdout.write("  応答: ");
    const result = await streamRequest(
      "127.0.0.1",
      MTPLX_PORT,
      "/v1/chat/completions",
      streamPayload,
      (text) => {
        process.stdout.write(text);
      },
    );
    process.stdout.write("\n");
    printStage(
      7,
      `OpenAI ストリーム (${result.tokenCount} tokens, ${result.elapsed.toFixed(1)}s)`,
      result.ok,
      result.ok
        ? `TPS: ${(result.tokenCount / result.elapsed).toFixed(1)}`
        : "ストリームエラー",
    );
    if (result.ok) {
      passed++;
    } else {
      failed++;
      if (FAIL_FAST) {
        summarize();
        return;
      }
    }
  } catch (e) {
    printStage(7, "OpenAI ストリーム", false, `エラー: ${e.message}`);
    failed++;
    if (FAIL_FAST) {
      summarize();
      return;
    }
  }

  // Stage 8: Anthropic ストリーミング（Proxy 経由 /v1/messages）
  console.log("");
  console.log("--- Stage 8: Anthropic ストリーミング（Proxy 経由）---");
  const STREAM_PROMPT2 = "減価償却について説明してください。";
  console.log("  プロンプト: " + STREAM_PROMPT2);
  try {
    const proxyModel = "openai/" + MODEL_NAME;
    const streamPayload2 = {
      model: proxyModel,
      messages: [{ role: "user", content: STREAM_PROMPT2 }],
      max_tokens: 128,
      stream: true,
    };
    process.stdout.write("  応答(stream): ");
    const result2 = await streamRequest(
      "127.0.0.1",
      PROXY_PORT,
      "/v1/messages",
      streamPayload2,
      (text) => {
        process.stdout.write(text);
      },
    );
    process.stdout.write("\n");
    // 非ストリーミングで全文取得
    const fullRes = await httpRequest(
      "POST",
      "127.0.0.1",
      PROXY_PORT,
      "/v1/messages",
      {
        model: proxyModel,
        messages: [{ role: "user", content: STREAM_PROMPT2 }],
        max_tokens: 128,
      },
    );
    if (fullRes.status === 200 && fullRes.json && fullRes.json.content) {
      const fullText = fullRes.json.content.map((c) => c.text || "").join("");
      console.log("  応答(全文): " + fullText.slice(0, 300));
    }
    printStage(
      8,
      `Anthropic ストリーム (${result2.tokenCount} tokens, ${result2.elapsed.toFixed(1)}s)`,
      result2.ok,
      result2.ok
        ? `TPS: ${(result2.tokenCount / result2.elapsed).toFixed(1)}`
        : "ストリームエラー",
    );
    if (result2.ok) {
      passed++;
    } else {
      failed++;
      if (FAIL_FAST) {
        summarize();
        return;
      }
    }
  } catch (e) {
    printStage(8, "Anthropic ストリーム", false, `エラー: ${e.message}`);
    failed++;
    if (FAIL_FAST) {
      summarize();
      return;
    }
  }

  summarize();
}

// require 経由で読み込まれた場合は main を自動実行しない（ユニットテスト用）
if (require.main === module) {
  main().catch((e) => {
    console.error("予期しないエラー:", e);
    process.exit(1);
  });
}

module.exports = {
  httpRequest,
  streamRequest,
  findMTPLXProcess,
  findProxyProcess,
  printStage,
  summarize,
  main,
};
