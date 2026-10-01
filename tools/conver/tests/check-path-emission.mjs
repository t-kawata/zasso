#!/usr/bin/env node
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
/**
 * check-path-emission — report whether a path that leaves the process names this machine.
 *
 * Two questions, because the rule has two observable ends. The committed tree is asked
 * whether any artefact names this machine's home directory, which is the rule itself and is
 * exact. The sources are asked whether a sink interpolates a path this file proved to be
 * absolute without the converter, which is the rule one step earlier and is exact but
 * incomplete, for the reason `tests/lib/path-emission.mjs` states.
 *
 * Exits 0 when neither check finds anything, 1 otherwise. A scan that inspected nothing is
 * reported as a failure rather than as a clean tree: an empty scan and a clean one print the
 * same findings, and only one of them means the rule holds.
 */
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  renderArtefactReport,
  renderEmissionReport,
  scanCommittedArtefacts,
  scanPathEmissions,
} from './lib/path-emission.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_ROOT = join(PROJECT_ROOT, '.claude', 'scripts');

const emissions = scanPathEmissions({ root: SCRIPTS_ROOT });
const artefacts = scanCommittedArtefacts({ repositoryRoot: PROJECT_ROOT });

process.stdout.write(renderEmissionReport(emissions));
process.stdout.write(renderArtefactReport(artefacts));

const scannedNothing = emissions.inspected === 0 || artefacts.files === 0;
if (scannedNothing) {
  process.stderr.write(
    'the scan inspected nothing, which is a defect of the scan rather than a clean tree\n',
  );
}
process.exit(emissions.bypassing.length === 0 && artefacts.naming.length === 0 && !scannedNothing ? 0 : 1);
