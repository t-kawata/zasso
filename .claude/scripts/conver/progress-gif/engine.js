import { STAGE_ORDER } from './loop.js';
import {
  groupColor,
  formatDate,
  formatPercent,
  radiusForArea,
} from './layout.js';

const BACKGROUND = [5, 7, 10];
const FONT_FAMILY = 'ConverNoto, system-ui, sans-serif';
const LABEL_COLOUR = '#c8d2e4';
const UNLIT_DOT_COLOUR = '#222a36';
const HEADER_BAR_TRACK_COLOUR = '#1b2430';
const HEADER_PERCENT_COLOUR = '#b8c2d6';
const HEADER_TITLE_SIZE = 14;
const MIN_TITLE_SIZE = 10;
export const TITLE_SEGMENT_GAP = 12;
export const TITLE_ELLIPSIS = '…';
const HEADER_DATE_SIZE = 20;
const HEADER_STAGE_SIZE = 18;
const HEADER_PERCENT_SIZE = 11;
export const LADDER_LABEL_SIZE = 14;

/** Build the fixed 256-colour palette: background, grayscale ramp and seven group ramps. */
export function makePalette() {
  const palette = [BACKGROUND.slice()];
  for (let index = 1; index <= 24; index += 1) {
    const value = Math.round((index * 255) / 24);
    palette.push([value, value, value]);
  }
  const colours = [...new Set(STAGE_ORDER.map((stage) => groupColor(stage)))].map(hexToRgb);
  for (const colour of colours) {
    for (let step = 1; step <= 20; step += 1) {
      palette.push(colour.map((value) => Math.round((value * step) / 20)));
    }
    for (let step = 1; step <= 8; step += 1) {
      palette.push(colour.map((value) => Math.round(value + ((255 - value) * step) / 9)));
    }
  }
  while (palette.length < 256) palette.push([255, 255, 255]);
  return palette.slice(0, 256);
}

// [::TICKET::] PX-350, PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-350|PX-351) --for-spec --no-implementation-order`.
function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// [::TICKET::] PX-350, PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-350|PX-351) --for-spec --no-implementation-order`.
function withAlpha(hex, alpha) {
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

// [::TICKET::] PX-350, PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-350|PX-351) --for-spec --no-implementation-order`.
function mixWithWhite(hex, amount) {
  const [red, green, blue] = hexToRgb(hex);
  return `rgb(${Math.round(red + (255 - red) * amount)}, ${Math.round(green + (255 - green) * amount)}, ${Math.round(blue + (255 - blue) * amount)})`;
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function clampUnit(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

let cachedPalette = null;
let cachedLut = null;

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function resolvePalette(palette) {
  return palette || (cachedPalette || (cachedPalette = makePalette()));
}

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

export function quantizeRgba(rgbaPixels, palette, width, height) {
  const entries = resolvePalette(palette);
  const lut = cachedLut && entries === cachedPalette ? cachedLut : buildLut(entries);
  if (entries === cachedPalette) cachedLut = lut;
  const out = new Uint8Array(width * height);
  for (let pixel = 0, source = 0; pixel < out.length; pixel += 1, source += 4) {
    const key = ((rgbaPixels[source] >> 3) << 10) | ((rgbaPixels[source + 1] >> 3) << 5) | (rgbaPixels[source + 2] >> 3);
    out[pixel] = lut[key];
  }
  return out;
}

class ByteWriter {
  constructor() {
    this.chunks = [];
    this.buffer = new Uint8Array(65536);
    this.offset = 0;
  }

  push(value) {
    if (this.offset === this.buffer.length) this.flush();
    this.buffer[this.offset] = value & 255;
    this.offset += 1;
  }

  pushBytes(values) {
    for (const value of values) this.push(value);
  }

  flush() {
    if (this.offset > 0) {
      this.chunks.push(this.buffer.slice(0, this.offset));
      this.offset = 0;
    }
  }

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

function writeU16(writer, value) {
  writer.push(value & 255);
  writer.push((value >> 8) & 255);
}

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

function writeSubBlocks(writer, bytes) {
  for (let offset = 0; offset < bytes.length; offset += 255) {
    const length = Math.min(255, bytes.length - offset);
    writer.push(length);
    for (let index = 0; index < length; index += 1) writer.push(bytes[offset + index]);
  }
  writer.push(0);
}

/** Bounding box of the palette indices that differ from the previous frame. */
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function findChangedBounds(previous, current, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * width;
    for (let column = 0; column < width; column += 1) {
      if (current[rowOffset + column] === previous[rowOffset + column]) continue;
      if (column < left) left = column;
      if (column > right) right = column;
      if (row < top) top = row;
      if (row > bottom) bottom = row;
    }
  }
  if (right < 0) return { x: 0, y: 0, width: 1, height: 1 };
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Encode indexed frames. The first frame is full; every later frame writes only the
 * bounding box that changed, which is what keeps the sample-level file size.
 */
export function encodeGif({ width, height, frames, delayCs = 10, palette }) {
  const entries = resolvePalette(palette);
  const writer = new ByteWriter();
  writer.pushBytes('GIF89a'.split('').map((character) => character.charCodeAt(0)));
  writeU16(writer, width);
  writeU16(writer, height);
  writer.push(0xf7);
  writer.push(0);
  writer.push(0);
  for (let index = 0; index < 256; index += 1) {
    const colour = entries[index] || [0, 0, 0];
    writer.push(colour[0]);
    writer.push(colour[1]);
    writer.push(colour[2]);
  }
  writer.push(0x21);
  writer.push(0xff);
  writer.push(11);
  writer.pushBytes('NETSCAPE2.0'.split('').map((character) => character.charCodeAt(0)));
  writer.push(3);
  writer.push(1);
  writer.push(0);
  writer.push(0);
  writer.push(0);
  let previous = null;
  for (const frame of frames) {
    const bounds = previous ? findChangedBounds(previous, frame, width, height) : { x: 0, y: 0, width, height };
    const pixels = new Uint8Array(bounds.width * bounds.height);
    for (let row = 0; row < bounds.height; row += 1) {
      for (let column = 0; column < bounds.width; column += 1) {
        pixels[row * bounds.width + column] = frame[(bounds.y + row) * width + bounds.x + column];
      }
    }
    writer.push(0x21);
    writer.push(0xf9);
    writer.push(4);
    writer.push(0x04);
    writeU16(writer, delayCs);
    writer.push(0);
    writer.push(0);
    writer.push(0x2c);
    writeU16(writer, bounds.x);
    writeU16(writer, bounds.y);
    writeU16(writer, bounds.width);
    writeU16(writer, bounds.height);
    writer.push(0);
    writer.push(8);
    writeSubBlocks(writer, lzwEncode(pixels));
    previous = Uint8Array.from(frame);
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

function fillRect(ctx, rectangle) {
  ctx.fillStyle = rectangle.colour;
  ctx.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function fillCircle(ctx, centre, radius, colour, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function strokeRing(ctx, ring) {
  ctx.globalAlpha = ring.alpha === undefined ? 1 : ring.alpha;
  ctx.strokeStyle = ring.colour;
  ctx.lineWidth = ring.lineWidth;
  ctx.beginPath();
  ctx.arc(ring.centre.x, ring.centre.y, ring.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function drawText(ctx, textRun) {
  ctx.globalAlpha = textRun.alpha === undefined ? 1 : textRun.alpha;
  ctx.font = textRun.font;
  ctx.fillStyle = textRun.colour;
  ctx.textAlign = textRun.align || 'left';
  ctx.textBaseline = textRun.baseline || 'middle';
  ctx.fillText(textRun.text, textRun.x, textRun.y);
  ctx.globalAlpha = 1;
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
function drawProgressBar(ctx, layout, frame) {
  const header = layout.header;
  fillRect(ctx, {
    x: header.barX,
    y: header.barY,
    width: header.barWidth,
    height: header.barHeight,
    colour: HEADER_BAR_TRACK_COLOUR,
  });
  fillRect(ctx, {
    x: header.barX,
    y: header.barY,
    width: header.barWidth * clampUnit(frame.overallProgress),
    height: header.barHeight,
    colour: groupColor(frame.stage || STAGE_ORDER[0]),
  });
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
export function selectTitle(frame, options, header) {
  return (frame && frame.title) || options.title || header.title;
}

// [::TICKET::] PX-352 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-352 --for-spec --no-implementation-order`.
export function fitTitleSize(ctx, text, availableWidth, baseSize, minSize = MIN_TITLE_SIZE) {
  if (!ctx || typeof ctx.measureText !== 'function') return baseSize;
  let size = baseSize;
  ctx.font = `600 ${size}px ${FONT_FAMILY}`;
  while (size > minSize && ctx.measureText(text).width > availableWidth) {
    size -= 1;
    ctx.font = `600 ${size}px ${FONT_FAMILY}`;
  }
  return size;
}

/** Return the split title only when the frame carries one; legacy frames have none. */
// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
export function selectTitleParts(frame) {
  return frame && frame.titleParts ? frame.titleParts : null;
}

/**
 * Fit the left name and the right metric block into one title band.
 *
 * The metric block is never truncated: it is the payload of the title. The size
 * shrinks first, and only when the minimum size still overflows does the name
 * give up characters and end with an ellipsis.
 */
// [::TICKET::] PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-354 --for-spec --no-implementation-order`.
export function fitTitleLayout(ctx, parts, options) {
  const {
    availableWidth,
    baseSize,
    minSize = MIN_TITLE_SIZE,
    gap = TITLE_SEGMENT_GAP,
  } = options;
  if (!ctx || typeof ctx.measureText !== 'function') {
    return { size: baseSize, left: parts.left, right: parts.right };
  }
  const measurePair = (size, left, right) => {
    ctx.font = `600 ${size}px ${FONT_FAMILY}`;
    return ctx.measureText(left).width + gap + ctx.measureText(right).width;
  };
  let size = baseSize;
  while (size > minSize && measurePair(size, parts.left, parts.right) > availableWidth) {
    size -= 1;
  }
  if (measurePair(size, parts.left, parts.right) <= availableWidth) {
    return { size, left: parts.left, right: parts.right };
  }
  let candidate = parts.left;
  while (candidate.length > 1) {
    candidate = candidate.slice(0, -1);
    const truncated = `${candidate}${TITLE_ELLIPSIS}`;
    if (measurePair(size, truncated, parts.right) <= availableWidth) {
      return { size, left: truncated, right: parts.right };
    }
  }
  return { size, left: TITLE_ELLIPSIS, right: parts.right };
}

// [::TICKET::] PX-351, PX-352, PX-354 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-351|PX-352|PX-354) --for-spec --no-implementation-order`.
function drawHeader(ctx, layout, frame, options) {
  const scale = layout.scale;
  const header = layout.header;
  const baseTitleSize = HEADER_TITLE_SIZE * scale;
  const availableWidth = layout.width - header.titleX * 2;
  const parts = selectTitleParts(frame);
  if (parts) {
    const fitted = fitTitleLayout(ctx, parts, {
      availableWidth,
      baseSize: baseTitleSize,
      minSize: MIN_TITLE_SIZE * scale,
      gap: TITLE_SEGMENT_GAP * scale,
    });
    const font = `600 ${fitted.size}px ${FONT_FAMILY}`;
    drawText(ctx, { text: fitted.left, x: header.titleX, y: header.titleY, font, colour: '#eef2ff' });
    drawText(ctx, {
      text: fitted.right,
      x: layout.width - header.titleX,
      y: header.titleY,
      font,
      colour: '#eef2ff',
      align: 'right',
    });
  } else {
    // Legacy titles keep the original single-string rendering.
    const title = selectTitle(frame, options, header);
    const titleSize = frame && frame.title
      ? fitTitleSize(ctx, title, availableWidth, baseTitleSize)
      : baseTitleSize;
    drawText(ctx, {
      text: title,
      x: header.titleX,
      y: header.titleY,
      font: `600 ${titleSize}px ${FONT_FAMILY}`,
      colour: '#eef2ff',
    });
  }
  drawProgressBar(ctx, layout, frame);
  drawText(ctx, {
    text: formatDate(frame.t, frame.prec),
    x: header.dateX,
    y: header.dateY,
    font: `600 ${HEADER_DATE_SIZE * scale}px ${FONT_FAMILY}`,
    colour: '#f4f7ff',
  });
  drawText(ctx, {
    text: String(frame.stage || '').toUpperCase(),
    x: header.stageX,
    y: header.stageY,
    font: `600 ${HEADER_STAGE_SIZE * scale}px ${FONT_FAMILY}`,
    colour: groupColor(frame.stage),
  });
  drawText(ctx, {
    text: formatPercent(frame.overallProgress),
    x: header.percentX,
    y: header.percentY,
    font: `500 ${HEADER_PERCENT_SIZE * scale}px ${FONT_FAMILY}`,
    colour: HEADER_PERCENT_COLOUR,
    align: 'right',
  });
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function findTopStage(progress) {
  for (let index = STAGE_ORDER.length - 1; index >= 0; index -= 1) {
    if (progress[index] > 0.001) return STAGE_ORDER[index];
  }
  return STAGE_ORDER[0];
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function collectActiveStages(frame, packageIndex) {
  const stages = new Set();
  for (const value of frame.active || []) {
    if (value < 0 && value <= -100) stages.add(-100 - value);
    else if (Math.floor(value / STAGE_ORDER.length) === packageIndex) stages.add(value % STAGE_ORDER.length);
  }
  return stages;
}

// [::TICKET::] PX-350, PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-350|PX-351) --for-spec --no-implementation-order`.
function drawCell(ctx, layout, cell, frame, model) {
  const scale = layout.scale;
  const view = frame.packages[cell.packageIndex];
  if (!view) return;
  const progress = frame.pi[cell.packageIndex] || new Array(STAGE_ORDER.length).fill(0);
  const total = view.total;
  const reviewed = Math.min(view.reviewed, total);
  const fill = total > 0 ? reviewed / total : 0;
  const radius = radiusForArea(total, layout.grid.minTotal, layout.grid.maxTotal, layout.grid.minRadius, layout.grid.maxRadius);
  const stage = findTopStage(progress);
  const hue = groupColor(stage);
  const centre = { x: cell.centerX, y: cell.centerY };
  const density = view.density || 0;
  const pulse = 0.5 + 0.5 * Math.sin(frame.index * 0.9);
  strokeRing(ctx, { centre, radius: radius * 1.05, colour: '#3c465a', lineWidth: 1.2 * scale, alpha: 0.55 });
  if (fill > 0) {
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = hue;
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius * 1.05, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill);
    ctx.stroke();
    ctx.globalAlpha = 1;
    fillCircle(ctx, centre, radius * 0.96, hue, 0.18 * fill);
  }
  if (total === 0) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#5a6478';
    ctx.lineWidth = 1.2 * scale;
    ctx.setLineDash([3 * scale, 3 * scale]);
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius * 1.05, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  if (density > 0.01) {
    const alpha = 0.04 + 0.34 * density * density + 0.10 * density;
    const gradient = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, radius * 1.25);
    gradient.addColorStop(0, withAlpha(hue, alpha));
    gradient.addColorStop(1, withAlpha(hue, 0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  const flashStages = collectActiveStages(frame, cell.packageIndex);
  for (const dot of cell.dots) {
    const count = layout.dotCounts[dot.stage] || 1;
    const lit = clampUnit(progress[dot.stage] * count - dot.indexInStage);
    const dotX = centre.x + Math.cos(dot.angle) * dot.radial * radius;
    const dotY = centre.y + Math.sin(dot.angle) * dot.radial * radius;
    if (lit <= 0) {
      fillCircle(ctx, { x: dotX, y: dotY }, 0.9 * scale, UNLIT_DOT_COLOUR, 0.9);
      continue;
    }
    const flash = flashStages.has(dot.stage);
    const whiteMix = 0.25 + 0.35 * density + (flash ? 0.45 : 0);
    fillCircle(
      ctx,
      { x: dotX, y: dotY },
      (1.15 + 0.55 * lit + (flash ? 0.7 : 0)) * scale,
      mixWithWhite(groupColor(STAGE_ORDER[dot.stage]), whiteMix),
      0.55 + 0.45 * lit,
    );
  }
  if (flashStages.size > 0) {
    strokeRing(ctx, { centre, radius: radius * 1.16, colour: '#ffffff', lineWidth: 1.5 * scale, alpha: 0.55 + 0.4 * pulse });
  }
  cell.labelLines.forEach((line, lineIndex) => {
    drawText(ctx, {
      text: line,
      x: cell.labelX,
      y: cell.labelY + lineIndex * 11 * scale,
      font: `500 ${10 * scale}px ${FONT_FAMILY}`,
      colour: LABEL_COLOUR,
      align: 'center',
      baseline: 'alphabetic',
      alpha: 0.92,
    });
  });
}

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
function drawGrowthPulses(ctx, layout, frame) {
  for (const event of frame.growth || []) {
    const cell = layout.cells.find((entry) => entry.id === event.packageId);
    if (!cell) continue;
    strokeRing(ctx, {
      centre: { x: cell.centerX, y: cell.centerY },
      radius: cell.radius + 8 * layout.scale,
      colour: groupColor(event.stage),
      lineWidth: 3 * layout.scale,
      alpha: 0.8,
    });
  }
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function drawRunMarkers(ctx, layout, frame) {
  for (const run of frame.runs || []) {
    const cell = layout.cells.find((entry) => entry.id === run.packageId);
    if (!cell) continue;
    strokeRing(ctx, {
      centre: { x: cell.centerX, y: cell.centerY },
      radius: cell.radius + 4 * layout.scale,
      colour: groupColor(run.stage),
      lineWidth: (run.status === 'COMPLETE' ? 2 : 1.5) * layout.scale,
      alpha: 0.9,
    });
  }
}

// [::TICKET::] PX-350, PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-350|PX-351) --for-spec --no-implementation-order`.
function drawLadder(ctx, layout, frame) {
  const scale = layout.scale;
  layout.ladder.rows.forEach((row, index) => {
    const current = frame.stage === row.stage;
    const active = (frame.active || []).some((value) =>
      value === -100 - index || (value >= 0 && value % STAGE_ORDER.length === index));
    if (current || active) {
      fillRect(ctx, {
        x: row.x,
        y: row.y - 3 * scale,
        width: 188 * scale,
        height: 18 * scale,
        colour: withAlpha(row.colour, current ? 0.22 : 0.12),
      });
    }
    drawText(ctx, {
      text: row.stage.toUpperCase(),
      x: row.labelX,
      y: row.centerY,
      font: `600 ${LADDER_LABEL_SIZE * scale}px ${FONT_FAMILY}`,
      colour: row.colour,
      alpha: current || active ? 1 : 0.62,
    });
    fillRect(ctx, {
      x: row.barX,
      y: row.barY,
      width: row.barWidth,
      height: row.barHeight,
      colour: '#28303c',
    });
    fillRect(ctx, {
      x: row.barX,
      y: row.barY,
      width: row.barWidth * clampUnit(frame.globalStage[index] || 0),
      height: row.barHeight,
      colour: row.colour,
    });
  });
}

/** Draw one frame on a Canvas 2D context. The browser calls this; Node tests inject a fake. */
export function drawFrame(ctx, layout, frame, model, options = {}) {
  fillRect(ctx, { x: 0, y: 0, width: layout.width, height: layout.height, colour: '#05070a' });
  drawHeader(ctx, layout, frame, options);
  for (const cell of layout.cells) drawCell(ctx, layout, cell, frame, model);
  drawLadder(ctx, layout, frame);
  drawGrowthPulses(ctx, layout, frame);
  drawRunMarkers(ctx, layout, frame);
}

/** The browser engine bundle. It exposes only functions that do not use Node built-ins. */
export function makeEngine() {
  return {
    drawFrame,
    encodeGif,
    quantizeRgba,
    estimateGifBytes,
    makePalette,
  };
}
