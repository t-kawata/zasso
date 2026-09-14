// completion-policy.ts — コマンド完了ループの共通方針
//
// 責務:
//   ループ側 (runner.ts) と supervisor 側 (supervisor.ts) が共有する定数を
//   1箇所に置く。runner.ts は supervisor.ts を import するため、定数を
//   supervisor.ts 側に置くと循環参照になる。また runner.test.ts が
//   ./supervisor.js をモックした際に定数までモックされると、
//   「実物の上限値に対して runCommand の呼び出し回数を主張する」という
//   検証の意味が失われる。この分離はその両方を同時に解く。
//
// Layer 0 純粋定数（副作用なし・依存なし）

/** status が動かないときに送る定型の完了指示。1〜2回目はこの文面をそのまま送る */
export const COMPLETION_TEMPLATE =
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
  "Detected that the status indicates an incomplete state. Design and plan with " +
  "neither excess nor deficiency; what is necessary and sufficient must be done. " +
  "The information required to complete the task should already exist. " +
  "Exercise sound judgment and bring it to completion.";

/**
 * 完了ループの方針。テストから上限と切り詰め幅を差し替えられるよう mutable に保つ
 * （retryPolicy と同じ流儀）。
 */
export const completionPolicy = {
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
  /** 定型文をそのまま送る回数。3回目以降は supervisor がメッセージを決める */
  templateAttempts: 2,
  /** 1フェーズあたりの再送上限。到達したら throw せず既存の wave retry に委ねる */
  maxAttempts: 6,
  /** エージェント最終発話から supervisor に渡す末尾の文字数 */
  agentMessageTailChars: 1500,
  /** notes から supervisor に渡す末尾の文字数 */
  notesTailChars: 800,
  /** acceptanceCriteria から supervisor に渡す先頭の文字数 */
  acceptanceCriteriaChars: 512,
  /** scope から supervisor に渡す先頭の件数 */
  scopeItems: 3,
};
