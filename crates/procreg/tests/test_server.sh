#!/bin/bash
#===============================================================================
# test_server.sh — 結合テスト用簡易 TCP エコーサーバ（Node.js）
#
# 指定されたポートで TCP 接続を待ち受け、受け取ったデータを
# "Echo: <データ>" の形式で返す（1接続で終了）。
#
# 使用方法:
#   ./test_server.sh <port>
#
# 出力:
#   起動完了時に標準出力に "server_ready" と出力する。
#   ProcessRegistry の ReadyCondition::LogContains でこの文字列を
#   検出することで、サーバの起動完了を待機できる。
#
# 依存: node (Node.js)
#===============================================================================
set -euo pipefail

PORT="${1:?使用方法: $0 <port>}"

export NODE_PORT="$PORT"
exec node -e "
const port = parseInt(process.env.NODE_PORT);
const net = require('net');
const server = net.createServer((c) => {
    c.once('data', (data) => {
        c.write('Echo: ' + data);
        c.end();
    });
});
server.listen(port, '127.0.0.1', () => {
    console.log('server_ready');
});
"
