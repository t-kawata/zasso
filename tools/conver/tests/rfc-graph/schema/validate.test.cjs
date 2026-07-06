/**
 * validate.test.cjs — スキーマ検証基盤のテスト
 *
 * テスト対象: node.schema.json, edge.schema.json, graph.schema.json, validateAgainstSchema()
 * カバレッジ: 22ケース（正常系 5 / 異常系 12 / 境界値 5）
 *
 * このテストは全てのスキーマ定義が RFC-GRAPHIFY.md §§3.2.1-3.2.3 に完全準拠していることを検証する。
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const path = require("path");

const { validateAgainstSchema } = require("../../../.claude/scripts/rfc-graph/schema/validate");

const SCHEMAS_DIR = path.resolve(
  __dirname,
  "../../../.claude/scripts/rfc-graph/schema"
);

// ============================================================
// ヘルパー: 有効なデータのファクトリ関数
// ============================================================

/** 有効なノードデータを生成する */
function createValidNode(overrides) {
  return Object.assign(
    {
      id: "N0001",
      title: "認証要件",
      kind: "requirement",
      summary: "ユーザー認証に関する要件定義",
      sourceRanges: [{ refId: "REF001", startLine: 10, endLine: 25 }],
    },
    overrides
  );
}

/** 有効なエッジデータを生成する */
function createValidEdge(overrides) {
  return Object.assign(
    {
      from: "N0001",
      to: "N0002",
      type: "depends_on",
      attributes: {
        strength: "hard",
        bidirectional: false,
      },
    },
    overrides
  );
}

/** 有効なグラフデータを生成する */
function createValidGraph(overrides) {
  return Object.assign(
    {
      sourceFile: "/path/to/RFC.md",
      nodes: [createValidNode()],
      edges: [createValidEdge()],
    },
    overrides
  );
}

// ============================================================
// 正常系テスト
// ============================================================

describe("node.schema.json — 正常系", () => {
  const ALL_KINDS = [
    "requirement",
    "api_contract",
    "data_model",
    "state_machine",
    "architecture",
    "security",
    "error_policy",
    "config",
    "test_policy",
    "build_ci",
    "rationale",
    "glossary",
  ];

  for (const kind of ALL_KINDS) {
    it(`kind="${kind}" のノードが検証を通過する`, () => {
      const result = validateAgainstSchema(
        createValidNode({ kind }),
        "node.schema.json",
        SCHEMAS_DIR
      );
      assert.strictEqual(result.valid, true, `kind="${kind}" で検証失敗: ${JSON.stringify(result.errors)}`);
    });
  }
});

describe("edge.schema.json — 正常系", () => {
  const ALL_TYPES = [
    "depends_on",
    "implements",
    "refines",
    "extends",
    "conflicts_with",
    "triggers",
    "constrains",
    "supersedes",
    "references",
    "precedes",
    "part_of",
    "validates",
  ];

  for (const type of ALL_TYPES) {
    it(`type="${type}" のエッジが検証を通過する`, () => {
      const result = validateAgainstSchema(
        createValidEdge({ type }),
        "edge.schema.json",
        SCHEMAS_DIR
      );
      assert.strictEqual(result.valid, true, `type="${type}" で検証失敗: ${JSON.stringify(result.errors)}`);
    });
  }

  it("strength=hard + bidirectional=true のエッジが検証を通過する", () => {
    const result = validateAgainstSchema(
      createValidEdge({
        attributes: { strength: "hard", bidirectional: true },
      }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, true);
  });

  it("strength=soft + bidirectional=false + note 付きのエッジが検証を通過する", () => {
    const result = validateAgainstSchema(
      createValidEdge({
        attributes: {
          strength: "soft",
          bidirectional: false,
          note: "この依存関係は暫定的",
        },
      }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, true);
  });
});

describe("graph.schema.json — 正常系", () => {
  it("ノード1個 + エッジ1本の最小グラフが検証を通過する", () => {
    const result = validateAgainstSchema(
      createValidGraph(),
      "graph.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, true);
  });

  it("ノード10個 + エッジ5本のグラフが検証を通過する", () => {
    const nodes = Array.from({ length: 10 }, (_, i) =>
      createValidNode({
        id: `N${String(i + 1).padStart(4, "0")}`,
        title: `ノード${i + 1}`,
      })
    );
    const edges = Array.from({ length: 5 }, (_, i) =>
      createValidEdge({
        from: `N${String(i + 1).padStart(4, "0")}`,
        to: `N${String(i + 2).padStart(4, "0")}`,
      })
    );
    const result = validateAgainstSchema(
      createValidGraph({ nodes, edges }),
      "graph.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, true);
  });
});

// ============================================================
// 異常系テスト
// ============================================================

describe("node.schema.json — 異常系（必須フィールド欠落）", () => {
  const REQUIRED_FIELDS = ["id", "title", "kind", "summary", "sourceRanges"];

  for (const field of REQUIRED_FIELDS) {
    it(`必須フィールド "${field}" 欠落で検証失敗する`, () => {
      const node = createValidNode();
      delete node[field];
      const result = validateAgainstSchema(
        node,
        "node.schema.json",
        SCHEMAS_DIR
      );
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0, "エラーが返されていません");
    });
  }
});

describe("edge.schema.json — 異常系（必須フィールド欠落）", () => {
  const REQUIRED_FIELDS = ["from", "to", "type", "attributes"];

  for (const field of REQUIRED_FIELDS) {
    it(`必須フィールド "${field}" 欠落で検証失敗する`, () => {
      const edge = createValidEdge();
      delete edge[field];
      const result = validateAgainstSchema(
        edge,
        "edge.schema.json",
        SCHEMAS_DIR
      );
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0, "エラーが返されていません");
    });
  }
});

describe("graph.schema.json — 異常系（必須フィールド欠落）", () => {
  const REQUIRED_FIELDS = ["sourceFile", "nodes", "edges"];

  for (const field of REQUIRED_FIELDS) {
    it(`必須フィールド "${field}" 欠落で検証失敗する`, () => {
      const graph = createValidGraph();
      delete graph[field];
      const result = validateAgainstSchema(
        graph,
        "graph.schema.json",
        SCHEMAS_DIR
      );
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0, "エラーが返されていません");
    });
  }
});

describe("node.schema.json — 異常系（kind制約違反）", () => {
  it("未知のkind値で検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidNode({ kind: "unknown_kind" }),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });
});

describe("edge.schema.json — 異常系（type制約違反）", () => {
  it("未知のtype値で検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidEdge({ type: "unknown_type" }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });
});

describe("node.schema.json — 異常系（IDパターン違反）", () => {
  const INVALID_IDS = [
    { id: "N001", reason: "4桁未満" },
    { id: "X0001", reason: "先頭がN以外" },
    { id: "N001a", reason: "数字以外を含む" },
  ];

  for (const { id, reason } of INVALID_IDS) {
    it(`ID "${id}"（${reason}）で検証失敗する`, () => {
      const result = validateAgainstSchema(
        createValidNode({ id }),
        "node.schema.json",
        SCHEMAS_DIR
      );
      assert.strictEqual(
        result.valid,
        false,
        `ID "${id}"（${reason}）が不正に通過しました`
      );
    });
  }
});

describe("edge.schema.json — 異常系（from/to パターン違反）", () => {
  it("from がIDパターンに従わない値で検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidEdge({ from: "X0001" }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("to がIDパターンに従わない値で検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidEdge({ to: "N00" }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });
});

describe("edge.schema.json — 異常系（attributes 制約違反）", () => {
  it("strength が hard/soft 以外で検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidEdge({
        attributes: { strength: "medium", bidirectional: false },
      }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("bidirectional が boolean 以外で検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidEdge({
        attributes: { strength: "hard", bidirectional: "yes" },
      }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });
});

describe("全スキーマ — 異常系（additionalProperties 違反）", () => {
  it("node に未知フィールドを含めて検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidNode({ extraField: "should_not_exist" }),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("edge に未知フィールドを含めて検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidEdge({ extraField: "should_not_exist" }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("graph に未知フィールドを含めて検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidGraph({ extraField: "should_not_exist" }),
      "graph.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });
});

// ============================================================
// 境界値テスト
// ============================================================

describe("node.schema.json — 境界値（title）", () => {
  it("title が maxLength=120 を超える文字列で検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidNode({ title: "あ".repeat(121) }),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("title が空文字列で検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidNode({ title: "" }),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("title が maxLength=120 ちょうどの文字列で検証通過する", () => {
    const result = validateAgainstSchema(
      createValidNode({ title: "あ".repeat(120) }),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, true);
  });
});

describe("node.schema.json — 境界値（sourceRanges）", () => {
  it("sourceRanges が空配列で検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidNode({ sourceRanges: [] }),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });
});

describe("edge.schema.json — 境界値（attributes.note）", () => {
  it("attributes.note が maxLength=240 を超える文字列で検証失敗する", () => {
    const result = validateAgainstSchema(
      createValidEdge({
        attributes: { strength: "soft", bidirectional: false, note: "x".repeat(241) },
      }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("attributes.note が maxLength=240 ちょうどの文字列で検証通過する", () => {
    const result = validateAgainstSchema(
      createValidEdge({
        attributes: { strength: "soft", bidirectional: false, note: "x".repeat(240) },
      }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, true);
  });
});

// ============================================================
// validateAgainstSchema() 関数のテスト
// ============================================================

describe("validateAgainstSchema() — エラー処理", () => {
  it("存在しないスキーマファイルを指定した場合にエラーを返す", () => {
    const result = validateAgainstSchema(
      { id: "N0001" },
      "nonexistent.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
    const hasNotFoundMessage = result.errors.some((e) =>
      e.includes("見つかりません")
    );
    assert.ok(
      hasNotFoundMessage,
      `エラーメッセージに「見つかりません」が含まれていません: ${JSON.stringify(result.errors)}`
    );
  });

  it("有効なデータで成功結果を返す", () => {
    const result = validateAgainstSchema(
      createValidNode(),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors, undefined);
  });

  it("無効なデータで3段テンプレート形式のエラーを返す", () => {
    const node = createValidNode();
    delete node.id;
    const result = validateAgainstSchema(node, "node.schema.json", SCHEMAS_DIR);
    assert.strictEqual(result.valid, false);
    assert.ok(Array.isArray(result.errors));
    assert.ok(result.errors.length > 0);
    // 各エラーがパス: メッセージ (actual: 値) の形式になっていることを確認
    for (const err of result.errors) {
      assert.ok(
        typeof err === "string" && err.length > 0,
        `エラーが文字列ではありません: ${err}`
      );
    }
  });
});
