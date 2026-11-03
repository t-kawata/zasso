// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function stripExports(source) {
  return String(source || '')
    .replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace(/^export\s+(?=(async\s+)?(function|const|let|class)\b)/gm, '')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
}

/** Serialize a value for an inline script without allowing a closing script tag. */
export function serializeForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function extractInlineScript(html) {
  const match = /<script>([\s\S]*?)<\/script>/i.exec(String(html || ''));
  return match ? match[1] : '';
}

/**
 * Render one self-contained HTML viewer. The model, the loop/layout/engine/viewer
 * sources and the font are all inline; the document makes no network request and
 * needs no server.
 */
export function renderHtml(input) {
// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
  const { model, options, engineSource, layoutSource, loopSource, viewerSource, fontCss = '' } = input;
  const title = options.title || 'PROGRESS';
  const frames = options.frames || 120;
  const fps = options.fps || 10;
  const stamp = options.stamp || 'progress';
  const scale = options.scale || 1;
  const script = `
const MODEL = ${serializeForScript(model)};
const OPTIONS = ${serializeForScript({ frames, fps, title, stamp, scale })};
${stripExports(loopSource)}
${stripExports(layoutSource)}
${stripExports(engineSource)}
${stripExports(viewerSource)}
startViewer({ model: MODEL, options: OPTIONS, buildFrames, computeLayout, makeEngine });
`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
${fontCss}
html, body { margin: 0; background: #06080c; color: #dbe6ff; font: 14px system-ui, sans-serif; }
body { display: flex; flex-direction: column; align-items: center; padding: 16px; }
canvas { max-width: 96vw; height: auto; background: #06080c; }
button { padding: 8px 18px; background: #1b2430; color: #dfe; border: 1px solid #345; border-radius: 6px; cursor: pointer; }
#controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px; margin: 10px 0; }
#controls label { display: flex; align-items: center; gap: 6px; color: #9aa; font: 12px system-ui, sans-serif; }
#controls input[type="range"] { width: 150px; }
#error { color: #ff9a9a; max-width: 90vw; }
#status { color: #9aa; }
#tip { position: fixed; pointer-events: none; padding: 4px 8px; border-radius: 4px; background: #111a24; color: #dbe6ff; font: 12px system-ui, sans-serif; white-space: pre; }
</style>
</head>
<body>
<canvas id="board"></canvas>
<div id="controls">
<button id="pause">Pause</button>
<label>Speed <input id="speed" type="range" min="20" max="400" step="10" value="100"><span id="speed-value">100 ms/frame</span></label>
<label>Seek <input id="seek" type="range" min="0" max="0" step="1" value="0"><span id="seek-value">0/0</span></label>
<button id="download">Download GIF</button>
<span id="status"></span>
</div>
<div id="tip" hidden></div>
<div id="error" hidden></div>
<script>${script}</script>
</body>
</html>`;
}
