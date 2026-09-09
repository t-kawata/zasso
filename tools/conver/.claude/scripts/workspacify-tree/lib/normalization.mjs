// [::TICKET::] PX-175 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-175 --for-spec --no-implementation-order`.
/**
 * Input text normalization (G0/G1 prerequisite).
 *
 * Normalization is a fixed sequence: strip a UTF-8 BOM, convert every CRLF and
 * CR to LF, and otherwise preserve the bytes exactly (a trailing newline is
 * kept as-is; nothing is appended or removed). The returned normalized bytes
 * are the basis for the source hash and for every source range recorded later.
 */
import { TextDecoder } from 'node:util';

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const CR = 0x0d;

/**
 * Normalize raw input bytes to LF-only UTF-8 bytes.
 *
 * @param {Buffer|Uint8Array} input - raw file bytes
 * @returns {{ bytes: Uint8Array, hadBom: boolean, hadCrLf: boolean }}
 */
export function normalizeTextBytes(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const hadBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const body = hadBom ? buffer.subarray(3) : buffer;
  const hadCrLf = body.includes(CR);
  const text = UTF8_DECODER.decode(body);
  const normalized = text.replace(/\r\n|\r/g, '\n');
  return {
    bytes: new Uint8Array(Buffer.from(normalized, 'utf8')),
    hadBom,
    hadCrLf,
  };
}
