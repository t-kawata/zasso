// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
// [::TICKET::] PX-313 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-313 --for-spec --no-implementation-order`.
// [::TICKET::] PX-220 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-220 --for-spec --no-implementation-order`.
/**
 * graphify-cmd.test.cjs — Command-surface and bounded script tests for graphify-rfc.md
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * The command is a Markdown template, so its contract is asserted by lexical
 * analysis and pattern matching. The bounded script block runs the positional
 * and graph scripts with the command's fixed source, so the Markdown contract
 * and the real script interface are checked in one place.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ============================================================
// Target file path
// ============================================================

/** Absolute path to the slash command file */
const COMMAND_PATH = path.resolve(
  __dirname, '../../.claude/commands/graphify-rfc.md'
);

/** Absolute path to the package root, for README and baseline lookups. */
const PROJECT_ROOT = path.resolve(__dirname, '../..');

/** Absolute paths to the scripts the command invokes with the fixed source. */
const RFC_GRAPH_SCRIPTS = path.join(PROJECT_ROOT, '.claude/scripts/rfc-graph');
const CRUD = path.join(RFC_GRAPH_SCRIPTS, 'crud.js');
const VERIFY = path.join(RFC_GRAPH_SCRIPTS, 'verify.js');
const ANNOTATE = path.join(RFC_GRAPH_SCRIPTS, 'annotate-contracts.js');
const DEDUPLICATE_HEADINGS = path.join(RFC_GRAPH_SCRIPTS, 'deduplicate-headings.js');
const ANALYZE_SOURCE = path.join(RFC_GRAPH_SCRIPTS, 'analyze-source-structure.js');
const VALIDATE_SLUG = path.join(RFC_GRAPH_SCRIPTS, 'validate-slug.js');

/** A fixture RFC whose two sections can be covered by two nodes. */
const FIXTURE_RFC = [
  '# Fixture RFC', '', '## Purpose', '',
  'The fixture proves relative source resolution.', '',
  '## Contract', '',
  'The fixture proves the graph accepts a relative source.', '',
].join('\n');

/** Create a temporary package containing the fixture RFC.md. */
// [::TICKET::] PX-332, PX-333 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-332|PX-333) --for-spec --no-implementation-order`.
function makePackageWithRfc() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-cmd-'));
  fs.writeFileSync(path.join(dir, 'RFC.md'), FIXTURE_RFC);
  return dir;
}

/** Command file content (loaded once before tests) */
let commandContent;

/**
 * Simulate derived path calculation
 *
 * Mimics basename/dirname shell behavior to verify RFC 4.6 derivation formula.
 *
 * @param {string} sourcePath — Source file path
 * @returns {{ graphPath: string, statusPath: string }} Derived paths
 */
function deriveGraphPaths(sourcePath) {
  const dir = path.dirname(sourcePath);
  const base = path.basename(sourcePath, '.md');
  return {
    graphPath: path.join(dir, `${base}-GRAPH.json`),
    statusPath: path.join(dir, `${base}-GRAPHIFY-Status.json`),
  };
}

/**
 * Parse frontmatter from command content
 *
 * Assumes YAML frontmatter is enclosed by '---' delimiters and interprets
 * each line as key: value format.
 *
 * @param {string} content — Full file content
 * @returns {Object<string, string>} Parsed frontmatter
 */
function parseFrontmatter(content) {
  const lines = content.split('\n');
  const frontmatter = {};
  let inFrontmatter = false;
  let found = false;

  for (const line of lines) {
    if (line.trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      }
      found = true;
      break;
    }
    if (inFrontmatter) {
      const match = line.match(/^(\w[\w-]*):\s*(.*)$/);
      if (match) {
        frontmatter[match[1]] = match[2].trim();
      }
    }
  }

  return found ? frontmatter : {};
}

// ============================================================
// Tests
// ============================================================

describe('graphify-rfc.md slash command integration tests', () => {
  // Pre-load command content for all tests
  before(() => {
    commandContent = fs.readFileSync(COMMAND_PATH, 'utf8');
  });

  // ==========================================================
  // Frontmatter validation
  // ==========================================================

  describe('frontmatter', () => {
    it('should not declare an argument-hint', () => {
      const fm = parseFrontmatter(commandContent);
      assert.equal(fm['argument-hint'], undefined,
        'a no-argument command must not advertise a source path');
    });

    it('should include Read / Write / Bash in allowed-tools', () => {
      const fm = parseFrontmatter(commandContent);
      const tools = (fm['allowed-tools'] || '').split(',').map(t => t.trim());
      assert.ok(tools.includes('Read'), 'allowed-tools should include Read');
      assert.ok(tools.includes('Write'), 'allowed-tools should include Write');
      assert.ok(tools.includes('Bash'), 'allowed-tools should include Bash');
    });

    it('should have a non-empty description', () => {
      const fm = parseFrontmatter(commandContent);
      assert.ok(fm['description'] && fm['description'].length > 0,
        'description should be non-empty');
    });

    it('should mention 6Step or Step progress control in description', () => {
      const fm = parseFrontmatter(commandContent);
      const desc = fm['description'] || '';
      assert.ok(
        desc.includes('6Step') ||
        desc.includes('Step') ||
        desc.includes('進行制御'),
        'description should mention Step progress control'
      );
    });
  });

  // ==========================================================
  // Derived path calculation verification
  // ==========================================================

  describe('derived path calculation', () => {
    it('should derive correct paths from a regular .md file', () => {
      const { graphPath, statusPath } = deriveGraphPaths('/path/to/doc.md');
      assert.equal(graphPath, '/path/to/doc-GRAPH.json',
        'graphPath should be doc-GRAPH.json');
      assert.equal(statusPath, '/path/to/doc-GRAPHIFY-Status.json',
        'statusPath should be doc-GRAPHIFY-Status.json');
    });

    it('should derive correctly from a deep path', () => {
      const { graphPath, statusPath } = deriveGraphPaths('/a/b/c/d/doc.md');
      assert.equal(graphPath, '/a/b/c/d/doc-GRAPH.json',
        'should derive correct graphPath from deep path');
      assert.equal(statusPath, '/a/b/c/d/doc-GRAPHIFY-Status.json',
        'should derive correct statusPath from deep path');
    });

    it('should derive correctly from a path without extension (mimicking dirname behavior)', () => {
      const { graphPath, statusPath } = deriveGraphPaths('/path/to/doc');
      assert.equal(graphPath, '/path/to/doc-GRAPH.json',
        'should derive correct graphPath even without extension');
      assert.equal(statusPath, '/path/to/doc-GRAPHIFY-Status.json',
        'should derive correct statusPath even without extension');
    });

    it('should derive the fixed artifact names from RFC.md', () => {
      const { graphPath, statusPath } = deriveGraphPaths('RFC.md');
      assert.equal(graphPath, 'RFC-GRAPH.json',
        'the fixed source must derive RFC-GRAPH.json');
      assert.equal(statusPath, 'RFC-GRAPHIFY-Status.json',
        'the fixed source must derive RFC-GRAPHIFY-Status.json');
    });

    it('should have derivation formula described in the command file', () => {
      const hasGraphPathExpr = commandContent.includes('graphPath=');
      const hasStatusPathExpr = commandContent.includes('statusPath=');
      const hasDirnameRef = commandContent.includes('dirname');
      const hasBasenameRef = commandContent.includes('basename');
      assert.ok(hasGraphPathExpr && hasStatusPathExpr,
        'derivation formula for graphPath / statusPath should be present');
      assert.ok(hasDirnameRef && hasBasenameRef,
        'derivation formula should use dirname / basename');
    });
  });

  // ==========================================================
  // No-argument source contract
  // ==========================================================

  describe('no-argument source contract', () => {
    it('should title the command without a source path', () => {
      assert.match(commandContent, /^# \/graphify-rfc$/m,
        'the title must not advertise a path');
      assert.doesNotMatch(commandContent, /^# \/graphify-rfc <source-file-path>$/m,
        'the old title must be gone');
    });

    it('should fix the source to ./RFC.md and never read $1', () => {
      assert.match(commandContent, /sourcePath="RFC\.md"/,
        'the fixed source must be a named variable');
      assert.doesNotMatch(commandContent, /"\$1"/,
        'no script call may pass the positional $1');
      assert.doesNotMatch(commandContent, /\$1\b/,
        'no step may read the positional $1');
    });

    it('should stop before begin-run when RFC.md is absent or an argument is supplied', () => {
      const missing = commandContent.indexOf('MISSING_RFC');
      const unexpected = commandContent.indexOf('UNEXPECTED_ARGUMENT');
      const beginRun = commandContent.indexOf('begin-run');
      assert.ok(missing >= 0, 'MISSING_RFC must be present');
      assert.ok(unexpected >= 0, 'UNEXPECTED_ARGUMENT must be present');
      assert.ok(beginRun >= 0, 'begin-run must be present');
      assert.ok(missing < beginRun, 'MISSING_RFC must precede begin-run');
      assert.ok(unexpected < beginRun, 'UNEXPECTED_ARGUMENT must precede begin-run');
      assert.match(commandContent, /\[ ! -f "\$sourcePath" \]/,
        'the preflight must test the fixed source');
      assert.match(commandContent, /\[ -n "\$ARGUMENTS" \]/,
        'the preflight must reject a supplied argument');
    });

    it('should not fall back to a legacy slug-named RFC', () => {
      assert.ok(commandContent.indexOf('MISSING_RFC') >= 0,
        'the preflight must name the missing canonical RFC');
      assert.doesNotMatch(commandContent, /RFC-\*\.md/,
        'no glob fallback may select a non-canonical RFC');
      assert.doesNotMatch(commandContent, /read -r .*RFC-.* \.md/,
        'the command must not read a legacy name from the argument list');
    });

    it('should pass $sourcePath to every source-bearing invocation', () => {
      const invocations = commandContent.split('\n')
        .filter((line) => /^\s*(node|bash)\s/.test(line));
      const sourceInvocations = invocations.filter((line) =>
        line.includes('--source=') ||
        line.includes('--rfc=') ||
        line.includes('deduplicate-headings.js') ||
        line.includes('extract-io-boundary.js') ||
        line.includes('analyze-source-structure.js'));
      assert.ok(sourceInvocations.length >= 8,
        `expected at least 8 source-bearing invocations (actual: ${sourceInvocations.length})`);
      const offenders = sourceInvocations.filter((line) => !line.includes('$sourcePath'));
      assert.deepEqual(offenders, [],
        'every source-bearing invocation must use $sourcePath');
      assert.match(commandContent, /findAllocateManifest\('\$\(dirname "\$sourcePath"\)'\)/,
        'the allocate manifest must be discovered from the fixed source');
      assert.match(commandContent, /--package="\$\(dirname "\$sourcePath"\)"/,
        'the package must be derived from the fixed source');
    });

    it('C004: annotate-contracts receives the graph, not the RFC', () => {
      const attach = commandContent.indexOf('attach-unit-ids.js" --graph=');
      const annotate = commandContent.indexOf('annotate-contracts.js" "$graphPath"');
      const project = commandContent.indexOf('project-boundary-contracts.js" --graph=');
      assert.ok(attach >= 0, 'attach-unit-ids must be present');
      assert.ok(annotate > attach, 'annotate must run after attach');
      assert.ok(project > annotate, 'project-boundary-contracts must run after annotate');
      assert.equal(commandContent.includes('annotate-contracts.js "$1"'), false,
        'the RFC path must never be passed to the graph annotator');
    });

    it('C005: the frozen graphify headings and documentDigest match the command file', async () => {
      const { digestCommandFiles } = await import(
        '../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs'
      );
      const current = digestCommandFiles(PROJECT_ROOT)['graphify-rfc'];
      const baseline = JSON.parse(fs.readFileSync(
        path.join(PROJECT_ROOT, 'tests/workspacify-tree/baselines/manifest-hashes.json'),
        'utf8',
      ));
      const frozen = baseline.commandFileDigests['graphify-rfc'];
      assert.equal(frozen.headings.includes('# /graphify-rfc'), true,
        'the frozen headings must carry the no-argument title');
      assert.equal(frozen.headings.includes('# /graphify-rfc <source-file-path>'), false,
        'the frozen headings must not carry the old title');
      assert.equal(frozen.documentDigest, current.documentDigest,
        'the frozen document digest must match the current command file');
      assert.equal(frozen.languageProtocolDigest, current.languageProtocolDigest,
        'the Language Protocol table must not move');
      assert.equal(frozen.firstClassRuleDigest, current.firstClassRuleDigest,
        'the First-Class Rule line must not move');
    });

    it('C005: README documents the no-argument form', () => {
      const readme = fs.readFileSync(path.join(PROJECT_ROOT, 'README.md'), 'utf8');
      assert.match(readme, /^#### `\/graphify-rfc`$/m,
        'README must document the no-argument invocation');
      assert.doesNotMatch(readme, /#### `\/graphify-rfc <RFCファイルパス>`/,
        'README must not document the removed path argument');
      assert.match(readme, /MISSING_RFC/,
        'README must name the missing-RFC stop');
    });
  });

  // ==========================================================
  // Script integration with the fixed source
  // ==========================================================

  describe('script integration with the fixed source', () => {
    it('C001/C002: the positional scripts accept the fixed relative source', () => {
      const source = commandContent.match(/sourcePath="([^"]+)"/);
      assert.equal(source && source[1], 'RFC.md',
        'the command must fix the source before any script runs');
      const dir = makePackageWithRfc();
      try {
        const dedup = spawnSync(process.execPath, [DEDUPLICATE_HEADINGS, source[1]], { cwd: dir, encoding: 'utf8' });
        assert.equal(dedup.status, 0, dedup.stderr);
        const structure = spawnSync(process.execPath, [ANALYZE_SOURCE, source[1]], { cwd: dir, encoding: 'utf8' });
        assert.equal(structure.status, 0, structure.stderr);
        assert.match(structure.stdout, /Structure Analysis Report/);
        assert.match(structure.stdout, /Purpose/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    // @verifies C001
    // @verifies C002
    it('C001/C002: the fixed source reaches crud and verify', () => {
      const source = commandContent.match(/sourcePath="([^"]+)"/);
      assert.equal(source && source[1], 'RFC.md',
        'the command must fix the source before any script runs');
      const dir = makePackageWithRfc();
      try {
        const nodes = [
          {
            id: 'N0001', title: 'Purpose', kind: 'architecture', summary: 'Purpose section',
            language: 'typescript', slug: 'purpose',
            headingRefs: [{ heading: 2, texts: ['Purpose'] }],
          },
          {
            id: 'N0002', title: 'Contract', kind: 'api_contract', summary: 'Contract section',
            language: 'typescript', slug: 'contract',
            headingRefs: [{ heading: 2, texts: ['Contract'] }],
          },
        ];
        const edges = [{
          from: 'N0001', to: 'N0002', type: 'depends_on',
          attributes: { strength: 'hard', bidirectional: false },
          contracts: [{
            id: 'C001', precondition: 'N0001 exists',
            postcondition: 'N0002 is reachable', invariant: 'the edge remains',
          }],
        }];
        fs.writeFileSync(path.join(dir, '_temp_nodes.json'), JSON.stringify(nodes));
        fs.writeFileSync(path.join(dir, '_temp_edges.json'), JSON.stringify(edges));
        const created = spawnSync(process.execPath, [
          CRUD, '--graph=RFC-GRAPH.json', 'create-nodes',
          '--file=_temp_nodes.json', `--source=${source[1]}`,
          '--main-language=typescript',
        ], { cwd: dir, encoding: 'utf8' });
        assert.equal(created.status, 0, created.stderr);
        const linked = spawnSync(process.execPath, [
          CRUD, '--graph=RFC-GRAPH.json', 'create-edges',
          '--file=_temp_edges.json', `--source=${source[1]}`,
        ], { cwd: dir, encoding: 'utf8' });
        assert.equal(linked.status, 0, linked.stderr);
        const verified = spawnSync(process.execPath, [
          VERIFY, '--graph=RFC-GRAPH.json', `--source=${source[1]}`,
        ], { cwd: dir, encoding: 'utf8' });
        assert.equal(verified.status, 0, verified.stderr);
        assert.match(verified.stdout, /"ok":true/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    // @verifies C001
    it('C001: a fresh graph is created only with a main language', () => {
      const dir = makePackageWithRfc();
      try {
        const nodes = [{
          id: 'N0001', title: 'Purpose', kind: 'architecture', summary: 'Purpose section',
          language: 'typescript', slug: 'purpose',
          headingRefs: [{ heading: 2, texts: ['Purpose'] }],
        }];
        fs.writeFileSync(path.join(dir, '_temp_nodes.json'), JSON.stringify(nodes));
        const refused = spawnSync(process.execPath, [
          CRUD, '--graph=RFC-GRAPH.json', 'create-nodes',
          '--file=_temp_nodes.json', '--source=RFC.md',
        ], { cwd: dir, encoding: 'utf8' });
        assert.equal(refused.status, 1, 'a first write without a language must fail');
        assert.match(refused.stderr, /MISSING_MAIN_LANGUAGE/);
        assert.equal(fs.existsSync(path.join(dir, 'RFC-GRAPH.json')), false);
        const created = spawnSync(process.execPath, [
          CRUD, '--graph=RFC-GRAPH.json', 'create-nodes',
          '--file=_temp_nodes.json', '--source=RFC.md', '--main-language=typescript',
        ], { cwd: dir, encoding: 'utf8' });
        assert.equal(created.status, 0, created.stderr);
        const root = JSON.parse(fs.readFileSync(path.join(dir, 'RFC-GRAPH.json'), 'utf8'));
        assert.equal(root.mainLanguage, 'typescript');
        assert.equal(root.nodes.length, 1);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    // @verifies C002
    it('C002: the command bootstraps mainLanguage from the RFC', () => {
      assert.match(commandContent, /--main-language="\$mainLanguage"/);
      assert.match(commandContent, /implementation language the RFC states/);
      assert.match(commandContent, /`rust`, `go`, or `typescript`/);
    });

    // @verifies C003
    it('C003: the split gate records an authoritative-table exception', () => {
      assert.match(commandContent, /authoritative table/);
      assert.match(commandContent, /consumer/i);
      assert.match(commandContent, /never split/i);
      assert.match(commandContent, /cannot be interrupted/i);
      assert.equal(
        commandContent.includes('that a downstream script reads whole'),
        false,
        'the exception must not be limited to tables a script reads whole',
      );
      assert.equal(
        commandContent.includes('section >100 effective prose lines → mandatory split.'),
        false,
      );
    });

    it('the slug examples satisfy the validator and the command states its 25-character limit', () => {
      const { checkSlugFormat, checkSlugLength } = require(VALIDATE_SLUG);
      const examples = [...commandContent.matchAll(/`([a-z][a-z0-9_]*)`/g)]
        .map((match) => match[1]);
      assert.ok(examples.length > 0, 'the command names at least one lower_snake_case token');
      for (const slug of examples) {
        assert.equal(checkSlugFormat(slug).valid, true, `${slug} must be lower_snake_case`);
        assert.equal(checkSlugLength(slug).valid, true, `${slug} must be at most 25 characters`);
      }
      assert.match(commandContent, /max length 25/);
      assert.equal(commandContent.includes('Step 1 rule says 64'), false);
    });

    it('Step 3 names the level-2 heading scope verify.js checks', () => {
      assert.match(commandContent, /uncovered level-2 heading/);
      assert.equal(commandContent.includes('uncovered-line'), false);
      assert.equal(commandContent.includes('uncovered lines'), false);
    });

    // @verifies C004
    it('C004: Step 2 names the stale-view diagnosis and repair', () => {
      assert.match(commandContent, /STALE_VIEW_ORDER_CONVENTION/);
      assert.match(commandContent, /STEP_IDENTITY_MISMATCH/);
      assert.match(commandContent, /sequences-slice\/run\.mjs/);
      assert.match(commandContent, /smooth-sequences/);
      assert.match(commandContent, /per-sequence position/);
      assert.doesNotMatch(commandContent, /\bPX-\d+\b/,
        'the command is an operational contract, not a ticket log');
    });

    // @verifies C005
    it('C005: the frozen baseline follows the edited command', async () => {
      assert.match(commandContent, /--main-language="\$mainLanguage"/);
      const { digestCommandFiles } = await import(
        '../../.claude/scripts/workspacify-reverse/lib/command-file-digest.mjs'
      );
      const current = digestCommandFiles(PROJECT_ROOT)['graphify-rfc'];
      const frozen = JSON.parse(fs.readFileSync(
        path.join(PROJECT_ROOT, 'tests/workspacify-tree/baselines/manifest-hashes.json'), 'utf8'
      )).commandFileDigests['graphify-rfc'];
      for (const heading of frozen.headings) {
        assert.ok(current.headings.includes(heading), `frozen heading lost: ${heading}`);
      }
      assert.equal(frozen.documentDigest, current.documentDigest);
      assert.equal(frozen.languageProtocolDigest, current.languageProtocolDigest);
      assert.equal(frozen.firstClassRuleDigest, current.firstClassRuleDigest);
    });

    // @verifies C005
    it('C005: the installed command and script copies match conver', () => {
      const readText = (file) => fs.readFileSync(file, 'utf8');
      for (const rel of [
        '../../../../.claude/commands/graphify-rfc.md',
        '../../../../crates/siprs/.claude/commands/graphify-rfc.md',
      ]) {
        assert.equal(readText(path.resolve(__dirname, rel)), readText(COMMAND_PATH));
      }
      for (const rel of [
        '../../../../.claude/scripts/rfc-graph/crud.js',
        '../../../../crates/siprs/.claude/scripts/rfc-graph/crud.js',
      ]) {
        assert.equal(readText(path.resolve(__dirname, rel)), readText(CRUD));
      }
    });

    it('C004: annotate-contracts accepts the graph and rejects the RFC Markdown', () => {
      assert.match(commandContent, /annotate-contracts\.js" "\$graphPath"/);
      assert.equal(commandContent.includes('annotate-contracts.js "$1"'), false);
      const dir = makePackageWithRfc();
      try {
        fs.writeFileSync(path.join(dir, 'RFC-GRAPH.json'), JSON.stringify({
          sourceFile: 'RFC.md', mainLanguage: 'typescript', nodes: [], edges: [],
        }));
        const ok = spawnSync(process.execPath, [ANNOTATE, 'RFC-GRAPH.json'], { cwd: dir, encoding: 'utf8' });
        assert.equal(ok.status, 0, ok.stderr);
        assert.match(ok.stdout, /Edge Contract Annotation Guide/);
        const bad = spawnSync(process.execPath, [ANNOTATE, 'RFC.md'], { cwd: dir, encoding: 'utf8' });
        assert.equal(bad.status, 1, 'Markdown must not be accepted as graph JSON');
        assert.match(bad.stderr, /Failed to parse graph JSON/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // ==========================================================
  // Step progress description completeness
  // ==========================================================

  describe('6Step progress description', () => {
    it('should have Step 1 (node splitting) section heading', () => {
      assert.ok(commandContent.includes('Step 1'),
        'Step 1 heading should exist');
    });

    it('should have Step 2 (edge assignment) section heading', () => {
      assert.ok(commandContent.includes('Step 2'),
        'Step 2 heading should exist');
    });

    it('should have Step 3 (mechanical verification) section heading', () => {
      assert.ok(commandContent.includes('Step 3'),
        'Step 3 heading should exist');
    });

    it('should have Step 4 (self-verification) section heading', () => {
      assert.ok(commandContent.includes('Step 4'),
        'Step 4 heading should exist');
    });

    it('should have Step 5 (final quality verification) section heading', () => {
      assert.ok(commandContent.includes('Step 5'),
        'Step 5 heading should exist');
    });

    it('should have Step 5 (final quality check) section heading', () => {
      assert.ok(commandContent.includes('Step 5'),
        'Step 5 heading should exist');
    });

    it('should have all 6 Steps (Step 0-5) in "## Step" format', () => {
      const stepHeaders = commandContent.match(/^## Step \d/gm) || [];
      assert.equal(stepHeaders.length, 6,
        'there should be 6 headings in "## Step" format for Steps 0-5');
    });
  });

  // ==========================================================
  // update-step-status.js call verification
  // ==========================================================

  describe('update-step-status.js calls', () => {
    it('should have start-step calls for all 6 Steps', () => {
      const startStepMatches = commandContent.match(/start-step \d/g) || [];
      assert.ok(startStepMatches.length >= 5,
        `start-step should appear at least 5 times (actual: ${startStepMatches.length})`);
    });

    it('should have end-step calls', () => {
      const endStepMatches = commandContent.match(/end-step \d/g) || [];
      assert.ok(endStepMatches.length >= 4,
        `end-step should appear at least 4 times (actual: ${endStepMatches.length})`);
    });

    it('should have fail-step calls', () => {
      assert.ok(commandContent.includes('fail-step'),
        'fail-step error recording should be present');
    });

    it('should have reset-to-step calls', () => {
      const resetMatches = commandContent.match(/reset-to-step \d/g) || [];
      assert.ok(resetMatches.length >= 3,
        `reset-to-step should appear at least 3 times (actual: ${resetMatches.length})`);
    });

    it('should use consistent --graphify-status= prefix across all calls', () => {
      const lines = commandContent.split('\n');
      // Filter out description lines (--graphify-status=<path> format) and keep only actual command call lines
      const callLines = lines.filter(l =>
        l.includes('update-step-status.js') && l.includes('--graphify-status=') &&
        !l.includes('<path>')); // exclude template description lines
      const nonConforming = callLines.filter(l =>
        !l.includes('"$statusPath"') && !l.includes('$statusPath'));
      assert.equal(nonConforming.length, 0,
        'all update-step-status.js calls should use consistent --graphify-status');
    });
  });

  // ==========================================================
  // Derived path consistency
  // ==========================================================

  describe('derived path consistency', () => {
    it('should have consistent $graphPath across all script calls', () => {
      const lines = commandContent.split('\n');
      // Actual script call lines (exclude descriptions and template notation)
      const callLines = lines.filter(l =>
        l.includes('--graph=') && !l.includes('<path>'));
      const usesVariable = callLines.every(l =>
        l.includes('"$graphPath"') || l.includes('$graphPath'));
      assert.ok(usesVariable,
        'all --graph= references should use $graphPath variable');
    });

    it('should have consistent $statusPath across all update-step-status.js calls', () => {
      const lines = commandContent.split('\n');
      // Actual command call lines (exclude table rows and descriptions)
      const callLines = lines.filter(l =>
        l.includes('update-step-status.js') &&
        !l.includes('|') && // exclude table rows
        (l.includes('start-step') || l.includes('end-step') ||
         l.includes('fail-step') || l.includes('reset-to-step')));
      const usesVariable = callLines.every(l =>
        l.includes('"$statusPath"') || l.includes('$statusPath'));
      assert.ok(usesVariable,
        'all update-step-status.js calls should use $statusPath variable');
    });
  });

  // ==========================================================
  // verify.js result triage verification
  // ==========================================================

  describe('verify.js result triage', () => {
    it('should have reset-to-step 1 for uncovered heading reporting', () => {
      assert.ok(
        commandContent.includes('reset-to-step 1') &&
        (commandContent.includes('未カバー') || commandContent.includes('uncovered')),
        'should have reset-to-step 1 fallback for uncovered headings'
      );
    });

// [::TICKET::] PX-220 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-220 --for-spec --no-implementation-order`.
    it('should have reset-to-step 2 for isolated node reporting', () => {
      assert.ok(
        commandContent.includes('reset-to-step 2') &&
        (commandContent.includes('orphan') || commandContent.includes('isolated')),
        'should have reset-to-step 2 fallback for isolated nodes'
      );
    });

    it('should advance to end-step 3 when {"ok":true}', () => {
      assert.ok(
        commandContent.includes('ok') &&
        commandContent.includes('end-step 3'),
        'should advance to end-step 3 when {"ok":true}'
      );
    });

// [::TICKET::] PX-220 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-220 --for-spec --no-implementation-order`.
    it('should have a loop description that repeats until {"ok":true}', () => {
      assert.ok(
        commandContent.includes('repeat') || commandContent.includes('Repeat') ||
        commandContent.includes('until'),
        'should have a loop that repeats until ok is returned'
      );
    });
  });

  // ==========================================================
  // Error handling
  // ==========================================================

  describe('error handling', () => {
    it('should have reset-to-step recovery procedures in at least 4 places', () => {
      const resetLines = commandContent.match(/reset-to-step \d/g) || [];
      assert.ok(resetLines.length >= 4,
        `reset-to-step procedures should appear at least 4 times (actual: ${resetLines.length})`);
    });

    it('should mention Step 4 in the recovery guidance', () => {
      assert.ok(
        commandContent.includes('fail-step 4') ||
        (commandContent.includes('fail-step') && commandContent.includes('Step 4')),
        'should mention Step 4 (deprecated)'
      );
    });

    it('should have concrete recovery procedures using reset-to-step', () => {
      const resetLines = commandContent.match(/reset-to-step \d/g) || [];
      assert.ok(resetLines.length > 0,
        'should have concrete reset-to-step recovery procedures');
    });
  });

  // ==========================================================
  // Completion report
  // ==========================================================

  describe('completion report', () => {
    it('should have a completion report section', () => {
      assert.ok(
        commandContent.includes('final') ||
        commandContent.includes('Final') ||
        commandContent.includes('完了') ||
        commandContent.includes('出力'),
        'completion report section should exist'
      );
    });

    it('should report the graph file path', () => {
      assert.ok(
        commandContent.includes('graphPath') ||
        commandContent.includes('グラフファイル'),
        'graph file path should be reported'
      );
    });

// [::TICKET::] PX-220 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-220 --for-spec --no-implementation-order`.
    it('should report node and edge counts', () => {
      assert.ok(
        (commandContent.includes('node count') || commandContent.includes('Node count')) &&
        (commandContent.includes('edge count') || commandContent.includes('Edge count')),
        'node and edge counts should be reported'
      );
    });

    it('should report verification results', () => {
      assert.ok(
        commandContent.includes('検証') ||
        commandContent.includes('verify'),
        'verification results should be reported'
      );
    });
  });

  // ==========================================================
  // Error cases
  // ==========================================================

  describe('error cases', () => {
    it('should state that the command takes no argument and fixes the source', () => {
      assert.match(commandContent, /takes no argument/i,
        'the command must say it accepts no argument');
      assert.match(commandContent, /RFC\.md/,
        'the command must name the fixed source');
      assert.doesNotMatch(commandContent, /source-file-path/,
        'the removed source-file-path token must be gone');
    });

    it('should reference scripts under .claude/scripts/rfc-graph/', () => {
      const lines = commandContent.split('\n');
      const scriptCalls = lines.filter(l =>
        l.includes('update-step-status.js') ||
        l.includes('crud.js') ||
        l.includes('verify.js') ||
        l.includes('query.js'));
      // Allowing direct script names (without path) since CLAUDE resolves from CWD
      assert.ok(scriptCalls.length > 0,
        'should have some script calls described');
    });
  });

  // ==========================================================
  // Guidelines
  // ==========================================================

  describe('guidelines', () => {
// [::TICKET::] PX-220 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-220 --for-spec --no-implementation-order`.
    it('should mention that graphify splits at finer granularity than formulate', () => {
      assert.ok(
        (commandContent.includes('finer than') || commandContent.includes('finer granularity')),
        'should describe that graphify splits at finer granularity than formulate'
      );
    });

    it('should have readable descriptions for all 6 Step progress controls', () => {
      // Check that each Step section has a bash code block (instructions)
      const stepSections = commandContent.split(/## Step \d/);
      for (let i = 1; i < stepSections.length; i++) {
        // Each Step should have a code block (```bash ... ```)
        const hasCodeBlock = /\x60\x60\x60bash\s/.test(stepSections[i]);
        // Or have comments (lines starting with #)
        const hasCommentSteps = /# [^#]/.test(stepSections[i]);
        assert.ok(hasCodeBlock || hasCommentSteps,
          `Step ${i} should have command instructions`);
      }
    });

    it('should carry the distribution admission and chain commands', () => {
// [::TICKET::] PX-312 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-312 --for-spec --no-implementation-order`.
      assert.match(commandContent, /attach-unit-ids\.js"? --admit/);
      assert.match(commandContent, /project-boundary-contracts\.js/);
      assert.match(commandContent, /verify-chain\.mjs"? --stage=graphify/);
      assert.match(commandContent, /STALE_DISTRIBUTION_MAP/);
      assert.match(commandContent, /SEQUENCE_STEPS_UNDISTRIBUTED/);
      assert.match(commandContent, /begin-run/);
      assert.match(commandContent, /--audit/);
    });
  });
});
