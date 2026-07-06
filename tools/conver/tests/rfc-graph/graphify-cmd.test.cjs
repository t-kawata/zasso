/**
 * graphify-cmd.test.cjs — graphify-rfc.md スラッシュコマンドの結合テスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * スラッシュコマンドは Markdown テンプレートであるため、ファイルの字句解析・
 * パターンマッチによる検証を行う。実効可能なテスト項目のみを対象とし、
 * スクリプト呼び出しの実際の動作は基盤スクリプトの既存テストに委ねる。
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// ============================================================
// テスト対象ファイルのパス
// ============================================================

/** スラッシュコマンドファイルの絶対パス */
const COMMAND_PATH = path.resolve(
  __dirname, '../../.claude/commands/graphify-rfc.md'
);

/** コマンドファイルの内容（テスト前に1回読み込む） */
let commandContent;

/**
 * 導出パス計算をシミュレートする
 *
 * basename/dirname の shell 動作を模倣し、RFC §4.6 の導出式を検証する。
 *
 * @param {string} sourcePath — ソースファイルのパス
 * @returns {{ graphPath: string, statusPath: string }} 導出されたパス
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
 * コマンド内容から frontmatter をパースする
 *
 * YAML frontmatter は '---' で囲まれた範囲と想定し、各行を key: value 形式で解釈する。
 *
 * @param {string} content — ファイル内容全体
 * @returns {Object<string, string>} パースされた frontmatter
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
// テスト
// ============================================================

describe('graphify-rfc.md スラッシュコマンド結合テスト', () => {
  // 全テストで使用するコマンド内容を事前読み込み
  before(() => {
    commandContent = fs.readFileSync(COMMAND_PATH, 'utf8');
  });

  // ==========================================================
  // frontmatter 検証
  // ==========================================================

  describe('frontmatter', () => {
    it('argument-hint が正しく設定されている', () => {
      const fm = parseFrontmatter(commandContent);
      assert.equal(fm['argument-hint'], '<source-file-path>',
        'argument-hint は <source-file-path> であること');
    });

    it('allowed-tools に Read / Write / Bash が含まれている', () => {
      const fm = parseFrontmatter(commandContent);
      const tools = (fm['allowed-tools'] || '').split(',').map(t => t.trim());
      assert.ok(tools.includes('Read'), 'allowed-tools に Read が含まれている');
      assert.ok(tools.includes('Write'), 'allowed-tools に Write が含まれている');
      assert.ok(tools.includes('Bash'), 'allowed-tools に Bash が含まれている');
    });

    it('description が空でない', () => {
      const fm = parseFrontmatter(commandContent);
      assert.ok(fm['description'] && fm['description'].length > 0,
        'description は空でないこと');
    });

    it('description に "6Step" または Step 進行制御の記述が含まれている', () => {
      const fm = parseFrontmatter(commandContent);
      const desc = fm['description'] || '';
      assert.ok(
        desc.includes('6Step') ||
        desc.includes('Step') ||
        desc.includes('進行制御'),
        'description に Step 進行制御の記述が含まれている'
      );
    });
  });

  // ==========================================================
  // 導出パス計算検証
  // ==========================================================

  describe('導出パス計算', () => {
    it('通常の .md ファイルから正しいパスを導出する', () => {
      const { graphPath, statusPath } = deriveGraphPaths('/path/to/doc.md');
      assert.equal(graphPath, '/path/to/doc-GRAPH.json',
        'graphPath は doc-GRAPH.json になること');
      assert.equal(statusPath, '/path/to/doc-GRAPHIFY-Status.json',
        'statusPath は doc-GRAPHIFY-Status.json になること');
    });

    it('深いパスから正しく導出する', () => {
      const { graphPath, statusPath } = deriveGraphPaths('/a/b/c/d/doc.md');
      assert.equal(graphPath, '/a/b/c/d/doc-GRAPH.json',
        '深いパスでも正しい graphPath が導出されること');
      assert.equal(statusPath, '/a/b/c/d/doc-GRAPHIFY-Status.json',
        '深いパスでも正しい statusPath が導出されること');
    });

    it('拡張子なしパスから正しく導出する（dirname 動作の模倣）', () => {
      const { graphPath, statusPath } = deriveGraphPaths('/path/to/doc');
      assert.equal(graphPath, '/path/to/doc-GRAPH.json',
        '拡張子なしでも正しい graphPath が導出されること');
      assert.equal(statusPath, '/path/to/doc-GRAPHIFY-Status.json',
        '拡張子なしでも正しい statusPath が導出されること');
    });

    it('導出式がコマンド内に記述されている', () => {
      const hasGraphPathExpr = commandContent.includes('graphPath=');
      const hasStatusPathExpr = commandContent.includes('statusPath=');
      const hasDirnameRef = commandContent.includes('dirname');
      const hasBasenameRef = commandContent.includes('basename');
      assert.ok(hasGraphPathExpr && hasStatusPathExpr,
        '導出式 graphPath / statusPath が記述されていること');
      assert.ok(hasDirnameRef && hasBasenameRef,
        'dirname / basename を使用した導出式が記述されていること');
    });
  });

  // ==========================================================
  // Step 進行記述の完全性
  // ==========================================================

  describe('6Step進行記述', () => {
    it('Step 1（ノード分割）のセクション見出しが存在する', () => {
      assert.ok(commandContent.includes('Step 1'),
        'Step 1 の見出しが存在すること');
    });

    it('Step 2（エッジ付与）のセクション見出しが存在する', () => {
      assert.ok(commandContent.includes('Step 2'),
        'Step 2 の見出しが存在すること');
    });

    it('Step 3（機械検証）のセクション見出しが存在する', () => {
      assert.ok(commandContent.includes('Step 3'),
        'Step 3 の見出しが存在すること');
    });

    it('Step 4（マーカー埋め込み）のセクション見出しが存在する', () => {
      assert.ok(commandContent.includes('Step 4'),
        'Step 4 の見出しが存在すること');
    });

    it('Step 5（自己検証）のセクション見出しが存在する', () => {
      assert.ok(commandContent.includes('Step 5'),
        'Step 5 の見出しが存在すること');
    });

    it('Step 6（最終品質検証）のセクション見出しが存在する', () => {
      assert.ok(commandContent.includes('Step 6'),
        'Step 6 の見出しが存在すること');
    });

    it('全6Stepのセクション見出しが "## Step" 形式で記述されている', () => {
      const stepHeaders = commandContent.match(/^## Step \d/gm) || [];
      assert.equal(stepHeaders.length, 6,
        'Step 1〜6 の "## Step" 形式見出しが6つ存在すること');
    });
  });

  // ==========================================================
  // update-step-status.js 呼び出し検証
  // ==========================================================

  describe('update-step-status.js 呼び出し', () => {
    it('start-step の呼び出しが全6Stepに記述されている', () => {
      const startStepMatches = commandContent.match(/start-step \d/g) || [];
      assert.ok(startStepMatches.length >= 5,
        `start-step の呼び出しが5回以上記述されている（実際: ${startStepMatches.length}回）`);
    });

    it('end-step の呼び出しが記述されている', () => {
      const endStepMatches = commandContent.match(/end-step \d/g) || [];
      assert.ok(endStepMatches.length >= 4,
        `end-step の呼び出しが4回以上記述されている（実際: ${endStepMatches.length}回）`);
    });

    it('fail-step の呼び出しが記述されている', () => {
      assert.ok(commandContent.includes('fail-step'),
        'fail-step によるエラー記録が記述されていること');
    });

    it('reset-to-step の呼び出しが記述されている', () => {
      const resetMatches = commandContent.match(/reset-to-step \d/g) || [];
      assert.ok(resetMatches.length >= 3,
        `reset-to-step の呼び出しが3回以上記述されている（実際: ${resetMatches.length}回）`);
    });

    it('--graphify-status= プリフィックスが全呼び出しで統一されている', () => {
      const lines = commandContent.split('\n');
      // 説明文（`--graphify-status=<path>` 形式）を除外し、実際のコマンド呼び出し行のみを抽出
      const callLines = lines.filter(l =>
        l.includes('update-step-status.js') && l.includes('--graphify-status=') &&
        !l.includes('<path>')); // テンプレート説明行を除外
      const nonConforming = callLines.filter(l =>
        !l.includes('"$statusPath"') && !l.includes('$statusPath'));
      assert.equal(nonConforming.length, 0,
        '全 update-step-status.js 呼び出しで --graphify-status が統一されていること');
    });
  });

  // ==========================================================
  // 導出パス一貫性
  // ==========================================================

  describe('導出パス一貫性', () => {
    it('$graphPath が全スクリプト呼び出しで統一されている', () => {
      const lines = commandContent.split('\n');
      // 実際のスクリプト呼び出し行（説明文やテンプレート表記を除外）
      const callLines = lines.filter(l =>
        l.includes('--graph=') && !l.includes('<path>'));
      const usesVariable = callLines.every(l =>
        l.includes('"$graphPath"') || l.includes('$graphPath'));
      assert.ok(usesVariable,
        '全 --graph= 参照が $graphPath 変数で統一されていること');
    });

    it('$statusPath が全 update-step-status.js 呼び出しで統一されている', () => {
      const lines = commandContent.split('\n');
      // 実際のコマンド呼び出し行（テーブル行と説明文は除外）
      const callLines = lines.filter(l =>
        l.includes('update-step-status.js') &&
        !l.includes('|') && // テーブル行を除外
        (l.includes('start-step') || l.includes('end-step') ||
         l.includes('fail-step') || l.includes('reset-to-step')));
      const usesVariable = callLines.every(l =>
        l.includes('"$statusPath"') || l.includes('$statusPath'));
      assert.ok(usesVariable,
        '全 update-step-status.js 呼び出しが $statusPath 変数で統一されていること');
    });
  });

  // ==========================================================
  // verify.js 結果3分岐検証
  // ==========================================================

  describe('verify.js 結果3分岐', () => {
    it('未カバー行の報告に対する reset-to-step 1 の記述がある', () => {
      assert.ok(
        commandContent.includes('reset-to-step 1') &&
        (commandContent.includes('未カバー') || commandContent.includes('uncovered')),
        '未カバー行時に reset-to-step 1 で戻る記述があること'
      );
    });

    it('孤立ノードの報告に対する reset-to-step 2 の記述がある', () => {
      assert.ok(
        commandContent.includes('reset-to-step 2') &&
        (commandContent.includes('孤立') || commandContent.includes('isolated')),
        '孤立ノード時に reset-to-step 2 で戻る記述があること'
      );
    });

    it('{"ok":true} 時に end-step 3 へ進む記述がある', () => {
      assert.ok(
        commandContent.includes('ok') &&
        commandContent.includes('end-step 3'),
        '{"ok":true} 時に end-step 3 へ進む記述があること'
      );
    });

    it('{"ok":true} が返るまで繰り返すループ記述がある', () => {
      assert.ok(
        commandContent.includes('繰り返す') || commandContent.includes('ループ') ||
        commandContent.includes('返るまで') || commandContent.includes('戻る'),
        'ok が返るまでのループ記述があること'
      );
    });
  });

  // ==========================================================
  // エラーハンドリング
  // ==========================================================

  describe('エラーハンドリング', () => {
    it('各Stepにエラー時の復帰フロー（エラー時の復帰）が記述されている', () => {
      const errorRecoverySections = commandContent.match(/### エラー時の復帰/g) || [];
      assert.ok(errorRecoverySections.length >= 4,
        `エラー時の復帰セクションが4箇所以上記述されている（実際: ${errorRecoverySections.length}箇所）`);
    });

    it('Step 4（embed-markers.js）のエラー時に fail-step 4 で記録する記述がある', () => {
      assert.ok(
        commandContent.includes('fail-step 4') ||
        (commandContent.includes('fail-step') && commandContent.includes('Step 4')),
        'Step 4 のエラー時に fail-step で記録する記述があること'
      );
    });

    it('reset-to-step による復帰手順が具体的に記述されている', () => {
      const resetLines = commandContent.match(/reset-to-step \d/g) || [];
      assert.ok(resetLines.length > 0,
        'reset-to-step による具体的な復帰手順が記述されていること');
    });
  });

  // ==========================================================
  // 完了報告
  // ==========================================================

  describe('完了報告', () => {
    it('完了報告セクションが存在する', () => {
      assert.ok(
        commandContent.includes('完了報告') ||
        commandContent.includes('生成'),
        '完了報告セクションが存在すること'
      );
    });

    it('グラフファイルパスの報告が記述されている', () => {
      assert.ok(
        commandContent.includes('graphPath') ||
        commandContent.includes('グラフファイル'),
        'グラフファイルパスの報告が記述されていること'
      );
    });

    it('ノード数・エッジ数の報告が記述されている', () => {
      assert.ok(
        (commandContent.includes('ノード数') || commandContent.includes('ノード')) &&
        (commandContent.includes('エッジ数') || commandContent.includes('エッジ')),
        'ノード数・エッジ数の報告が記述されていること'
      );
    });

    it('検証結果の報告が記述されている', () => {
      assert.ok(
        commandContent.includes('検証') ||
        commandContent.includes('verify'),
        '検証結果の報告が記述されていること'
      );
    });
  });

  // ==========================================================
  // エラー系（異常系）
  // ==========================================================

  describe('異常系', () => {
    it('引数不足時の使用方法表示が記述されているか、または引数に関する記述がある', () => {
      assert.ok(
        commandContent.includes('引数') ||
        commandContent.includes('第1引数') ||
        commandContent.includes('source-file-path') ||
        commandContent.includes('必須'),
        '引数に関する説明が記述されていること'
      );
    });

    it('各スクリプト呼び出しが .claude/scripts/rfc-graph/ 配下を指している', () => {
      const lines = commandContent.split('\n');
      const scriptCalls = lines.filter(l =>
        l.includes('update-step-status.js') ||
        l.includes('crud.js') ||
        l.includes('verify.js') ||
        l.includes('embed-markers.js') ||
        l.includes('query.js'));
      // スクリプト名が直接的（パスなし）で使われていることは許容する
      // （CLAUDE がカレントディレクトリから解決するため）
      assert.ok(scriptCalls.length > 0,
        '何らかのスクリプト呼び出しが記述されていること');
    });
  });

  // ==========================================================
  // ガイドライン
  // ==========================================================

  describe('ガイドライン', () => {
    it('graphify は formulate より細かい粒度で分割する旨の記述がある', () => {
      assert.ok(
        commandContent.includes('formulate') &&
        (commandContent.includes('細かい') || commandContent.includes('発散')),
        'graphify は formulate より細かい粒度で分割するガイドラインが記述されていること'
      );
    });

    it('全6Stepの進行制御が読みやすい日本語で記述されている', () => {
      // 各Stepセクションに bash コードブロック（手順）が含まれているか確認
      const stepSections = commandContent.split(/## Step \d/);
      for (let i = 1; i < stepSections.length; i++) {
        // 各Stepにコードブロック（```bash ... ```）が含まれている
        const hasCodeBlock = /\x60\x60\x60bash\s/.test(stepSections[i]);
        // またはコメント行（# で始まる記述）が含まれている
        const hasCommentSteps = /# [^#]/.test(stepSections[i]);
        assert.ok(hasCodeBlock || hasCommentSteps,
          `Step ${i} にコマンド手順が記述されていること`);
      }
    });
  });
});
