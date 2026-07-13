#!/usr/bin/env node

/**
 * update-split-step-status-5-3.test.cjs
 * Tests: 5-3 step tracking + prune/renumber + Phase C stub resolution
 *
 * Run: node tests/update-split-step-status-5-3.test.cjs
 */

'use strict';

const path = require('path');
const fs = require('fs');

const sss = require(path.resolve(
  __dirname, '../.claude/scripts/rfc-graph/update-split-step-status.js'
));
const cpt = require(path.resolve(
  __dirname, '../.claude/scripts/tickets/consolidate-phase-tickets.js'
));

let passedCount = 0;
let failedCount = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) { passedCount++; }
  else { failedCount++; failures.push(msg); console.error('  FAIL: ' + msg); }
}

function assertEqual(a, b, msg) {
  if (a === b) { passedCount++; }
  else {
    failedCount++; failures.push(msg);
    console.error('  FAIL: ' + msg);
    console.error('    actual: ' + JSON.stringify(a) + ', expected: ' + JSON.stringify(b));
  }
}

function assertIncludes(arr, item, msg) {
  if (arr.includes(item)) { passedCount++; }
  else { failedCount++; failures.push(msg); console.error('  FAIL: ' + msg); }
}

function testStepOrder() {
  const o = sss.STEP_ORDER;
  assertIncludes(o, '5-3', 'STEP_ORDER has 5-3');
  assertEqual(o.indexOf('5-2') + 1, o.indexOf('5-3'), '5-2 then 5-3');
  assertEqual(o.indexOf('5-3') + 1, o.indexOf('6'), '5-3 then 6');
}

function testSubcommands() {
  assertIncludes(sss.ALLOWED_SUBCOMMANDS, 'prune-phases', 'has prune-phases');
  assertIncludes(sss.ALLOWED_SUBCOMMANDS, 'renumber-phases', 'has renumber-phases');
}

function testEndStep52() {
  const status = { steps: {}, currentStep: '5-2' };
  sss.STEP_ORDER.forEach(function(s) { status.steps[s] = 'pending'; });
  status.steps['5-2'] = 'running';
  sss.executeEndStep(status, '5-2');
  assertEqual(status.currentStep, '5-3', 'end 5-2 goes to 5-3');
  assertEqual(status.steps['5-2'], 'done', '5-2 is done');
}

function testEndStep53() {
  const status = { steps: {}, currentStep: '5-3' };
  sss.STEP_ORDER.forEach(function(s) { status.steps[s] = 'done'; });
  status.steps['5-3'] = 'running';
  sss.executeEndStep(status, '5-3');
  assertEqual(status.currentStep, '6', 'end 5-3 goes to 6');
  assertEqual(status.steps['5-3'], 'done', '5-3 is done');
}

function testStep53Lifecycle() {
  const status = { steps: {}, currentStep: '5-2' };
  sss.STEP_ORDER.forEach(function(s) { status.steps[s] = 'pending'; });

  sss.executeStartStep(status, '5-3');
  assertEqual(status.steps['5-3'], 'running', 'start -> running');
  assertEqual(status.currentStep, '5-3', 'current is 5-3');

  sss.executeFailStep(status, '5-3');
  assertEqual(status.steps['5-3'], 'error', 'fail -> error');
  assertEqual(status.currentStep, '5-3', 'current unchanged after fail');

  status.steps['6'] = 'done';
  sss.executeResetToStep(status, '5-3');
  assertEqual(status.steps['5-3'], 'error', 'reset keeps 5-3 status');
  assertEqual(status.steps['6'], 'pending', 'reset reverts 6 to pending');
}

function testValidateStepId() {
  assert(sss.validateStepId('5-3'), '5-3 is valid');
  assert(sss.validateStepId('5-2'), '5-2 is valid');
  assert(sss.validateStepId('6'), '6 is valid');
}

function testPhaseCStubResolved() {
  assert(typeof cpt.updateStatusJson === 'function', 'updateStatusJson exported');

  const source = fs.readFileSync(
    path.resolve(__dirname, '../.claude/scripts/tickets/consolidate-phase-tickets.js'),
    'utf8'
  );
  const hasStub = source.includes('[::STUB::] PX-46');
  assert(!hasStub, '[::STUB::] PX-46 removed from consolidate-phase-tickets.js');

  let threw = false;
  try { cpt.updateStatusJson('/tmp/nonexistent.json', [], []); }
  catch (e) { threw = true; }
  assert(!threw, 'updateStatusJson with empty input does not throw');
}

function run() {
  console.log('=== update-split-step-status-5-3.test.cjs ===');
  const tests = [
    testStepOrder, testSubcommands, testEndStep52, testEndStep53,
    testStep53Lifecycle, testValidateStepId, testPhaseCStubResolved,
  ];
  for (const fn of tests) {
    try { fn(); }
    catch (e) { failedCount++; failures.push('[CRASH] ' + fn.name + ': ' + e.message); }
  }
  const total = passedCount + failedCount;
  console.log('Result: ' + passedCount + '/' + total + ' PASS');
  process.exit(failedCount > 0 ? 1 : 0);
}

run();
