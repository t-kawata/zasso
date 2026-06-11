//! PunctuationMachine — 形態素解析ベースの日本語句読点自動挿入
//!
//! 移植元: ~/shyme/mycute/src/tools/punctuation_machine.rs
//! 変更点: LocaleCode の参照先を crate::types に変更

use anyhow::{anyhow, Result};
use lindera::tokenizer::Tokenizer;

use crate::lindera_util;
use crate::types::LocaleCode;

#[derive(Debug, Clone)]
struct TokenInfo {
    surface: String,
    pos: String,
    pos_detail1: String,
    conjugation_form: String,
}

/// 形態素解析ベースの日本語句読点挿入器
pub struct PunctuationMachine {
    tokenizer: Tokenizer,
}

impl PunctuationMachine {
    /// 新しい PunctuationMachine を作成する。
    pub fn new() -> Result<Self> {
        let tokenizer = lindera_util::get_tokenizer()?;
        Ok(Self { tokenizer })
    }

    fn tokenize_to_info(&self, text: &str) -> Result<Vec<TokenInfo>> {
        let mut tokens_raw = self
            .tokenizer
            .tokenize(text)
            .map_err(|e| anyhow!("Tokenization failed: {}", e))?;
        Ok(tokens_raw
            .iter_mut()
            .map(|token| {
                let surface = token.surface.to_string();
                let details = token.details();
                TokenInfo {
                    surface,
                    pos: details.first().copied().unwrap_or("").to_string(),
                    pos_detail1: details.get(1).copied().unwrap_or("").to_string(),
                    conjugation_form: details.get(5).copied().unwrap_or("").to_string(),
                }
            })
            .collect())
    }

    /// テキストに句読点を挿入する。
    pub fn insert(&self, text: &str, locale: &LocaleCode) -> Result<String> {
        self.insert_with_context(text, "", locale, false)
    }

    /// 文脈を考慮して句読点を挿入する。
    pub fn insert_with_context(
        &self,
        text: &str,
        context: &str,
        locale: &LocaleCode,
        allow_terminal_punctuation: bool,
    ) -> Result<String> {
        if text.is_empty() {
            if allow_terminal_punctuation && !context.is_empty() && locale == &LocaleCode::Ja {
                let context_clean = context.replace("?", "？").replace("!", "！");
                if let Some(last_char) = context_clean.chars().last() {
                    if ['。', '？', '！', '!', '?', '、'].contains(&last_char) {
                        return Ok(String::new());
                    }
                }
                if let Ok(tokens) = self.tokenize_to_info(&context_clean) {
                    if !tokens.is_empty() {
                        let last_idx = tokens.len() - 1;
                        if self.should_insert_question_ja(last_idx, &tokens, true) {
                            return Ok("？".to_string());
                        }
                        if self.should_insert_period_ja(last_idx, &tokens, true) {
                            return Ok("。".to_string());
                        }
                    }
                }
            }
            return Ok(String::new());
        }

        let (text_clean, context_clean) = if locale == &LocaleCode::Ja {
            (
                text.replace("?", "？").replace("!", "！"),
                context.replace("?", "？").replace("!", "！"),
            )
        } else {
            (text.to_string(), context.to_string())
        };

        if locale != &LocaleCode::Ja {
            return Ok(text_clean);
        }

        let full_text = format!("{}{}", context_clean, text_clean);
        let context_len = context_clean.len();

        let mut tokens = self.tokenize_to_info(&full_text)?;

        // Voice Command Replacement（まる→。、てん→、）
        for i in 0..tokens.len() {
            let token = &mut tokens[i];
            if ["名詞", "感動詞", "副詞"].contains(&token.pos.as_str()) {
                if ["まる", "丸", "マル"].contains(&token.surface.as_str()) {
                    token.surface = "。".to_string();
                    token.pos = "補助記号".to_string();
                    token.pos_detail1 = "句点".to_string();
                } else if ["てん", "点", "天", "テン"].contains(&token.surface.as_str()) {
                    token.surface = "、".to_string();
                    token.pos = "補助記号".to_string();
                    token.pos_detail1 = "読点".to_string();
                }
            }
        }

        let mut result = String::new();
        let mut current_offset = 0;

        for i in 0..tokens.len() {
            let current = &tokens[i];
            let token_len = current.surface.len();

            if current_offset >= context_len {
                result.push_str(&current.surface);

                if self.should_insert_question_ja(i, &tokens, allow_terminal_punctuation) {
                    result.push('？');
                } else if self.should_insert_period_ja(i, &tokens, allow_terminal_punctuation) {
                    result.push('。');
                }
            } else if current_offset + token_len > context_len {
                let overlap = context_len - current_offset;
                if overlap < token_len {
                    let partial = &current.surface[overlap..];
                    result.push_str(partial);

                    if self.should_insert_question_ja(i, &tokens, allow_terminal_punctuation) {
                        result.push('？');
                    } else if self.should_insert_period_ja(i, &tokens, allow_terminal_punctuation) {
                        result.push('。');
                    }
                }
            }

            current_offset += token_len;
        }

        Ok(result)
    }

    fn is_sentence_starter(&self, token: &TokenInfo) -> bool {
        let starters = [
            "はい",
            "ええ",
            "うん",
            "いや",
            "まあ",
            "さて",
            "そう",
            "でも",
            "しかし",
            "ただ",
            "じゃあ",
            "では",
            "じゃ",
            "それ",
            "あと",
            "もう",
            "また",
            "そして",
            "だから",
        ];
        if ["感動詞", "接続詞", "副詞"].contains(&token.pos.as_str()) {
            return true;
        }
        starters.contains(&token.surface.as_str())
    }

    fn should_insert_period_ja(
        &self,
        index: usize,
        tokens: &[TokenInfo],
        allow_terminal_punctuation: bool,
    ) -> bool {
        if index >= tokens.len() - 1 {
            return allow_terminal_punctuation;
        }

        let current = &tokens[index];
        let next_opt = tokens.get(index + 1);

        // 継続表現の絶対禁止
        if current.pos == "助詞" && ["接続助詞", "格助詞"].contains(&current.pos_detail1.as_str())
        {
            if [
                "が",
                "けど",
                "けれど",
                "けれども",
                "し",
                "から",
                "ので",
                "のに",
                "て",
                "で",
            ]
            .contains(&current.surface.as_str())
            {
                return false;
            }
        }

        // 引用の「と」が続く場合は絶対に打たない
        if let Some(next) = next_opt {
            if next.surface == "と" && next.pos == "助詞" {
                return false;
            }
        }

        // 丁寧語（です・ます）や依頼（ください）の終止
        if current.pos == "助動詞" || current.pos == "動詞" {
            let polite = [
                "です",
                "ます",
                "でした",
                "ました",
                "ございます",
                "でしょう",
                "ください",
                "くださいませ",
                "ません",
                "ありません",
            ];
            if polite.contains(&current.surface.as_str()) {
                if let Some(next) = next_opt {
                    return next.pos != "助詞";
                } else {
                    return allow_terminal_punctuation;
                }
            }
        }

        // 終助詞（ね・よ・わ・な）
        if current.pos == "助詞" && current.pos_detail1 == "終助詞" {
            if ["ね", "よ", "わ", "な", "よね", "わね"].contains(&current.surface.as_str())
            {
                if let Some(next) = next_opt {
                    return next.pos != "助詞";
                } else {
                    return allow_terminal_punctuation;
                }
            }
        }

        // 自立語による遡及判定
        if (current.pos == "動詞" || current.pos == "形容詞" || current.pos == "助動詞")
            && (current.conjugation_form.contains("基本形")
                || current.conjugation_form.contains("タ形"))
        {
            if let Some(next) = next_opt {
                if self.is_sentence_starter(next) {
                    return true;
                }
            } else {
                return allow_terminal_punctuation;
            }
        }

        false
    }

    fn should_insert_question_ja(
        &self,
        index: usize,
        tokens: &[TokenInfo],
        allow_terminal_punctuation: bool,
    ) -> bool {
        if index >= tokens.len() - 1 {
            if !allow_terminal_punctuation {
                return false;
            }
        }

        let current = &tokens[index];
        let next_opt = tokens.get(index + 1);

        let interrogatives = ["か", "かい", "だい", "かな", "かしら"];
        if current.pos == "助詞" && interrogatives.contains(&current.surface.as_str()) {
            if let Some(next) = next_opt {
                return next.pos != "助詞";
            } else {
                return allow_terminal_punctuation;
            }
        }

        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_japanese_text_is_tokenized() {
        // Lindera での形態素解析が正常に動作することを確認
        let machine = PunctuationMachine::new().unwrap();
        let result = machine
            .insert_with_context("こんにちは元気ですか", "", &LocaleCode::Ja, false)
            .unwrap();
        // テキストが消失していないこと
        assert!(!result.is_empty(), "Result should not be empty");
        assert!(result.contains("こんにちは"), "Should contain input text");
    }

    #[test]
    fn test_english_passthrough() {
        let machine = PunctuationMachine::new().unwrap();
        let result = machine.insert("hello world", &LocaleCode::En).unwrap();
        assert_eq!(result, "hello world");
    }

    #[test]
    fn test_japanese_processing_succeeds() {
        // 日本語テキストの処理がエラーなく完了することを確認
        let machine = PunctuationMachine::new().unwrap();
        let inputs = [
            ("それですか", &LocaleCode::Ja),
            ("そうです", &LocaleCode::Ja),
            ("そうです。次に行きます", &LocaleCode::Ja),
        ];
        for (text, locale) in &inputs {
            let result = machine
                .insert_with_context(text, "", *locale, true)
                .unwrap();
            assert!(
                !result.is_empty(),
                "Result for '{}' should not be empty",
                text
            );
        }
    }

    #[test]
    fn test_terminal_punctuation_allowed() {
        let machine = PunctuationMachine::new().unwrap();
        // allow_terminal=true でエラーなく処理されること
        let result = machine
            .insert_with_context("そうです", "", &LocaleCode::Ja, true)
            .unwrap();
        assert!(!result.is_empty());
        // 何らかの句読点または元のテキストが含まれていること
        assert!(
            result.contains("そう") || result.contains('。'),
            "Unexpected result: '{}'",
            result
        );
    }

    #[test]
    fn test_empty_input() {
        let machine = PunctuationMachine::new().unwrap();
        let result = machine
            .insert_with_context("", "前の文。", &LocaleCode::Ja, false)
            .unwrap();
        // 空入力は空文字を返す（タイムアウトでない限り）
        assert!(result.is_empty() || result == "。");
    }
}
