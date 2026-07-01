//! # 並行性制御: Semaphore-based backpressure
//!
//! provider ごとに `tokio::sync::Semaphore` を用いた backpressure 制御を行う。
//! queue 長の楽観的カウンタを `AtomicUsize` で管理し、満杯時は即座に
//! 429 相当のエラーを返す。

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

/// 並行性制御: Semaphore-based limiter + bounded wait queue（RFC §7）。
///
/// ## 動作
///
/// 1. `acquire()` はまず非ブロッキング `try_acquire_owned()` を試行（高速パス）
/// 2. 成功時は Semaphore permits のみで in-flight 管理が完結するため、
///    `current_queue` を操作せずに permit を返す
/// 3. 高速パス失敗時は queue 残容量を楽観的にチェック
/// 4. 満杯なら即座に `Err(LimiterError::QueueFull)`
/// 5. `current_queue` をインクリメントし、`Semaphore::acquire_owned()` で非同期待機
/// 6. permit 取得後、`current_queue` をデクリメントして permit を返却
/// 7. permit は drop 時に自動解放（クライアント切断による Future drop も同様）
#[derive(Debug)]
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
    /// ## 高速パス: try_acquire_owned
    ///
    /// RFC 01 の設計にはない最適化として、ブロッキング acquire の前に非ブロッキング
    /// `try_acquire_owned()` を試行する。Semaphore に空きがある場合、queue 管理の
    /// オーバーヘッド（アトミック操作 + コンテキストスイッチ）を回避できる。
    ///
    /// try_acquire 成功時は `current_queue` を増加させないが、これは Semaphore の
    /// permits のみで in-flight 数が正確に管理されるため問題ない。queue 待機を
    /// 経ていないリクエストは current_queue に計上する必要がない。
    ///
    /// ## Queue チェックの楽観的性質
    ///
    /// `current_queue` のロードとインクリメントはアトミックだが、チェックと
    /// インクリメントの間に別スレッドが割り込む可能性がある。この場合、
    /// `max_queue` をわずかに超過することがあるが、これは過剰な拒否（false
    /// rejection）よりは許容可能な設計判断である。
    pub async fn acquire(&self) -> Result<OwnedSemaphorePermit, LimiterError> {
        // 高速パス: Semaphore に空きがあれば非ブロッキングで取得
        // try_acquire 成功時は current_queue を増加させない。Semaphore の permits
        // のみで in-flight 数が管理されるため問題ない（queue 未経由のため計上不要）。
        match self.semaphore.clone().try_acquire_owned() {
            Ok(permit) => return Ok(permit),
            Err(_) => {
                // 低速パス: queue 残容量をチェック
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

/// LimiterError を ProxyError に変換する。
///
/// QueueFull → QueueFull（429 Too Many Requests）
/// Closed → Internal（プログラミングエラーまたは予期しないセマフォ解放）
impl From<LimiterError> for crate::ProxyError {
    fn from(e: LimiterError) -> Self {
        match e {
            LimiterError::QueueFull => crate::ProxyError::QueueFull,
            LimiterError::Closed => crate::ProxyError::Internal("semaphore closed".to_string()),
        }
    }
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
