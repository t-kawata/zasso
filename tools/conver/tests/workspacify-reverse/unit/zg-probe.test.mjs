// @verifies C003
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
/**
 * The serving layer's zg probe, measured on its own.
 *
 * zg is not on this machine, and that is the state the probe has to make
 * ordinary: an absent search tool is a normal condition, reported as such, and
 * no stage of the analysis waits for it. The runner is therefore injected —
 * the same seam `env-manifest.cjs` uses for its environment probe — so the
 * candidate branch is exercised by a stand-in rather than by not running it.
 *
 * The two search modes are kept apart on purpose. A `--rg` search enumerates a
 * literal completely and is the only zg use that may stand near a
 * determination; a hybrid search finds material by meaning and can do no more
 * than propose. Every hit therefore carries the label of the mode that produced
 * it, because a candidate that later reads as a finding is the failure this
 * layer exists to prevent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANDIDATE_LABEL,
  EXHAUSTIVE_LABEL,
  ZG_AVAILABILITY,
  ZG_REMEDY,
  ZG_SEARCH_MODES,
  ZG_TOOL_ID,
  probeZg,
  renderZgReport,
} from '../../../.claude/scripts/workspacify-reverse/lib/zg-probe.mjs';
import { createSyntheticTree, SPIKE_SLICE_FILES } from '../helpers/scratch.mjs';

/**
 * A stand-in for the zg executable.
 *
 * `hits` is the raw stdout a search returns, so the parsing is measured rather
 * than bypassed: the stub emits the same `path:line:text` shape ripgrep does.
 */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
function zgStub({ availability = ZG_AVAILABILITY.available, version = '0.3.1', hits = [], status = 0 } = {}) {
  return ({ command, args }) => {
    if (availability === ZG_AVAILABILITY.unavailable) {
      return { status: 127, stdout: '', stderr: `zsh: command not found: ${command}` };
    }
    if (args[0] === 'version') return { status: 0, stdout: `zg ${version}\n`, stderr: '' };
    return { status, stdout: hits.length > 0 ? `${hits.join('\n')}\n` : '', stderr: '' };
  };
}

const AVAILABILITIES = [ZG_AVAILABILITY.available, ZG_AVAILABILITY.unavailable];

// --- C003 precondition: both states are legal inputs --------------------------

test('C003 precondition: zg is either available or absent, and both are legal inputs', () => {
  const tree = createSyntheticTree(SPIKE_SLICE_FILES);
  try {
    for (const availability of AVAILABILITIES) {
      const probe = probeZg({
        root: tree.root,
        query: 'where credentials are validated',
        runner: zgStub({ availability }),
      });

      assert.equal(AVAILABILITIES.includes(probe.availability), true, 'the availability is one of the two declared states');
      assert.equal(probe.tool, ZG_TOOL_ID);
      assert.equal(probe.commandLine, 'zg version');
      assert.equal(probe.query, 'where credentials are validated');
    }
  } finally {
    tree.dispose();
  }
});

// --- C003 postcondition: the two search modes are served apart ----------------

test('C003 postcondition: candidate discovery and exhaustive enumeration are distinguished and served separately', () => {
  const tree = createSyntheticTree(SPIKE_SLICE_FILES);
  try {
    const hits = ['src/api/login.rs:4:    assert!(!user.name.is_empty());'];

    const candidate = probeZg({ root: tree.root, query: 'where credentials are validated', runner: zgStub({ hits }) });
    assert.equal(candidate.mode, ZG_SEARCH_MODES.candidate.mode);
    assert.equal(candidate.candidates.length, 1, 'the candidate mode serves the candidates');
    assert.deepEqual(candidate.exhaustive, [], 'and serves no enumeration');
    assert.equal(candidate.deterministic, false, 'a model-dependent search is never deterministic');

    const exhaustive = probeZg({
      root: tree.root,
      query: 'login',
      mode: ZG_SEARCH_MODES.exhaustive.mode,
      runner: zgStub({ hits }),
    });
    assert.equal(exhaustive.mode, ZG_SEARCH_MODES.exhaustive.mode);
    assert.equal(exhaustive.exhaustive.length, 1, 'the exhaustive mode serves the enumeration');
    assert.deepEqual(exhaustive.candidates, [], 'and serves no candidates');
    assert.equal(exhaustive.deterministic, true, 'a complete enumeration of a named literal is deterministic');

    assert.notEqual(ZG_SEARCH_MODES.candidate.mode, ZG_SEARCH_MODES.exhaustive.mode);
    assert.notEqual(ZG_SEARCH_MODES.candidate.label, ZG_SEARCH_MODES.exhaustive.label);
  } finally {
    tree.dispose();
  }
});

test('UT-3: probeZg reports availability and, when available, returns candidates labelled as candidates', () => {
  const tree = createSyntheticTree(SPIKE_SLICE_FILES);
  try {
    const probe = probeZg({
      root: tree.root,
      query: 'where access credentials are validated',
      runner: zgStub({ hits: ['src/api/login.rs:4:    assert!(!user.name.is_empty());'] }),
    });

    assert.equal(probe.availability, ZG_AVAILABILITY.available);
    assert.equal(probe.version, '0.3.1');
    assert.equal(probe.remedy, '', 'an installed tool needs no remedy');
    assert.equal(probe.candidates.length > 0, true);
    assert.equal(
      probe.candidates.every((hit) => hit.label === CANDIDATE_LABEL),
      true,
      'a search hit is a candidate, never a finding',
    );

    const [hit] = probe.candidates;
    assert.equal(hit.path, 'src/api/login.rs');
    assert.equal(hit.line, 4);
    assert.equal(hit.text, '    assert!(!user.name.is_empty());');
  } finally {
    tree.dispose();
  }
});

test('C003 invariant: every hit carries the label of the mode that produced it, and the report says what the label means', () => {
  const tree = createSyntheticTree(SPIKE_SLICE_FILES);
  try {
    const probe = probeZg({
      root: tree.root,
      query: 'where access credentials are validated',
      runner: zgStub({ hits: ['src/api/login.rs:4:    assert!(!user.name.is_empty());'] }),
    });

    const labels = [...probe.candidates, ...probe.exhaustive].map((hit) => hit.label);
    assert.equal(labels.every((label) => label === CANDIDATE_LABEL || label === EXHAUSTIVE_LABEL), true);
    assert.equal(probe.candidates.every((hit) => hit.label !== EXHAUSTIVE_LABEL), true);

    const markdown = renderZgReport(probe);
    assert.match(markdown, /candidate/i);
    assert.match(markdown, /does not settle a claim/i, 'the report states what a candidate may not be used for');
  } finally {
    tree.dispose();
  }
});

test('UT-3: a hit that carries no location is kept rather than dropped', () => {
  const tree = createSyntheticTree(SPIKE_SLICE_FILES);
  try {
    const probe = probeZg({
      root: tree.root,
      query: 'where access credentials are validated',
      runner: zgStub({ hits: ['src/api/login.rs:4:located', 'a summary line with no location at all'] }),
    });

    assert.equal(probe.candidates.length, 2, 'the free-form line is reported, not silently discarded');
    const unlocated = probe.candidates.find((hit) => hit.path === null);
    assert.equal(unlocated.line, null);
    assert.equal(unlocated.text, 'a summary line with no location at all');
  } finally {
    tree.dispose();
  }
});

// --- UT-5 / UT-8: an absent zg is normal, not an error ------------------------

test('UT-5: an unavailable zg is reported as unavailable and does not raise', () => {
  const tree = createSyntheticTree(SPIKE_SLICE_FILES);
  try {
    let probe;
    assert.doesNotThrow(() => {
      probe = probeZg({ root: tree.root, query: 'q', runner: zgStub({ availability: ZG_AVAILABILITY.unavailable }) });
    }, 'a missing search tool is a normal condition');

    assert.equal(probe.availability, ZG_AVAILABILITY.unavailable);
    assert.equal(probe.version, null);
    assert.equal(probe.remedy, ZG_REMEDY);
    assert.deepEqual(probe.candidates, []);
    assert.deepEqual(probe.exhaustive, []);
    assert.equal(probe.deterministic, false);
  } finally {
    tree.dispose();
  }
});

test('UT-8: an absent zg produces a report with no candidate section', () => {
  const tree = createSyntheticTree(SPIKE_SLICE_FILES);
  try {
    const markdown = renderZgReport(
      probeZg({ root: tree.root, query: 'q', runner: zgStub({ availability: ZG_AVAILABILITY.unavailable }) }),
    );

    assert.match(markdown, /not installed|unavailable/i, 'the absence is stated');
    assert.match(markdown, new RegExp(ZG_REMEDY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the fix is named');
    assert.equal(/^## /m.test(markdown), false, 'an absent zg produces no candidate section');
  } finally {
    tree.dispose();
  }
});

test('C003 invariant: a search that failed is reported, so silence is never read as "no candidates"', () => {
  const tree = createSyntheticTree(SPIKE_SLICE_FILES);
  try {
    const probe = probeZg({
      root: tree.root,
      query: 'where credentials are validated',
      runner: zgStub({ hits: [], status: 2 }),
    });

    assert.equal(probe.search.status, 2);
    assert.equal(probe.search.note.length > 0, true, 'a failed search explains itself');
    assert.deepEqual(probe.candidates, [], 'and returns no candidates rather than invented ones');
    assert.match(renderZgReport(probe), /status 2/, 'the report carries the failure');
  } finally {
    tree.dispose();
  }
});

test('UT-3: a search that is asked for nothing returns no candidates, so the probe is never a hidden enumeration', () => {
  const tree = createSyntheticTree(SPIKE_SLICE_FILES);
  try {
    const probe = probeZg({ root: tree.root, runner: zgStub({ hits: ['src/api/login.rs:4:x'] }) });
    assert.equal(probe.query, null);
    assert.deepEqual(probe.candidates, [], 'without a query the probe reports availability and nothing else');
  } finally {
    tree.dispose();
  }
});

test('C003 postcondition: the exhaustive mode renders its own heading and its own meaning, and keeps an unlocated row', () => {
  const tree = createSyntheticTree(SPIKE_SLICE_FILES);
  try {
    const probe = probeZg({
      root: tree.root,
      query: 'login',
      mode: ZG_SEARCH_MODES.exhaustive.mode,
      runner: zgStub({ hits: ['src/api/login.rs:4:located', 'a trailing summary with no location'] }),
    });

    const markdown = renderZgReport(probe);
    assert.match(markdown, /^## Exhaustive enumeration \(zg --rg\)/m, 'the exhaustive mode names itself');
    assert.doesNotMatch(markdown, /^## Candidate discovery/m, 'and is never rendered as candidate discovery');
    assert.match(markdown, /complete for the literal/i, 'it states what its completeness does and does not cover');
    assert.match(markdown, /src\/api\/login\.rs:4/);
    assert.match(markdown, /a trailing summary with no location/, 'an unlocated row is rendered, not dropped');
  } finally {
    tree.dispose();
  }
});

test('UT-3: an installed zg that was asked nothing is rendered as installed, not as a crash', () => {
  const tree = createSyntheticTree(SPIKE_SLICE_FILES);
  try {
    for (const query of [null, '']) {
      const probe = probeZg({ root: tree.root, query, runner: zgStub({ hits: ['src/api/login.rs:4:x'] }) });

      assert.equal(probe.availability, ZG_AVAILABILITY.available, 'the tool is installed');
      assert.equal(probe.search, null, 'no question was asked, so no search ran');

      let markdown;
      assert.doesNotThrow(() => {
        markdown = renderZgReport(probe);
      }, 'an installed tool with no question is a normal condition, exactly as an absent one is');
      assert.match(markdown, /zg is installed/);
      assert.match(markdown, /no question was asked/i);
      assert.match(markdown, /candidate/i, 'the section still says what a candidate would be');
    }
  } finally {
    tree.dispose();
  }
});
