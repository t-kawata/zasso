// [::STUB::] P2-1: Slack通知の本実装は P2-1 で行う

export interface ErrorContext {
  ticketId: string;
  message: string;
  phase: string;
}

export function sendSlackError(context: ErrorContext): Promise<void> {
  return Promise.resolve();
}
