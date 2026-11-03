import { STAGE_ORDER } from './loop.js';
import { groupColor, formatDate, formatRatio, formatSplit } from './layout.js';

const BACKGROUND = [6, 8, 12];

/** Build the fixed 256-colour palette: background, grayscale ramp and seven group ramps. */
export function makePalette() {
  const palette = [];
  palette.push(BACKGROUND.slice());
  for (let index = 1; index < 24; index += 1) {
    const value = Math.round((index * 255) / 23);
    palette.push([value, value, value]);
  }
  const colours = STAGE_ORDER.map((stage) => groupColor(stage))
    .filter((value, index, all) => all.indexOf(value) === index)
    .map((hex) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]);
  for (const colour of colours) {
    for (let step = 1; step <= 24; step += 1) {
      palette.push(colour.map((value) => Math.round((value * step) / 24)));
    }
    for (let step = 1; step <= 8; step += 1) {
      palette.push(colour.map((value) => Math.round(value + ((255 - value) * step) / 9)));
    }
  }
  while (palette.length < 256) palette.push([255, 255, 255]);
  return palette.slice(0, 256);
}

let cachedPalette = null;
let cachedLut = null;

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function paletteEntries(palette) {
  return palette || (cachedPalette || (cachedPalette = makePalette()));
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function buildLut(palette) {
  const lut = new Uint8Array(32768);
  for (let index = 0; index < 32768; index += 1) {
    const red = ((index >> 10) & 31) * 8 + 4;
    const green = ((index >> 5) & 31) * 8 + 4;
    const blue = (index & 31) * 8 + 4;
    let best = 0;
    let distance = Infinity;
    for (let entry = 0; entry < palette.length; entry += 1) {
      const dr = palette[entry][0] - red;
      const dg = palette[entry][1] - green;
      const db = palette[entry][2] - blue;
      const candidate = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (candidate < distance) {
        distance = candidate;
        best = entry;
      }
    }
    lut[index] = best;
  }
  return lut;
}

export function quantizeRgba(rgba, palette, width, height) {
  const entries = paletteEntries(palette);
  const lut = cachedLut && entries === cachedPalette ? cachedLut : buildLut(entries);
  if (entries === cachedPalette) cachedLut = lut;
  const out = new Uint8Array(width * height);
  for (let pixel = 0, source = 0; pixel < out.length; pixel += 1, source += 4) {
    const key = ((rgba[source] >> 3) << 10) | ((rgba[source + 1] >> 3) << 5) | (rgba[source + 2] >> 3);
    out[pixel] = lut[key];
  }
  return out;
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
class ByteWriter {
// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
  constructor() {
    this.chunks = [];
    this.buffer = new Uint8Array(65536);
    this.offset = 0;
  }

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
  push(value) {
    if (this.offset === this.buffer.length) this.flush();
    this.buffer[this.offset] = value & 255;
    this.offset += 1;
  }

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
  pushBytes(values) {
    for (const value of values) this.push(value);
  }

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
  flush() {
    if (this.offset > 0) {
      this.chunks.push(this.buffer.slice(0, this.offset));
      this.offset = 0;
    }
  }

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
  toUint8Array() {
    this.flush();
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function writeU16(writer, value) {
  writer.push(value & 255);
  writer.push((value >> 8) & 255);
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function lzwEncode(pixels) {
  const CLEAR = 256;
  const EOI = 257;
  const table = new Int32Array(4096 * 256);
  const out = new ByteWriter();
  let current = 0;
  let bits = 0;
  let codeSize = 9;
  let next = 258;
  const emit = (code) => {
    current |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(current & 255);
      current >>= 8;
      bits -= 8;
    }
  };
  emit(CLEAR);
  let prefix = pixels[0] || 0;
  for (let index = 1; index < pixels.length; index += 1) {
    const value = pixels[index];
    const key = prefix * 256 + value;
    const code = table[key];
    if (code !== 0) {
      prefix = code;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(CLEAR);
      next = 258;
      codeSize = 9;
      table.fill(0);
    } else {
      if (next >= (1 << codeSize)) codeSize += 1;
      table[key] = next;
      next += 1;
    }
    prefix = value;
  }
  emit(prefix);
  emit(EOI);
  if (bits > 0) out.push(current & 255);
  return out.toUint8Array();
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function writeSubBlocks(writer, bytes) {
  for (let offset = 0; offset < bytes.length; offset += 255) {
    const length = Math.min(255, bytes.length - offset);
    writer.push(length);
    for (let index = 0; index < length; index += 1) writer.push(bytes[offset + index]);
  }
  writer.push(0);
}

/**
 * Encode indexed frames. Each frame is a Uint8Array of width*height palette indices.
 * Frames are written as full images; this keeps the encoder simple and deterministic.
 */
export function encodeGif({ width, height, frames, delayCs = 10, palette }) {
  const entries = paletteEntries(palette);
  const writer = new ByteWriter();
  writer.pushBytes('GIF89a'.split('').map((character) => character.charCodeAt(0)));
  writeU16(writer, width);
  writeU16(writer, height);
  writer.push(0xf7, 0, 0);
  for (let index = 0; index < 256; index += 1) {
    const colour = entries[index] || [0, 0, 0];
    writer.push(colour[0]);
    writer.push(colour[1]);
    writer.push(colour[2]);
  }
  writer.push(0x21, 0xff, 11);
  writer.pushBytes('NETSCAPE2.0'.split('').map((character) => character.charCodeAt(0)));
  writer.push(3, 1, 0, 0, 0);
  for (const frame of frames) {
    writer.push(0x21, 0xf9, 4, 0x04);
    writeU16(writer, delayCs);
    writer.push(0, 0);
    writer.push(0x2c);
    writeU16(writer, 0);
    writeU16(writer, 0);
    writeU16(writer, width);
    writeU16(writer, height);
    writer.push(0);
    writer.push(8);
    writeSubBlocks(writer, lzwEncode(frame));
  }
  writer.push(0x3b);
  return writer.toUint8Array();
}

export function estimateGifBytes({ width, height }, { frames = 120 } = {}) {
  const pixels = Math.max(1, width) * Math.max(1, height) * Math.max(1, frames);
  return Math.round(pixels * 0.09 + 1024);
}

/**
 * Reduce the frame count only when the estimate exceeds the ceiling. The budget is a
 * safety valve, not a target: a model below the ceiling keeps the requested frames.
 */
export function fitFramesToCeiling(layout, requestedFrames, maxBytes) {
  const warnings = [];
  let frames = Math.max(20, Math.round(requestedFrames));
  let estimated = estimateGifBytes(layout, { frames });
  while (estimated > maxBytes && frames > 20) {
    frames = Math.max(20, Math.floor(frames * (maxBytes / estimated)));
    estimated = estimateGifBytes(layout, { frames });
    warnings.push(`estimated GIF exceeds ${maxBytes} bytes; reduced to ${frames} frames`);
  }
  return { frames, estimated, warnings };
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function fillRect(ctx, rectangle) {
  ctx.fillStyle = rectangle.colour;
  ctx.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function drawCenteredText(ctx, textRun) {
  ctx.font = textRun.font;
  ctx.fillStyle = textRun.colour;
  ctx.textAlign = textRun.align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(textRun.text, textRun.x, textRun.y);
}

/** Draw one frame on a Canvas 2D context. The browser calls this; Node tests inject a fake. */
export function drawFrame(ctx, layout, frame, model, options = {}) {
  fillRect(ctx, { x: 0, y: 0, width: layout.width, height: layout.height, colour: '#06080c' });
  drawCenteredText(ctx, { text: options.title || 'PROGRESS', x: 16, y: 24, font: '600 18px ConverNoto, system-ui', colour: '#f2f5ff', align: 'left' });
  drawCenteredText(ctx, { text: formatDate(frame.t, frame.prec), x: layout.width - 16, y: 24, font: '500 14px ConverNoto, system-ui', colour: '#b8c2d6', align: 'right' });
  drawCenteredText(ctx, { text: String(frame.stage || '').toUpperCase(), x: 16, y: 52, font: '600 14px ConverNoto, system-ui', colour: groupColor(frame.stage), align: 'left' });
  const totals = frame.packages.reduce((sum, pkg) => ({ covered: sum.covered + pkg.covered, reviewed: sum.reviewed + pkg.reviewed }), { covered: 0, reviewed: 0 });
  drawCenteredText(ctx, { text: formatRatio(totals.covered, totals.reviewed), x: layout.width - 16, y: 52,
    font: '500 13px ConverNoto, system-ui', colour: '#b8c2d6', align: 'right' });
  drawCenteredText(ctx, { text: formatSplit(model.totals.splitPackages, model.totals.packages), x: layout.width - 16, y: 70,
    font: '500 12px ConverNoto, system-ui', colour: '#8f9bb0', align: 'right' });

  for (const cell of layout.cells) {
    const pkg = frame.packages.find((item) => item.id === cell.id);
    if (!pkg) continue;
    ctx.beginPath();
    ctx.arc(cell.centerX, cell.centerY, cell.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#101722';
    ctx.fill();
    ctx.strokeStyle = '#2a3545';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (pkg.fill > 0) {
      ctx.beginPath();
      ctx.moveTo(cell.centerX, cell.centerY);
      ctx.arc(cell.centerX, cell.centerY, cell.radius - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pkg.fill);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fill();
    }
    STAGE_ORDER.forEach((stage, index) => {
      const start = -Math.PI / 2 + (index / STAGE_ORDER.length) * Math.PI * 2;
      const end = -Math.PI / 2 + ((index + 1) / STAGE_ORDER.length) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cell.centerX, cell.centerY, cell.radius + 4, start + 0.02, end - 0.02);
      ctx.strokeStyle = groupColor(stage);
      ctx.globalAlpha = 0.2 + 0.8 * (pkg.stages[stage] || 0);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    cell.labelLines.forEach((line, lineIndex) => {
      drawCenteredText(ctx, { text: line, x: cell.centerX, y: cell.centerY + cell.radius + 14 + lineIndex * 13,
        font: '500 11px ConverNoto, system-ui', colour: '#c8d2e4' });
    });
  }

  const ring = layout.ring;
  const drillSubSweep = ['grill', 'graphify', 'boundify', 'split'];
  const drillStage = frame.stage === 'drill' ? drillSubSweep[frame.index % drillSubSweep.length] : null;
  const loopBackStage = frame.stage === 'find' && (frame.growth || []).length > 0 ? 'make' : null;
  STAGE_ORDER.forEach((stage, index) => {
    const start = ring.segments[index].start;
    const end = ring.segments[index].end;
    const highlighted = frame.stage === stage || drillStage === stage || loopBackStage === stage;
    ctx.beginPath();
    ctx.arc(ring.centerX, ring.centerY, ring.radius, start + 0.02, end - 0.02);
    ctx.strokeStyle = groupColor(stage);
    ctx.globalAlpha = highlighted ? 1 : 0.45;
    ctx.lineWidth = highlighted ? 10 : 6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    const middle = (start + end) / 2;
    drawCenteredText(ctx, { text: stage, x: ring.centerX + Math.cos(middle) * (ring.radius + 20),
      y: ring.centerY + Math.sin(middle) * (ring.radius + 20), font: '500 10px ConverNoto, system-ui', colour: groupColor(stage) });
  });
  drawCenteredText(ctx, { text: String(frame.stage || '').toUpperCase(), x: ring.centerX, y: ring.centerY,
    font: '600 16px ConverNoto, system-ui', colour: groupColor(frame.stage) });

  for (const event of frame.growth || []) {
    const cell = layout.cells.find((item) => item.id === event.packageId);
    if (!cell) continue;
    ctx.beginPath();
    ctx.arc(cell.centerX, cell.centerY, cell.radius + 12, 0, Math.PI * 2);
    ctx.strokeStyle = groupColor(event.stage);
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** The browser engine bundle. It exposes only functions that do not use Node built-ins. */
export function makeEngine() {
  return {
    drawFrame,
    encodeGif,
    quantizeRgba,
    estimateGifBytes,
    makePalette,
    formatDate,
    formatRatio,
    formatSplit,
    groupColor,
  };
}
