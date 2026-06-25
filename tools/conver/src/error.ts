// CommandTimeoutError: ACPコマンドがタイムアウトしたことを表すエラー型
export class CommandTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandTimeoutError";
  }
}
