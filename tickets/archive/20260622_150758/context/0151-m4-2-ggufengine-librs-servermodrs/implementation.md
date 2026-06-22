# M4-2 実装サマリ

## 変更概要
GgufEngine に HTTP サーバーのライフサイクル管理機能を追加した。

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/lib.rs` | 編集 | start_server(), new_with_auto_start(), Drop, shutdown_signal() 追加 + test 5件 + STUB2件削除 |
| `src/server/mod.rs` | 編集 | M4-2 STUB コメント削除 |

## 実装した機能

### GgufEngine::start_server(self: Arc<Self>, config: ServerConfig)
- build_router() → TcpListener::bind → axum::serve + with_graceful_shutdown(shutdown_signal)
- AbortHandle を self.server_handle に保存（Drop 時に abort 可能）
- 戻り値: JoinHandle を呼び出し元に返す（死活監視用）

### GgufEngine::new_with_auto_start(config: GgufConfig)
- auto_start_server=true の場合、tokio::spawn で自動起動
- Arc<Self> を返す（InferenceEngine として共有可能）

### impl Drop for GgufEngine
- server_handle に AbortHandle が保存されていれば abort()

### shutdown_signal()
- Ctrl+C + SIGTERM（Unix）を tokio::select! で待機
- シグナルハンドラインストール失敗は tracing::warn でログに記録（panic しない）

## 技術的判断
- JoinHandle は Clone 不可 → AbortHandle（Clone + Send）を内部保存、JoinHandle は戻り値として返却
- Mutex ロック失敗（poisoning）は if let Ok で安全に処理、ServerStartupFailed にはしない

## テスト結果
- 全158テスト通過（既存153 + 新規5）
- 新規テスト: Drop None, Drop abort, new_with_auto_start false, new_with_auto_start true, shutdown_signal callable
- cargo check --all-targets: 警告0
- cargo fmt: フォーマット済み
- cargo clippy: 新規警告0（全警告は既存コード由来）
