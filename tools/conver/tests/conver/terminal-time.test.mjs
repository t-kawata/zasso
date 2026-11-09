// The animation must end at "now": every event has been applied and the token
// figure must include the analysis day, not stop at the last stage's estimate.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFrames,
  buildTimeline,
  formatUsageTitle,
  progressAt,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { INITIAL_TIME, makeModel, packageModel, stageEvent } from './models.mjs';

const DAY = 24 * 60 * 60 * 1000;

/** A cumulative usage series with one bucket per day. */
// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function usageSeries(days) {
  return days.map(({ date, costUsd, miss = costUsd * 1e6, hit = costUsd * 2e6, out = costUsd * 3e6 }) => ({
    date,
    cumulative: {
      cacheMissInputTokens: miss,
      cacheHitInputTokens: hit,
      outputTokens: out,
      costUsd,
    },
  }));
}

test('the final frame stands at analysisTime, not at the last stage estimate', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const analysisTime = INITIAL_TIME + 2 * DAY;
  const model = makeModel({
    packages: [pkg],
    analysisTime,
    events: [
      stageEvent('educe', INITIAL_TIME, null, 1),
      stageEvent('drill', INITIAL_TIME + 5_000, pkg.id, 1),
    ],
  });

  const frames = buildFrames(model, { frames: 60 });

  assert.equal(frames.at(-1).t, analysisTime);
  assert.ok(frames.every((frame, index) => index === 0 || frame.t >= frames[index - 1].t));
});

test('the final title carries the token and cost total of the analysis day', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const analysisTime = Date.parse('2026-11-02T12:00:00Z');
  const usage = usageSeries([
    { date: '2026-11-01', costUsd: 1.25 },
    { date: '2026-11-02', costUsd: 7.75 },
  ]);
  const model = makeModel({
    packages: [pkg],
    analysisTime,
    titleName: 'gaia',
    usage,
    usageAvailable: true,
    events: [
      stageEvent('educe', INITIAL_TIME, null, 1),
      stageEvent('drill', INITIAL_TIME + 5_000, pkg.id, 1),
    ],
  });

  const frames = buildFrames(model, { frames: 60 });

  assert.equal(frames.at(-1).title, formatUsageTitle('gaia', usage.at(-1).cumulative, 'CONTRACTS = 0/?', 'TICKETS = 0/?'));
  assert.notEqual(frames.at(-1).title, formatUsageTitle('gaia', usage[0].cumulative, 'CONTRACTS = 0/?', 'TICKETS = 0/?'));
});

test('a late event before analysisTime is fully applied and dated today', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const analysisTime = Date.parse('2026-11-06T02:00:00Z');
  const initialT = Date.parse('2026-10-26T00:00:00Z');
  const model = makeModel({
    initialT,
    analysisTime,
    packages: [pkg],
    events: [
      { ...stageEvent('educe', initialT, null, 1), timeSource: 'status' },
      { ...stageEvent('grill', Date.parse('2026-11-06T01:42:00Z'), pkg.id, 0.4), timeSource: 'status' },
      { ...stageEvent('drill', Date.parse('2026-11-04T23:57:00Z'), pkg.id, 1), timeSource: 'status' },
    ],
  });

  const frames = buildFrames(model, { frames: 60 });
  const last = frames.at(-1);

  assert.equal(last.t, analysisTime);
  assert.equal(last.pi[0][2], 0.4);
  assert.equal(last.pi[0][15], 1);
});

test('the previous marker excludes work done after the previous render', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
  const initialT = Date.parse('2026-10-26T00:00:00Z');
  const previousT = Date.parse('2026-11-05T00:00:00Z');
  const analysisTime = Date.parse('2026-11-06T03:00:00Z');
  const lateMake = {
    ...stageEvent('make', Date.parse('2026-11-06T02:30:00Z'), pkg.id, 0.2),
    timeSource: 'status',
  };
  const model = makeModel({
    initialT,
    analysisTime,
    packages: [pkg],
    events: [
      { ...stageEvent('educe', initialT, null, 0.5), timeSource: 'status' },
      lateMake,
      { ...stageEvent('drill', Date.parse('2026-11-04T23:00:00Z'), pkg.id, 0.5), timeSource: 'status' },
    ],
  });
  const withoutLateWork = makeModel({
    initialT,
    analysisTime,
    packages: [pkg],
    events: model.events.filter((event) => event.stage !== 'make'),
  });

  assert.equal(progressAt(model, previousT), progressAt(withoutLateWork, previousT));
  assert.ok(progressAt(model, analysisTime) > progressAt(model, previousT));
});

test('every event is applied by the final frame', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    analysisTime: INITIAL_TIME + 3 * DAY,
    events: [
      stageEvent('educe', INITIAL_TIME, null, 0.5),
      stageEvent('explain', INITIAL_TIME + 1_000, pkg.id, 0.25),
      stageEvent('grill', INITIAL_TIME + 2_000, pkg.id, 0.4),
      stageEvent('graphify', INITIAL_TIME + 3_000, pkg.id, 0.2),
      stageEvent('drill', INITIAL_TIME + 4_000, pkg.id, 0.75),
    ],
  });

  const last = buildFrames(model, { frames: 60 }).at(-1);

  assert.equal(last.pi[0][0], 0.5);
  assert.equal(last.pi[0][1], 0.25);
  assert.equal(last.pi[0][2], 0.4);
  assert.equal(last.pi[0][4], 0.2);
  assert.equal(last.pi[0][15], 0.75);
});

test('without analysisTime the last frame keeps the last display date', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    events: [
      stageEvent('educe', INITIAL_TIME, null, 1),
      stageEvent('drill', INITIAL_TIME + 5_000, pkg.id, 1),
    ],
  });

  const built = buildTimeline(model);
  const frames = buildFrames(model, { frames: 60 });

  assert.equal(frames.at(-1).t, built.timeline.at(-1).t);
});

test('an analysisTime older than the last display date never rewinds the clock', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    analysisTime: INITIAL_TIME - 10 * DAY,
    events: [
      stageEvent('educe', INITIAL_TIME, null, 1),
      stageEvent('drill', INITIAL_TIME + 5_000, pkg.id, 1),
    ],
  });

  const built = buildTimeline(model);
  const frames = buildFrames(model, { frames: 60 });

  assert.equal(frames.at(-1).t, built.timeline.at(-1).t);
  assert.ok(frames.every((frame, index) => index === 0 || frame.t >= frames[index - 1].t));
});
