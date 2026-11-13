#!/usr/bin/env node
// @verifies C011
/**
 * Acceptance record writer and checker.
 *
 * Builds the mini wiki, verifies dev and installed modes, and writes the
 * measured record. The record is evidence, not a second verifier.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { verifyOkfSkill } from '../../../.claude/scripts/amend-rfc-up/verify-okf-skill.mjs';
import { buildMiniSkillV2 } from '../lib/fixture-v2.mjs';

function recordPath(argv) {
  const index = argv.indexOf('--record');
  return index >= 0 ? resolve(argv[index + 1]) : null;
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
async function main() {
  const skill = await buildMiniSkillV2();
  const target = join(skill.root, 'installed');
  try {
    mkdirSync(target, { recursive: true });
    execFileSync(process.execPath, [join(skill.skillDir, 'install.js'), target]);
    const dev = await verifyOkfSkill({
      skillPath: skill.skillDir,
      root: skill.root,
      sourceRoot: skill.root,
      pathAlias: skill.aliasPath,
      mode: 'dev',
    });
    const installed = await verifyOkfSkill({
      skillPath: join(target, '.claude/skills', basename(skill.skillDir)),
      root: skill.root,
      pathAlias: skill.aliasPath,
      mode: 'installed',
    });
    const record = {
      schema: 'okf-builds/v2',
      check_set_version: dev.check_set_version,
      builds: [{
        name: 'mini-okf',
        mode: 'dev',
        status: dev.status,
        required: dev.required_checks.length,
        verified: dev.required_checks.filter((name) => dev.checks[name].status === 'machine_verified').length,
        closure_sha256: dev.closure_sha256,
        installed_status: installed.status,
        installed_required: installed.required_checks.length,
        installed_verified: installed.required_checks.filter((name) => installed.checks[name].status === 'machine_verified').length,
        installed_closure_sha256: installed.closure_sha256,
      }],
    };
    const out = recordPath(process.argv.slice(2));
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify(record.builds[0])}\n`);
    return dev.status === 'machine_verified' && installed.status === 'machine_verified' ? 0 : 1;
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
