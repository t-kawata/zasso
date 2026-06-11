//! 常駐型オーディオプレイヤー (Actor Pattern)
//!
//! 専用スレッド（Actor）を起動し、そのスレッド内で Audio OutputStream を保持し続ける。
//! 外部からは Channel 経由で再生リクエストを送信することで、
//! OutputStream の Send/Sync 制約を回避しつつ、デバイスの常駐化（低遅延再生）を実現する。
//!
//! 移植元: ~/shyme/mycute/src/tools/audio.rs（完全移植）

use lazy_static::lazy_static;
use rodio::{Decoder, OutputStreamBuilder, Sink};
use std::io::Cursor;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;
use std::thread;

/// 埋め込み音声データ
static READY_WAV: &[u8] = include_bytes!("wav/piro.wav");
static COMMIT_WAV: &[u8] = include_bytes!("wav/commit.wav");

/// 再生リクエスト
enum AudioCommand {
    PlayReady,
    PlayCommit,
}

/// 擬似無音ソース
struct PseudoSilence {
    channels: u16,
    sample_rate: u32,
    seed: u32,
}

impl PseudoSilence {
    fn new(channels: u16, sample_rate: u32) -> Self {
        Self {
            channels,
            sample_rate,
            seed: 12345,
        }
    }
}

impl Iterator for PseudoSilence {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        self.seed = self.seed.wrapping_mul(1103515245).wrapping_add(12345);
        Some(((self.seed as f32 / u32::MAX as f32) - 0.5) * 0.0005)
    }
}

impl rodio::Source for PseudoSilence {
    fn current_span_len(&self) -> Option<usize> {
        None
    }
    fn channels(&self) -> u16 {
        self.channels
    }
    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
    fn total_duration(&self) -> Option<std::time::Duration> {
        None
    }
}

/// オーディオスレッドへの送信チャンネルを保持する
struct AudioHandle {
    sender: Sender<AudioCommand>,
}

impl AudioHandle {
    fn new() -> anyhow::Result<Self> {
        let (tx, rx) = channel();

        thread::Builder::new()
            .name("voiput-audio-actor".to_string())
            .spawn(move || {
                run_audio_actor(rx);
            })
            .map_err(|e| anyhow::anyhow!("Failed to spawn audio actor thread: {}", e))?;

        Ok(Self { sender: tx })
    }

    fn send(&self, cmd: AudioCommand) {
        if let Err(e) = self.sender.send(cmd) {
            log::warn!("[Audio] Failed to send play command: {}", e);
        }
    }
}

/// オーディオActor（専用スレッド内で実行）
fn run_audio_actor(rx: Receiver<AudioCommand>) {
    let stream = match OutputStreamBuilder::open_default_stream() {
        Ok(s) => s,
        Err(e) => {
            log::error!(
                "[Audio] Failed to open output stream: {}. Audio actor will exit.",
                e
            );
            return;
        }
    };

    let mut current_sink: Option<Sink> = None;

    while let Ok(cmd) = rx.recv() {
        if let Some(sink) = current_sink.take() {
            sink.stop();
        }

        let wav_data = match cmd {
            AudioCommand::PlayReady => READY_WAV,
            AudioCommand::PlayCommit => COMMIT_WAV,
        };

        let cursor = Cursor::new(wav_data);
        match Decoder::new(cursor) {
            Ok(source) => {
                use rodio::Source;
                let sample_rate = source.sample_rate();
                let channels = source.channels();

                let mixer = stream.mixer();
                let sink = Sink::connect_new(&mixer);
                sink.append(source);

                let post_silence = PseudoSilence::new(channels, sample_rate)
                    .take_duration(std::time::Duration::from_millis(500));
                sink.append(post_silence);

                current_sink = Some(sink);
            }
            Err(e) => log::error!("[Audio] Failed to decode WAV: {}", e),
        }
    }
}

lazy_static! {
    static ref AUDIO_HANDLE: Mutex<Option<AudioHandle>> = Mutex::new(None);
}

/// 録音準備完了音（piro.wav）を再生する
pub fn play_ready_sound() {
    if let Ok(guard) = AUDIO_HANDLE.lock() {
        if let Some(handle) = guard.as_ref() {
            handle.send(AudioCommand::PlayReady);
        }
    }
}

/// 録音終了・コミット音（commit.wav）を再生する
pub fn play_commit_sound() {
    if let Ok(guard) = AUDIO_HANDLE.lock() {
        if let Some(handle) = guard.as_ref() {
            handle.send(AudioCommand::PlayCommit);
        }
    }
}

/// オーディオシステムを初期化する
pub fn init() -> anyhow::Result<()> {
    let mut guard = AUDIO_HANDLE
        .lock()
        .map_err(|_| anyhow::anyhow!("Audio lock poisoned"))?;
    if guard.is_none() {
        match AudioHandle::new() {
            Ok(h) => {
                *guard = Some(h);
            }
            Err(e) => {
                log::error!("[Audio] Failed to initialize: {}", e);
                return Err(e);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_twice_does_not_panic() {
        // 初回 init
        let _ = init();
        // 2回目 init もパニックしない
        let _ = init();
    }

    #[test]
    fn test_play_before_init_does_not_panic() {
        // init 前の再生呼び出しは無視されるだけでパニックしない
        play_ready_sound();
        play_commit_sound();
    }
}
