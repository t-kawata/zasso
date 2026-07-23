/**
 * show-ticket-context.test.cjs — show-ticket-context.js の単体テスト
 *
 * テスト対象: parseArgs, isValidTicketKey, parseTicketKey, findTicket,
 *            parseRelatedTicketIds, resolveRfcPaths,
 *            buildTicketNotFoundMarkdown, buildTicketMarkdown
 * カバレッジ: 38ケース
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
  it("--ticket-key のみ指定", function () {
    const r = parseArgs(["--ticket-key=P0-1"]);
    assert.strictEqual(r.ticketKey, "P0-1");
    assert.strictEqual(r.forSpec, false);
  });

  it("--ticket-key + --tickets + --for-spec を指定", function () {
    const r = parseArgs(["--ticket-key=PX-53", "--tickets=/tmp/Tickets.json", "--for-spec"]);
    assert.strictEqual(r.ticketKey, "PX-53");
    assert.strictEqual(r.ticketsPath, "/tmp/Tickets.json");
    assert.strictEqual(r.forSpec, true);
  });

  it("引数なし", function () {
    const r = parseArgs([]);
    assert.strictEqual(r.ticketKey, "");
    assert.strictEqual(r.forSpec, false);
  });
});

// ---------------------------------------------------------------------------
// isValidTicketKey
// ---------------------------------------------------------------------------

describe("show-ticket-context — isValidTicketKey", function () {
  it("P0-1 → true", () => assert.strictEqual(isValidTicketKey("P0-1"), true));
  it("PX-53 → true", () => assert.strictEqual(isValidTicketKey("PX-53"), true));
  it("P-1-5 → true", () => assert.strictEqual(isValidTicketKey("P-1-5"), true));
  it("空文字 → false", () => assert.strictEqual(isValidTicketKey(""), false));
  it("p0-1 → false", () => assert.strictEqual(isValidTicketKey("p0-1"), false));
  it("数字のみ → false", () => assert.strictEqual(isValidTicketKey("123"), false));
});

// ---------------------------------------------------------------------------
// parseTicketKey
// ---------------------------------------------------------------------------

describe("show-ticket-context — parseTicketKey", function () {
  it("P0-1 → {phaseId:0, ticketId:1}", () => assert.deepStrictEqual(parseTicketKey("P0-1"), { phaseId: 0, ticketId: 1 }));
  it("PX-53 → {phaseId:-1, ticketId:53}", () => assert.deepStrictEqual(parseTicketKey("PX-53"), { phaseId: -1, ticketId: 53 }));
  it("P-1-5 → {phaseId:-1, ticketId:5}", () => assert.deepStrictEqual(parseTicketKey("P-1-5"), { phaseId: -1, ticketId: 5 }));
  it("不正形式 → null", () => assert.strictEqual(parseTicketKey("invalid"), null));
});

// ---------------------------------------------------------------------------
// findTicket
// ---------------------------------------------------------------------------

describe("show-ticket-context — findTicket", function () {
  it("存在するチケット", function () {
    const data = makeTicketsData(makeTicket({ id: 1 }));
    assert.notStrictEqual(findTicket(data, { phaseId: 0, ticketId: 1 }), null);
  });
  it("存在しないチケット → null", function () {
    assert.strictEqual(findTicket(makeTicketsData(), { phaseId: 0, ticketId: 999 }), null);
  });
  it("parsed null → null", () => assert.strictEqual(findTicket(makeTicketsData(), null), null));
});

// ---------------------------------------------------------------------------
// parseRelatedTicketIds
// ---------------------------------------------------------------------------

describe("show-ticket-context — parseRelatedTicketIds", function () {
  it("3件の関連チケット", function () {
    const raw = "[depends_on] P0-1 (a), [references] P0-2 (b), [part_of] P1-1 (c)";
    const rows = parseRelatedTicketIds(raw);
    assert.strictEqual(rows.length, 3);
  });
  it("空文字 → []", () => assert.deepStrictEqual(parseRelatedTicketIds(""), []));
  it("null → []", () => assert.deepStrictEqual(parseRelatedTicketIds(null), []));
  it("重複排除", function () {
    assert.strictEqual(parseRelatedTicketIds("[depends_on] P0-1 (a), [depends_on] P0-1 (a)").length, 1);
  });
  it("全角括弧", function () {
    assert.ok(parseRelatedTicketIds('[part_of] P9-2 (被依存元（依存元）)')[0].description.includes("被依存元"));
  });
});

// ---------------------------------------------------------------------------
// buildTicketNotFoundMarkdown
// ---------------------------------------------------------------------------

describe("show-ticket-context — buildTicketNotFoundMarkdown", function () {
  it("Not Found ヘッダー", () => assert.ok(buildTicketNotFoundMarkdown("PX-999").includes("Not Found")));
  it("ensure-ticket.js 参照", () => assert.ok(buildTicketNotFoundMarkdown("PX-999").includes("ensure-ticket.js")));
  it("中断メッセージ → abort message in English", () => assert.ok(buildTicketNotFoundMarkdown("PX-999").includes("abort")));
});

// ---------------------------------------------------------------------------
// buildTicketMarkdown — 通常モード (forSpec=false)
// ---------------------------------------------------------------------------

describe("show-ticket-context — buildTicketMarkdown (normal mode)", function () {
  let dir, ticketsDir;
  before(function () { dir = tmpDir(); ticketsDir = dir; });
  after(function () { fs.rmSync(dir, { recursive: true, force: true }); });

  function md(ticket, data) {
    return buildTicketMarkdown("P0-1", ticket, data || makeTicketsData(ticket), ticketsDir, false);
  }

  it("Case 1: 基本セクション + ステータスバッジ", function () {
    const ticket = makeTicket();
    const out = md(ticket);
    assert.ok(out.includes("# P0-1: Test Ticket [todo]"));
    assert.ok(out.includes("## Background"));
    assert.ok(out.includes("## Scope"));
    assert.ok(out.includes("## Implementation Target Files"));
    assert.ok(out.includes("## Test Plan"));
    assert.ok(out.includes("### Unit Tests"));
    assert.ok(out.includes("### Exceptions"));
    assert.ok(out.includes("## Pipeline Context"));
    // IMPORTANT バナーは通常モードのみ
    assert.ok(out.includes("IMPORTANT"));
  });

  it("Case 2: nodeIds + pipeline → graph セクション", function () {
    writeFile(dir, "test-rfc.md", "# RFC");
    writeFile(dir, "test-rfc-GRAPH.json", "{}");
    writeFile(dir, "test-rfc-Dirs-Tree.json", "{}");
    const out = md(makeTicket({ nodeIds: ["N0001"] }));
    assert.ok(out.includes("To show related RFC graph details"));
  });

  it("Case 3: nodeIds なし → graph なし", function () {
    assert.ok(!md(makeTicket({ nodeIds: undefined })).includes("To show related RFC graph details"));
  });

  it("Case 4: relatedTicketIds → Related Tickets 表", function () {
    assert.ok(md(makeTicket({ relatedTicketIds: "[depends_on] P0-1 (dep)" })).includes("## Related Tickets"));
  });

  it("Case 5: relatedTicketIds なし → Related Tickets なし", function () {
    assert.ok(!md(makeTicket({ relatedTicketIds: undefined })).includes("## Related Tickets"));
  });

  it("Case 6: Notes", function () {
    const out = md(makeTicket({ notes: "Important note." }));
    assert.ok(out.includes("## Notes"));
    assert.ok(out.includes("Important note."));
  });

  it("Case 7: Scope なし → Scope 非表示", function () {
    assert.ok(!md(makeTicket({ scope: undefined })).includes("## Scope"));
  });

  it("Case 8: Spec-File → Pipeline Context に表示", function () {
    writeFile(dir, "test-spec.md", "# Spec");
    assert.ok(md(makeTicket({ specPath: "test-spec.md" })).includes("Spec-File"));
  });

  it("Case 9: Pipeline Available true", function () {
    writeFile(dir, "test-rfc.md", "# RFC");
    writeFile(dir, "test-rfc-GRAPH.json", "{}");
    writeFile(dir, "test-rfc-Dirs-Tree.json", "{}");
    assert.ok(md(makeTicket({ nodeIds: ["N0001"] })).includes("**true**"));
  });

  it("Case 10: pipeline + nodeIds なし → graph なし", function () {
    writeFile(dir, "test-rfc.md", "# RFC");
    writeFile(dir, "test-rfc-GRAPH.json", "{}");
    writeFile(dir, "test-rfc-Dirs-Tree.json", "{}");
    assert.ok(!md(makeTicket({ nodeIds: undefined })).includes("To show related RFC graph details"));
  });

  it("Case 11: testIntegration → Integration Tests", function () {
    assert.ok(md(makeTicket({ testIntegration: ["IT: test"] })).includes("### Integration Tests"));
  });

  it("Case 12: testIntegration なし → Integration Tests 非表示", function () {
    assert.ok(!md(makeTicket({ testIntegration: undefined })).includes("### Integration Tests"));
  });

  // ---- 新規フィールド ----

  it("Case 13: status バッジ [todo]", function () {
    assert.ok(md(makeTicket({ status: "made" })).includes("[made]"));
    assert.ok(md(makeTicket({ status: "done" })).includes("[done]"));
  });

  it("Case 14: referenceSection → RFC Reference", function () {
    const out = md(makeTicket({ referenceSection: "RFC-ROOT (§1, §2)" }));
    assert.ok(out.includes("## RFC Reference"));
    assert.ok(out.includes("RFC-ROOT (§1, §2)"));
  });

  it("Case 15: investigation → Investigation", function () {
    const out = md(makeTicket({ investigation: "src/foo.rs:42 を確認" }));
    assert.ok(out.includes("## Investigation"));
    assert.ok(out.includes("src/foo.rs:42"));
  });

  it("Case 16: referenceUrls → Reference URLs", function () {
    const out = md(makeTicket({ referenceUrls: ["https://example.com"] }));
    assert.ok(out.includes("## Reference URLs"));
    assert.ok(out.includes("https://example.com"));
  });

  it("Case 17: sourcePaths → Source Paths", function () {
    const out = md(makeTicket({ sourcePaths: ["src/foo.rs:42"] }));
    assert.ok(out.includes("## Source Paths"));
    assert.ok(out.includes("src/foo.rs:42"));
  });

  it("Case 18: rfcDiscrepancies → RFC Discrepancies", function () {
    const out = md(makeTicket({ rfcDiscrepancies: ["§3.1 未実装"] }));
    assert.ok(out.includes("## RFC Discrepancies"));
    assert.ok(out.includes("§3.1 未実装"));
  });

  it("Case 19: invariants → Invariants", function () {
    const out = md(makeTicket({ invariants: "鍵長は448ビット固定" }));
    assert.ok(out.includes("## Invariants"));
    assert.ok(out.includes("鍵長は448ビット固定"));
  });

  it("Case 20: 全新規フィールドが空 → 該当セクション非表示", function () {
    const ticket = makeTicket({
      referenceSection: undefined, investigation: undefined,
      referenceUrls: undefined, sourcePaths: undefined,
      rfcDiscrepancies: undefined, invariants: undefined,
    });
    const out = md(ticket);
    assert.ok(!out.includes("## RFC Reference"));
    assert.ok(!out.includes("## Investigation"));
    assert.ok(!out.includes("## Reference URLs"));
    assert.ok(!out.includes("## Source Paths"));
    assert.ok(!out.includes("## RFC Discrepancies"));
    assert.ok(!out.includes("## Invariants"));
  });

  it("Case 21: boyScoutPlan → Boy Scout Rule セクション", function () {
    const out = md(makeTicket({ boyScoutPlan: "src/foo.rs:42 の process() を3分割" }));
    assert.ok(out.includes("## Boy Scout Rule"));
    assert.ok(out.includes("process() を3分割"));
  });

  it("Case 22: boyScoutPlan なし → Boy Scout Rule 非表示", function () {
    assert.ok(!md(makeTicket({ boyScoutPlan: undefined })).includes("## Boy Scout Rule"));
  });
});

// ---------------------------------------------------------------------------
// buildTicketMarkdown — --for-spec モード
// ---------------------------------------------------------------------------

describe("show-ticket-context — buildTicketMarkdown (--for-spec mode)", function () {
  let dir, ticketsDir;
  before(function () { dir = tmpDir(); ticketsDir = dir; });
  after(function () { fs.rmSync(dir, { recursive: true, force: true }); });

  function wsMd(ticket, data) {
    return buildTicketMarkdown("P0-1", ticket, data || makeTicketsData(ticket), ticketsDir, true);
  }

  it("IMPORTANT バナーが出力されない", function () {
    assert.ok(!wsMd(makeTicket()).includes("IMPORTANT"));
  });

  it("Pipeline Context が出力されない", function () {
    assert.ok(!wsMd(makeTicket()).includes("## Pipeline Context"));
  });

  it("Implementation Order が冒頭に出力される", function () {
    const out = wsMd(makeTicket());
    assert.ok(out.startsWith("**Reference — Implementation Order (TDD Red-Green-Refactor)**"));
    assert.ok(out.includes("Red → Green → Refactor"));
    assert.ok(out.includes("Definition of Done"));
  });

  it("通常のセクションは出力される", function () {
    const out = wsMd(makeTicket());
    assert.ok(out.includes("## Background"));
    assert.ok(out.includes("## Scope"));
    assert.ok(out.includes("## Test Plan"));
    assert.ok(out.includes("## Notes"));
  });

  it("新規フィールドも出力される（forSpec の有無で差がない）", function () {
    const out = wsMd(makeTicket({
      referenceSection: "RFC-ROOT (§1)",
      investigation: "Investigation content",
      invariants: "Invariant content",
    }));
    assert.ok(out.includes("## RFC Reference"));
    assert.ok(out.includes("## Investigation"));
    assert.ok(out.includes("## Invariants"));
  });
});

// ---------------------------------------------------------------------------
// resolveRfcPaths
// ---------------------------------------------------------------------------

describe("show-ticket-context — resolveRfcPaths", function () {
  let dir;
  before(function () { dir = tmpDir(); });
  after(function () { fs.rmSync(dir, { recursive: true, force: true }); });

  it("resolvedPaths 全ファイル実在", function () {
    writeFile(dir, "rfc.md", "# R");
    writeFile(dir, "rfc-GRAPH.json", "{}");
    writeFile(dir, "rfc-Dirs-Tree.json", "{}");
    const rp = { rfcPath: "rfc.md", graphPath: "rfc-GRAPH.json", dirsTreePath: "rfc-Dirs-Tree.json" };
    const r = resolveRfcPaths("ignored.md", dir, rp);
    assert.strictEqual(r.rfcPathSource, "resolvedPaths");
  });

  it("rawSource .md → graph/dirs 自動導出", function () {
    writeFile(dir, "doc.md", "# Doc");
    const r = resolveRfcPaths("doc.md", dir, null);
    assert.ok(r.graphPath.endsWith("doc-GRAPH.json"));
    assert.strictEqual(r.rfcPathSource, "metadata.source.md");
  });

  it("rawSource .json → RFC 逆算", function () {
    writeFile(dir, "spec-GRAPH.json", "{}");
    const r = resolveRfcPaths("spec-GRAPH.json", dir, null);
    assert.ok(r.rfcPath.endsWith("spec.md"));
    assert.strictEqual(r.rfcPathSource, "metadata.source.json");
  });

  it("存在しないファイル → not_found", function () {
    const r = resolveRfcPaths("nonexistent.md", dir, null);
    assert.strictEqual(r.rfcPath, "");
    assert.strictEqual(r.rfcPathSource, "not_found");
  });

  it("rawSource なし → none", function () {
    const r = resolveRfcPaths("", dir, null);
    assert.strictEqual(r.rfcPathSource, "none");
  });
});
