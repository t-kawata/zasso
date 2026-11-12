import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const SCANNED_EXTENSIONS = new Set([
  '.rs', '.toml', '.yaml', '.yml', '.json', '.md', '.ts', '.js', '.mjs', '.cjs', '.sh',
]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FINDINGS = 100;
const INCOMPLETE = /\b(?:todo!|unimplemented!|panic!)\(|\b(?:TODO|FIXME|HACK|XXX)\b/;
const SECRET = /(password\s*=|-----BEGIN|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/;

export function scanImplementation({ root, paths = [] }) {
  if (paths.length === 0) {
    return { ok: false, findings: [{ kind: 'no-changed-paths' }], truncated: false };
  }

  const findings = [];
  for (const path of paths) {
    const absolute = join(root, path);
    if (!existsSync(absolute) || statSync(absolute).isDirectory()) continue;
    if (!SCANNED_EXTENSIONS.has(extname(path))) continue;
    if (statSync(absolute).size > MAX_FILE_BYTES) continue;

    const lines = readFileSync(absolute, 'utf8').split('\n');
    for (const [index, line] of lines.entries()) {
      const marked = line.includes('[::STUB::]')
        || (index > 0 && lines[index - 1].includes('[::STUB::]'));
      if (INCOMPLETE.test(line) && !marked) {
        findings.push({ path, line: index + 1, kind: 'unmarked-incomplete' });
      }
      if (SECRET.test(line)) {
        findings.push({ path, line: index + 1, kind: 'secret' });
      }
      if (findings.length >= MAX_FINDINGS) return { ok: false, findings, truncated: true };
    }
  }
  return { ok: findings.length === 0, findings, truncated: false };
}
