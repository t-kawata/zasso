import fs from 'node:fs';
import path from 'node:path';

import { STAGE_ORDER } from './loop.js';
import { STAGE_CAPTIONS } from './layout.js';

/** Collect every text run the renderer can draw. */
export function collectUsedText(model, options = {}) {
// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
// [::TICKET::] PX-380 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-380 --for-spec --no-implementation-order`.
  // The fixed padding covers every glyph the title can draw, including the
  // bracketed metric values, even when no frame title is present.
  const parts = [options.title || 'PROGRESS', 'TICKETS CONTRACTS CPC ICOD []$? 0123456789/:.-%'];
  for (const stage of STAGE_ORDER) parts.push(stage);
  // The language switch draws either column at runtime, so both must be covered.
  for (const table of Object.values(STAGE_CAPTIONS)) {
    for (const description of Object.values(table)) parts.push(description);
  }
  for (const pkg of (model && model.packages) || []) parts.push(pkg.name || pkg.id);
  return parts.join(' ');
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function codePoints(text) {
  return [...new Set([...String(text || '')].map((character) => character.codePointAt(0)))];
}

/** Select the bundled WOFF2 subsets whose unicode ranges cover the used code points. */
export function selectSubsets(text, manifest) {
  const points = codePoints(text);
  const subsets = (manifest && manifest.subsets) || [];
  return subsets.filter((subset) => {
    const ranges = subset.ranges || [];
    return points.some((point) => ranges.some(([start, end]) => point >= start && point <= end));
  });
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function rangeCss(ranges) {
  return (ranges || [])
    .map(([start, end]) => `U+${start.toString(16).toUpperCase()}-${end.toString(16).toUpperCase()}`)
    .join(', ');
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function dataUri(file, mime) {
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

/**
 * Load the bundled font. The preferred asset is the selected WOFF2 subset set; a full
 * Noto Sans JP variable TTF is accepted as the fallback so a partial checkout still works.
 */
export function loadFontBundle(fontDir, usedText) {
  const warnings = [];
  const manifestPath = path.join(fontDir, 'subset-manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const selected = selectSubsets(usedText, manifest);
      if (selected.length > 0) {
        const css = selected.map((subset) => {
          const file = path.join(fontDir, subset.file);
          if (!fs.existsSync(file)) {
            warnings.push(`font subset missing: ${subset.file}`);
            return '';
          }
          return `@font-face { font-family: 'ConverNoto'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${dataUri(file, 'font/woff2')}) format('woff2'); unicode-range: ${rangeCss(subset.ranges)}; }`;
        }).filter(Boolean).join('\n');
        if (css) return { css, warnings, mode: 'subsets' };
      }
    } catch (error) {
      warnings.push(`font subset manifest unreadable: ${error.message}`);
    }
  }
  const full = path.join(fontDir, 'NotoSansJP[wght].ttf');
  if (fs.existsSync(full)) {
    return {
      css: `@font-face { font-family: 'ConverNoto'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${dataUri(full, 'font/ttf')}) format('truetype'); }`,
      warnings,
      mode: 'full',
    };
  }
  warnings.push('font bundle unavailable; the viewer falls back to system-ui');
  return { css: '', warnings, mode: 'fallback' };
}
