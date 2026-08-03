

// tickets.test.ts — tickets.ts のユニットテスト
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する
//
// ファイル I/O を伴うテストは一時ファイルを作成して行う。
// ENOENT や JSON パースエラーは readFileSync / JSON.parse の throw がそのまま伝播することを確認する。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import path, { join } from "node:path";
import os, { tmpdir } from "node:os";
import { loadPendingTickets, checkAllReviewed, getGraphPathFromTickets } from "./tickets.js";

/** テスト用に一時ディレクトリに Tickets.json を書き込み、そのパスを返す */
// [::TICKET::] PX-114 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-114 --for-spec --no-implementation-order`.
// [::TICKET::] PX-116 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-116 --for-spec --no-implementation-order`.
function writeTempTickets(data: object): string {
  const dir = mkdtempSync(join(tmpdir(), "tt-"));
  const path = join(dir, "Tickets.json");
  writeFileSync(path, JSON.stringify(data), "utf-8");
  return path;
}

describe("loadPendingTickets", () => {
  it("1 phase に未処理2件 + reviewed1件 → 未処理2件のみ返る", () => {
    const path = writeTempTickets({
      title: "Test",
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        {
          id: 0, name: "P0",
          tickets: [
            { id: 1, phaseId: 0, status: "todo", title: "A" },
            { id: 2, phaseId: 0, status: "done", title: "B" },
            { id: 3, phaseId: 0, status: "reviewed", title: "C" },
          ],
        },
      ],
    });
    const result = loadPendingTickets(path);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].title, "A");
    assert.strictEqual(result[1].title, "B");
  });

  it("複数 phase に分散した未処理 → 全未処理を抽出", () => {
    const path = writeTempTickets({
      title: "Test",
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        {
          id: 0, name: "P0",
          tickets: [{ id: 1, phaseId: 0, status: "reviewed", title: "A" }],
        },
        {
          id: 1, name: "P1",
          tickets: [{ id: 2, phaseId: 1, status: "todo", title: "B" }],
        },
      ],
    });
    const result = loadPendingTickets(path);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, "B");
  });

  it("全 reviewed → 空配列", () => {
    const path = writeTempTickets({
      title: "Test",
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        {
          id: 0, name: "P0",
          tickets: [
            { id: 1, phaseId: 0, status: "reviewed", title: "A" },
            { id: 2, phaseId: 0, status: "reviewed", title: "B" },
          ],
        },
      ],
    });
    assert.deepStrictEqual(loadPendingTickets(path), []);
  });

  it("空の phase → 空配列", () => {
    const path = writeTempTickets({
      title: "Test",
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [],
    });
    assert.deepStrictEqual(loadPendingTickets(path), []);
  });

  it("複数 phase のチケットに正しい phaseId が付与される", () => {
    const path = writeTempTickets({
      title: "Test",
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        { id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "A" }] },
        { id: 5, name: "P5", tickets: [{ id: 2, phaseId: 5, status: "todo", title: "B" }] },
        { id: 10, name: "P10", tickets: [{ id: 3, phaseId: 10, status: "todo", title: "C" }] },
      ],
    });
    const result = loadPendingTickets(path);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].phaseId, 0);
    assert.strictEqual(result[1].phaseId, 5);
    assert.strictEqual(result[2].phaseId, 10);
  });

  it("phaseId が欠落したチケットでも自動補完される", () => {
    const path = writeTempTickets({
      title: "Test",
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        {
          id: 3, name: "P3",
          tickets: [
            { id: 1, status: "todo", title: "NoPhaseId" } as any,
          ],
        },
      ],
    });
    const result = loadPendingTickets(path);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].phaseId, 3);
  });

  it("誤った phaseId が親 phase の id で上書きされる", () => {
    const path = writeTempTickets({
      title: "Test",
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        {
          id: 2, name: "P2",
          tickets: [{ id: 1, phaseId: 999, status: "todo", title: "WrongPhaseId" }],
        },
      ],
    });
    const result = loadPendingTickets(path);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].phaseId, 2);
  });

  it("ファイル不在 → ENOENT を throw", () => {
    assert.throws(
      () => loadPendingTickets("/nonexistent/path/Tickets.json"),
      { code: "ENOENT" },
    );
  });

  it("不正な JSON → SyntaxError を throw", () => {
    const dir = mkdtempSync(join(tmpdir(), "tt-"));
    const path = join(dir, "bad.json");
    writeFileSync(path, "{invalid json}", "utf-8");
    assert.throws(
      () => loadPendingTickets(path),
      SyntaxError,
    );
  });
});

describe("checkAllReviewed", () => {
  it("全チケット reviewed → true", () => {
    const path = writeTempTickets({
      title: "Test",
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        {
          id: 0, name: "P0",
          tickets: [
            { id: 1, phaseId: 0, status: "reviewed", title: "A" },
          ],
        },
      ],
    });
    assert.strictEqual(checkAllReviewed(path), true);
  });

  it("一部未処理 → false", () => {
    const path = writeTempTickets({
      title: "Test",
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        {
          id: 0, name: "P0",
          tickets: [
            { id: 1, phaseId: 0, status: "reviewed", title: "A" },
            { id: 2, phaseId: 0, status: "todo", title: "B" },
          ],
        },
      ],
    });
    assert.strictEqual(checkAllReviewed(path), false);
  });

  it("空配列 → true", () => {
    const path = writeTempTickets({
      title: "Test",
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [],
    });
    assert.strictEqual(checkAllReviewed(path), true);
  });
});

describe("round-aware status (R<round>)", () => {
  it("loadPendingTickets は R1 チケットを処理済みとして除外する", () => {
    const path = writeTempTickets({
      title: "Test",
      round: 1,
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        {
          id: 0, name: "P0",
          tickets: [
            { id: 1, phaseId: 0, status: "R1", title: "A" },
            { id: 2, phaseId: 0, status: "todo", title: "B" },
          ],
        },
      ],
    });
    const result = loadPendingTickets(path);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, "B");
  });

  it("loadPendingTickets は todo/made/planned/done を引き続き含む", () => {
    const path = writeTempTickets({
      title: "Test",
      round: 2,
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        {
          id: 0, name: "P0",
          tickets: [
            { id: 1, phaseId: 0, status: "todo", title: "A" },
            { id: 2, phaseId: 0, status: "made", title: "B" },
            { id: 3, phaseId: 0, status: "planned", title: "C" },
            { id: 4, phaseId: 0, status: "done", title: "D" },
          ],
        },
      ],
    });
    assert.strictEqual(loadPendingTickets(path).length, 4);
  });

  it("checkAllReviewed は全チケットが R1 または reviewed なら true", () => {
    const path = writeTempTickets({
      title: "Test",
      round: 1,
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        {
          id: 0, name: "P0",
          tickets: [
            { id: 1, phaseId: 0, status: "R1", title: "A" },
            { id: 2, phaseId: 0, status: "reviewed", title: "B" },
          ],
        },
      ],
    });
    assert.strictEqual(checkAllReviewed(path), true);
  });

  it("checkAllReviewed は R1 と並んで todo/done があれば false", () => {
    const path = writeTempTickets({
      title: "Test",
      round: 1,
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        {
          id: 0, name: "P0",
          tickets: [
            { id: 1, phaseId: 0, status: "R1", title: "A" },
            { id: 2, phaseId: 0, status: "done", title: "B" },
          ],
        },
      ],
    });
    assert.strictEqual(checkAllReviewed(path), false);
  });

  it("不変条件: loadPendingTickets は R<N> のチケットを一切返さない", () => {
    const path = writeTempTickets({
      title: "Test",
      round: 1,
      metadata: { source: "r.md", generatedAt: "2026-06-25" },
      phases: [
        {
          id: 0, name: "P0",
          tickets: [
            { id: 1, phaseId: 0, status: "R1", title: "A" },
            { id: 2, phaseId: 0, status: "todo", title: "B" },
            { id: 3, phaseId: 0, status: "R2", title: "C" },
          ],
        },
      ],
    });
    const result = loadPendingTickets(path);
    assert.ok(result.every((t) => !/^R\d+$/.test(t.status)));
  });
});

describe("getGraphPathFromTickets", () => {
  // @verifies C002
  it("resolvedPaths.graphPath あり → チルダ展開済み絶対パスを返す", () => {
    const ticketsPath = writeTempTickets({
      title: "Test",
      metadata: {
        source: "~/shyme/zasso/crates/siprs/RFC-ROOT.md",
        resolvedPaths: { graphPath: "~/shyme/zasso/crates/siprs/RFC-ROOT-GRAPH.json" },
        generatedAt: "2026-07-28",
      },
      phases: [],
    });
    const expected = path.resolve(os.homedir(), "shyme/zasso/crates/siprs/RFC-ROOT-GRAPH.json");
    assert.strictEqual(getGraphPathFromTickets(ticketsPath), expected);
    assert.ok(!getGraphPathFromTickets(ticketsPath).includes("~"));
  });

  // @verifies C003
  it("resolvedPaths なし + source あり → <source .md 除去>-GRAPH.json を導出", () => {
    const ticketsPath = writeTempTickets({
      title: "Test",
      metadata: { source: "tools/conver/RFC_ROOT.md", generatedAt: "2026-06-25" },
      phases: [],
    });
    const expected = path.resolve("tools/conver/RFC_ROOT-GRAPH.json");
    assert.strictEqual(getGraphPathFromTickets(ticketsPath), expected);
  });

  // @verifies C004
  it("resolvedPaths.graphPath も metadata.source もない → ticketsPath を返す", () => {
    const ticketsPath = writeTempTickets({ title: "Test", phases: [] });
    assert.strictEqual(getGraphPathFromTickets(ticketsPath), ticketsPath);
    assert.notStrictEqual(getGraphPathFromTickets(ticketsPath), undefined);
  });

  // @verifies C002 C003 C004
  it("戻り値は常に非空文字列", () => {
    const ticketsPath = writeTempTickets({ title: "Test", phases: [] });
    assert.ok(getGraphPathFromTickets(ticketsPath).length > 0);
  });
});
