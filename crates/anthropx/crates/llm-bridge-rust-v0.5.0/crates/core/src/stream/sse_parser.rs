//! SSE frame parsing — extracts `event:` and `data:` lines from raw SSE.

/// A single parsed SSE frame from the raw byte stream.
#[derive(Debug, Clone, Default)]
pub struct SseFrame {
    /// The `event:` field, if present.
    pub event: Option<String>,
    /// The `data:` field content.
    pub data: String,
}

/// Parse raw SSE bytes into a list of frames.
///
/// Handles data-only SSE framing with `[DONE]`-style terminators.
pub fn parse_sse_frames(input: &[u8]) -> Vec<SseFrame> {
    let text = String::from_utf8_lossy(input);
    let mut frames = Vec::new();
    let mut current = SseFrame::default();
    let mut has_data = false;

    for line in text.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            if has_data {
                frames.push(std::mem::take(&mut current));
                has_data = false;
            }
            current = SseFrame::default();
            continue;
        }

        if trimmed.starts_with(':') {
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("data:") {
            let value = rest.strip_prefix(' ').unwrap_or(rest);
            current.data = value.to_string();
            has_data = true;
        } else if let Some(rest) = trimmed.strip_prefix("event:") {
            let value = rest.strip_prefix(' ').unwrap_or(rest);
            current.event = Some(value.to_string());
        }
    }

    if has_data {
        frames.push(current);
    }

    frames
}
