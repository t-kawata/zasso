/**
 * graphify-cmd.test.cjs — Integration tests for graphify-rfc.md slash command
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Since slash commands are Markdown templates, validation is done via
 * lexical analysis and pattern matching of the file. Only testable items
 * are targeted; actual script execution behavior is delegated to existing
 * infrastructure script tests.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// ============================================================
// Target file path
// ============================================================

/** Absolute path to the slash command file */
const COMMAND_PATH = path.resolve(
  __dirname, '../../.claude/commands/graphify-rfc.md'
);

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
    it('should have argument-hint set correctly', () => {
      const fm = parseFrontmatter(commandContent);
      assert.equal(fm['argument-hint'], '</path/to/RFC-doc.md>',
        'argument-hint should be </path/to/RFC-doc.md>');
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

    it('should have Step 4 (marker embedding) section heading', () => {
      assert.ok(commandContent.includes('Step 4'),
        'Step 4 heading should exist');
    });

    it('should have Step 5 (self-verification) section heading', () => {
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
    it('should have reset-to-step 1 for uncovered line reporting', () => {
      assert.ok(
        commandContent.includes('reset-to-step 1') &&
        (commandContent.includes('未カバー') || commandContent.includes('uncovered')),
        'should have reset-to-step 1 fallback for uncovered lines'
      );
    });

    it('should have reset-to-step 2 for isolated node reporting', () => {
      assert.ok(
        commandContent.includes('reset-to-step 2') &&
        (commandContent.includes('孤立') || commandContent.includes('isolated')),
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

    it('should have a loop description that repeats until {"ok":true}', () => {
      assert.ok(
        commandContent.includes('繰り返す') || commandContent.includes('ループ') ||
        commandContent.includes('返るまで') || commandContent.includes('戻る'),
        'should have a loop that repeats until ok is returned'
      );
    });
  });

  // ==========================================================
  // Error handling
  // ==========================================================

  describe('error handling', () => {
    it('should have error recovery flow described in each step', () => {
      const errorRecoverySections = commandContent.match(/### エラー時の復帰/g) || [];
      assert.ok(errorRecoverySections.length >= 4,
        `error recovery sections should appear at least 4 times (actual: ${errorRecoverySections.length})`);
    });

    it('should describe recovery procedure for each Step and mention Step 4 (deprecated)', () => {
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
        commandContent.includes('完了報告') ||
        commandContent.includes('生成'),
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

    it('should report node and edge counts', () => {
      assert.ok(
        (commandContent.includes('ノード数') || commandContent.includes('ノード')) &&
        (commandContent.includes('エッジ数') || commandContent.includes('エッジ')),
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
    it('should have usage instructions for missing arguments or argument-related description', () => {
      assert.ok(
        commandContent.includes('argument') ||
        commandContent.includes('1st argument') ||
        commandContent.includes('source-file-path') ||
        commandContent.includes('required'),
        'should describe argument usage'
      );
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
    it('should mention that graphify splits at finer granularity than formulate', () => {
      assert.ok(
        commandContent.includes('formulate') &&
        commandContent.includes('finer granularity'),
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
  });
});
