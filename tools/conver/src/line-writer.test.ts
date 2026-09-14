// line-writer.test.ts — MessageLineWriter のユニットテスト
//
// テスト方針:
//   ACP の agent_message_chunk はトークン単位の差分で届く。そのまま書くと
//   メッセージが横に連結して読めなくなるため、MessageLineWriter が保証すべき
//   境界（行末 / 閉じ括弧の取り込み / flush / 保留上限）をここで固定する。
//   行の書き出しは「次チャンクで閉じ括弧が続くか」を確かめてから行うため、
//   1チャンク分だけ遅れる。テストはその遅延を含めて期待値を書く。
//
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_PENDING_CHARS, MessageLineWriter } from "./line-writer.js";

/** 書き出された行を記録するライターを生成する */
function createRecordingWriter() {
  const lines: string[] = [];
  const writer = new MessageLineWriter((line: string) => {
    lines.push(line);
  });
  return { writer, lines };
}

describe("MessageLineWriter", () => {
  it("行末に達しないチャンクは保留され、flush まで出力されない", () => {
    const { writer, lines } = createRecordingWriter();

    writer.push("実装");
    writer.push("中です");

    assert.deepStrictEqual(lines, []);
    writer.flush();
    assert.deepStrictEqual(lines, ["実装中です\n"]);
  });

  it("行末の続きが閉じ括弧でないと分かった時点で行を出力する", () => {
    const { writer, lines } = createRecordingWriter();

    writer.push("完了しました。");
    assert.deepStrictEqual(lines, []);

    writer.push("次の作業");
    assert.deepStrictEqual(lines, ["完了しました。\n"]);

    writer.flush();
    assert.deepStrictEqual(lines, ["完了しました。\n", "次の作業\n"]);
  });

  it("1チャンクに複数文が含まれる場合は文ごとに改行される", () => {
    const { writer, lines } = createRecordingWriter();

    writer.push("完了しました。次は実装です。残り");

    assert.deepStrictEqual(lines, ["完了しました。\n", "次は実装です。\n"]);
    writer.flush();
    assert.deepStrictEqual(lines, [
      "完了しました。\n",
      "次は実装です。\n",
      "残り\n",
    ]);
  });

  it("文末記号の後に届いたチャンクを前の行に連結しない", () => {
    const { writer, lines } = createRecordingWriter();

    writer.push("完了。");
    writer.push("次の作業");

    assert.deepStrictEqual(lines, ["完了。\n"]);
    writer.flush();
    assert.deepStrictEqual(lines, ["完了。\n", "次の作業\n"]);
  });

  it("チャンク内の改行を行末として扱い、空行を足さない", () => {
    const { writer, lines } = createRecordingWriter();

    writer.push("見出し\n本文");
    assert.deepStrictEqual(lines, ["見出し\n"]);

    writer.flush();
    assert.deepStrictEqual(lines, ["見出し\n", "本文\n"]);
  });

  it("感嘆符・疑問符を行末として扱い、閉じ括弧をその行に取り込む", () => {
    const { writer, lines } = createRecordingWriter();

    writer.push("本当？」");
    writer.push("終わり。】");
    writer.push("やった！");
    writer.flush();

    assert.deepStrictEqual(lines, ["本当？」\n", "終わり。】\n", "やった！\n"]);
  });

  it("単独の閉じ括弧は行末にしない", () => {
    const { writer, lines } = createRecordingWriter();

    writer.push("終わり】");

    assert.deepStrictEqual(lines, []);
    writer.flush();
    assert.deepStrictEqual(lines, ["終わり】\n"]);
  });

  it("チャンクをまたいで届いた閉じ括弧を前の行に取り込む", () => {
    const { writer, lines } = createRecordingWriter();

    writer.push("本当？");
    writer.push("」");
    writer.flush();

    assert.deepStrictEqual(lines, ["本当？」\n"]);
  });

  it("空文字の push は出力も保留も変えない", () => {
    const { writer, lines } = createRecordingWriter();

    writer.push("");
    writer.push("途中");

    assert.deepStrictEqual(lines, []);
    writer.flush();
    assert.deepStrictEqual(lines, ["途中\n"]);
  });

  it("flush は書き出し待ちが無ければ何も出力しない", () => {
    const { writer, lines } = createRecordingWriter();

    writer.push("完了。");
    writer.flush();
    writer.flush();

    assert.deepStrictEqual(lines, ["完了。\n"]);
  });

  it("行末が来ないまま上限に達したら行として確定する", () => {
    const { writer, lines } = createRecordingWriter();
    const longText = "あ".repeat(MAX_PENDING_CHARS);

    writer.push(longText);

    assert.deepStrictEqual(lines, [`${longText}\n`]);
    writer.flush();
    assert.deepStrictEqual(lines, [`${longText}\n`]);
  });

  it("上限未満の保留は確定しない", () => {
    const { writer, lines } = createRecordingWriter();

    writer.push("あ".repeat(MAX_PENDING_CHARS - 1));

    assert.deepStrictEqual(lines, []);
  });
});
