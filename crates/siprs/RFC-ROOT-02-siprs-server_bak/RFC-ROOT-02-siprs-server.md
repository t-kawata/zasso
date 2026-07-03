---
tree:
  level: child
  childId: "02"
  childName: HTTP/WS API Server (siprs-server)
slug: siprs-server
canonicalRfcPath: ../RFC-ROOT.md
canonicalRfcSection: "§52-57"
ioSchema: "HTTP/WebSocket protocol (JSON + バイナリフレーム)。REST API エンドポイント一覧 + WS メッセージプロトコル定義"
decouplingMethod: "Cargo.toml path dep (siprs = { path = "../siprs" })"
dependencyOn: [01]
---

# RFC: HTTP/WS API Server (siprs-server)

## 責務

Axum ベースの HTTP REST + WebSocket API サーバーとして、siprs クライアントの全操作を外部ネットワーク経由で利用可能にする。具体的には：
1. REST API エンドポイント（アカウント CRUD、発信/切断/保留/DTMF/転送、通話状態取得、ヘルスチェック、シャットダウン）
2. WebSocket エンドポイント（制御系イベントのリアルタイム配信 + 音声バイナリチャンク転送）
3. JWT 認証（SIP アカウント認証によるトークン発行・Axum Middleware 検証）
4. SQLite + SeaORM による設定・アカウント情報の永続化
5. Layer 5 API Integration Tests（Axum TestResponse + WebSocket client）
6. スタンドアロンバイナリモードと Tauri 埋め込みライブラリモードの両対応

## I/O境界

- **ネットワーク境界 (HTTP/WS)**: REST API（JSON）と WebSocket（JSONテキスト + バイナリフレーム）が唯一の外界接点。バイナリフレームは先頭 24 バイト固定ヘッダ + 可変長 PCM データ。
- **Rust API 境界**: siprs crate の SipClient / SipAccountHandle / EventBus を介して全 SIP 操作を実行。siprs の公開 API に対する 1:1 ラッパーとして機能する。
- **永続化境界 (SQLite)**: rusqlite (bundled) + SeaORM によるアカウント設定の永続化。`:memory:` モードでテスト分離可能。
- **認証境界**: Axum Layer として実装された JWT 検証 Middleware。認証方式の差し替えが Layer 交換で可能（LocalhostOnly / ApiKey / Jwt）。

## 親との関係

根拠: §52-57

正典 RFC の§52（crate分割方針・ライセンス・マルチインスタンス）、§53（スタンドアロンサーバーモード・設定ファイル）、§54（HTTP/WS API プロトコル構成・REST エンドポイント一覧・WS メッセージプロトコル・イベント-音声時間的相関保証）、§55（JWT 認証・Axum Middleware）、§56（SQLite + SeaORM 永続化・マイグレーション管理）、§57（テスト戦略拡張 Layer 5）の設計を継承する。
本子RFCは正典RFCの HTTP/WebSocket API サーバー部分を独立した設計文書として抽出したものであり、siprs-core（子01）に依存する側として位置づけられる。

## 依存関係

子01（siprs-core）への Cargo.toml path dependency 必須（siprs = { path = "../siprs" }）。
外部依存: Axum 0.8, tokio (full features), tokio-tungstenite 0.24, serde/serde_json, jsonwebtoken 9, rusqlite 0.32 (bundled), sea-orm 1.1 (sqlite-sqlx), tracing, clap (cli feature only)
