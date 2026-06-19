//! # CLI 引数解析
//!
//! `clap` を使用したコマンドライン引数の解析。
//! 現状は `-t <config.toml>` のみを受け付ける。

use clap::Parser;
use std::path::PathBuf;

/// anthropx: Anthropic compatible API proxy server
#[derive(Parser, Debug)]
#[command(name = "anthropx", version, about)]
pub struct Cli {
    /// Path to TOML configuration file
    #[arg(short = 't', long = "config", required = true)]
    pub config: PathBuf,
}

/// コマンドライン引数をパースする。
///
/// エラー時は clap が自動的にヘルプを表示してプロセスを終了する。
pub fn parse_args() -> Cli {
    Cli::parse()
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// `-t <path>` が正しくパースされること。
    #[test]
    fn parse_args_with_config() {
        let cli = Cli::try_parse_from(&["anthropx", "-t", "/etc/anthropx/config.toml"])
            .expect("should parse with -t");
        assert_eq!(cli.config.to_str().unwrap(), "/etc/anthropx/config.toml");
    }

    /// `-t` なしではエラーになること。
    #[test]
    fn parse_args_missing_config() {
        let result = Cli::try_parse_from(&["anthropx"]);
        assert!(result.is_err());
    }
}
