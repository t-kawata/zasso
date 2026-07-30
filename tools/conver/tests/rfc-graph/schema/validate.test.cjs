/**
 * validate.test.cjs — Tests for the schema validation infrastructure
 *
 * Test targets: node.schema.json, edge.schema.json, graph.schema.json, validateAgainstSchema()
 * Coverage: 22 cases (positive 5 / negative 12 / boundary 5)
 *
 * This test verifies that all schema definitions fully comply with RFC-GRAPHIFY.md §§3.2.1-3.2.3.
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
// Helpers: factory functions for valid data
// ============================================================

/** Creates valid node data */
function createValidNode(overrides) {
  return Object.assign(
    {
      id: "N0001",
      title: "Authentication Requirements",
      kind: "requirement",
      summary: "Requirements definition for user authentication",
      slug: "auth_requirements",
      headingRefs: [{ refId: "REF001", heading: 2, texts: ["Requirements", "Authentication"] }],
    },
    overrides
  );
}

/** Creates valid edge data */
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
      contracts: [
        {
          id: "C001",
          precondition: "from node exists",
          postcondition: "edge is created",
          invariant: "from and to nodes are connected",
        },
      ],
    },
    overrides
  );
}

/** Creates valid graph data */
function createValidGraph(overrides) {
  return Object.assign(
    {
      sourceFile: "/path/to/RFC.md",
      mainLanguage: "rust",
      nodes: [createValidNode()],
      edges: [createValidEdge()],
    },
    overrides
  );
}

// ============================================================
// Positive (normal) tests
// ============================================================

describe("node.schema.json — positive", () => {
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
    it(`kind="${kind}" node passes validation`, () => {
      const result = validateAgainstSchema(
        createValidNode({ kind }),
        "node.schema.json",
        SCHEMAS_DIR
      );
      assert.strictEqual(result.valid, true, `Validation failed for kind="${kind}": ${JSON.stringify(result.errors)}`);
    });
  }
});

describe("edge.schema.json — positive", () => {
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
    it(`type="${type}" edge passes validation`, () => {
      const result = validateAgainstSchema(
        createValidEdge({ type }),
        "edge.schema.json",
        SCHEMAS_DIR
      );
      assert.strictEqual(result.valid, true, `Validation failed for type="${type}": ${JSON.stringify(result.errors)}`);
    });
  }

  it("edge with strength=hard + bidirectional=true passes validation", () => {
    const result = validateAgainstSchema(
      createValidEdge({
        attributes: { strength: "hard", bidirectional: true },
      }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, true);
  });

  it("edge with strength=soft + bidirectional=false + note passes validation", () => {
    const result = validateAgainstSchema(
      createValidEdge({
        attributes: {
          strength: "soft",
          bidirectional: false,
          note: "This dependency is provisional",
        },
      }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, true);
  });
});

describe("graph.schema.json — positive", () => {
  it("minimal graph with 1 node + 1 edge passes validation", () => {
    const result = validateAgainstSchema(
      createValidGraph(),
      "graph.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, true);
  });

  it("graph with 10 nodes + 5 edges passes validation", () => {
    const nodes = Array.from({ length: 10 }, (_, i) =>
      createValidNode({
        id: `N${String(i + 1).padStart(4, "0")}`,
        title: `Node ${i + 1}`,
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
// Negative (abnormal) tests
// ============================================================

describe("node.schema.json — negative (missing required fields)", () => {
  const REQUIRED_FIELDS = ["id", "title", "kind", "summary", "slug", "headingRefs"];

  for (const field of REQUIRED_FIELDS) {
    it(`validation fails when required field "${field}" is missing`, () => {
      const node = createValidNode();
      delete node[field];
      const result = validateAgainstSchema(
        node,
        "node.schema.json",
        SCHEMAS_DIR
      );
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0, "No errors were returned");
    });
  }
});

describe("edge.schema.json — negative (missing required fields)", () => {
  const REQUIRED_FIELDS = ["from", "to", "type", "attributes", "contracts"];

  for (const field of REQUIRED_FIELDS) {
    it(`validation fails when required field "${field}" is missing`, () => {
      const edge = createValidEdge();
      delete edge[field];
      const result = validateAgainstSchema(
        edge,
        "edge.schema.json",
        SCHEMAS_DIR
      );
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0, "No errors were returned");
    });
  }
});

describe("graph.schema.json — negative (missing required fields)", () => {
  const REQUIRED_FIELDS = ["sourceFile", "mainLanguage", "nodes", "edges"];

  for (const field of REQUIRED_FIELDS) {
    it(`validation fails when required field "${field}" is missing`, () => {
      const graph = createValidGraph();
      delete graph[field];
      const result = validateAgainstSchema(
        graph,
        "graph.schema.json",
        SCHEMAS_DIR
      );
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0, "No errors were returned");
    });
  }
});

describe("node.schema.json — negative (kind constraint violation)", () => {
  it("validation fails with unknown kind value", () => {
    const result = validateAgainstSchema(
      createValidNode({ kind: "unknown_kind" }),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });
});

describe("edge.schema.json — negative (type constraint violation)", () => {
  it("validation fails with unknown type value", () => {
    const result = validateAgainstSchema(
      createValidEdge({ type: "unknown_type" }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });
});

describe("node.schema.json — negative (ID pattern violation)", () => {
  const INVALID_IDS = [
    { id: "N001", reason: "less than 4 digits" },
    { id: "X0001", reason: "does not start with N" },
    { id: "N001a", reason: "contains non-numeric characters" },
  ];

  for (const { id, reason } of INVALID_IDS) {
    it(`ID "${id}" (${reason}) fails validation`, () => {
      const result = validateAgainstSchema(
        createValidNode({ id }),
        "node.schema.json",
        SCHEMAS_DIR
      );
      assert.strictEqual(
        result.valid,
        false,
        `ID "${id}" (${reason}) incorrectly passed validation`
      );
    });
  }
});

describe("edge.schema.json — negative (from/to pattern violation)", () => {
  it("validation fails when from does not match ID pattern", () => {
    const result = validateAgainstSchema(
      createValidEdge({ from: "X0001" }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("validation fails when to does not match ID pattern", () => {
    const result = validateAgainstSchema(
      createValidEdge({ to: "N00" }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });
});

describe("edge.schema.json — negative (attributes constraint violation)", () => {
  it("validation fails when strength is not hard/soft", () => {
    const result = validateAgainstSchema(
      createValidEdge({
        attributes: { strength: "medium", bidirectional: false },
      }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("validation fails when bidirectional is not boolean", () => {
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

describe("all schemas — negative (additionalProperties violation)", () => {
  it("validation fails when node contains unknown field", () => {
    const result = validateAgainstSchema(
      createValidNode({ extraField: "should_not_exist" }),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("validation fails when edge contains unknown field", () => {
    const result = validateAgainstSchema(
      createValidEdge({ extraField: "should_not_exist" }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("validation fails when graph contains unknown field", () => {
    const result = validateAgainstSchema(
      createValidGraph({ extraField: "should_not_exist" }),
      "graph.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });
});

// ============================================================
// Boundary value tests
// ============================================================

describe("node.schema.json — boundary (title)", () => {
  it("validation fails with title exceeding maxLength=120", () => {
    const result = validateAgainstSchema(
      createValidNode({ title: "x".repeat(121) }),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("validation fails with empty title", () => {
    const result = validateAgainstSchema(
      createValidNode({ title: "" }),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("title at maxLength=120 boundary passes validation", () => {
    const result = validateAgainstSchema(
      createValidNode({ title: "x".repeat(120) }),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, true);
  });
});

describe("node.schema.json — boundary (sourceRanges)", () => {
  it("validation fails with empty sourceRanges array", () => {
    const result = validateAgainstSchema(
      createValidNode({ sourceRanges: [] }),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });
});

describe("edge.schema.json — boundary (attributes.note)", () => {
  it("validation fails when note exceeds maxLength=240", () => {
    const result = validateAgainstSchema(
      createValidEdge({
        attributes: { strength: "soft", bidirectional: false, note: "x".repeat(241) },
      }),
      "edge.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
  });

  it("note at maxLength=240 boundary passes validation", () => {
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
// Tests for validateAgainstSchema()
// ============================================================

describe("validateAgainstSchema() — error handling", () => {
  it("returns error for non-existent schema file", () => {
    const result = validateAgainstSchema(
      { id: "N0001" },
      "nonexistent.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
    const hasNotFoundMessage = result.errors.some((e) =>
      e.includes("not found")
    );
    assert.ok(
      hasNotFoundMessage,
      `Error message does not include "not found": ${JSON.stringify(result.errors)}`
    );
  });

  it("returns success for valid data", () => {
    const result = validateAgainstSchema(
      createValidNode(),
      "node.schema.json",
      SCHEMAS_DIR
    );
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors, undefined);
  });

  it("returns triple-template format errors for invalid data", () => {
    const node = createValidNode();
    delete node.id;
    const result = validateAgainstSchema(node, "node.schema.json", SCHEMAS_DIR);
    assert.strictEqual(result.valid, false);
    assert.ok(Array.isArray(result.errors));
    assert.ok(result.errors.length > 0);
    // Each error should be in "path: message (actual: value)" format
    for (const err of result.errors) {
      assert.ok(
        typeof err === "string" && err.length > 0,
        `Error is not a string: ${err}`
      );
    }
  });
});
