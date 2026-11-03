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
button { margin: 10px 6px; padding: 8px 18px; background: #1b2430; color: #dfe; border: 1px solid #345; border-radius: 6px; cursor: pointer; }
#error { color: #ff9a9a; max-width: 90vw; }
#status { color: #9aa; }
</style>
</head>
<body>
<canvas id="board"></canvas>
<div><button id="pause">Pause</button><button id="download">Download GIF</button><span id="status"></span></div>
<div id="error" hidden></div>
<script>${script}</script>
</body>
</html>`;
}
