// terminal-text.ts — the one boundary between untrusted text and the terminal.
//
// Tool output and child stderr are not ours: they may carry cursor movement,
// erase-line, alternate-screen or hyperlink sequences. The dashboard reserves
// the top rows, so a single cursor-up from a command would paint stdout over the
// header. SGR color is the only escape a log line legitimately needs; everything
// else is dropped here, before the renderer writes it.

/** OSC ... BEL / ST, used by hyperlinks and terminal titles. */
const OSC_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** DCS / PM / APC introducers through their ST terminator. */
const DCS_PATTERN = /\x1b[PX^_][\s\S]*?\x1b\\/g;

/** CSI sequences; SGR (final `m`) is the only one kept. */
const CSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Any remaining ESC pair (DECSC/DECRC, charset selection, single shifts) that
 * is not a CSI. Valid CSIs — including the SGR kept above — are left alone.
 */
const ESC_PATTERN = /\x1b(?!\[[0-9;?]*[ -/]*[@-~])[\s\S]?/g;

/** C0 controls other than newline, tab and the ESC that starts a kept SGR. */
const CONTROL_PATTERN = /[\x00-\x08\x0b-\x1a\x1c-\x1f\x7f]/g;

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export function sanitizeTerminalText(value: string): string {
  return value
    .replace(OSC_PATTERN, "")
    .replace(DCS_PATTERN, "")
    .replace(CSI_PATTERN, (sequence) => (/m$/.test(sequence) ? sequence : ""))
    .replace(ESC_PATTERN, "")
    .replace(CONTROL_PATTERN, "");
}
