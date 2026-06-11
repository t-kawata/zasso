//! Lindera 形態素解析エンジンの初期化
//!
//! embedded IPADIC 辞書を使用して Tokenizer を生成する。
//! 移植元: ~/shyme/mycute/src/tools/lindera_util.rs（完全移植）

use anyhow::{anyhow, Result};
use lindera::dictionary::load_dictionary;
use lindera::mode::Mode;
use lindera::segmenter::Segmenter;
use lindera::tokenizer::Tokenizer;

/// embedded IPADIC 辞書で初期化された Tokenizer を取得する。
pub fn get_tokenizer() -> Result<Tokenizer> {
    let dictionary = load_dictionary("embedded://ipadic")
        .map_err(|e| anyhow!("Failed to load IPADIC: {}", e))?;
    let segmenter = Segmenter::new(Mode::Normal, dictionary, None);
    let tokenizer = Tokenizer::new(segmenter);
    Ok(tokenizer)
}
