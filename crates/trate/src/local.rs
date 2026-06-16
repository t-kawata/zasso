use crate::AsrBackend;

/// ローカル ASR バックエンドが実装すべきトレイト。
///
/// `AsrBackend` に加えて、ローカルモデルに固有の情報（モデルパス等）を提供する。
/// 将来のモデル追加（Whisper / SenseVoice 等）はこのトレイトを実装する。
///
/// `Sync` は PseudoAsrStreamer の型制約（`B: AsrBackend + Send + Sync + 'static`）を
/// 満たすために必要。Qwen3AsrBackend は Mutex で内部状態を保護しており、Sync を満たす。
pub trait LocalAsrBackend: AsrBackend + Sync {
    /// 使用中のモデルファイルへのパスを返す（エラーメッセージ等で使用）。
    fn model_path(&self) -> &str;

    /// バックエンドが正常に初期化されているかを確認する。
    fn is_healthy(&self) -> bool;
}
