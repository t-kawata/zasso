
// tickets.ts — Tickets.json 読み込み・状態確認（ファイルI/Oモジュール）
//
// 責務: node:fs.readFileSync で Tickets.json を読み込み、以下の操作を提供する
// - loadPendingTickets: 未処理（status ≠ "reviewed"）チケットの抽出
// - checkAllReviewed:   全チケットが reviewed 状態か判定
// - getGraphPathFromTickets: /find-omissions へ渡す *-GRAPH.json の絶対パスを解決
//
// 読み取りが主務。clearForNextRound のみ、runLoop 起動時の安全網として書き込みを行う（PX-145）。
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { isTerminalStatus, ticketKeyOf } from "./ticket-status.js";

/** 単一チケットの情報 */
// [::TICKET::] PX-145, PX-146, PX-211 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-145|PX-146|PX-211) --for-spec --no-implementation-order`.
export interface Ticket {
  id: number;
  phaseId: number;
  status: string;
  title: string;
  /** ラウンド途中で追加されたチケット。次ラウンドまで処理対象外（PX-143/PX-144）。 */
  forNextRound?: boolean;
  referenceSection?: string;
  background?: string;
  scope?: string[];
  /** 合格条件。supervisor が「情報は既に存在する」根拠として読む（PX-211） */
  acceptanceCriteria?: string[];
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
// [::TICKET::] PX-114, PX-116 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-114|PX-116) --for-spec --no-implementation-order`.
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
export function loadPendingTickets(ticketsPath: string): Ticket[] {
  const raw = readFileSync(ticketsPath, "utf-8");
  const ticketsData: TicketsJson = JSON.parse(raw);
  return pendingTicketsOf(ticketsData);
}

/**
 * Pending tickets in Tickets.json array order: phase order first, then ticket
 * order. The strict loop must not sort by id; the array order is the declared
 * implementation order.
 */
export function pendingTicketsOf(ticketsData: TicketsJson): Ticket[] {
  return ticketsData.phases
    .flatMap((phase) =>
      phase.tickets.map((ticket) => ({ ...ticket, phaseId: phase.id })),
    )
    .filter(
      (ticket) =>
        !isTerminalStatus(ticket.status) && ticket.forNextRound !== true,
    );
}

/**
 * 全チケットの status が "reviewed" または round-aware ("R<round>") か判定する。
 * チケットが1件も存在しない場合は true を返す（空の状態を「全件 review 完了」とみなす）。
 * @param ticketsPath Tickets.json のファイルパス
 * @returns 全チケットが reviewed / R<round> なら true
 */
export function checkAllReviewed(ticketsPath: string): boolean {
  const raw = readFileSync(ticketsPath, "utf-8");
  const ticketsData: TicketsJson = JSON.parse(raw);

  for (const phase of ticketsData.phases) {
    for (const ticket of phase.tickets) {
      // forNextRound チケットは次ラウンドの作業なので「今ラウンドの完了判定」をブロックしない（PX-145）。
      if (!isTerminalStatus(ticket.status) && ticket.forNextRound !== true) {
        return false;
      }
    }
  }

  return true;
}

/** Progress of one phase, used by the phase-level Slack message. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface PhaseProgress {
  phaseId: number;
  total: number;
  reviewed: number;
  lastTicketKey: string;
  complete: boolean;
}

/** Progress of one package, used to decide the package boundary. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface PackageProgressSummary {
  total: number;
  reviewed: number;
  allTerminal: boolean;
}

export function phaseProgress(ticketsData: TicketsJson, phaseId: number): PhaseProgress {
  const phase = ticketsData.phases.find((candidate) => candidate.id === phaseId);
  if (phase === undefined) {
    return { phaseId, total: 0, reviewed: 0, lastTicketKey: "", complete: false };
  }
  const reviewed = phase.tickets.filter((ticket) => isTerminalStatus(ticket.status)).length;
  const lastTicket = phase.tickets[phase.tickets.length - 1];
  return {
    phaseId,
    total: phase.tickets.length,
    reviewed,
    lastTicketKey:
      lastTicket === undefined ? "" : ticketKeyOf(phase.id, lastTicket.id),
    complete: phase.tickets.length > 0 && reviewed === phase.tickets.length,
  };
}

export function packageProgress(ticketsData: TicketsJson): PackageProgressSummary {
  let total = 0;
  let reviewed = 0;
  for (const phase of ticketsData.phases) {
    total += phase.tickets.length;
    reviewed += phase.tickets.filter((ticket) => isTerminalStatus(ticket.status)).length;
  }
  return { total, reviewed, allTerminal: total === reviewed };
}

/**
 * 全チケットの forNextRound フラグを削除して Tickets.json に書き戻す。
 * runLoop 起動時の安全網（PX-145）: 中断されたラウンドで残ったフラグを解除し、
 * チケットが次ラウンドで処理可能になる。冪等 — 何度呼んでも結果は同一。
 * @param ticketsPath Tickets.json のファイルパス
 */
export function clearForNextRound(ticketsPath: string): void {
  const ticketsData: TicketsJson = JSON.parse(readFileSync(ticketsPath, "utf-8"));
  for (const phase of ticketsData.phases) {
    for (const ticket of phase.tickets) {
      delete ticket.forNextRound;
    }
  }
  // The file is committed, so every home path in it is stored in the portable form.
  writeFileSync(ticketsPath, JSON.stringify(toHomeRelativeDeep(ticketsData), null, 2) + "\n", "utf-8");
}

/**
 * 文字列中の $HOME 配下の絶対パスを ~/ に置き換える。
 *
 * `.claude/scripts/lib/path-utils.js` の toHomeRelativeText と同じ規則を、
 * バンドルされる TypeScript 側でも適用する。区切り文字を要求するため、
 * `/Users/alice2` のような兄弟ディレクトリはホームと誤認しない。
 * @param text 絶対パスを含みうる文字列
 * @returns $HOME 前置部を ~ にした文字列
 */
function toHomeRelativeText(text: string): string {
  const home = os.homedir();
  if (!home || home === path.parse(home).root) return text;
  const escaped = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`${escaped}[/\\\\]`, "g"), "~/");
}

/**
 * JSON 形状の値の全文字列に toHomeRelativeText を適用する。
 * @param value JSON 形状の値
 * @returns 文字列だけを変換した新しい値
 */
function toHomeRelativeDeep<T>(value: T): T {
  if (typeof value === "string") return toHomeRelativeText(value) as unknown as T;
  if (Array.isArray(value)) {
    return value.map((entry) => toHomeRelativeDeep(entry)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const converted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      converted[key] = toHomeRelativeDeep(entry);
    }
    return converted as T;
  }
  return value;
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
// [::TICKET::] PX-116 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-116 --for-spec --no-implementation-order`.
function expandTilde(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

/**
 * metadata.source から GRAPH ファイルパスを導出する。
 * @param source RFC markdown のパス（metadata.source）
 * @returns 導出したパス。source が無ければ undefined
 */
// [::TICKET::] PX-116 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-116 --for-spec --no-implementation-order`.
// [::TICKET::] PX-117 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-117 --for-spec --no-implementation-order`.
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
  const ticketsData: TicketsJson = JSON.parse(raw);
  const graphPath =
    ticketsData.metadata?.resolvedPaths?.graphPath ??
    deriveGraphPath(ticketsData.metadata?.source);
  return path.resolve(expandTilde(graphPath ?? ticketsPath));
}

/**
 * Tickets.json のフェーズ数とチケット数を返す。
 * find 後の統合成否判定（フェーズ/チケット数の前後比較）に使う。
 * 読み取り専用で副作用を持たない。
 * @param ticketsPath Tickets.json のファイルパス
 * @returns フェーズ数とチケット数
 */
export function countPhasesAndTickets(
  ticketsPath: string,
): { phaseCount: number; ticketCount: number } {
  const raw = readFileSync(ticketsPath, "utf-8");
  const ticketsData: TicketsJson = JSON.parse(raw);
  return {
    phaseCount: ticketsData.phases.length,
    ticketCount: ticketsData.phases.reduce(
      (total, phase) => total + (phase.tickets?.length ?? 0),
      0,
    ),
  };
}
