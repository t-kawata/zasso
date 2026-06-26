// tickets.ts — Tickets.json 読み込み・状態確認（ファイルI/Oモジュール）
//
// 責務: node:fs.readFileSync で Tickets.json を読み込み、以下の操作を提供する
// - loadPendingTickets: 未処理（status ≠ "reviewed"）チケットの抽出
// - checkAllReviewed:   全チケットが reviewed 状態か判定
// - getSourceFromTickets: メタデータの source 値を取得（なければ引数をそのまま返す）
//
// 書き込み処理はスコープ外。.claude/scripts/tickets/ のスクリプト群が担当する。
import { readFileSync } from "node:fs";

/** 単一チケットの情報 */
export interface Ticket {
  id: number;
  phaseId: number;
  status: string;
  title: string;
  referenceSection?: string;
  background?: string;
  scope?: string[];
  testVerification?: string[];
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
export interface TicketsJson {
  title?: string;
  metadata?: {
    source: string;
    generatedAt: string;
    analyzedSections?: string;
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
  const data: TicketsJson = JSON.parse(raw);
  return data.phases
    .flatMap((phase) =>
      phase.tickets.map((t) => ({ ...t, phaseId: phase.id })),
    )
    .filter((t) => t.status !== "reviewed");
}

/**
 * 全チケットの status が "reviewed" か判定する。
 * チケットが1件も存在しない場合は true を返す（空の状態を「全件 review 完了」とみなす）。
 * @param ticketsPath Tickets.json のファイルパス
 * @returns 全チケットが reviewed なら true
 */
export function checkAllReviewed(ticketsPath: string): boolean {
  const raw = readFileSync(ticketsPath, "utf-8");
  const data: TicketsJson = JSON.parse(raw);

  for (const phase of data.phases) {
    for (const ticket of phase.tickets) {
      if (ticket.status !== "reviewed") {
        return false;
      }
    }
  }

  return true;
}

/**
 * Tickets.json の metadata.source を返す。
 * metadata が存在しない場合、または metadata に source が存在しない場合は
 * ticketsPath をそのまま返す。
 * @param ticketsPath Tickets.json のファイルパス
 * @returns source の値（なければ ticketsPath）
 */
export function getSourceFromTickets(ticketsPath: string): string {
  const raw = readFileSync(ticketsPath, "utf-8");
  const data: TicketsJson = JSON.parse(raw);

  if (data.metadata?.source) {
    return data.metadata.source;
  }

  return ticketsPath;
}
