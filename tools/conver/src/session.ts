// [::STUB::] P3-1: ACPセッション管理の本実装は P3-1 で行う

import { CommandTimeoutError } from "./error.js";

export interface AcpSession {
  sessionId: string;
}

export function spawnAgent(apiKey: string, model: string): Promise<void> {
  return Promise.resolve();
}

export function createSession(): Promise<AcpSession> {
  return Promise.resolve({ sessionId: "stub-session" });
}

export function runCommand(session: AcpSession, command: string): Promise<string> {
  return Promise.resolve("");
}

export function disposeSession(session: AcpSession): Promise<void> {
  return Promise.resolve();
}
