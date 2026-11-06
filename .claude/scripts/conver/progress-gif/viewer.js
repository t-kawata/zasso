// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
import { clampColumns, DEFAULT_CAPTION_LANGUAGE } from './layout.js';

/**
 * Browser-side viewer. It receives the model, the options and the pure engine
 * functions from the inline bundle; it owns only the DOM, the animation clock and
 * the download gesture.
 */
export const SPEED_MIN_MS = 20;
export const SPEED_MAX_MS = 400;
export const DEFAULT_SPEED_MS = 150;
export const MIN_FRAMES = 20;
export const MAX_FRAMES = 600;
export const DEFAULT_FRAMES = 200;
export const DEFAULT_LOOP = true;
export const GIF_DELAY_MIN_CS = 2;
export const GIF_DELAY_MAX_CS = 100;

/** Keep the user-selected frame interval inside the numeric input range. */
export function clampSpeedMs(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') return DEFAULT_SPEED_MS;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return DEFAULT_SPEED_MS;
  return Math.max(SPEED_MIN_MS, Math.min(SPEED_MAX_MS, Math.round(numeric)));
}

/**
 * Keep the requested frame count inside the range the browser can encode safely.
 * The upper bound caps the indexed pixel buffer held during GIF download.
 */
export function clampFrames(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') return DEFAULT_FRAMES;
  const numeric = Math.round(Number(raw));
  if (!Number.isFinite(numeric)) return DEFAULT_FRAMES;
  return Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, numeric));
}

/** Convert milliseconds per frame into the GIF centisecond delay field. */
export function delayCentiseconds(speedMs) {
  const numeric = Number(speedMs);
  const safe = Number.isFinite(numeric) ? numeric : DEFAULT_SPEED_MS;
  return Math.max(GIF_DELAY_MIN_CS, Math.min(GIF_DELAY_MAX_CS, Math.round(safe / 10)));
}

/**
 * Advance playback by one frame. A looping animation wraps to the first frame;
 * a non-looping one holds the last frame and reports that playback has ended.
 */
export function advancePlayback(index, frameCount, loop) {
  const count = Math.floor(Number(frameCount));
  if (!Number.isFinite(count) || count <= 0) return { index: 0, ended: true };
  const current = Math.max(0, Math.min(count - 1, Math.floor(Number(index)) || 0));
  if (current + 1 < count) return { index: current + 1, ended: false };
  if (loop) return { index: 0, ended: false };
  return { index: count - 1, ended: true };
}

export function startViewer({ model, options, buildFrames, computeLayout, makeEngine }) {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const errorBox = document.getElementById('error');
  const status = document.getElementById('status');
  const pauseButton = document.getElementById('pause');
  const framesInput = document.getElementById('frames');
  const speedInput = document.getElementById('speed');
  const columnsInput = document.getElementById('columns');
  const loopInput = document.getElementById('loop');
  const languageInput = document.getElementById('language');
  const seekInput = document.getElementById('seek');
  const seekValue = document.getElementById('seek-value');
  let frames = [];
  let layout = null;
  let index = 0;
  let playing = true;
  let last = 0;
  let frameCount = clampFrames(options.frames);
  let speedMs = clampSpeedMs(options.speedMs);
  let columns = clampColumns(options.columns);
  let loop = DEFAULT_LOOP;
  let language = DEFAULT_CAPTION_LANGUAGE;

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
  function showError(error) {
    errorBox.textContent = String(error && error.message ? error.message : error);
    errorBox.hidden = false;
  }

  /** Draw options plus the caption language currently selected in the controls. */
// [::TICKET::] PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-380 --for-spec --no-implementation-order`.
  function renderOptions() {
    return { ...options, language };
  }

// [::TICKET::] PX-349, PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-349|PX-380) --for-spec --no-implementation-order`.
  function drawAt(position) {
    if (!layout || frames.length === 0) return;
    makeEngine().drawFrame(ctx, layout, frames[position % frames.length], model, renderOptions());
  }

// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
  function syncFramesControls() {
    framesInput.value = String(frameCount);
  }

  function syncSpeedControls() {
    speedInput.value = String(speedMs);
  }

// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
  function syncSeekControls() {
    seekInput.value = String(index);
    seekValue.textContent = `${index}/${Math.max(0, frames.length - 1)}`;
  }

  function syncColumnsControls() {
    columnsInput.value = String(columns);
  }

  function relayout() {
    layout = computeLayout(model, {
      measureText: (text) => ctx.measureText(text).width,
      scale: options.scale,
      columns,
    });
    canvas.width = layout.width;
    canvas.height = layout.height;
    const tip = document.getElementById('tip');
    if (tip) tip.hidden = true;
    drawAt(index);
  }

  /**
   * Rebuilding keeps the viewer at the same relative position in the timeline.
   * The new frame count changes how many frames the same events are spread over.
   */
  function rebuildFrames() {
    const previousLastIndex = Math.max(0, frames.length - 1);
    const positionRatio = previousLastIndex > 0 ? index / previousLastIndex : 0;
    frames = buildFrames(model, { ...options, frames: frameCount });
    const lastIndex = Math.max(0, frames.length - 1);
    index = Math.max(0, Math.min(lastIndex, Math.round(positionRatio * lastIndex)));
    seekInput.max = String(lastIndex);
    syncSeekControls();
    drawAt(index);
  }

// [::TICKET::] PX-349, PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-349|PX-351) --for-spec --no-implementation-order`.
  function tick(time) {
    if (playing && time - last >= speedMs) {
      drawAt(index);
      const next = advancePlayback(index, frames.length, loop);
      index = next.index;
      if (next.ended) {
        playing = false;
        pauseButton.textContent = 'Play';
      }
      last = time;
      syncSeekControls();
    }
    requestAnimationFrame(tick);
  }

// [::TICKET::] PX-349, PX-351, PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-349|PX-351|PX-380) --for-spec --no-implementation-order`.
  function encodeAndDownload() {
    status.textContent = 'Encoding GIF...';
    const engine = makeEngine();
    const indexed = frames.map((frame) => {
      engine.drawFrame(ctx, layout, frame, model, renderOptions());
      const image = ctx.getImageData(0, 0, layout.width, layout.height);
      return engine.quantizeRgba(image.data, null, layout.width, layout.height);
    });
    const gif = engine.encodeGif({
      width: layout.width,
      height: layout.height,
      frames: indexed,
      delayCs: delayCentiseconds(speedMs),
    });
    const blob = new Blob([gif], { type: 'image/gif' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = options.stamp + '.gif';
    link.click();
    status.textContent = `GIF ready (${gif.length} bytes)`;
  }

// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
  function updateTooltip(event) {
    const tip = document.getElementById('tip');
    if (!tip || !layout) return;
    const rect = canvas.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) * (layout.width / rect.width);
    const pointerY = (event.clientY - rect.top) * (layout.height / rect.height);
    const cell = layout.cells.find((entry) => Math.hypot(entry.centerX - pointerX, entry.centerY - pointerY) <= entry.radius * 1.25);
    if (!cell) {
      tip.hidden = true;
      return;
    }
    tip.textContent = cell.name === cell.path ? cell.name : cell.name + '\n' + cell.path;
    tip.style.left = event.clientX + 12 + 'px';
    tip.style.top = event.clientY + 12 + 'px';
    tip.hidden = false;
  }

  try {
    const fontReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fontReady.then(function () {
      frames = buildFrames(model, { ...options, frames: frameCount });
      index = 0;
      seekInput.max = String(Math.max(0, frames.length - 1));
      syncFramesControls();
      syncSpeedControls();
      syncColumnsControls();
      syncSeekControls();
      relayout();
      requestAnimationFrame(tick);
      document.getElementById('download').addEventListener('click', encodeAndDownload);
      canvas.addEventListener('mousemove', updateTooltip);
      canvas.addEventListener('mouseleave', function () {
        const tip = document.getElementById('tip');
        if (tip) tip.hidden = true;
      });
      if (location.hash === '#download') encodeAndDownload();
      pauseButton.addEventListener('click', function () {
        const isAtEnd = !loop && index >= frames.length - 1;
        if (!playing && isAtEnd) {
          index = 0;
          drawAt(index);
          syncSeekControls();
        }
        playing = !playing;
        pauseButton.textContent = playing ? 'Pause' : 'Play';
        last = 0;
      });
      framesInput.addEventListener('change', function () {
        frameCount = clampFrames(framesInput.value);
        syncFramesControls();
        rebuildFrames();
      });
      speedInput.addEventListener('change', function () {
        speedMs = clampSpeedMs(speedInput.value);
        syncSpeedControls();
      });
      columnsInput.addEventListener('change', function () {
        columns = clampColumns(columnsInput.value);
        syncColumnsControls();
        relayout();
      });
      loopInput.addEventListener('change', function () {
        loop = loopInput.checked;
      });
      languageInput.addEventListener('change', function () {
        language = languageInput.checked ? 'en' : 'ja';
        drawAt(index);
      });
      seekInput.addEventListener('input', function () {
        playing = false;
        pauseButton.textContent = 'Play';
        index = Math.max(0, Math.min(frames.length - 1, Math.round(Number(seekInput.value) || 0)));
        drawAt(index);
        syncSeekControls();
      });
    }).catch(showError);
  } catch (error) {
    showError(error);
  }
}
