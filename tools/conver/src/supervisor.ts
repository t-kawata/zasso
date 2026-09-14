// supervisor.ts — 停滞したコマンドに送る継続指示の生成
//
// 責務:
//   コマンドが status を動かさずに終わったとき、次に何を送るべきかを決める。
//   1〜2回目は定型文 (COMPLETION_TEMPLATE) をそのまま送るため、この module は
//   3回目以降だけが使う。
//
// 最重要の不変条件:
//   generateCompletionMessage は決して throw しない。輸送失敗・非2xx・不正 JSON・
//   content 欠落・空文字のいずれでも定型文を返す。supervisor の失敗が完了ループを
//   止められてはならない。縮退先が定型文であることがその唯一の保証である。
//
// Layer 2 コンポーネント（ネットワーク I/O を含む）
// 依存: node:https / node:http, completion-policy.ts, session.ts (SessionConfig 型)
import http from "node:http";
import https from "node:https";
import { COMPLETION_TEMPLATE, completionPolicy } from "./completion-policy.js";
import type { SessionConfig } from "./session.js";

/** 生成された指示の種別。1〜2回目は template、3回目以降は generated */
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
export type InstructionKind = "template" | "generated";

/** 既に送った指示の記録。同じ指示の繰り返しを避けるために supervisor へ渡す */
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
export interface PriorInstruction {
  attempt: number;
  kind: InstructionKind;
  text: string;
}

/** チケットから supervisor に渡す文脈。すべて切り詰め済み */
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
export interface SupervisorTicketContext {
  title: string;
  acceptanceCriteria: string;
  scope: string[];
  notesTail: string;
}

/** supervisor に渡す完成済みリクエスト */
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
export interface SupervisorRequest {
  command: string;
  ticketId: string;
  attempt: number;
  maxAttempts: number;
  statusAtStart: string;
  statusCurrent: string;
  expectedOnCompletion: string;
  completionDefinition: string;
  priorInstructions: PriorInstruction[];
  agentLastMessageTail: string;
  workspaceChangedFiles: number | null;
  ticketContext: SupervisorTicketContext;
}

/**
 * リクエストの素材。runner.ts が Tickets.json と自プロセスから集める生の値で、
 * 切り詰めは buildSupervisorRequest が行う（runner は切り詰め幅を知らなくてよい）。
 */
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
export interface SupervisorIngredients {
  command: string;
  ticketId: string;
  attempt: number;
  maxAttempts: number;
  statusAtStart: string;
  statusCurrent: string;
  expectedOnCompletion: string;
  completionDefinition: string;
  priorInstructions: PriorInstruction[];
  agentLastMessageTail: string;
  workspaceChangedFiles: number | null;
  ticketTitle: string;
  acceptanceCriteria: string;
  scope: string[];
  notes: string;
}

/** 輸送層の応答。非2xx でも reject せず、呼び出し側が分岐する */
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
export interface HttpResponse {
  statusCode: number;
  body: string;
}

/** 輸送層の注入シーム。テストは偽の実装を渡し、モジュールモックを要さない */
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
export type HttpPostJson = (
  url: string,
  body: unknown,
  headers: Record<string, string>,
) => Promise<HttpResponse>;

/**
 * supervisor への応答を待つ上限。これを超えた輸送は中断し、定型文へ縮退する。
 * テストから短縮できるよう mutable に保つ。
 */
export const supervisorPolicy = {
  timeoutMs: 30_000,
};

/** supervisor に与える役割と、判断の拠り所となる2つの原則 */
export const SUPERVISOR_SYSTEM_PROMPT = [
  "You supervise an autonomous coding agent that stopped before completing a slash command.",
  "It cannot ask questions and no human will answer it.",
  "",
  "Two principles govern your instruction:",
  "",
  "1. It already has everything it needs. The information required to complete the task",
  "   exists in its workspace and in its ticket. Never tell it to request, search for, or",
  "   wait for information it should already hold.",
  "",
  "2. It must finish. Make the necessary and sufficient judgment called for by the original",
  "   design, neither more nor less, and direct it to run until the slash command is complete",
  "   and the status transition has been emitted. It must not return before that.",
  "",
  "Return ONLY the instruction itself: English, imperative, addressed to the agent, no",
  "preamble, no explanation, no markdown fences. If an instruction was already sent and the",
  "status has not moved, escalate: name the concrete missing action.",
].join("\n");

/** supervisor 応答の最大トークン数。指示1つ分に十分で、応答を短く保つ */
const SUPERVISOR_MAX_TOKENS = 512;

/** Anthropic Messages API のバージョンヘッダ値 */
const ANTHROPIC_VERSION = "2023-06-01";

/** Messages API のパス接尾部 */
const MESSAGES_PATH = "/v1/messages";

/** 先頭から limit 文字に切り詰める */
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
function truncateHead(text: string, limit: number): string {
  return text.slice(0, limit);
}

/** 末尾から limit 文字に切り詰める — 直近の状態ほど判断に効くため後ろを残す */
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
function truncateTail(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(-limit);
}

/** 素材を切り詰めて supervisor 用のリクエストに組み立てる */
export function buildSupervisorRequest(
  ingredients: SupervisorIngredients,
): SupervisorRequest {
  return {
    command: ingredients.command,
    ticketId: ingredients.ticketId,
    attempt: ingredients.attempt,
    maxAttempts: ingredients.maxAttempts,
    statusAtStart: ingredients.statusAtStart,
    statusCurrent: ingredients.statusCurrent,
    expectedOnCompletion: ingredients.expectedOnCompletion,
    completionDefinition: ingredients.completionDefinition,
    // 複製して渡す。ループはこの後も配列に追記するため、参照を渡すと
    // 送信済みリクエストの中身が事後に変わってしまう
    priorInstructions: [...ingredients.priorInstructions],
    agentLastMessageTail: truncateTail(
      ingredients.agentLastMessageTail,
      completionPolicy.agentMessageTailChars,
    ),
    workspaceChangedFiles: ingredients.workspaceChangedFiles,
    ticketContext: {
      title: ingredients.ticketTitle,
      acceptanceCriteria: truncateHead(
        ingredients.acceptanceCriteria,
        completionPolicy.acceptanceCriteriaChars,
      ),
      scope: ingredients.scope.slice(0, completionPolicy.scopeItems),
      notesTail: truncateTail(ingredients.notes, completionPolicy.notesTailChars),
    },
  };
}

/** baseUrl の末尾スラッシュを正規化して Messages API の URL を組み立てる */
export function buildMessagesUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${MESSAGES_PATH}`;
}

/**
 * リクエスト本文を組み立てる。状況は JSON 文字列として1つの user メッセージに載せる
 * — 散文で並べるより、モデルが欠落なく読める。
 */
export function buildRequestBody(
  request: SupervisorRequest,
  model: string,
): unknown {
  const situation = {
    command: request.command,
    ticket: request.ticketId,
    attempt: request.attempt,
    max_attempts: request.maxAttempts,
    status: {
      at_command_start: request.statusAtStart,
      current: request.statusCurrent,
      expected_on_completion: request.expectedOnCompletion,
    },
    completion_definition: request.completionDefinition,
    prior_instructions: request.priorInstructions.map((instruction) => ({
      attempt: instruction.attempt,
      kind: instruction.kind,
      text: instruction.text,
    })),
    agent_last_message_tail: request.agentLastMessageTail,
    workspace: { changed_files_since_command_start: request.workspaceChangedFiles },
    ticket_context: {
      title: request.ticketContext.title,
      acceptance_criteria: request.ticketContext.acceptanceCriteria,
      scope: request.ticketContext.scope,
      notes_tail: request.ticketContext.notesTail,
    },
  };

  return {
    model,
    max_tokens: SUPERVISOR_MAX_TOKENS,
    system: SUPERVISOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(situation) }],
  };
}

/** プロバイダへ送るヘッダを組み立てる */
export function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

/**
 * 既定の輸送層。notifier.ts の sendSlackOnce と同じ形をとるが、2点だけ異なる:
 * 応答本文を返すこと、非2xx でも reject しないこと（分岐は呼び出し側が持つ）。
 */
export function postJsonHttps(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const isHttps = target.protocol === "https:";
    const requestFn = isHttps ? https.request : http.request;
    const defaultPort = isHttps ? 443 : 80;

    const req = requestFn(
      {
        hostname: target.hostname,
        port: target.port ? parseInt(target.port, 10) : defaultPort,
        path: target.pathname,
        method: "POST",
        headers,
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk: string) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode ?? 0, body: responseBody });
        });
      },
    );

    // 応答が返らないプロバイダで完了ループごと停止しないよう、必ず上限を設ける
    req.setTimeout(supervisorPolicy.timeoutMs, () => {
      req.destroy(new Error(`supervisor request timed out after ${supervisorPolicy.timeoutMs}ms`));
    });

    req.on("error", (err) => reject(err));
    req.write(JSON.stringify(body));
    req.end();
  });
}

/** 応答本文から指示文を取り出す。取り出せなければ null */
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
function extractInstruction(responseBody: string): string | null {
  let parsed: { content?: Array<{ text?: string }> };
  try {
    parsed = JSON.parse(responseBody) as { content?: Array<{ text?: string }> };
  } catch {
    return null;
  }
  const text = parsed.content?.[0]?.text;
  return typeof text === "string" && text.trim().length > 0 ? text : null;
}

/** 縮退を観測可能にしつつ定型文を返す — 失敗を黙って飲み込まない */
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
function degradeToTemplate(
  request: SupervisorRequest,
  failureKind: string,
  detail: string,
): string {
  process.stderr.write(
    `[conver] supervisor 縮退 (${failureKind}): ${detail} — ` +
      `${request.ticketId} ${request.command} attempt ${request.attempt}\n`,
  );
  return COMPLETION_TEMPLATE;
}

/**
 * 停滞したコマンドへ送る継続指示を生成する。
 * この関数は決して throw せず、失敗時は COMPLETION_TEMPLATE を返す。
 */
export async function generateCompletionMessage(
  request: SupervisorRequest,
  config: SessionConfig,
  postJson: HttpPostJson = postJsonHttps,
): Promise<string> {
  try {
    const response = await postJson(
      buildMessagesUrl(config.baseUrl),
      buildRequestBody(request, config.model),
      buildHeaders(config.apiKey),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return degradeToTemplate(request, "non-2xx", `status ${response.statusCode}`);
    }

    return (
      extractInstruction(response.body) ??
      degradeToTemplate(request, "empty content", "no usable instruction text")
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return degradeToTemplate(request, "transport error", detail);
  }
}
