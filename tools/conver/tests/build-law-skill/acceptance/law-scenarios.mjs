/**
 * Twelve realistic exploration and reach scenarios for rust-interface-law.
 *
 * Each scenario records the command sequence, the concept ids in the answer,
 * the payload size, the latency, and whether the result was sufficient.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export async function runLawScenarios({ skillDir, fixtureRoot }) {
  const cli = join(skillDir, 'dist/skill.mjs');
  const scenarios = [];

  const run = (label, args, cwd = process.cwd(), expect = [0]) => {
    const started = process.hrtime.bigint();
    const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    scenarios.push({
      label,
      commands: [`node "$LAW" ${args.join(' ')}`],
      status: result.status,
      expectedStatus: expect,
      conceptIds: extractIds(result.stdout),
      payloadBytes: Buffer.byteLength(result.stdout, 'utf8') + Buffer.byteLength(result.stderr, 'utf8'),
      latencyMs,
      rawGrepUsed: false,
      verdict: expect.includes(result.status) ? 'sufficient' : 'insufficient',
    });
    return result;
  };

  const appliedRoot = join(fixtureRoot, 'applicable');
  run('applies REST', ['applies', '--root', appliedRoot, '--paths', 'crates/app-rest/src/lib.rs'], appliedRoot, [0]);
  run('show REST-01', ['show', 'REST-01']);
  run('required REST-01', ['required', '--rule', 'REST-01']);
  run('incoming ID-01', ['incoming', 'ID-01']);
  run('context REST-01', ['context', '--rule', 'REST-01', '--budget', '1000000']);
  run('freshness', ['freshness']);
  run('trust unverified', ['trust', '--tier', 'unverified']);
  run('explain REST-01', ['explain', '--rule', 'REST-01']);
  run('search authorization', ['search', '--query', 'authorization']);
  run('required adapter phase', ['required', '--phase', 'adapter']);
  run('lint', ['lint']);
  run('neighbors REST-01', ['neighbors', 'REST-01']);
  return scenarios;
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function extractIds(output) {
  const text = String(output ?? '');
  const ids = new Set();
  for (const match of text.matchAll(/(?:`|")((?:rules|sources)\/[a-z0-9-]+(?:\/[a-z0-9-]+)*)(?:`|")/g)) {
    ids.add(match[1]);
  }
  return [...ids].sort();
}
