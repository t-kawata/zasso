/**
 * resolve-ticket-context.test.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseArguments,
  derivePaths,
  generateInstruction,
  resolveDocPath,
  isValidTicketKey,
  parseTicketKey,
  ticketExists,
} = require('../.claude/scripts/tickets/resolve-ticket-context.js');

describe('resolve-ticket-context', () => {
  describe('parseArguments', () => {
    it('正常系: --tickets と --ticket-key をパースする', () => {
      const result = parseArguments(['--tickets=/a/Tickets.json', '--ticket-key=P0-1']);
      assert.ok(result.ticketsPath.endsWith('Tickets.json'));
      assert.equal(result.ticketKey, 'P0-1');
    });

    it('正常系: --ticket-key なしでもエラーにならない', () => {
      const result = parseArguments(['--tickets=/a/Tickets.json']);
      assert.equal(result.ticketKey, '');
    });
  });

  describe('derivePaths', () => {
    it('正常系: md パスから GRAPH/Dirs-Tree パスを導出する', () => {
      const r = derivePaths('/path/to/RFC-ROOT.md');
      assert.ok(r.graphPath.endsWith('RFC-ROOT-GRAPH.json'));
      assert.ok(r.dirsTreePath.endsWith('RFC-ROOT-Dirs-Tree.json'));
    });
  });

  describe('resolveDocPath', () => {
    it('正常系: metadata.source が空の場合 → docPath 空', () => {
      const r = resolveDocPath('', '/some/dir');
      assert.equal(r.docPath, '');
      assert.equal(r.docPathSource, 'none');
    });

    it('正常系: metadata.source が .md ファイルとして存在する場合 → そのまま使用', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdp-md-'));
      try {
        const mdPath = path.join(tmpDir, 'RFC-ROOT.md');
        fs.writeFileSync(mdPath, '# test', 'utf8');
        const r = resolveDocPath(mdPath, tmpDir);
        assert.equal(r.docPath, mdPath);
        assert.ok(r.graphPath.endsWith('RFC-ROOT-GRAPH.json'));
        assert.ok(r.dirsTreePath.endsWith('RFC-ROOT-Dirs-Tree.json'));
        assert.equal(r.docPathSource, 'metadata.source.md');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('正常系: metadata.source が GRAPH.json の場合 → .md に変換して使用', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdp-json-'));
      try {
        // GRAPH.json と RFC.md の両方を作成
        const graphPath = path.join(tmpDir, 'RFC-ROOT-GRAPH.json');
        const mdPath = path.join(tmpDir, 'RFC-ROOT.md');
        fs.writeFileSync(graphPath, '{}', 'utf8');
        fs.writeFileSync(mdPath, '# test', 'utf8');

        const r = resolveDocPath(graphPath, tmpDir);
        assert.equal(r.docPath, mdPath);
        assert.equal(r.graphPath, graphPath);
        assert.ok(r.dirsTreePath.endsWith('RFC-ROOT-Dirs-Tree.json'));
        assert.equal(r.docPathSource, 'metadata.source.json');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('正常系: metadata.source が存在しないファイルの場合 → docPath 空、docPathSource=not_found', () => {
      const r = resolveDocPath('/nonexistent/path.md', '/some/dir');
      assert.equal(r.docPath, '');
      assert.equal(r.docPathSource, 'not_found');
    });

    it('正常系: metadata.source が相対パスの .md の場合 → ticketsDir から絶対パス解決', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdp-rel-'));
      try {
        const mdPath = path.join(tmpDir, 'RFC.md');
        fs.writeFileSync(mdPath, '# test', 'utf8');
        const r = resolveDocPath('RFC.md', tmpDir);
        assert.equal(r.docPath, mdPath);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('正常系: metadata.source が .json で -GRAPH サフィックスなしの場合 → そのまま basename を使用', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdp-js2-'));
      try {
        const jsonPath = path.join(tmpDir, 'data.json');
        const mdPath = path.join(tmpDir, 'data.md');
        fs.writeFileSync(jsonPath, '{}', 'utf8');
        fs.writeFileSync(mdPath, '# test', 'utf8');
        const r = resolveDocPath(jsonPath, tmpDir);
        assert.equal(r.docPath, mdPath);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('isValidTicketKey', () => {
    it('正常系: P{id}-{id} 形式 → true', () => {
      assert.equal(isValidTicketKey('P0-1'), true);
    });

    it('正常系: PX-{id} 形式 → true', () => {
      assert.equal(isValidTicketKey('PX-53'), true);
    });

    it('異常系: 空文字列 → false', () => {
      assert.equal(isValidTicketKey(''), false);
    });

    it('異常系: 不正形式 → false', () => {
      assert.equal(isValidTicketKey('invalid'), false);
    });
  });

  describe('parseTicketKey', () => {
    it('正常系: P0-1 → {phaseId:0, ticketId:1}', () => {
      const r = parseTicketKey('P0-1');
      assert.equal(r.phaseId, 0);
      assert.equal(r.ticketId, 1);
    });

    it('正常系: PX-53 → {phaseId:-1, ticketId:53}', () => {
      const r = parseTicketKey('PX-53');
      assert.equal(r.phaseId, -1);
      assert.equal(r.ticketId, 53);
    });

    it('異常系: 不正形式 → null', () => {
      assert.equal(parseTicketKey('invalid'), null);
    });
  });

  describe('ticketExists', () => {
    const tickets = {
      phases: [
        { id: 0, name: 'P0', tickets: [{ id: 1 }, { id: 2 }] },
        { id: -1, name: 'PX', tickets: [{ id: 53 }] },
      ],
    };

    it('正常系: 存在するチケット → true', () => {
      assert.equal(ticketExists(tickets, 0, 1), true);
    });

    it('正常系: 存在する PX チケット → true', () => {
      assert.equal(ticketExists(tickets, -1, 53), true);
    });

    it('異常系: 存在しないチケット → false', () => {
      assert.equal(ticketExists(tickets, 0, 999), false);
    });

    it('異常系: 存在しないフェーズ → false', () => {
      assert.equal(ticketExists(tickets, 99, 1), false);
    });

    it('異常系: 空の phases → false', () => {
      assert.equal(ticketExists({ phases: [] }, 0, 1), false);
    });
  });

  describe('generateInstruction', () => {
    it('正常系: ticketKey なし → add-ticket 指示', () => {
      const instr = generateInstruction('', true, false, '', 'none', false, false, false);
      assert.ok(instr.includes('引数'));
    });

    it('正常系: ticketKey 不正形式 → 引数エラー指示', () => {
      const instr = generateInstruction('invalid', true, false, '', 'none', false, false, false);
      assert.ok(instr.includes('形式'));
    });

    it('正常系: ticketExistsFlag=false → 新規作成指示', () => {
      const instr = generateInstruction('P0-1', false, false, '', 'none', false, false, false);
      assert.ok(instr.includes('存在しません'));
    });

    it('正常系: specExistsFlag=false → spec 欠落指示', () => {
      const instr = generateInstruction('P0-1', true, false, '', 'none', false, false, false);
      assert.ok(instr.includes('見つかりません'));
    });

    it('正常系: docPathSource=none → スポットモード指示', () => {
      const instr = generateInstruction('P0-1', true, true, '', 'none', false, false, false);
      assert.ok(instr.includes('スポット'));
    });

    it('正常系: docPathSource=not_found → パス確認指示', () => {
      const instr = generateInstruction('P0-1', true, true, '', 'not_found', false, false, false);
      assert.ok(instr.includes('存在しません'));
    });

    it('正常系: docPathSource=unknown → 形式不明指示', () => {
      const instr = generateInstruction('P0-1', true, true, '', 'unknown', false, false, false);
      assert.ok(instr.includes('形式が不明'));
    });

    it('正常系: 全情報あり → pipeline 実行指示', () => {
      const instr = generateInstruction('P0-1', true, true, '/a/RFC.md', 'metadata.source.md', true, true, true);
      assert.ok(instr.includes('全て揃っています'));
    });

    it('正常系: graph/dirs 不足 → 不完全指示', () => {
      const instr = generateInstruction('P0-1', true, true, '/a/RFC.md', 'metadata.source.md', true, false, true);
      assert.ok(instr.includes('不完全'));
    });
  });
});
