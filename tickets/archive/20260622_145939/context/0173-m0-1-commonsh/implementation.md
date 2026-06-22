# チケット #173 実装サマリー

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `mycc/common.sh` | 新規作成 | 4つの色付き出力関数 (`info`, `warn`, `error`, `die`) + `set -euo pipefail` |
| `mycc/tests/test-common.sh` | 新規作成 | 9テストケースのテストランナー |

## 実装内容

### `mycc/common.sh`
- `set -euo pipefail` を冒頭に宣言（全スクリプト共通の堅牢性基底）
- `# shellcheck shell=sh` 準拠（POSIX sh 互換、bashism 回避）
- 4つの ANSI カラーコードを名前付き定数で定義（`COLOR_GREEN`, `COLOR_YELLOW`, `COLOR_RED`, `COLOR_RESET`）
- `info()` — 緑色 `[INFO]` プレフィックス付きで標準出力
- `warn()` — 黄色 `[WARN]` プレフィックス付きで標準出力
- `error()` — 赤色 `[ERROR]` プレフィックス付きで標準出力
- `die()` — `error()` 内部呼び出し + `exit 1`

### `mycc/tests/test-common.sh`
- 全テストをサブシェル `(source common.sh && <func>)` で実行（テスト間分離）
- 9件のテスト項目：info/warn/error/die の出力確認、終了コード検証、空文字列・複数行エッジケース、関数定義確認

## テスト結果
- 9/9 passed, 0 failed
- 品質チェック: 0 issues

## Boy Scout 改善
- 新規コードのため既存コード改善はなし
- 翻訳可能性基準を満たしていることを確認（関数名＝動詞句、一関数一責務、定数化）
