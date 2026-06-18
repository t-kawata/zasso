//! # ランタイムハンドル
//!
//! `SipClient` が reactor と通信するためのハンドル。
//! `tokio::sync::mpsc::unbounded_channel` でコマンドを送信し、
//! `oneshot` で結果を待ち受ける。RFC §7.2 に準拠。
//!
//! M11-3 (Reactor loop) 以降で使用。現在は未使用のため dead_code を許容。
#![allow(dead_code)]

use crate::error::SipError;
use crate::runtime::command::RuntimeCommand;

/// Reactor との通信ハンドル。
///
/// `SipClient` および `SipAccountHandle` が reactor と通信するための
/// MPSC 送信チャネル。`Clone` 可能。
#[derive(Debug, Clone)]
pub(crate) struct RuntimeHandle {
    tx: tokio::sync::mpsc::UnboundedSender<RuntimeCommand>,
}

impl RuntimeHandle {
    /// ハンドルと対応する receiver を生成する。
    pub fn new() -> (Self, tokio::sync::mpsc::UnboundedReceiver<RuntimeCommand>) {
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        (Self { tx }, rx)
    }

    /// コマンドを reactor に送信する（非ブロッキング）。
    ///
    /// チャネルが閉じている場合は `SipError` を返す。
    pub fn send(&self, cmd: RuntimeCommand) -> Result<(), SipError> {
        self.tx
            .send(cmd)
            .map_err(|_| SipError::invalid_state("runtime channel closed"))
    }

    /// コマンドを送信し、結果を非同期待機する。
    ///
    /// `f` は `oneshot::Sender` を受け取り、`RuntimeCommand` を生成するクロージャ。
    /// 内部的に oneshot チャネルを作成し、コマンド送信後は結果を await する。
    pub async fn send_and_wait<T>(
        &self,
        f: impl FnOnce(tokio::sync::oneshot::Sender<Result<T, SipError>>) -> RuntimeCommand,
    ) -> Result<T, SipError> {
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        let cmd = f(reply_tx);
        self.send(cmd)?;
        reply_rx
            .await
            .map_err(|_| SipError::invalid_state("reply channel closed"))?
    }

    /// reactor 側の receiver が drop されたかを確認する。
    pub fn is_closed(&self) -> bool {
        self.tx.is_closed()
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::command::HangupReason;
    use crate::util::id::CallId;

    /// send → receiver 側で同一コマンドが受信できることを確認する。
    #[tokio::test]
    async fn test_send_receive() {
        let (handle, mut rx) = RuntimeHandle::new();

        let call_id = CallId::generate();
        let cmd = RuntimeCommand::Hangup {
            call_id,
            reason: HangupReason::Bye,
            reply: tokio::sync::oneshot::channel().0,
        };
        assert!(handle.send(cmd).is_ok());

        let received = rx.recv().await;
        assert!(received.is_some());
    }

    /// send_and_wait で oneshot reply がラウンドトリップすることを確認する。
    #[tokio::test]
    async fn test_send_and_wait_roundtrip() {
        let (handle, mut rx) = RuntimeHandle::new();

        // 別タスクで receiver 側を処理
        tokio::spawn(async move {
            if let Some(cmd) = rx.recv().await {
                if let RuntimeCommand::Shutdown { reply } = cmd {
                    let _ = reply.send(Ok(()));
                }
            }
        });

        let result = handle
            .send_and_wait(|reply| RuntimeCommand::Shutdown { reply })
            .await;
        assert!(result.is_ok());
    }

    /// Clone したハンドルからも送信可能であることを確認する。
    #[tokio::test]
    async fn test_clone_handle() {
        let (handle, mut rx) = RuntimeHandle::new();
        let handle2 = handle.clone();

        let cmd = RuntimeCommand::Shutdown {
            reply: tokio::sync::oneshot::channel().0,
        };
        assert!(handle2.send(cmd).is_ok());
        assert!(rx.recv().await.is_some());
    }

    /// receiver drop 後 is_closed() が true を返すことを確認する。
    #[tokio::test]
    async fn test_is_closed() {
        let (handle, rx) = RuntimeHandle::new();
        assert!(!handle.is_closed());

        drop(rx);
        // drop 後はチャネルが閉じられるまで少し時間が必要。
        // tokio タスクとして yield してから確認。
        tokio::task::yield_now().await;
        assert!(handle.is_closed());
    }
}
