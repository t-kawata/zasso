//! # 並行性制御: Semaphore-based backpressure
//!
//! provider ごとに `tokio::sync::Semaphore` を用いた backpressure 制御を行う。
//! queue 長の楽観的カウンタを `AtomicUsize` で管理し、満杯時は即座に
//! 429 相当のエラーを返す。

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

/// 並行性制御: Semaphore-based limiter + bounded wait queue（RFC §7）。
///
/// ## 動作
///
/// 1. `acquire()` 呼び出し時に queue 残容量を楽観的にチェック
/// 2. 満杯なら即座に `Err(LimiterError::QueueFull)`
/// 3. `current_queue` をインクリメントし、`Semaphore::acquire_owned()` で非同期待機
/// 4. permit 取得後、`current_queue` をデクリメントして permit を返却
/// 5. permit は drop 時に自動解放（クライアント切断による Future drop も同様）
pub struct ConcurrencyLimiter {
    semaphore: Arc<Semaphore>,
    max_queue: usize,
    current_queue: AtomicUsize,
}

impl ConcurrencyLimiter {
    /// `ConcurrencyLimiter` を生成する。
    ///
    /// * `max_in_flight`: 同時実行数の上限（Semaphore の初期許可数）
    /// * `max_queue`: 待機キューの最大長（0 で queue 無効 = 即座に QueueFull）
    pub fn new(max_in_flight: usize, max_queue: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_in_flight)),
            max_queue,
            current_queue: AtomicUsize::new(0),
        }
    }

    /// 処理枠（permit）を取得する。
    ///
    /// queue 満杯時は `Err(LimiterError::QueueFull)` を返す。
    /// 取得した permit は drop 時に自動的にセマフォに返却される。
    ///
    /// ## Queue チェックの楽観的性質
    ///
    /// `current_queue` のロードとインクリメントはアトミックだが、チェックと
    /// インクリメントの間に別スレッドが割り込む可能性がある。この場合、
    /// `max_queue` をわずかに超過することがあるが、これは過剰な拒否（false
    /// rejection）よりは許容可能な設計判断である。
    pub async fn acquire(&self) -> Result<OwnedSemaphorePermit, LimiterError> {
        // まず非ブロッキング acquire を試行（セマフォに空きがある場合の高速パス）
        match self.semaphore.clone().try_acquire_owned() {
            Ok(permit) => return Ok(permit),
            Err(_) => {
                // セマフォが満杯。queue 残容量をチェック
                let queued = self.current_queue.load(Ordering::Acquire);
                if queued >= self.max_queue {
                    return Err(LimiterError::QueueFull);
                }
            }
        }

        self.current_queue.fetch_add(1, Ordering::Release);

        // 非同期待機（Future drop で自動キャンセルされる）
        let permit = self
            .semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| LimiterError::Closed)?;

        self.current_queue.fetch_sub(1, Ordering::Release);
        Ok(permit)
    }
}

/// `ConcurrencyLimiter` のエラー型。
#[derive(Debug, thiserror::Error)]
pub enum LimiterError {
    /// キューが満杯（HTTP 429 相当）
    #[error("queue is full")]
    QueueFull,
    /// セマフォがクローズされた
    #[error("semaphore closed")]
    Closed,
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// acquire → permit を drop → 再度 acquire 可能 のサイクル。
    #[tokio::test]
    async fn acquire_release_cycle() {
        let limiter = ConcurrencyLimiter::new(1, 10);
        let permit = limiter.acquire().await.expect("first acquire");
        drop(permit);
        let permit = limiter.acquire().await.expect("second acquire after drop");
        drop(permit);
    }

    /// max_in_flight=1, max_queue=1 で2つ目の acquire がブロックされること。
    #[tokio::test]
    async fn max_in_flight_blocks() {
        let limiter = ConcurrencyLimiter::new(1, 1);
        let _permit1 = limiter.acquire().await.expect("first acquire");

        // 2つ目の acquire はタイムアウトでブロック確認（permit1 が解放されるまで待機）
        let result =
            tokio::time::timeout(std::time::Duration::from_millis(50), limiter.acquire()).await;
        assert!(result.is_err(), "second acquire should timeout");
    }

    /// max_queue=0, max_in_flight=1 で2つ目の acquire → Err(QueueFull)。
    #[tokio::test]
    async fn max_queue_zero_rejects() {
        let limiter = ConcurrencyLimiter::new(1, 0);
        let _permit1 = limiter.acquire().await.expect("first acquire");

        // queue=0 のため2つ目は即座に QueueFull
        let result = limiter.acquire().await;
        assert!(matches!(result, Err(LimiterError::QueueFull)));
    }

    /// permit drop → Semaphore の permit が返却される（try_acquire で確認）。
    #[tokio::test]
    async fn try_acquire_after_permit_drop() {
        let limiter = ConcurrencyLimiter::new(1, 10);
        let permit = limiter.acquire().await.expect("acquire");
        drop(permit);

        // permit が返却されたので即座に acquire 可能
        let permit = limiter.acquire().await.expect("acquire after drop");
        drop(permit);
    }

    /// LimiterError の Display が意味のあるメッセージを出力すること。
    #[test]
    fn limiter_error_display() {
        assert_eq!(LimiterError::QueueFull.to_string(), "queue is full");
        assert_eq!(LimiterError::Closed.to_string(), "semaphore closed");
    }

    /// LimiterError が std::error::Error を満たすこと。
    #[test]
    fn limiter_error_is_std_error() {
        fn assert_error<T: std::error::Error>() {}
        assert_error::<LimiterError>();
    }
}
