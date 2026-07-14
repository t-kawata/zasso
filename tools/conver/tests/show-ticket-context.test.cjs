/**
 * show-ticket-context.test.cjs — show-ticket-context.js の単体テスト
 *
 * テスト対象: parseArgs, isValidTicketKey, parseTicketKey, findTicket,
 *            parseRelatedTicketIds, resolveRfcPaths,
 *            buildTicketNotFoundMarkdown, buildTicketMarkdown
 * カバレッジ: 27ケース（正常系18 / 異常系5 / 境界値4）
 */

const assert = require("node:assert");
const { describe, it, before, after } = require("node:test");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  parseArgs,
  buildTicketNotFoundMarkdown,
  buildTicketMarkdown,
  parseRelatedTicketIds,
  resolveRfcPaths,
  isValidTicketKey,
  parseTicketKey,
  findTicket,
} = require("../.claude/scripts/tickets/show-ticket-context");

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeTicket(overrides) {
  return Object.assign(
    {
      title: "Test Ticket",
      background: "This is a test background.",
      scope: ["scope item 1", "scope item 2"],
      default_files: ["src/main.rs", "src/lib.rs"],
      testUnit: ["UT: test should pass"],
      testExceptions: ["Exception: external dependency"],
      notes: "Some implementation notes.",
      id: 42,
      phaseId: 0,
      status: "todo",
    },
    overrides || {}
  );
}

function makeTicketsData(ticket, metaOverrides) {
  const tickets = Array.isArray(ticket) ? ticket : [ticket || makeTicket()];
  const phaseId = tickets[0] ? tickets[0].phaseId : 0;
  return {
    phases: [
      { id: phaseId, ticketKeyPrefix: `P${phaseId}`, tickets },
    ],
    metadata: Object.assign(
      {
        source: "test-rfc.md",
        resolvedPaths: {
          rfcPath: "test-rfc.md",
          graphPath: "test-rfc-GRAPH.json",
          dirsTreePath: "test-rfc-Dirs-Tree.json",
        },
      },
      metaOverrides || {}
    ),
  };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "stc-test-"));
}

function writeFile(dir, name, content) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content || "");
  return p;
}

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe("show-ticket-context — parseArgs", function () {
  it("Case 1: --ticket-key のみ指定 → Tickets.json は CWD 基準", function () {
    const result = parseArgs(["--ticket-key=P0-1"]);
    assert.strictEqual(result.ticketKey, "P0-1");
    assert(result.ticketsPath.endsWith("Tickets.json"));
  });

  it("Case 2: --ticket-key + --tickets を指定", function () {
    const result = parseArgs([
      "--ticket-key=PX-53",
      "--tickets=/tmp/my/Tickets.json",
    ]);
    assert.strictEqual(result.ticketKey, "PX-53");
    assert.strictEqual(result.ticketsPath, "/tmp/my/Tickets.json");
  });

  it("Case 3: 引数なし → ticketKey は空文字", function () {
    const result = parseArgs([]);
    assert.strictEqual(result.ticketKey, "");
  });

  it("Case 4: 不明なフラグは無視", function () {
    const result = parseArgs([
      "--unknown=foo",
      "--ticket-key=P0-99",
    ]);
    assert.strictEqual(result.ticketKey, "P0-99");
  });
});

// ---------------------------------------------------------------------------
// isValidTicketKey
// ---------------------------------------------------------------------------

describe("show-ticket-context — isValidTicketKey", function () {
  it("Case 1: P0-1 形式 → true", function () {
    assert.strictEqual(isValidTicketKey("P0-1"), true);
  });
  it("Case 2: PX-53 形式 → true", function () {
    assert.strictEqual(isValidTicketKey("PX-53"), true);
  });
  it("Case 3: P-1-5 形式（負の phaseId）→ true", function () {
    assert.strictEqual(isValidTicketKey("P-1-5"), true);
  });
  it("Case 4: 空文字 → false", function () {
    assert.strictEqual(isValidTicketKey(""), false);
  });
  it("Case 5: p0-1（小文字 p）→ false", function () {
    assert.strictEqual(isValidTicketKey("p0-1"), false);
  });
  it("Case 6: 数字のみ → false", function () {
    assert.strictEqual(isValidTicketKey("123"), false);
  });
});

// ---------------------------------------------------------------------------
// parseTicketKey
// ---------------------------------------------------------------------------

describe("show-ticket-context — parseTicketKey", function () {
  it("Case 1: P0-1 → phaseId=0, ticketId=1", function () {
    const r = parseTicketKey("P0-1");
    assert.deepStrictEqual(r, { phaseId: 0, ticketId: 1 });
  });
  it("Case 2: PX-53 → phaseId=-1, ticketId=53", function () {
    const r = parseTicketKey("PX-53");
    assert.deepStrictEqual(r, { phaseId: -1, ticketId: 53 });
  });
  it("Case 3: P-1-5 → phaseId=-1, ticketId=5", function () {
    const r = parseTicketKey("P-1-5");
    assert.deepStrictEqual(r, { phaseId: -1, ticketId: 5 });
  });
  it("Case 4: 不正形式 → null", function () {
    assert.strictEqual(parseTicketKey("invalid"), null);
  });
});

// ---------------------------------------------------------------------------
// findTicket
// ---------------------------------------------------------------------------

describe("show-ticket-context — findTicket", function () {
  it("Case 1: 存在するチケットを検索 → チケットオブジェクト", function () {
    const ticket = makeTicket({ id: 1 });
    const data = makeTicketsData(ticket);
    const result = findTicket(data, { phaseId: 0, ticketId: 1 });
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.title, "Test Ticket");
  });

  it("Case 2: 存在しないチケット → null", function () {
    const data = makeTicketsData(makeTicket({ id: 1 }));
    const result = findTicket(data, { phaseId: 0, ticketId: 999 });
    assert.strictEqual(result, null);
  });

  it("Case 3: parsed が null → null", function () {
    const data = makeTicketsData();
    assert.strictEqual(findTicket(data, null), null);
  });

  it("Case 4: PX フェーズ（id=-1）のチケット", function () {
    const ticket = makeTicket({ id: 53, phaseId: -1 });
    const data = {
      phases: [{ id: -1, ticketKeyPrefix: "PX", tickets: [ticket] }],
      metadata: {},
    };
    const result = findTicket(data, { phaseId: -1, ticketId: 53 });
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.title, "Test Ticket");
  });
});

// ---------------------------------------------------------------------------
// parseRelatedTicketIds
// ---------------------------------------------------------------------------

describe("show-ticket-context — parseRelatedTicketIds", function () {
  it("Case 1: 3件の関連チケット → 3行パース", function () {
    const raw =
      "[depends_on] P0-1 (dep description), [references] P0-2 (ref description), [part_of] P1-1 (part description)";
    const rows = parseRelatedTicketIds(raw);
    assert.strictEqual(rows.length, 3);
    assert.strictEqual(rows[0].relation, "depends_on");
    assert.strictEqual(rows[0].ticket, "P0-1");
    assert.strictEqual(rows[1].relation, "references");
    assert.strictEqual(rows[2].relation, "part_of");
  });

  it("Case 2: 空文字 → 空配列", function () {
    assert.deepStrictEqual(parseRelatedTicketIds(""), []);
  });

  it("Case 3: null → 空配列", function () {
    assert.deepStrictEqual(parseRelatedTicketIds(null), []);
  });

  it("Case 4: 重複行 → 排除される", function () {
    const raw =
      "[depends_on] P0-1 (desc1), [depends_on] P0-1 (desc1)";
    const rows = parseRelatedTicketIds(raw);
    assert.strictEqual(rows.length, 1);
  });

  it("Case 5: 記述に全角括弧を含む", function () {
    const raw = '[part_of] P9-2 (被依存元（依存元）: ネットワーク基盤)';
    const rows = parseRelatedTicketIds(raw);
    assert.strictEqual(rows.length, 1);
    assert.ok(rows[0].description.includes("ネットワーク基盤"));
  });
});

// ---------------------------------------------------------------------------
// buildTicketNotFoundMarkdown
// ---------------------------------------------------------------------------

describe("show-ticket-context — buildTicketNotFoundMarkdown", function () {
  it("Case 1: ヘッダーに Not Found が含まれる", function () {
    const md = buildTicketNotFoundMarkdown("PX-999");
    assert.ok(md.includes("# PX-999: Not Found"));
  });

  it("Case 2: ensure-ticket-and-spec.js のコマンド例が含まれる", function () {
    const md = buildTicketNotFoundMarkdown("PX-999");
    assert.ok(md.includes("ensure-ticket-and-spec.js"));
    assert.ok(md.includes("--ticket-key=PX-999"));
  });

  it("Case 3: 中断メッセージが含まれる", function () {
    const md = buildTicketNotFoundMarkdown("PX-999");
    assert.ok(md.includes("中断します"));
  });
});

// ---------------------------------------------------------------------------
// buildTicketMarkdown - セクション有無
// ---------------------------------------------------------------------------

describe("show-ticket-context — buildTicketMarkdown", function () {
  let dir, ticketsDir;

  before(function () {
    dir = tmpDir();
    ticketsDir = dir;
  });

  after(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("Case 1: 基本セクション（Background/Scope/DefaultFiles/TestPlan）が含まれる", function () {
    const ticket = makeTicket();
    const data = makeTicketsData(ticket);
    const md = buildTicketMarkdown("P0-42", ticket, data, ticketsDir);
    assert.ok(md.includes("# P0-42: Test Ticket"));
    assert.ok(md.includes("## Background"));
    assert.ok(md.includes("## Scope"));
    assert.ok(md.includes("## Implementation Target Files"));
    assert.ok(md.includes("## Test Plan"));
    assert.ok(md.includes("### Unit Tests"));
    assert.ok(md.includes("### Exceptions"));
    assert.ok(md.includes("## Pipeline Context"));
  });

  it("Case 2: nodeIds + pipeline available → graph セクションが含まれる", function () {
    const rfcFile = writeFile(dir, "test-rfc.md", "# RFC");
    const graphFile = writeFile(dir, "test-rfc-GRAPH.json", "{}");
    const dirsFile = writeFile(dir, "test-rfc-Dirs-Tree.json", "{}");
    const ticket = makeTicket({ nodeIds: ["N0001", "N0002"] });
    const data = makeTicketsData(ticket);
    const md = buildTicketMarkdown("P0-1", ticket, data, ticketsDir);
    assert.ok(md.includes("To show related RFC graph details"));
    assert.ok(md.includes("query.js"));
    assert.ok(md.includes("`N0001`"));
    assert.ok(md.includes("`N0002`"));
  });

  it("Case 3: nodeIds なし → graph セクションが含まれない", function () {
    const ticket = makeTicket({ nodeIds: undefined });
    const data = makeTicketsData(ticket);
    const md = buildTicketMarkdown("P0-1", ticket, data, ticketsDir);
    assert.ok(!md.includes("To show related RFC graph details"));
  });

  it("Case 4: relatedTicketIds あり → Related Tickets 表が含まれる", function () {
    const ticket = makeTicket({
      relatedTicketIds: "[depends_on] P0-1 (dep description)",
    });
    const data = makeTicketsData(ticket);
    const md = buildTicketMarkdown("P0-1", ticket, data, ticketsDir);
    assert.ok(md.includes("## Related Tickets"));
    assert.ok(md.includes("P0-1"));
    assert.ok(md.includes("depends_on"));
  });

  it("Case 5: relatedTicketIds なし → Related Tickets 表が含まれない", function () {
    const ticket = makeTicket({ relatedTicketIds: undefined });
    const data = makeTicketsData(ticket);
    const md = buildTicketMarkdown("P0-1", ticket, data, ticketsDir);
    assert.ok(!md.includes("## Related Tickets"));
  });

  it("Case 6: Notes が含まれる", function () {
    const ticket = makeTicket({ notes: "Important note here." });
    const data = makeTicketsData(ticket);
    const md = buildTicketMarkdown("P0-1", ticket, data, ticketsDir);
    assert.ok(md.includes("## Notes"));
    assert.ok(md.includes("Important note here."));
  });

  it("Case 7: Scope なし → Scope セクションが含まれない", function () {
    const ticket = makeTicket({ scope: undefined });
    const data = makeTicketsData(ticket);
    const md = buildTicketMarkdown("P0-1", ticket, data, ticketsDir);
    assert.ok(!md.includes("## Scope"));
  });

  it("Case 8: Spec-File が存在する → Pipeline Context に Spec-File 行が Exist=true", function () {
    writeFile(dir, "test-spec.md", "# Spec");
    const ticket = makeTicket({ referenceSection: "test-spec.md" });
    const data = makeTicketsData(ticket);
    const md = buildTicketMarkdown("P0-1", ticket, data, ticketsDir);
    assert.ok(md.includes("Spec-File"));
  });

  it("Case 9: Pipeline Available の表示", function () {
    const rfcFile = writeFile(dir, "test-rfc.md", "# RFC");
    const graphFile = writeFile(dir, "test-rfc-GRAPH.json", "{}");
    const dirsFile = writeFile(dir, "test-rfc-Dirs-Tree.json", "{}");
    const ticket = makeTicket({ nodeIds: ["N0001"] });
    const data = makeTicketsData(ticket);
    const md = buildTicketMarkdown("P0-1", ticket, data, ticketsDir);
    assert.ok(md.includes("**true**"));
  });

  it("Case 10: pipeline available だが nodeIds なし → graph セクションなし", function () {
    // pipeline は整っているがチケットに nodeIds がない → グラフは非表示
    const rfcFile = writeFile(dir, "test-rfc.md", "# RFC");
    const graphFile = writeFile(dir, "test-rfc-GRAPH.json", "{}");
    const dirsFile = writeFile(dir, "test-rfc-Dirs-Tree.json", "{}");
    const ticket = makeTicket({ nodeIds: undefined });
    const data = makeTicketsData(ticket);
    const md = buildTicketMarkdown("P0-1", ticket, data, ticketsDir);
    assert.ok(!md.includes("To show related RFC graph details"));
  });

  it("Case 11: testIntegration を指定 → Integration Tests セクションが含まれる", function () {
    const ticket = makeTicket({ testIntegration: ["IT: module A + B"] });
    const data = makeTicketsData(ticket);
    const md = buildTicketMarkdown("P0-1", ticket, data, ticketsDir);
    assert.ok(md.includes("### Integration Tests"));
    assert.ok(md.includes("IT: module A + B"));
  });

  it("Case 12: testIntegration なし → Integration Tests セクションが含まれない", function () {
    const ticket = makeTicket({ testIntegration: undefined });
    const data = makeTicketsData(ticket);
    const md = buildTicketMarkdown("P0-1", ticket, data, ticketsDir);
    assert.ok(!md.includes("### Integration Tests"));
  });
});

// ---------------------------------------------------------------------------
// resolveRfcPaths
// ---------------------------------------------------------------------------

describe("show-ticket-context — resolveRfcPaths", function () {
  let dir;

  before(function () { dir = tmpDir(); });
  after(function () { fs.rmSync(dir, { recursive: true, force: true }); });

  it("Case 1: resolvedPaths が存在し全ファイル実在 → そのパスを返す", function () {
    writeFile(dir, "rfc.md", "# R");
    writeFile(dir, "rfc-GRAPH.json", "{}");
    writeFile(dir, "rfc-Dirs-Tree.json", "{}");
    const rp = {
      rfcPath: "rfc.md",
      graphPath: "rfc-GRAPH.json",
      dirsTreePath: "rfc-Dirs-Tree.json",
    };
    const result = resolveRfcPaths("ignored.md", dir, rp);
    assert.ok(result.rfcPath.endsWith("rfc.md"));
    assert.strictEqual(result.rfcPathSource, "resolvedPaths");
  });

  it("Case 2: rawSource が .md → graph/dirs を自動導出", function () {
    writeFile(dir, "doc.md", "# Doc");
    const result = resolveRfcPaths("doc.md", dir, null);
    assert.ok(result.rfcPath.endsWith("doc.md"));
    assert.ok(result.graphPath.endsWith("doc-GRAPH.json"));
    assert.ok(result.dirsTreePath.endsWith("doc-Dirs-Tree.json"));
    assert.strictEqual(result.rfcPathSource, "metadata.source.md");
  });

  it("Case 3: rawSource が .json（GRAPH.json）→ RFC を逆算", function () {
    writeFile(dir, "spec-GRAPH.json", "{}");
    const result = resolveRfcPaths("spec-GRAPH.json", dir, null);
    assert.ok(result.rfcPath.endsWith("spec.md"));
    assert.ok(result.graphPath.endsWith("spec-GRAPH.json"));
    assert.strictEqual(result.rfcPathSource, "metadata.source.json");
  });

  it("Case 4: rawSource が存在しないファイル → rfcPathSource=not_found, パス空", function () {
    const result = resolveRfcPaths("nonexistent.md", dir, null);
    assert.strictEqual(result.rfcPath, "");
    assert.strictEqual(result.rfcPathSource, "not_found");
  });

  it("Case 5: rawSource なし → rfcPathSource=none", function () {
    const result = resolveRfcPaths("", dir, null);
    assert.strictEqual(result.rfcPath, "");
    assert.strictEqual(result.rfcPathSource, "none");
  });
});
