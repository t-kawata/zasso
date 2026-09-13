// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
/**
 * The sufficiency of the file name, not of the assertions.
 *
 * P24-1's declaration records the presence of a test file per representative and
 * nothing about what it asserts, so this file exists to make that claim true and
 * to be readable — the adequacy of what it covers is the open item the
 * declaration records rather than something this file settles.
 */
import assert from 'node:assert/strict';
import { describeBox } from '../index.js';
import { doubled } from '../alpha.js';

assert.equal(describeBox({ width: 3, height: 4 }), '3x4', 'the merged interface reaches the entry point');
assert.equal(doubled(), 2, 'the re-exported module is reachable through the entry point');
