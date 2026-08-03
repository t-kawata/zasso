// tickets.ts — Tickets.json 読み込み・状態確認（ファイルI/Oモジュール）
//
// 責務: node:fs.readFileSync で Tickets.json を読み込み、以下の操作を提供する
// - loadPendingTickets: 未処理（status ≠ "reviewed"）チケットの抽出
// - checkAllReviewed:   全チケットが reviewed 状態か判定
// - getGraphPathFromTickets: /find-omissions へ渡す *-GRAPH.json の絶対パスを解決
//
// 書き込み処理はスコープ外。.claude/scripts/tickets/ のスクリプト群が担当する。
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

/** 単一チケットの情報 */
export interface Ticket {
  id: number;
  phaseId: number;
  status: string;
  title: string;
  referenceSection?: string;
  background?: string;
  scope?: string[];
  testUnit?: string[];
  testExceptions?: string[];
  instrumentation?: string;
  notes?: string;
  relatedTicketIds?: string;
  startedAt?: string;
  completedAt?: string;
}

/** フェーズ — チケットをグループ化する単位 */
export interface Phase {
  id: number;
  name: string;
  externalDependencies?: string;
  tickets: Ticket[];
}

/** Tickets.json のルート構造 */
// [::TICKET::] PX-114, PX-116 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-114|PX-116) --for-spec --no-implementation-order`.
export interface TicketsJson {
  title?: string;
  /** 処理ラウンド番号（新規作成時は 1、サイクル完了ごとにインクリメント） */
  round: number;
  metadata?: {
    source: string;
    generatedAt: string;
    analyzedSections?: string;
    /** graphify/boundify が解決した成果物のパス（~/ 前置き可） */
    resolvedPaths?: {
      rfcPath?: string;
      graphPath?: string;
      dirsTreePath?: string;
    };
  };
  phases: Phase[];
}

/**
 * Tickets.json を読み込み、未処理（status ≠ "reviewed"）のチケット一覧を
 * 全 phase からフラットに抽出する。
 * 各チケットには所属フェーズの phaseId を付与する（JSON の phaseId 値は上書き）。
 * @param ticketsPath Tickets.json のファイルパス
 * @returns 未処理チケットの配列（空の場合は空配列）
 */
/**
 * Round-aware status (e.g. "R1", "R2") — records the completion round.
 * Round numbers are integers >= 1 with no leading zeros.
 */
const isRoundStatus = (status: string): boolean => /^R[1-9]\d*$/.test(status);

export function loadPendingTickets(ticketsPath: string): Ticket[] {
  const raw = readFileSync(ticketsPath, "utf-8");
  const data: TicketsJson = JSON.parse(raw);
  return data.phases
    .flatMap((phase) =>
      phase.tickets.map((t) => ({ ...t, phaseId: phase.id })),
    )
    .filter((t) => t.status !== "reviewed" && !isRoundStatus(t.status));
}

/**
 * 全チケットの status が "reviewed" または round-aware ("R<round>") か判定する。
 * チケットが1件も存在しない場合は true を返す（空の状態を「全件 review 完了」とみなす）。
 * @param ticketsPath Tickets.json のファイルパス
 * @returns 全チケットが reviewed / R<round> なら true
 */
export function checkAllReviewed(ticketsPath: string): boolean {
  const raw = readFileSync(ticketsPath, "utf-8");
  const data: TicketsJson = JSON.parse(raw);

  for (const phase of data.phases) {
    for (const ticket of phase.tickets) {
      if (ticket.status !== "reviewed" && !isRoundStatus(ticket.status)) {
        return false;
      }
    }
  }

  return true;
}

/** GRAPH ファイル名の接尾辞 — graphify の命名規約（<source>.md → <source>-GRAPH.json） */
const GRAPH_FILE_SUFFIX = "-GRAPH.json";

/**
 * パス先頭の ~ をホームディレクトリに展開する。
 * validate-graph-arg.js は path.resolve() のみを行うため、~ を素通しすると
 * 存在チェック（fs.existsSync）に失敗する。ここで展開してから返す。
 * @param p チルダ付きの可能性があるパス
 * @returns チルダ展開済みのパス
 */
// [::TICKET::] PX-116 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-116 --for-spec --no-implementation-order`.
function expandTilde(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

/**
 * metadata.source から GRAPH ファイルパスを導出する。
 * @param source RFC markdown のパス（metadata.source）
 * @returns 導出したパス。source が無ければ undefined
 */
// [::TICKET::] PX-116 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-116 --for-spec --no-implementation-order`.
function deriveGraphPath(source?: string): string | undefined {
  if (!source) return undefined;
  return source.replace(/\.md$/, "") + GRAPH_FILE_SUFFIX;
}

/**
 * /find-omissions へ渡す *-GRAPH.json の絶対パスを返す。
 * 優先順位:
 *   1. metadata.resolvedPaths.graphPath（主経路）
 *   2. metadata.source からの導出（fallback）
 *   3. ticketsPath（最終 fallback）
 * いずれもチルダ展開 + path.resolve で絶対パスに正規化して返す。
 * @param ticketsPath Tickets.json のファイルパス
 * @returns GRAPH ファイルの絶対パス（常に非空文字列）
 */
export function getGraphPathFromTickets(ticketsPath: string): string {
  const raw = readFileSync(ticketsPath, "utf-8");
  const data: TicketsJson = JSON.parse(raw);
  const graphPath =
    data.metadata?.resolvedPaths?.graphPath ??
    deriveGraphPath(data.metadata?.source);
  return path.resolve(expandTilde(graphPath ?? ticketsPath));
}
