---
ticket_id: 174
title: common.sh — 環境チェック関数群
slug: commonsh
status: reviewed
created_at: 2026-06-21
updated_at: 2026-06-21
project: mycc
dependencies: {"predecessor": ["M0-1: common.sh — 色付き出力ヘルパー関数 (ticket 173)"], "successor": ["M1-1: doctor.sh — 環境診断スクリプト", "M1-2: setup.sh — 環境構築スクリプト"]}
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0174-commonsh/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0174-commonsh/review.md
---
# M0-2: common.sh — 環境チェック関数群

## Summary

`common.sh` に環境前提条件を検証する6つの関数（`check_apple_silicon`、`check_brew`、`check_tool`、`check_claude`、`check_model`、`check_all`）を追加する。各関数は「何が不足しているか」「どうインストールするか」を具体的な手順とともに表示する責務を持ち、自動インストールは一切行わない（Q12）。

これらの関数は `doctor.sh`（全前提条件チェック）と `setup.sh`（実行者前提条件チェック＋継続）の両方から使用される。

## Background

M0-1 で `common.sh` に色付き出力ヘルパー関数（`info`、`warn`、`error`、`die`）が追加された。本チケット M0-2 は同一ファイルに環境チェック関数群を追加する。これにより `doctor.sh` と `setup.sh` は `source common.sh` するだけで全前提条件の検証が可能となる。

**参照:**
- RFC.md §1. common.sh — 共通チェック関数（関数一覧と実装例）
- Tickets.md §M0-2: common.sh — 環境チェック関数群（詳細仕様）
- Q4: Homebrew 不在→エラー終了＋手順表示
- Q12: 不足ツールは一覧表示＋手順提示、自動インストールしない
- Q14: Claude Code 不在は手順表示のみ（自動インストールしない）
- Q15: `uname -m` + `sysctl` で Apple Silicon 確認

## Scope

- `mycc/common.sh` に以下の6関数を追記:

### `check_apple_silicon()`
- `uname -m` が `arm64` かつ `sysctl -n hw.optional.arm64` が `1` でなければ `die`（非 Apple Silicon は一切サポートしない）
- 正常時は `info "Apple Silicon: OK (arm64)"` を出力

### `check_brew()`
- `command -v brew` がなければ `die` + Homebrew インストール手順を表示
- 正常時は `info "Homebrew: OK (<version>)"` を出力

### `check_tool <name> <binary> [version_flag]`
- 汎用ツール確認関数
- 第1引数: 表示名（例: `"Python 3.12"`）
- 第2引数: バイナリ名（例: `python3.12`）
- 第3引数（省略可）: バージョンフラグ（デフォルト: `--version`）
- バイナリが存在しなければ `die` + `brew install <name>` 表示
- 正常時はバージョン文字列を表示

### `check_claude()`
- `command -v claude` がなければ `die` + `npm install -g @anthropic-ai/claude-code` 表示
- 正常時は `info "Claude Code: OK (<version>)"` を出力

### `check_model <dir>`
- モデルディレクトリと `config.json` の存在確認
- 不在時は `warn` + `setup.sh` 実行を促すメッセージ（`return 1`、**非終了**）
- `die` は使用せず、常に呼び出し元に復帰する
- 空ディレクトリの場合も `return 1`

### `check_all()`
- 上記全チェックを逐次実行
- failure 件数を集計
- 一件でも不足があれば `return 1`、全通過なら `return 0`
- 各チェックの失敗で即座に終了せず、**全てのチェックを実行**してから集計結果を返す
- 内部で以下の7項目をチェック:
  1. `check_apple_silicon`
  2. `check_brew`
  3. `check_tool "Python 3.12" "python3.12" "--version"`
  4. `check_tool "Git" "git" "--version"`
  5. `check_tool "uv" "uv" "--version"`
  6. `check_tool "Node.js" "node" "--version"`
  7. `check_claude`

## Non-scope

- **`check_model` は `check_all` に含めない**: `check_model` はモデルが存在しなくても環境のセットアップ自体は可能であるため、`check_all` の対象外とする。モデル確認は呼び出し元（`doctor.sh` 等）が個別に実行する。
- **自動インストール機能**: 不足ツールの自動インストールは一切行わない（Q12）
- **`doctor.sh` / `setup.sh` の作成**: 本チケットでは common.sh への関数追加のみ。各スクリプトは後続チケット M1-1 / M1-2 で実装。
- **`check_port` 関数**: ポート空き確認（`lsof`）は M2-1 で実装予定。本チケットでは対象外。
- **非 Apple Silicon の検出精度向上**: `sysctl -n hw.optional.arm64` で十分と判断。`sysctl hw.memsize` 等の追加確認は将来の課題。

## Investigation

### 既存コードベースの状態

```text
mycc/
├── common.sh            — M0-1 実装済み（info, warn, error, die の4関数、48行）
├── tests/
│   └── test-common.sh   — M0-1 のユニットテスト（104行、8テストケース）
├── Tickets.md           — M0-2 の仕様記述済み
├── RFC.md               — 実装リファレンス（check_* 関数のコード例含む）
├── CLAUDE.md            — 設計全体マップ
└── .gitignore           — 作成済み
```

`common.sh` 現在の内容（48行）:
- `set -euo pipefail`
- `COLOR_GREEN` / `COLOR_YELLOW` / `COLOR_RED` / `COLOR_RESET` 定数
- `info()`、`warn()`、`error()`、`die()` の4関数
- シェルチェック: `# shellcheck shell=sh`

`check_apple_silicon` 等の関数は未実装。M0-1 完了後、本チケットで追記する。

### スタブの確認

`mycc/Tickets.md` 30行目（M0-1 セクション内）に以下のスタブマーカーが存在:

> `[::STUB::] 後続M0-2でcheck_*関数を追加`: 関数群は空のプレースホルダではなく、このチケットでは実装しない

このスタブは「M0-1 では check_* 関数を実装しない」という意味のマーカーであり、**本チケット M0-2 によって解決される**。実装完了後、このマーカーは削除可能となる。

また、`find-all-stubs.js` によるスキャンでは `mycc/common.sh` に `[::STUB::]` マーカーは発見されなかった。`check_*` 関数は単に存在しないだけであり、スタブ（仮実装）としてのマーカーは不要。

### 設計上の確認事項

**`set -euo pipefail` との相互作用:**

`check_*` 関数群は `set -e` 有効下で動作する。特に注意すべき点:
- `command -v brew &>/dev/null` — `&>/dev/null` で出力抑制。`command -v` 自体の戻り値は `set -e` に影響しない（条件式内で評価）。
- `check_model` は `return 1` を返す可能性がある。呼び出し元で `||` で受けること。サブシェルで実行するか、`|| true` で `set -e` の影響を回避する。

**バージョン表示の `head -1` パイプ:**

`check_tool` 内部で `$binary $flag 2>&1 | head -1` とパイプしている。`set -o pipefail` と組み合わせた場合、`head -1` が SIGPIPE で終了することがあるが、これは pipefail の対象外（`head` が正常に読み取りを完了した後にパイプを閉じる）であるため実害はない。

**`check_all` の `||` 連鎖:**

`check_all` 内部では各チェック関数を `||` で連鎖し、failure カウンタをインクリメントする。`set -e` 下では `||` で失敗を捕捉した時点で `set -e` のトリガーは解除されるため、安全に記述可能。

```bash
check_apple_silicon || { failures=$((failures + 1)); }
# ↑ failures=$? の左辺は失敗しても set -e は発動しない（|| で捕捉済みのため）
```

## Test Plan

### ユニットテスト計画

テスト対象関数: `check_apple_silicon()`、`check_brew()`、`check_tool()`、`check_claude()`、`check_model()`、`check_all()`

テストフレームワーク: 既存の `tests/test-common.sh` にテストケースを追記する。全テストは M0-1 と同様にサブシェルで実行し、外部コマンドのモックは `PATH` の一時的な上書きで実現する。

| # | 分類 | テストケース | 入力 | 期待結果 |
|---|------|-------------|------|---------|
| 1 | 正常系 | `check_apple_silicon` on Apple Silicon | 通常実行（Apple Silicon 上） | `info` で OK 表示 + `return 0` |
| 2 | 異常系 | `check_apple_silicon` on 非 Apple Silicon | `uname -m` → `x86_64` をモック | `die` でエラー終了 + exit 1 |
| 3 | 境界値 | `check_apple_silicon` — sysctl が 0 | `sysctl -n hw.optional.arm64` → `0` をモック | `die` でエラー終了 + exit 1 |
| 4 | 正常系 | `check_brew` brew 存在時 | 通常実行（brew インストール済み） | `info` で OK 表示 + `return 0` |
| 5 | 異常系 | `check_brew` brew 不在時 | `command -v brew` → 失敗するようモック | `die` でエラー終了 + インストール手順表示 |
| 6 | 正常系 | `check_tool` 存在時 | `check_tool "Python 3.12" "python3.12" "--version"`（実在） | `info` で OK 表示 + `return 0` |
| 7 | 異常系 | `check_tool` 不在時 | `check_tool "nonexistent" "nonexistent_cmd"` | `die` でエラー終了 + `brew install nonexistent` 表示 |
| 8 | 正常系 | `check_tool` カスタムバージョンフラグ | `check_tool "Git" "git" "--version"` | 通常動作 |
| 9 | 正常系 | `check_claude` Claude Code 存在時 | 通常実行（claude インストール済み） | `info` で OK 表示 + `return 0` |
| 10 | 異常系 | `check_claude` Claude Code 不在時 | `command -v claude` → 失敗するようモック | `die` + `npm install -g @anthropic-ai/claude-code` 表示 |
| 11 | 正常系 | `check_model` モデル存在時 | 一時ディレクトリ + `config.json` 作成 | `info` で OK 表示 + `return 0` |
| 12 | 異常系 | `check_model` ディレクトリ不在 | 存在しないディレクトリを指定 | `warn` で警告 + `return 1`（非終了） |
| 13 | 異常系 | `check_model` config.json 不在 | 空ディレクトリを指定 | `warn` + `return 1`（非終了） |
| 14 | 正常系 | `check_all` 全通過 | 全チェック通過をモック | `info` で全通過表示 + `return 0` |
| 15 | 異常系 | `check_all` 一部不足 | 一部チェック失敗をモック | `error` + `return 1`（全てのチェックが実行されることを確認） |
| 16 | 正常系 | 関数定義確認 | `declare -f check_apple_silicon check_brew check_tool check_claude check_model check_all` | 6関数すべてが定義済みとして返る |
| 17 | 境界値 | `check_tool` 空文字列表示名 | `check_tool "" "ls"` | 正常動作（表示名は空になるがクラッシュしない） |

**カバレッジ目標**: 80%（クリティカルパス: `check_apple_silicon` の異常系、`check_brew` の異常系、`die()` 呼び出しパスは 100%）

### 外部コマンドモック戦略

`check_*` 関数のテストでは、以下のように `PATH` を一時的に上書きして外部コマンドをモックする:

```sh
# モック用の一時ディレクトリ
mock_dir=$(mktemp -d)

# uname のモック（x86_64 を返す）
cat > "$mock_dir/uname" <<'EOF'
#!/bin/sh
echo "x86_64"
EOF
chmod +x "$mock_dir/uname"

# モック PATH でサブシェル実行
result=$( (PATH="$mock_dir:$PATH"; source "$COMMON_SH" && check_apple_silicon) 2>&1) || exit_code=$?

rm -rf "$mock_dir"
```

テスト 11（`check_model` 正常系）は `mktemp -d` で一時ディレクトリを作成し、`touch config.json` でテストデータを用意する。

### ユニットテスト不可能な項目（例外）

- **実際の Apple Silicon 上での全チェック通過テスト**: CI 環境が Apple Silicon とは限らないため、`check_apple_silicon` の正常系テストは実際のハードウェアでのみ有効。Mock ベースのテスト（テスト1〜3）で代替する。
- **実際の Homebrew バージョン出力の検証**: `brew --version | head -1` の出力フォーマットは Homebrew バージョンに依存する。存在確認と非空出力のみ検証可能。
- **実際の `claude --version` 出力の検証**: 同上。

## Boy Scout Rule — 翻訳可能性計画

### 新規コード

新規に追加する `check_*` 関数群において、以下の翻訳可能性基準を満たす:

1. **関数名は動詞句・動作を明示**:
   - `check_apple_silicon` — 「Apple Silicon をチェックする」と逐語訳可能
   - `check_brew` — 「Homebrew をチェックする」
   - `check_tool` — 「ツールをチェックする」
   - `check_claude` — 「Claude Code をチェックする」
   - `check_model` — 「モデルをチェックする」
   - `check_all` — 「全てチェックする」

2. **一関数一責務**:
   - 各 `check_*` 関数は一つの前提条件のみを検証する
   - メッセージ表示と終了コード以外の副作用を持たない
   - `check_all` は委譲のみを行い、集計ロジックは単一の責務として正当

3. **マジックナンバー排除**:
   - Apple Silicon 確認の `uname -m` / `sysctl` パラメータは名前付き定数化しないが、コメントで意味を説明する（システムコール名そのものが仕様であるため硬直化防止）

4. **エラーメッセージは具体的に**:
   - 「何が不足しているか」＋「どうインストールするか」を具体的なコマンド例と共に表示
   - ユーザーがメッセージを読むだけで次のアクションがわかる状態を目指す
   - `die()` のエラーメッセージは複数行でも構わない（Q4: 不足ツールは一覧表示＋手順提示）

5. **コメントは「なぜ」を説明**:
   - 例: `# uname -m は Rosetta でも arm64 を返すため、sysctl でハードウェアレベル確認`
   - 各関数には日本語で目的と制約を記述する

### 既存コードの改善

`common.sh` の M0-1 実装部分（info/warn/error/die）は既に翻訳可能性を満たしている。本チケットでは新規追加箇所にのみ集中する。

## Acceptance Criteria

- [ ] `check_apple_silicon()` が Apple Silicon 環境で正常動作し、Intel/VM 環境で `die()` する
- [ ] `check_brew()` が Homebrew 存在確認と不在時のインストール手順表示を行う
- [ ] `check_tool()` が汎用ツール確認として動作し、第3引数のデフォルト値が `--version` である
- [ ] `check_claude()` が Claude Code 存在確認と不在時の `npm install -g` 手順表示を行う
- [ ] `check_model()` がモデル不在時・不整合時に `warn` + `return 1`（非終了）で動作する
- [ ] `check_all()` が全チェックを逐次実行し、failure 件数を集計して 0 または 1 を返す
- [ ] `check_all()` が `check_model` を含まない（別枠の呼び出し）
- [ ] 全てのチェック関数が自動インストールを行わない（表示のみ）
- [ ] 全てのテストケース（17件）がサブシェルで通過する
- [ ] 翻訳可能性基準（関数名・一責務・エラーメッセージ具体性）を満たしている
- [ ] スタブ `[::STUB::] 後続M0-2でcheck_*関数を追加` が解決され、マーカーが削除可能である

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい更新手順である。
-->

### 成果物

- 計画: context/0174-commonsh/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0174-commonsh/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0174-commonsh/review.md（未作成、/review-ticket 全チェック通過後に作成）

### 実装のヒント

RFC.md §1 に実装コード例が記載されている。これをベースに、Tickets.md の詳細仕様に合致するよう調整すること:

1. RFC の `check_apple_silicon` は `[ "$arch" != "arm64" ] || [ "$hw_opt" != "1" ]` で判定 — これで正しい
2. RFC の `check_brew` は `command -v brew` で確認 — Q14 の条件を満たす
3. `check_model` は RFC の実装通り、`die` ではなく `warn` + `return 1`（非終了）— Q12 の例外
4. RFC の `check_all` は `check_model` を含んでいない — これは正しい仕様

実装時の注意点:
- 全ての関数は `set -euo pipefail` 下で動作することを前提とする
- `check_tool` のデフォルト第3引数は `${3:---version}` とする（`${3:-"--version"}` ではない: クォート位置に注意）
