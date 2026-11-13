// [::TICKET::] PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-422 --for-spec --no-implementation-order`.
// [::TICKET::] PX-421 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-421 --for-spec --no-implementation-order`.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

export async function buildDist({ root }) {
  const absoluteRoot = resolve(root);
  const result = await build({
    entryPoints: [join(absoluteRoot, 'scripts/cli.mjs')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
    sourcemap: false,
    legalComments: 'none',
    // Path comments are relative to this root; without it the bundle depends on cwd.
    absWorkingDir: absoluteRoot,
  });

  const content = result.outputFiles[0].text;
  const outputPath = join(root, 'dist/skill.mjs');
  mkdirSync(join(root, 'dist'), { recursive: true });
  // Concurrent tests build this entry; a per-process temp plus atomic rename
  // keeps the committed file whole and stops two builds sharing one temp path.
  const temporary = `${outputPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  writeFileSync(temporary, content);
  renameSync(temporary, outputPath);

  return {
    path: outputPath,
    content,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

export function install({ root, mode }) {
  if (mode === 'build') throw new Error('install must not build');
  const dist = join(root, 'dist/skill.mjs');
  if (!existsSync(dist)) throw new Error('dist not found: ' + dist);
  return { built: false, copied: true, path: dist };
}
