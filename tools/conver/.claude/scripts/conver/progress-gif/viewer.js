// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
/**
 * Browser-side viewer. It receives the model, the options and the pure engine
 * functions from the inline bundle; it owns only the DOM, the animation clock and
 * the download gesture.
 */
export function startViewer({ model, options, buildFrames, computeLayout, makeEngine }) {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const errorBox = document.getElementById('error');
  const status = document.getElementById('status');
  let frames = [];
  let layout = null;
  let index = 0;
  let playing = true;
  let last = 0;

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
  function showError(error) {
    errorBox.textContent = String(error && error.message ? error.message : error);
    errorBox.hidden = false;
  }

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
  function drawAt(position) {
    if (!layout || frames.length === 0) return;
    makeEngine().drawFrame(ctx, layout, frames[position % frames.length], model, options);
  }

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
  function tick(time) {
    if (playing && time - last >= 1000 / options.fps) {
      drawAt(index);
      index = (index + 1) % Math.max(1, frames.length);
      last = time;
    }
    requestAnimationFrame(tick);
  }

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
  function encodeAndDownload() {
    status.textContent = 'Encoding GIF...';
    const engine = makeEngine();
    const indexed = frames.map((frame) => {
      engine.drawFrame(ctx, layout, frame, model, options);
      const image = ctx.getImageData(0, 0, layout.width, layout.height);
      return engine.quantizeRgba(image.data, null, layout.width, layout.height);
    });
    const gif = engine.encodeGif({
      width: layout.width,
      height: layout.height,
      frames: indexed,
      delayCs: Math.max(1, Math.round(100 / options.fps)),
    });
    const blob = new Blob([gif], { type: 'image/gif' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = options.stamp + '.gif';
    link.click();
    status.textContent = 'GIF ready (' + gif.length + ' bytes)';
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
      layout = computeLayout(model, { measureText: (text) => ctx.measureText(text).width, scale: options.scale });
      canvas.width = layout.width;
      canvas.height = layout.height;
      frames = buildFrames(model, options);
      index = 0;
      drawAt(0);
      requestAnimationFrame(tick);
      document.getElementById('download').addEventListener('click', encodeAndDownload);
      canvas.addEventListener('mousemove', updateTooltip);
      canvas.addEventListener('mouseleave', function () {
        const tip = document.getElementById('tip');
        if (tip) tip.hidden = true;
      });
      if (location.hash === '#download') encodeAndDownload();
      document.getElementById('pause').addEventListener('click', function (event) {
        playing = !playing;
        event.target.textContent = playing ? 'Pause' : 'Play';
      });
    }).catch(showError);
  } catch (error) {
    showError(error);
  }
}
