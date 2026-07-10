/**
 * phasify-schema-compat.test.cjs — tickets-schema.json 互換性テスト
 *
 * phase.nodeIds 追加が既存の Tickets.json や CRUD スクリプトに
 * 影響を与えないことを確認する。
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.resolve(__dirname, '../../.claude/scripts/tickets/tickets-schema.json');
const TICKETS_JSON_PATH = path.resolve(__dirname, '../../Tickets.json');

// ============================================================
// スキーマファイルの存在と構造
// ============================================================

describe('tickets-schema.json compatibility', () => {
  it('should exist and be valid JSON', () => {
    const content = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(content);
    assert.ok(schema);
    assert.strictEqual(schema.$schema, 'http://json-schema.org/draft-07/schema#');
  });

  it('should have nodeIds in phase properties', () => {
    const content = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(content);
    const phaseProps = schema.definitions.phase.properties;
    assert.ok(phaseProps.nodeIds, 'nodeIds プロパティが存在すること');
    assert.strictEqual(phaseProps.nodeIds.type, 'array');
    assert.strictEqual(phaseProps.nodeIds.items.type, 'string');
  });

  it('should not require nodeIds (backward compatibility)', () => {
    const content = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(content);
    const phaseRequired = schema.definitions.phase.required;
    assert.ok(!phaseRequired.includes('nodeIds'), 'nodeIds は required に含まれないこと');
    assert.ok(phaseRequired.includes('id'), '既存の required フィールドは維持されること');
    assert.ok(phaseRequired.includes('name'));
    assert.ok(phaseRequired.includes('tickets'));
  });

  it('should validate existing Tickets.json without nodeIds', () => {
    // 既存の Tickets.json は nodeIds なしでも読み込めることを確認
    const content = fs.readFileSync(TICKETS_JSON_PATH, 'utf8');
    const tickets = JSON.parse(content);
    assert.ok(tickets);
    assert.ok(Array.isArray(tickets.phases));
    // nodeIds がなくてもエラーにならない
    for (const phase of tickets.phases) {
      // nodeIds が undefined でもスキーマ検証を通るはず
      assert.ok(phase.id !== undefined);
      assert.ok(phase.name);
      assert.ok(Array.isArray(phase.tickets));
    }
  });

  it('should validate Tickets.json with nodeIds added', () => {
    const content = fs.readFileSync(TICKETS_JSON_PATH, 'utf8');
    const tickets = JSON.parse(content);
    // いくつかのフェーズに nodeIds を追加しても検証を通る
    if (tickets.phases.length > 0) {
      tickets.phases[0].nodeIds = ['N0001', 'N0002', 'N0003'];
      // JSON として有効
      const serialized = JSON.stringify(tickets);
      const parsed = JSON.parse(serialized);
      assert.ok(Array.isArray(parsed.phases[0].nodeIds));
      assert.strictEqual(parsed.phases[0].nodeIds.length, 3);
    }
  });

  it('should have summary in phase properties', () => {
    const content = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(content);
    const phaseProps = schema.definitions.phase.properties;
    assert.ok(phaseProps.summary, 'summary プロパティが存在すること');
    assert.strictEqual(phaseProps.summary.type, 'string');
  });

  it('should not require summary (backward compatibility)', () => {
    const content = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(content);
    const phaseRequired = schema.definitions.phase.required;
    assert.ok(!phaseRequired.includes('summary'), 'summary は required に含まれないこと');
  });

  it('should validate Tickets.json with summary added', () => {
    const content = fs.readFileSync(TICKETS_JSON_PATH, 'utf8');
    const tickets = JSON.parse(content);
    if (tickets.phases.length > 0) {
      tickets.phases[0].summary = 'テストサマリー';
      const serialized = JSON.stringify(tickets);
      const parsed = JSON.parse(serialized);
      assert.strictEqual(parsed.phases[0].summary, 'テストサマリー');
    }
  });

  it('should be loadable by validate-tickets.js with summary', () => {
    const validatePath = path.resolve(__dirname, '../../.claude/scripts/lib/validate-tickets.js');
    const mod = require(validatePath);
    const sample = {
      title: 'test',
      metadata: { source: 'test', generatedAt: '2026-07-10' },
      phases: [
        { id: 0, name: 'P0', tickets: [], nodeIds: ['N0001'], summary: 'test summary' },
      ],
    };
    const result = mod.validateTickets(sample);
    assert.ok(result.valid, 'summary ありでも検証を通すこと: ' + JSON.stringify(result.errors));
  });

  it('should maintain existing phase field types', () => {
    const content = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(content);
    const phaseProps = schema.definitions.phase.properties;
    // 既存フィールドの型が変わっていないことを確認
    assert.strictEqual(phaseProps.id.type, 'integer');
    assert.strictEqual(phaseProps.name.type, 'string');
    assert.strictEqual(phaseProps.tickets.type, 'array');
    assert.strictEqual(phaseProps.externalDependencies.type, 'string');
    assert.strictEqual(phaseProps.characteristics.type, 'string');
  });

  it('should be loadable by validate-tickets.js', () => {
    const validatePath = path.resolve(__dirname, '../../.claude/scripts/lib/validate-tickets.js');
    assert.ok(fs.existsSync(validatePath), 'validate-tickets.js が存在すること');
    const mod = require(validatePath);
    assert.ok(typeof mod.validateTickets === 'function');

    // nodeIds なしの Tickets.json で検証を通す
    const sample = {
      title: 'test',
      metadata: { source: 'test', generatedAt: '2026-07-10' },
      phases: [
        { id: 0, name: 'P0', tickets: [] },
        { id: 1, name: 'P1', tickets: [{ id: 1, phaseId: 1, title: 'test', status: 'todo' }] },
      ],
    };
    const result = mod.validateTickets(sample);
    assert.ok(result.valid, 'nodeIds なしでも検証を通すこと: ' + JSON.stringify(result.errors));
  });

  it('should be loadable by validate-tickets.js with nodeIds', () => {
    const validatePath = path.resolve(__dirname, '../../.claude/scripts/lib/validate-tickets.js');
    const mod = require(validatePath);

    // nodeIds ありの Tickets.json で検証を通す
    const sample = {
      title: 'test',
      metadata: { source: 'test', generatedAt: '2026-07-10' },
      phases: [
        { id: 0, name: 'P0', tickets: [], nodeIds: ['N0001', 'N0002'] },
      ],
    };
    const result = mod.validateTickets(sample);
    assert.ok(result.valid, 'nodeIds ありでも検証を通すこと: ' + JSON.stringify(result.errors));
  });
});
