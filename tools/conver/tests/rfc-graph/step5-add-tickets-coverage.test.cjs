/**
 * step5-add-tickets-coverage.test.cjs — add-tickets-for-phase.js + verify-all-ticket-coverage.js のテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { verifyNodeCoverage, resolveDefaultFiles, parseCliArguments } = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');
const { checkPhase, verifyAllTicketCoverage, formatReport } = require('../../.claude/scripts/tickets/verify-all-ticket-coverage.js');
const { bulkAddTickets } = require('../../.claude/scripts/tickets/bulk-add-tickets.js');
const { validateTickets } = require('../../.claude/scripts/lib/validate-tickets.js');

// ============================================================
// テスト用データ
// ============================================================

const SAMPLE_NODE_IDS = ['N0001', 'N0002', 'N0003'];

function createTestTicketsData(overrides) {
  const data = {
    title: 'テスト',
    metadata: { source: 'test', generatedAt: '2026-07-10' },
    phases: [
      {
        id: 0,
        name: 'フェーズ0',
        nodeIds: SAMPLE_NODE_IDS,
        tickets: [],
      },
    ],
  };
  if (overrides) {
    Object.assign(data.phases[0], overrides);
  }
  return data;
}

function createTestTicketsDataWithTickets() {
  const data = createTestTicketsData();
  data.phases[0].tickets = [
    { id: 1, phaseId: 0, title: 'チケット1', status: 'todo', nodeIds: ['N0001', 'N0002'] },
    { id: 2, phaseId: 0, title: 'チケット2', status: 'todo', nodeIds: ['N0003'] },
  ];
  return data;
}

// ============================================================
// verifyNodeCoverage（add-tickets-for-phase.js）
// ============================================================

describe('verifyNodeCoverage', () => {
  it('全ノードがカバーされていれば valid=true', () => {
    const phase = {
      nodeIds: ['N0001', 'N0002', 'N0003'],
      tickets: [
        { nodeIds: ['N0001'] },
        { nodeIds: ['N0002'] },
        { nodeIds: ['N0003'] },
      ],
    };
    const result = verifyNodeCoverage(phase);
    assert.equal(result.valid, true);
    assert.equal(result.missingNodeIds.length, 0);
  });

  it('1チケットに複数ノードが束ねられていても valid', () => {
    const phase = {
      nodeIds: ['N0001', 'N0002', 'N0003'],
      tickets: [
        { nodeIds: ['N0001', 'N0002', 'N0003'] },
      ],
    };
    const result = verifyNodeCoverage(phase);
    assert.equal(result.valid, true);
  });

  it('不足ノードがある場合は valid=false + 不足リスト', () => {
    const phase = {
      nodeIds: ['N0001', 'N0002', 'N0003', 'N0004'],
      tickets: [
        { nodeIds: ['N0001'] },
        { nodeIds: ['N0002'] },
      ],
    };
    const result = verifyNodeCoverage(phase);
    assert.equal(result.valid, false);
    assert.deepEqual(result.missingNodeIds, ['N0003', 'N0004']);
  });

  it('nodeIds 未設定のチケットがある場合も検出する', () => {
    const phase = {
      nodeIds: ['N0001'],
      tickets: [
        { title: 'nodeIdsなしチケット' },
      ],
    };
    const result = verifyNodeCoverage(phase);
    assert.equal(result.valid, false);
    assert.equal(result.ticketsWithoutNodeIds, 1);
  });

  it('フェーズ外のノードIDを extraNodeIds として報告する', () => {
    const phase = {
      nodeIds: ['N0001'],
      tickets: [
        { nodeIds: ['N0001', 'N9999'] },
      ],
    };
    const result = verifyNodeCoverage(phase);
    assert.equal(result.valid, true); // 不足はない
    assert.deepEqual(result.extraNodeIds, ['N9999']);
  });
});

// ============================================================
// bulkAddTickets（bulk-add-tickets.js）
// ============================================================

describe('bulkAddTickets (nodeIds integration)', () => {
  it('nodeIds 付きチケットを追加できる', () => {
    const data = createTestTicketsData();
    const batch = [
      {
        phaseId: 0,
        tickets: [
          { title: 'チケット1', nodeIds: ['N0001'] },
          { title: 'チケット2', nodeIds: ['N0002', 'N0003'] },
        ],
      },
    ];
    const result = bulkAddTickets(data, batch);
    assert.equal(result.success, true);
    assert.equal(result.added, 2);

    // チケットが正しく追加され、nodeIds が保持されている
    const tickets = data.phases[0].tickets;
    assert.equal(tickets.length, 2);
    assert.deepEqual(tickets[0].nodeIds, ['N0001']);
    assert.deepEqual(tickets[1].nodeIds, ['N0002', 'N0003']);
  });

  it('nodeIds なしでも追加できる（互換性）', () => {
    const data = createTestTicketsData();
    const batch = [
      {
        phaseId: 0,
        tickets: [
          { title: 'nodeIdsなしチケット' },
        ],
      },
    ];
    const result = bulkAddTickets(data, batch);
    assert.equal(result.success, true);
    assert.equal(data.phases[0].tickets[0].nodeIds, undefined);
  });
});

// ============================================================
// checkPhase / verifyAllTicketCoverage（verify-all-ticket-coverage.js）
// ============================================================

describe('checkPhase', () => {
  it('全カバーされたフェーズを valid と判定する', () => {
    const phase = {
      id: 0,
      nodeIds: ['N0001', 'N0002'],
      tickets: [
        { nodeIds: ['N0001', 'N0002'] },
      ],
    };
    const result = checkPhase(phase);
    assert.equal(result.valid, true);
    assert.equal(result.hasTickets, true);
    assert.equal(result.ticketCount, 1);
  });

  it('チケットが空のフェーズを invalid と判定する', () => {
    const phase = {
      id: 0,
      nodeIds: ['N0001'],
      tickets: [],
    };
    const result = checkPhase(phase);
    assert.equal(result.valid, false);
    assert.equal(result.hasTickets, false);
  });

  it('フェーズに nodeIds がない場合は valid と判定する（後方互換性）', () => {
    const phase = {
      id: 1,
      nodeIds: [],
      tickets: [{ id: 1, phaseId: 1, title: 't', status: 'todo' }],
    };
    const result = checkPhase(phase);
    assert.equal(result.valid, true);
  });

  it('PX フェーズを正しくラベル付けする', () => {
    const phase = {
      id: -1,
      nodeIds: ['N0001'],
      tickets: [{ nodeIds: ['N0001'] }],
    };
    const result = checkPhase(phase);
    assert.equal(result.phaseLabel, 'PX');
  });
});

describe('verifyAllTicketCoverage', () => {
  it('全フェーズがカバーされていれば valid=true', () => {
    const data = {
      phases: [
        {
          id: 0,
          nodeIds: ['N0001'],
          tickets: [{ nodeIds: ['N0001'] }],
        },
        {
          id: 1,
          nodeIds: ['N0002'],
          tickets: [{ nodeIds: ['N0002'] }],
        },
      ],
    };
    const result = verifyAllTicketCoverage(data);
    assert.equal(result.valid, true);
    assert.equal(result.totalPhases, 2);
    assert.equal(result.totalTickets, 2);
  });

  it('不完全なフェーズがある場合は valid=false', () => {
    const data = {
      phases: [
        {
          id: 0,
          nodeIds: ['N0001', 'N0002'],
          tickets: [{ nodeIds: ['N0001'] }],
        },
      ],
    };
    const result = verifyAllTicketCoverage(data);
    assert.equal(result.valid, false);
    assert.equal(result.failedPhases.length, 1);
  });

  it('空のフェーズリストでもエラーにならない', () => {
    const data = { phases: [] };
    const result = verifyAllTicketCoverage(data);
    assert.equal(result.valid, true);
    assert.equal(result.totalPhases, 0);
  });
});

describe('formatReport', () => {
  it('全PASSケースで「✅ PASS」を含む', () => {
    const report = {
      valid: true,
      totalPhases: 1,
      totalTickets: 2,
      phaseResults: [
        { valid: true, phaseLabel: 'P0', ticketCount: 2, missingNodeIds: [], extraNodeIds: [] },
      ],
      failedPhases: [],
    };
    const output = formatReport(report);
    assert.ok(output.includes('✅ PASS'));
  });

  it('FAILケースで「❌ FAIL」を含む', () => {
    const report = {
      valid: false,
      totalPhases: 1,
      totalTickets: 1,
      phaseResults: [
        { valid: false, phaseLabel: 'P0', ticketCount: 1, missingNodeIds: ['N0002'], extraNodeIds: [] },
      ],
      failedPhases: [
        { valid: false, phaseLabel: 'P0', ticketCount: 1, missingNodeIds: ['N0002'], extraNodeIds: [] },
      ],
    };
    const output = formatReport(report);
    assert.ok(output.includes('❌ FAIL'));
    assert.ok(output.includes('N0002'));
  });
});

// ============================================================
// resolveDefaultFiles（add-tickets-for-phase.js）
// ============================================================

describe('resolveDefaultFiles', () => {
  it('全 nodeIds が nodeToDirMap に存在する場合、default_files が正しく設定される', () => {
    const tickets = [
      { title: 'チケット1', nodeIds: ['N0001', 'N0003'] },
    ];
    const nodeToDirMap = {
      N0001: 'src/auth/token.rs',
      N0003: 'src/auth/keystore.rs',
    };

    resolveDefaultFiles(tickets, nodeToDirMap);

    assert.ok(Array.isArray(tickets[0].default_files));
    assert.equal(tickets[0].default_files.length, 2);
    assert.equal(tickets[0].default_files[0], 'src/auth/keystore.rs');
    assert.equal(tickets[0].default_files[1], 'src/auth/token.rs');
  });

  it('一部の nodeId が nodeToDirMap に存在しない場合、存在するもののみ設定される', () => {
    const tickets = [
      { title: 'チケットA', nodeIds: ['N0001', 'N9999'] },
    ];
    const nodeToDirMap = {
      N0001: 'src/auth/token.rs',
    };

    resolveDefaultFiles(tickets, nodeToDirMap);

    assert.ok(Array.isArray(tickets[0].default_files));
    assert.equal(tickets[0].default_files.length, 1);
    assert.equal(tickets[0].default_files[0], 'src/auth/token.rs');
  });

  it('nodeIds が空の場合、default_files は設定されない', () => {
    const tickets = [
      { title: 'チケットB', nodeIds: [] },
    ];
    const nodeToDirMap = {};

    resolveDefaultFiles(tickets, nodeToDirMap);

    assert.equal(tickets[0].default_files, undefined);
  });

  it('重複するファイルパスは排除されソートされる', () => {
    const tickets = [
      { title: 'チケットC', nodeIds: ['N0001', 'N0002', 'N0003'] },
    ];
    const nodeToDirMap = {
      N0001: 'src/core/api.rs',
      N0002: 'src/core/api.rs',
      N0003: 'src/core/auth.rs',
    };

    resolveDefaultFiles(tickets, nodeToDirMap);

    assert.ok(Array.isArray(tickets[0].default_files));
    assert.equal(tickets[0].default_files.length, 2);
    assert.equal(tickets[0].default_files[0], 'src/core/api.rs');
    assert.equal(tickets[0].default_files[1], 'src/core/auth.rs');
  });
});

// ============================================================
// parseCliArguments（add-tickets-for-phase.js）
// ============================================================

describe('parseCliArguments', () => {
  it('3引数全てが揃っていれば正しくパースする', () => {
    const argv = ['node', 'script.js', '/path/to/tickets.json', '/path/to/dirs-tree.json', 'P0'];
    const result = parseCliArguments(argv);
    assert.equal(result.error, null);
    assert.equal(result.ticketsJsonPath, '/path/to/tickets.json');
    assert.equal(result.dirsTreePath, '/path/to/dirs-tree.json');
    assert.equal(result.phaseArg, 'P0');
  });

  it('第2引数（ticketsJsonPath）が欠落している場合はエラーを返す', () => {
    const argv = ['node', 'script.js', null, '/path/to/dirs-tree.json', 'P0'];
    const result = parseCliArguments(argv);
    assert.notEqual(result.error, null);
    assert.ok(result.error.includes('Usage'));
  });

  it('第3引数（dirsTreePath）が欠落している場合はエラーを返す', () => {
    const argv = ['node', 'script.js', '/path/to/tickets.json', undefined, 'P0'];
    const result = parseCliArguments(argv);
    assert.notEqual(result.error, null);
    assert.ok(result.error.includes('Usage'));
  });

  it('第4引数（phaseArg）が欠落している場合はエラーを返す', () => {
    const argv = ['node', 'script.js', '/path/to/tickets.json', '/path/to/dirs-tree.json'];
    const result = parseCliArguments(argv);
    assert.notEqual(result.error, null);
    assert.ok(result.error.includes('Usage'));
  });
});

// ============================================================
// スキーマ互換性（default_files を含むチケットの検証通過）
// ============================================================

describe('スキーマ互換性 (default_files)', () => {
  it('default_files を含むチケットがスキーマ検証を通過する', () => {
    const data = {
      title: 'テスト',
      metadata: { source: 'test', generatedAt: '2026-07-10' },
      phases: [
        {
          id: 0,
          name: 'フェーズ0',
          nodeIds: ['N0001'],
          tickets: [
            {
              id: 1,
              phaseId: 0,
              title: 'default_files 付きチケット',
              status: 'todo',
              nodeIds: ['N0001'],
              default_files: ['src/auth/token.rs', 'src/auth/keystore.rs'],
            },
          ],
        },
      ],
    };
    const result = validateTickets(data);
    assert.equal(result.valid, true);
  });

  it('default_files が空配列でもスキーマ検証を通過する', () => {
    const data = {
      title: 'テスト',
      metadata: { source: 'test', generatedAt: '2026-07-10' },
      phases: [
        {
          id: 0,
          name: 'フェーズ0',
          tickets: [
            {
              id: 1,
              phaseId: 0,
              title: 'default_files 空配列チケット',
              status: 'todo',
              default_files: [],
            },
          ],
        },
      ],
    };
    const result = validateTickets(data);
    assert.equal(result.valid, true);
  });
});
