// [::STUB::] P0-3: CLI引数パースの本実装は P0-3 で行う

export interface CliOptions {
  model: string;
  ticketsPath: string;
  maxCount: number;
  resolveEvery: number;
  pushEnabled: boolean;
  timeoutMs: number;
}

export function parseCliOptions(argv: string[]): CliOptions {
  return {
    model: "flash",
    ticketsPath: "Tickets.json",
    maxCount: 1,
    resolveEvery: 0,
    pushEnabled: false,
    timeoutMs: 300000,
  };
}
