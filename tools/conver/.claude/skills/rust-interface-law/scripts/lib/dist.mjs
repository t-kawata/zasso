import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

export async function buildDist({ root }) {
  const result = await build({
    entryPoints: [join(root, 'scripts/cli.mjs')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
    sourcemap: false,
    legalComments: 'none',
  });

  const content = result.outputFiles[0].text;
  const outputPath = join(root, 'dist/skill.mjs');
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(outputPath, content);

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
