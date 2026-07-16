#!/usr/bin/env node
/**
 * validate-question-format.js <question-text>
 *
 * grill 質問の形式を検証する。AIはユーザーに質問を提示する前に
 * 必ずこのスクリプトを通過しなければならない。
 *
 * 検証ルール:
 *   0. 質問ID（Q<番号>）が含まれている
 *   1. 提案の理由・背景・トレードオフが含まれている
 *   2. Yes/No または ABC 選択肢で回答可能である
 *   3. 自由記述を求める表現が含まれていない
 *   4. 選択肢は改行で区切られたリスト形式であり、その後ろにAIが1つを選んだおすすめ＋理由が続く
 *
 * 使用方法:
 *   node validate-question-format.js "質問文..."
 *
 * 終了コード:
 *   0 — 形式適合
 *   1 — 形式違反（エラーメッセージ付き）
 */
const question = process.argv[2];
if (!question) {
  console.error("Usage: validate-question-format.js <question-text>");
  process.exit(1);
}

const errors = [];

// ── ルール0: 質問ID（Q<番号>）が含まれている ──

const hasQuestionId = /\bQ\d+\b/.test(question);
if (!hasQuestionId) {
  errors.push(
    "[MISSING_QUESTION_ID] Question does not contain an ID in \"Q<number>\" format.\n" +
    "  Fix: Prefix the question with a unique ID like \"Q1\", \"Q2\", ..."
  );
}

// ── ルール1: 理由・背景・トレードオフが含まれている ──

const reasoningPatterns = [
  /理由/i, /ため/i, /だから/i, /なぜ/i, /なので/i,
  /提案/i, /比較/i, /メリット/, /デメリット/,
  /trade.?off/i, /because/i, /reason/i, /propose/i,
  /advantage/i, /disadvantage/i, /alternative/i,
  /一方/i, /対して/i, /優れる/i, /劣る/i,
  /コスト/i, /影響/i, /懸念/i,
  /考慮/i, /検討/i, /観点/i,
  /スケーラビリティ/i, /保守性/i, /拡張性/i,
];

const hasReasoning = reasoningPatterns.some((p) => p.test(question));
if (!hasReasoning) {
  errors.push(
    "[MISSING_REASONING] Question does not include rationale, context, or trade-off analysis.\n" +
    "  Fix: Explain why the proposal is made and include comparison with alternatives."
  );
}

// ── ルール2: Yes/No または ABC 選択肢で回答可能 ──

const choicePatterns = [
  /[\(（]?\s*A\s*[\)）]/, /[\(（]?\s*B\s*[\)）]/, /[\(（]?\s*C\s*[\)）]/,
  /\bYes\b/i, /\bNo\b/i,
  /賛成/i, /反対/i, /採用/i, /却下/i,
];

const hasChoice = choicePatterns.some((p) => p.test(question));
if (!hasChoice) {
  errors.push(
    "[MISSING_CHOICES] Question does not include Yes/No or A/B/C choices.\n" +
    "  Fix: Format the question so the user can pick from discrete options."
  );
}

// ── ルール3: 自由記述を求めていない ──

const openEndedPatterns = [
  /どう思いますか/, /どう考えますか/, /どうしますか/, /いかがでしょうか/,
  /自由にお書きください/, /任意/, /教えてください/,
  /what.?do.?you.?think/i, /your.?thoughts/i, /describe/i, /explain/i,
  /\[自由記述\]/, /\[フリーテキスト\]/,
];

// 「どうしますか」は文脈による — ABC選択肢があれば許可
const hasOpenEnded = openEndedPatterns.some((p) => p.test(question));
if (hasOpenEnded && !hasChoice) {
  errors.push(
    "[OPEN_ENDED_QUESTION] Question asks for free-form user input.\n" +
    "  Fix: Restrict to Yes/No or A/B/C answerable format."
  );
}

// ── ルール4: 選択肢は改行リスト形式 ＋ 列挙後にAIのおすすめ＋理由が必要 ──

const lines = question.split("\n");
let inlineChoicesFound = false;
let lastChoiceLineIndex = -1;
const choiceLabelPattern = /^\s*[\(（]?\s*[ABC]\s*[\)）]/;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // 1行に複数の A) B) C) があるか → インライン形式（違反）
  const matches = line.match(/[\(（]?\s*[ABC]\s*[\)）]/g);
  if (matches && matches.length >= 2) {
    inlineChoicesFound = true;
  }
  if (choiceLabelPattern.test(line)) {
    lastChoiceLineIndex = i;
  }
}

if (inlineChoicesFound) {
  errors.push(
    "[INLINE_CHOICES] Multiple choices appear on the same line.\n" +
    "  Fix: Place each choice on its own line as a list.\n" +
    "  Correct: A) Choice 1\n      B) Choice 2\n  Wrong: A) Choice 1  B) Choice 2"
  );
}

// 選択肢を列挙した後、AIが1つを選んで理由を述べているか
if (lastChoiceLineIndex >= 0) {
  const afterChoices = lines.slice(lastChoiceLineIndex + 1).join("\n");
  const recommendationPatterns = [
    /おすすめ/, /推奨/, /推す/, /推薦/,
    /recommend/i, /suggest/i, /propose/i,
    /私は\s*[A-C]/, /[A-C]\s*を/, /option\s*[A-C]/i,
  ];
  const hasRecommendation = recommendationPatterns.some((p) => p.test(afterChoices));
  if (!hasRecommendation) {
    errors.push(
      "[MISSING_RECOMMENDATION] After listing choices, the AI's recommendation with reasoning is not stated.\n" +
      "  Fix: Append \"I recommend A because ...\" after the choices.\n" +
      "  Correct: ... C) Both\n\n     I recommend A (JWT) because ...\n" +
      "  Wrong: Listing choices without a recommendation"
    );
  }
}

// ── 結果出力 ──

if (errors.length > 0) {
  console.log(JSON.stringify({ valid: false, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ valid: true }));
