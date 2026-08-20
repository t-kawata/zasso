/**
 * handoff-step1.test.cjs — Verifies the handoff doc section 5 reflects the implemented Step 1
 *
 * PX-159 Phase 2: section 5 must describe the sub-step structure driven by
 * update-status.js set-step and the evolution safety mechanism (rfc-evolution.js),
 * without relying on the old grill command references.
 *
 * RED at make time: section 5 still describes the pre-implementation approach.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const HANDOFF = path.resolve(__dirname, '../../docs/drill-rfc-down-implementation-handoff.md');
const md = fs.readFileSync(HANDOFF, 'utf8');

describe('handoff doc section 5 (Step 1: grill)', () => {
  it('describes the sub-step structure (1-1..1-12) managed by update-status.js set-step', () => {
    const sec5 = md.slice(md.indexOf('## 5. Step 1: grill'), md.indexOf('## 6. Step 2: graphify'));
    assert.ok(sec5.includes('## 5. Step 1: grill'), 'section 5 present');
    assert.match(sec5, /1-1\.\.1-12|サブステップ|set-step/, 'sub-step structure mentioned');
    assert.match(sec5, /update-status\.js/, 'update-status.js referenced');
  });

  it('mentions the evolution safety mechanism (rfc-evolution.js) and session-init.js', () => {
    const sec5 = md.slice(md.indexOf('## 5. Step 1: grill'), md.indexOf('## 6. Step 2: graphify'));
    assert.match(sec5, /rfc-evolution\.js/, 'rfc-evolution.js referenced');
    assert.match(sec5, /session-init\.js/, 'session-init.js referenced');
  });

  it('no longer relies on init-for-drill-rfc-down.js or the old drill reference', () => {
    const sec5 = md.slice(md.indexOf('## 5. Step 1: grill'), md.indexOf('## 6. Step 2: graphify'));
    assert.doesNotMatch(sec5, /init-for-drill-rfc-down\.js/, 'old init wrapper removed');
    assert.doesNotMatch(sec5, /drill-rfc-down-old/, 'old drill command reference removed');
  });
});
