#!/usr/bin/env node
/**
 * dump-proxy.mjs — Bifrost→vllm-mlx 間のHTTPリクエスト/レスポンスをダンプする
 *
 * 使用法:
 *   1. vllm-mlx を原本の 8081 で起動しておく
 *   2. このプロキシを 8082 で起動 (vllm-mlx の代わりに Bifrost から見えるように)
 *   3. Bifrost の lmpx provider の base_url を http://127.0.0.1:8082 に変更
 *   4. test-acp.mjs を実行
 *
 *   Bifrost の設定変更が面倒な場合は、proxy target を 8081 のままプロキシ機能を切って
 *   ダンプだけ行うことも可能（後述の MODE 参照）
 */

import http from "node:http";

const TARGET_PORT = 8081;
const PROXY_PORT = 8082;
const TARGET_HOST = "127.0.0.1";

const server = http.createServer((req, res) => {
  const chunks = [];

  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const bodyStr = body.toString("utf8");

    console.log("\n" + "=".repeat(72));
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    console.log("─".repeat(72));
    try {
      const parsed = JSON.parse(bodyStr);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(bodyStr);
    }
    console.log("─".repeat(72));

    // Forward to vllm-mlx
    const options = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const resChunks = [];
      proxyRes.on("data", (c) => resChunks.push(c));
      proxyRes.on("end", () => {
        const resBody = Buffer.concat(resChunks);
        console.log(`[RESPONSE] ${proxyRes.statusCode}`);
        console.log("─".repeat(72));
        try {
          const parsed = JSON.parse(resBody.toString("utf8"));
          console.log(JSON.stringify(parsed, null, 2));
        } catch {
          console.log(resBody.toString("utf8"));
        }
        console.log("=".repeat(72));
        console.log();

        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        res.end(resBody);
      });
    });

    proxyReq.on("error", (err) => {
      console.error(`[PROXY ERROR] ${err.message}`);
      res.writeHead(502);
      res.end(JSON.stringify({ error: err.message }));
    });

    proxyReq.end(body);
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`dump-proxy listening on port ${PROXY_PORT} → ${TARGET_HOST}:${TARGET_PORT}`);
  console.log(`Configure Bifrost lmpx base_url to http://127.0.0.1:${PROXY_PORT}`);
  console.log(`Then run: node tmp/test-acp.mjs -m ternary-bonsai-27b`);
  console.log();
});
