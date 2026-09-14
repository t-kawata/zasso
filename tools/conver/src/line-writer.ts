// line-writer.ts — agent 出力を「1メッセージ1行」に組み立てるライター
//
// ACP の agent_message_chunk はトークン単位の差分で届くため、そのまま stdout に
// 書くとメッセージが横に連結して読めなくなる。行末（文末記号または改行）までを
// 1行として書き出し、端数は次のチャンクへ持ち越す。書き出す行は必ず改行で
// 終わるため、メッセージの連結も文の途中での改行も起こらない。

// 行末 = 文末記号（または改行）と、それに続く閉じ括弧の連なり。
// 「〜？」の「」」を次行の先頭にしないため、閉じ括弧は同じ行に取り込む。
const LINE_END = /[。．！？\n][）」】]*/g;

// 前行の末尾に付く閉じ括弧はチャンクをまたいで届くことがあるため、
// 続きが閉じ括弧かどうかを確かめてから行を書き出す。
const LEADING_CLOSERS = /^[）」】]*/;

// 行末が来ないまま保留が肥大化した場合に、行として確定する上限（文字数）。
// 行末を持たないテキスト（英語のみの応答やコード片）でも、出力が止まったまま
// にならず、保留が増え続けないことを保証する。
export const MAX_PENDING_CHARS = 4096;

/** 確定した1行を書き出す先 */
export type LineSink = (line: string) => void;

/** 差分チャンクを1メッセージ1行に組み立てるライター */
export class MessageLineWriter {
  /** まだ行末に達していない端数 */
  #pending = "";

  /** 行末まで確定したが、続く閉じ括弧を待っている行 */
  #completed: string | null = null;

  readonly #sink: LineSink;

  constructor(sink: LineSink) {
    this.#sink = sink;
  }

  /** 差分チャンクを受け取り、行末に達した行を書き出す */
  push(text: string): void {
    this.#pending += text;
    this.#extractCompletedLines();
    this.#releaseCompletedLine();

    if (this.#pending.length >= MAX_PENDING_CHARS) {
      this.flush();
    }
  }

  /** 書き出し待ちの行と保留中の端数をすべて書き出す（stop / 中断時に呼ぶ） */
  flush(): void {
    if (this.#completed !== null) {
      this.#sink(terminate(this.#completed));
      this.#completed = null;
    }
    if (this.#pending.length > 0) {
      this.#sink(terminate(this.#pending));
      this.#pending = "";
    }
  }

  /** 行末に達した行を取り出す。後続の行が取れた時点で、先行する行は確定して書き出す */
  #extractCompletedLines(): void {
    let consumed = 0;
    for (const lineEnd of this.#pending.matchAll(LINE_END)) {
      const end = lineEnd.index + lineEnd[0].length;
      if (this.#completed !== null) {
        this.#sink(terminate(this.#completed));
      }
      this.#completed = this.#pending.slice(consumed, end);
      consumed = end;
    }
    this.#pending = this.#pending.slice(consumed);
  }

  /**
   * 書き出し待ちの行を確定させる。
   * 続きが閉じ括弧ならその行に取り込み、閉じ括弧以外の文字が届いた時点で
   * 行末が確定したと判断して書き出す。端数が空の間は次のチャンクを待つ。
   */
  #releaseCompletedLine(): void {
    if (this.#completed === null) return;

    const closers = LEADING_CLOSERS.exec(this.#pending)?.[0] ?? "";
    if (closers.length > 0) {
      this.#completed += closers;
      this.#pending = this.#pending.slice(closers.length);
    }
    if (this.#pending.length === 0) return;

    this.#sink(terminate(this.#completed));
    this.#completed = null;
  }
}

/** 行末が改行でなければ改行を足す（改行済みの行に空行を足さない） */
function terminate(line: string): string {
  return line.endsWith("\n") ? line : `${line}\n`;
}
