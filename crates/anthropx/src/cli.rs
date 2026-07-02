//! # CLI 引数解析
//!
//! `clap` を使用したコマンドライン引数の解析。
//! 現状は `-c <config.toml>` のみを受け付ける。

use clap::Parser;
use std::path::PathBuf;

/// anthropx: Anthropic compatible API proxy server
#[derive(Parser, Debug)]
#[command(name = "anthropx", version, about)]
pub struct Cli {
    /// Path to TOML configuration file
    #[arg(short = 'c', long = "config", required = true)]
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

    /// `-c <path>` が正しくパースされること。
    #[test]
    fn parse_args_with_config() {
        let cli = Cli::try_parse_from(["anthropx", "-c", "/etc/anthropx/config.toml"])
            .expect("should parse with -c");
        assert_eq!(cli.config.to_str().unwrap(), "/etc/anthropx/config.toml");
    }

    /// `-c` なしではエラーになること。
    #[test]
    fn parse_args_missing_config() {
        let result = Cli::try_parse_from(["anthropx"]);
        assert!(result.is_err());
    }
}
