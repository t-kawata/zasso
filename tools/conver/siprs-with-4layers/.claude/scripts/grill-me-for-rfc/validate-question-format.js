#!/usr/bin/env node
/**
 * validate-question-format.js <question-text>
 *
 * Validates the format of grill questions. The AI must pass through this script
 * before presenting any question to the user.
 *
 * Validation rules:
 *   0. Question ID (Q<number>) is present
 *   1. Proposal rationale, context, and trade-offs are included
 *   2. Answerable via Yes/No or A/B/C choices
 *   3. No free-form input solicitations
 *   4. Choices are in newline-separated list format, followed by the AI's recommendation with reasoning
 *
 * Usage:
 *   node validate-question-format.js "question text..."
 *
 * Exit codes:
 *   0 — Format valid
 *   1 — Format violation (with error message)
 */
const question = process.argv[2];
if (!question) {
  console.error("Usage: validate-question-format.js <question-text>");
  process.exit(1);
}

const errors = [];

// ── Rule 0: Question ID (Q<number>) is present ──

const hasQuestionId = /\bQ\d+\b/.test(question);
if (!hasQuestionId) {
  errors.push(
    "[MISSING_QUESTION_ID] Question does not contain an ID in \"Q<number>\" format.\n" +
    "  Fix: Prefix the question with a unique ID like \"Q1\", \"Q2\", ..."
  );
}

// ── Rule 1: Rationale, context, and trade-offs are included ──

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

// ── Rule 2: Answerable via Yes/No or A/B/C choices ──

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

// ── Rule 3: No free-form input solicitations ──

const openEndedPatterns = [
  /どう思いますか/, /どう考えますか/, /どうしますか/, /いかがでしょうか/,
  /自由にお書きください/, /任意/, /教えてください/,
  /what.?do.?you.?think/i, /your.?thoughts/i, /describe/i, /explain/i,
  /\[自由記述\]/, /\[フリーテキスト\]/,
];

// "dou shimasu ka" depends on context — allowed if ABC choices exist
const hasOpenEnded = openEndedPatterns.some((p) => p.test(question));
if (hasOpenEnded && !hasChoice) {
  errors.push(
    "[OPEN_ENDED_QUESTION] Question asks for free-form user input.\n" +
    "  Fix: Restrict to Yes/No or A/B/C answerable format."
  );
}

// ── Rule 4: Choices in newline list format + AI recommendation with reasoning after listing ──

const lines = question.split("\n");
let inlineChoicesFound = false;
let lastChoiceLineIndex = -1;
const choiceLabelPattern = /^\s*[\(（]?\s*[ABC]\s*[\)）]/;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Multiple A) B) C) on one line → inline format (violation)
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

// Whether the AI picks one and states reasoning after listing choices
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

// ── Output result ──

if (errors.length > 0) {
  console.log(JSON.stringify({ valid: false, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ valid: true }));
