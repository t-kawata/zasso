// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0085:  62.16 メディア経路の完成（conf port / キュー消費 / WAV）
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0085 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================


// ---------------------------------------------------------------------------
// WAV constants — named values for the RIFF/WAVE format (H13, §62.16)
// ---------------------------------------------------------------------------

/// Length of the canonical 44-byte RIFF/WAVE header (no extra chunks).
pub const WAV_HEADER_LEN: usize = 44;
/// WAVE_FORMAT_PCM tag in the `fmt ` chunk (`audio_format = 1`).
pub const PCM_FORMAT_TAG: u16 = 1;
/// Size of the PCM `fmt ` chunk payload for linear PCM.
pub const FMT_CHUNK_LEN: u32 = 16;
/// Bytes per signed 16-bit PCM sample.
pub const BYTES_PER_I16: usize = 2;

// ---------------------------------------------------------------------------
// WAV writer — RIFF/WAVE header + PCM16 sample data (H13, §62.16)
// ---------------------------------------------------------------------------

use std::fs::File;
use std::io::{BufWriter, Seek, SeekFrom, Write};
use std::path::Path;

use crate::error::{SipError, SipErrorKind};
use crate::model::audio_format_chunkpair::{AudioChunk, AudioChunkPair, AudioFormat, ChannelLayout};
use crate::runtime::audio_worker::AsyncAudioSource;

/// Map an I/O failure into a `SipError` carrying the path context.
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
fn io_error(action: &str, path: &Path, error: std::io::Error) -> SipError {
    SipError::new(
        SipErrorKind::InvalidState,
        format!("{action} {path:?}: {error}"),
    )
}

/// Convert an `AudioChunk` into a `Vec<i16>` (F32 samples are clipped and
/// scaled to the i16 range — WAVE_FORMAT_PCM output).
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
fn chunk_to_i16(chunk: &AudioChunk) -> Vec<i16> {
    match chunk {
        AudioChunk::I16(samples) => samples.clone(),
        AudioChunk::F32(samples) => samples.iter().copied().map(f32_to_i16).collect(),
    }
}

/// Clip a float sample to [-1.0, 1.0] and scale it into the i16 range.
///
/// ±1.0 map exactly to `i16::MIN` / `i16::MAX`; intermediate values use
/// truncating multiplication (matching the crate's i16 PCM convention).
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
fn f32_to_i16(sample: f32) -> i16 {
    if sample >= 1.0 {
        i16::MAX
    } else if sample <= -1.0 {
        i16::MIN
    } else {
        (sample * i16::MAX as f32) as i16
    }
}

// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
fn write_u32_le(writer: &mut impl Write, value: u32) -> Result<(), SipError> {
    writer
        .write_all(&value.to_le_bytes())
        .map_err(|e| SipError::new(SipErrorKind::InvalidState, format!("write u32: {e}")))
}

// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
fn write_i16_le(writer: &mut impl Write, value: i16) -> Result<(), SipError> {
    writer
        .write_all(&value.to_le_bytes())
        .map_err(|e| SipError::new(SipErrorKind::InvalidState, format!("write i16: {e}")))
}

/// Number of channels the format maps into the WAV file.
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
fn channel_count(layout: ChannelLayout) -> u16 {
    match layout {
        ChannelLayout::Mono => 1,
        ChannelLayout::StereoInOut => 2,
    }
}

/// Write the 44-byte RIFF/WAVE header. Sizes are patched by `finalize`.
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
fn write_header(writer: &mut BufWriter<File>, format: &AudioFormat) -> Result<(), SipError> {
    let channels = channel_count(format.channel_layout);
    let sample_rate = format.sample_rate_hz();
    let bits_per_sample = 16u16; // PCM16 output regardless of source bit depth
    let block_align = channels * bits_per_sample / 8;
    let byte_rate = sample_rate * block_align as u32;

    let mut header = [0u8; WAV_HEADER_LEN];
    header[0..4].copy_from_slice(b"RIFF");
    // [4..8]  riff size (36 + data_size) — patched by finalize
    header[8..12].copy_from_slice(b"WAVE");
    header[12..16].copy_from_slice(b"fmt ");
    header[16..20].copy_from_slice(&FMT_CHUNK_LEN.to_le_bytes());
    header[20..22].copy_from_slice(&PCM_FORMAT_TAG.to_le_bytes());
    header[22..24].copy_from_slice(&channels.to_le_bytes());
    header[24..28].copy_from_slice(&sample_rate.to_le_bytes());
    header[28..32].copy_from_slice(&byte_rate.to_le_bytes());
    header[32..34].copy_from_slice(&block_align.to_le_bytes());
    header[34..36].copy_from_slice(&bits_per_sample.to_le_bytes());
    header[36..40].copy_from_slice(b"data");
    // [40..44] data_size — patched by finalize
    writer
        .write_all(&header)
        .map_err(|e| SipError::new(SipErrorKind::InvalidState, format!("write header: {e}")))?;
    writer
        .flush()
        .map_err(|e| SipError::new(SipErrorKind::InvalidState, format!("flush header: {e}")))
}

/// Streaming writer that emits a RIFF/WAVE PCM16 file (H13).
///
/// `StereoInOut` interleaves L = `in_chunk` (IN) and R = `out_chunk` (OUT);
/// `Mono` writes the `in_chunk` samples. Call [`WavWriter::finalize`] to patch
/// the header sizes once all pairs are written.
pub struct WavWriter {
    writer: BufWriter<File>,
    format: AudioFormat,
    data_bytes: u32,
}

// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
impl WavWriter {
    /// Open `path` and write the RIFF/WAVE header for `format`.
    pub fn create(path: &Path, format: AudioFormat) -> Result<Self, SipError> {
        let file = File::create(path).map_err(|e| io_error("create", path, e))?;
        let mut writer = BufWriter::new(file);
        write_header(&mut writer, &format)?;
        Ok(Self {
            writer,
            format,
            data_bytes: 0,
        })
    }

    /// Write one paired IN/OUT chunk as interleaved (or mono) PCM16 samples.
    pub fn write_stereo_pair(&mut self, pair: &AudioChunkPair) -> Result<(), SipError> {
        let in_samples = chunk_to_i16(&pair.in_chunk);
        let out_samples = chunk_to_i16(&pair.out_chunk);
        match self.format.channel_layout {
            ChannelLayout::StereoInOut => {
                let frame_len = in_samples.len().max(out_samples.len());
                for index in 0..frame_len {
                    let left = in_samples.get(index).copied().unwrap_or(0);
                    let right = out_samples.get(index).copied().unwrap_or(0);
                    write_i16_le(&mut self.writer, left)?;
                    write_i16_le(&mut self.writer, right)?;
                    self.data_bytes += BYTES_PER_I16 as u32 * 2;
                }
            }
            ChannelLayout::Mono => {
                for &sample in &in_samples {
                    write_i16_le(&mut self.writer, sample)?;
                    self.data_bytes += BYTES_PER_I16 as u32;
                }
            }
        }
        Ok(())
    }

    /// Patch the RIFF and data sizes and flush the underlying file.
    pub fn finalize(&mut self) -> Result<(), SipError> {
        let file = self.writer.get_mut();
        file.seek(SeekFrom::Start(4))
            .map_err(|e| SipError::new(SipErrorKind::InvalidState, format!("seek riff size: {e}")))?;
        write_u32_le(file, FMT_CHUNK_LEN + 20 + self.data_bytes)?;
        file.seek(SeekFrom::Start(40)).map_err(|e| {
            SipError::new(SipErrorKind::InvalidState, format!("seek data size: {e}"))
        })?;
        write_u32_le(file, self.data_bytes)?;
        self.writer
            .flush()
            .map_err(|e| SipError::new(SipErrorKind::InvalidState, format!("flush final: {e}")))
    }
}

/// Convert a slice of `AudioChunkPair`s into a stereo (L=IN, R=OUT) PCM16 WAV file.
///
/// The file is written at `path`; the header's sample rate / channel layout
/// come from `format`. Errors (unwritable path, I/O failure) surface as
/// `SipError` and are never swallowed.
pub fn write_stereo_wav(
    path: &Path,
    chunks: &[AudioChunkPair],
    format: AudioFormat,
) -> Result<(), SipError> {
    let mut writer = WavWriter::create(path, format)?;
    for pair in chunks {
        writer.write_stereo_pair(pair)?;
    }
    writer.finalize()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// WavFileSource — WAV-backed AsyncAudioSource (Q6, §62.16)
// ---------------------------------------------------------------------------

/// A WAV-backed [`AsyncAudioSource`] that serves PCM16 samples in file order.
///
/// `new` parses the RIFF/WAVE header and reads the `data` chunk into memory;
/// `next_chunk` copies the next slice of samples and returns `0` once the
/// file is exhausted (matching the `AsyncAudioSource` contract).
pub struct WavFileSource {
    samples: Vec<i16>,
    position: usize,
}

// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
impl WavFileSource {
    /// Read `path` and validate it is a PCM16 WAV matching `format.sample_rate`.
    pub fn new(path: &Path, format: AudioFormat) -> Result<Self, SipError> {
        let bytes = std::fs::read(path).map_err(|e| io_error("read", path, e))?;
        let header = parse_wav_header(&bytes)?;
        if header.sample_rate != format.sample_rate_hz() {
            return Err(SipError::new(
                SipErrorKind::InvalidArgument,
                format!(
                    "WAV sample rate {} does not match requested {}",
                    header.sample_rate,
                    format.sample_rate_hz()
                ),
            ));
        }
        Ok(Self {
            samples: header.samples,
            position: 0,
        })
    }
}

#[async_trait::async_trait]
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
impl AsyncAudioSource for WavFileSource {
    async fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
        let remaining = self.samples.len() - self.position;
        let to_copy = remaining.min(buf.len());
        if to_copy > 0 {
            buf[..to_copy]
                .copy_from_slice(&self.samples[self.position..self.position + to_copy]);
            self.position += to_copy;
        }
        to_copy
    }
}

/// Parsed view of a PCM16 WAV file: validated header fields + data samples.
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
struct ParsedWav {
    sample_rate: u32,
    samples: Vec<i16>,
}

/// Parse a RIFF/WAVE PCM16 file, extracting the `data` chunk samples.
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
fn parse_wav_header(bytes: &[u8]) -> Result<ParsedWav, SipError> {
    if bytes.len() < WAV_HEADER_LEN {
        return Err(SipError::new(
            SipErrorKind::InvalidArgument,
            "file too small to be a WAV",
        ));
    }
    if &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err(SipError::new(
            SipErrorKind::InvalidArgument,
            "not a RIFF/WAVE file",
        ));
    }
    if &bytes[12..16] != b"fmt " {
        return Err(SipError::new(
            SipErrorKind::InvalidArgument,
            "missing fmt chunk",
        ));
    }
    let audio_format = u16::from_le_bytes([bytes[20], bytes[21]]);
    if audio_format != PCM_FORMAT_TAG {
        return Err(SipError::new(
            SipErrorKind::InvalidArgument,
            format!("unsupported WAV format tag {audio_format}"),
        ));
    }
    let sample_rate = u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]);
    let bits_per_sample = u16::from_le_bytes([bytes[34], bytes[35]]);
    if bits_per_sample != 16 {
        return Err(SipError::new(
            SipErrorKind::InvalidArgument,
            format!("unsupported bits per sample {bits_per_sample}"),
        ));
    }

    let mut offset = 12usize;
    let mut data: Option<&[u8]> = None;
    while offset + 8 <= bytes.len() {
        let chunk_len =
            u32::from_le_bytes([bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]])
                as usize;
        let data_start = offset + 8;
        if &bytes[offset..offset + 4] == b"data" {
            data = Some(&bytes[data_start..data_start + chunk_len]);
            break;
        }
        // Chunks are word-aligned (padded to even length).
        offset = data_start + chunk_len + (chunk_len % 2);
    }
    let data = data.ok_or_else(|| {
        SipError::new(SipErrorKind::InvalidArgument, "missing data chunk")
    })?;

    let mut samples = Vec::with_capacity(data.len() / BYTES_PER_I16);
    for pair in data.chunks_exact(BYTES_PER_I16) {
        samples.push(i16::from_le_bytes([pair[0], pair[1]]));
    }
    Ok(ParsedWav { sample_rate, samples })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::{SipError, SipErrorKind};
    use crate::model::{
        AccountId, AudioChunk, AudioChunkPair, AudioFormat, BitDepth, ChannelLayout, CallId,
        SampleRate,
    };
    use crate::runtime::audio_worker::AsyncAudioSource;
    use std::time::SystemTime;

    /// Construct an `AudioFormat`, mapping `AudioFormatError` into `SipError`
    /// so tests can use `?` without a `From` impl on the error type.
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    fn make_format(
        sample_rate: SampleRate,
        bit_depth: BitDepth,
        layout: ChannelLayout,
        frame_ms: u16,
    ) -> Result<AudioFormat, SipError> {
        AudioFormat::new(sample_rate, bit_depth, layout, frame_ms)
            .map_err(|e| SipError::new(SipErrorKind::InvalidArgument, e.to_string()))
    }

    /// Build a paired IN/OUT chunk from raw i16 sample vectors.
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    fn make_pair(in_samples: Vec<i16>, out_samples: Vec<i16>) -> Result<AudioChunkPair, SipError> {
        Ok(AudioChunkPair {
            call_id: CallId::from_u64(1)
                .map_err(|e| SipError::new(SipErrorKind::InvalidArgument, e.to_string()))?,
            account_id: AccountId::from_u64(1)
                .map_err(|e| SipError::new(SipErrorKind::InvalidArgument, e.to_string()))?,
            timestamp: SystemTime::now(),
            in_chunk: AudioChunk::I16(in_samples),
            out_chunk: AudioChunk::I16(out_samples),
        })
    }

    /// Build a paired chunk carrying raw F32 sample vectors.
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    fn make_f32_pair(
        in_samples: Vec<f32>,
        out_samples: Vec<f32>,
    ) -> Result<AudioChunkPair, SipError> {
        Ok(AudioChunkPair {
            call_id: CallId::from_u64(1)
                .map_err(|e| SipError::new(SipErrorKind::InvalidArgument, e.to_string()))?,
            account_id: AccountId::from_u64(1)
                .map_err(|e| SipError::new(SipErrorKind::InvalidArgument, e.to_string()))?,
            timestamp: SystemTime::now(),
            in_chunk: AudioChunk::F32(in_samples),
            out_chunk: AudioChunk::F32(out_samples),
        })
    }

    /// Unique temp path per test (PID + test tag) to avoid cross-test collisions.
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    fn temp_wav_path(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "siprs_p16_7_{tag}_{}.wav",
            std::process::id()
        ))
    }

    /// C108-Pre: the §62.16 implementation surface compiles and is reachable.
    #[test]
    // @verifies C108
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    fn media_path_wiring_surface_is_reachable() {
        let _ = core::mem::size_of::<WavWriter>();
        let _ = core::mem::size_of::<WavFileSource>();
    }

    /// C108-Post: write_stereo_wav writes a canonical RIFF/WAVE stereo PCM16 file.
    #[test]
    // @verifies C108
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    fn write_stereo_wav_writes_valid_riff_wave() -> Result<(), SipError> {
        let path = temp_wav_path("riff");
        let fmt = make_format(
            SampleRate::Hz8000,
            BitDepth::I16,
            ChannelLayout::StereoInOut,
            20,
        )?;
        let pair = make_pair(vec![100i16; 160], vec![200i16; 160])?;
        write_stereo_wav(&path, &[pair], fmt)?;
        let bytes = std::fs::read(&path).map_err(|e| SipError::new(SipErrorKind::InvalidState, format!("read {:?}: {e}", path)))?;
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        assert_eq!(&bytes[12..16], b"fmt ");
        assert_eq!(u16::from_le_bytes([bytes[20], bytes[21]]), PCM_FORMAT_TAG, "PCM");
        assert_eq!(u16::from_le_bytes([bytes[22], bytes[23]]), 2, "stereo");
        assert_eq!(
            u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]),
            8_000
        );
        assert_eq!(u16::from_le_bytes([bytes[34], bytes[35]]), 16, "bits/sample");
        assert_eq!(&bytes[36..40], b"data");
        assert_eq!(
            u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]),
            160 * 2 * 2,
            "data size = samples * channels * 2 bytes"
        );
        std::fs::remove_file(&path).ok();
        Ok(())
    }

    /// C108-Inv: WavWriter channel order (L=IN, R=OUT) matches AudioChunkPair.
    #[tokio::test]
    // @verifies C108
    async fn wav_channel_mapping_matches_from_processed_frame() -> Result<(), SipError> {
        let fmt = make_format(
            SampleRate::Hz8000,
            BitDepth::I16,
            ChannelLayout::StereoInOut,
            20,
        )?;
        // from_processed_frame maps L→in_chunk, R→out_chunk (§62.6).
        let frame = crate::audio::pipeline::ProcessedFrame {
            stereo_interleaved: vec![1i16, 2],
            negotiated_codec: crate::config::codec_policy_fallback::NegotiatedCodec::Pcmu,
            timestamp: std::time::Instant::now(),
        };
        let pair = AudioChunkPair::from_processed_frame(
            CallId::from_u64(1)
                .map_err(|e| SipError::new(SipErrorKind::InvalidArgument, e.to_string()))?,
            AccountId::from_u64(1)
                .map_err(|e| SipError::new(SipErrorKind::InvalidArgument, e.to_string()))?,
            &frame,
        );
        assert_eq!(pair.in_chunk, AudioChunk::I16(vec![1]));
        assert_eq!(pair.out_chunk, AudioChunk::I16(vec![2]));
        // WavWriter must write L=in_chunk, R=out_chunk in that order.
        let path = temp_wav_path("inv");
        write_stereo_wav(&path, &[pair], fmt)?;
        let mut src = WavFileSource::new(&path, fmt)?;
        let mut buf = vec![0i16; 2];
        let written = src.next_chunk(&mut buf).await;
        assert_eq!(written, 2);
        assert_eq!(buf, vec![1, 2], "L=IN(1), R=OUT(2) order preserved");
        std::fs::remove_file(&path).ok();
        Ok(())
    }

    /// Boundary: an empty chunk list yields a 44-byte header with data size 0.
    #[test]
    // @verifies C108
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    fn write_stereo_wav_empty_chunks_writes_zero_data() -> Result<(), SipError> {
        let path = temp_wav_path("empty");
        let fmt = make_format(
            SampleRate::Hz8000,
            BitDepth::I16,
            ChannelLayout::StereoInOut,
            20,
        )?;
        write_stereo_wav(&path, &[], fmt)?;
        let bytes = std::fs::read(&path).map_err(|e| SipError::new(SipErrorKind::InvalidState, format!("read {:?}: {e}", path)))?;
        assert_eq!(bytes.len(), WAV_HEADER_LEN);
        assert_eq!(
            u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]),
            0,
            "empty data chunk"
        );
        assert_eq!(
            u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]),
            36,
            "RIFF size = 36 + data_size"
        );
        std::fs::remove_file(&path).ok();
        Ok(())
    }

    /// Error: writing to an unwritable path returns SipError, never panics.
    #[test]
    // @verifies C108
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    fn write_stereo_wav_invalid_path_returns_error() -> Result<(), SipError> {
        let fmt = make_format(
            SampleRate::Hz8000,
            BitDepth::I16,
            ChannelLayout::StereoInOut,
            20,
        )?;
        let pair = make_pair(vec![0i16; 160], vec![0i16; 160])?;
        let missing_dir = std::env::temp_dir().join("siprs_no_such_dir_xyz");
        let path = missing_dir.join("out.wav");
        let result = write_stereo_wav(&path, &[pair], fmt);
        assert!(result.is_err(), "unwritable path must return SipError");
        Ok(())
    }

    /// F32 chunks are clipped to [-1.0, 1.0] and scaled to i16.
    #[tokio::test]
    // @verifies C108
    async fn f32_chunk_converts_with_clipping() -> Result<(), SipError> {
        let path = temp_wav_path("f32");
        let fmt = make_format(
            SampleRate::Hz8000,
            BitDepth::F32,
            ChannelLayout::StereoInOut,
            20,
        )?;
        let pair = make_f32_pair(vec![-2.0, 0.0, 1.0], vec![0.5, -0.5, 2.0])?;
        write_stereo_wav(&path, &[pair], fmt)?;
        let mut src = WavFileSource::new(&path, fmt)?;
        let mut buf = vec![0i16; 6];
        let written = src.next_chunk(&mut buf).await;
        assert_eq!(written, 6);
        // in: -2.0 clipped→ -32768, 0.0→0, 1.0→32767
        assert_eq!(buf[0], i16::MIN);
        assert_eq!(buf[2], 0);
        assert_eq!(buf[4], i16::MAX);
        // out: 0.5→16384, -0.5→-16384, 2.0 clipped→32767
        assert_eq!(buf[1], (0.5 * i16::MAX as f32) as i16);
        assert_eq!(buf[3], (-0.5 * i16::MAX as f32) as i16);
        assert_eq!(buf[5], i16::MAX);
        std::fs::remove_file(&path).ok();
        Ok(())
    }

    /// C033 (AsyncAudioSource): WavFileSource serves PCM and returns 0 when exhausted.
    #[tokio::test]
    // @verifies C033
    async fn wav_file_source_reads_samples_and_exhausts() -> Result<(), SipError> {
        let path = temp_wav_path("src");
        let fmt = make_format(
            SampleRate::Hz8000,
            BitDepth::I16,
            ChannelLayout::Mono,
            20,
        )?;
        let pair = make_pair(vec![5i16; 160], Vec::new())?;
        write_stereo_wav(&path, &[pair], fmt)?;
        let mut src = WavFileSource::new(&path, fmt)?;
        let mut buf = vec![0i16; 160];
        let written = src.next_chunk(&mut buf).await;
        assert_eq!(written, 160);
        assert!(buf.iter().all(|&s| s == 5));
        let written_again = src.next_chunk(&mut buf).await;
        assert_eq!(written_again, 0, "exhausted source returns 0");
        std::fs::remove_file(&path).ok();
        Ok(())
    }

    /// Error: a missing WAV file makes WavFileSource::new return SipError.
    #[test]
    // @verifies C033
// [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    fn wav_file_source_rejects_missing_file() -> Result<(), SipError> {
        let fmt = make_format(
            SampleRate::Hz8000,
            BitDepth::I16,
            ChannelLayout::Mono,
            20,
        )?;
        let path = std::env::temp_dir().join(format!(
            "siprs_p16_7_missing_{}.wav",
            std::process::id()
        ));
        assert!(WavFileSource::new(&path, fmt).is_err());
        Ok(())
    }
}
