---
ticket_id: 175
title: M1-1: doctor.sh — 環境診断スクリプト
slug: m1-1-doctorsh
status: reviewed
created_at: 2026-06-21
updated_at: 2026-06-21
project: mycc
dependencies: {"predecessor":["M0-1: common.sh — 色付き出力ヘルパー関数 (ticket 173)","M0-2: common.sh — 環境チェック関数群 (ticket 174)"],"successor":[],"parallel":["M1-2: setup.sh — 環境構築スクリプト（冪等） (ticket 176)"]}
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0175-m1-1-doctorsh/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0175-m1-1-doctorsh/review.md
plan_path: /Users/kawata/shyme/zasso/tickets/context/0175-m1-1-doctorsh/plan.md
---
# M1-1: doctor.sh — 環境診断スクリプト

## Summary

`doctor.sh` は mycc 環境のエントリポイントとして、全前提条件（Apple Silicon、Homebrew、Python 3.12、Git、uv、Node.js、Claude Code、モデルファイル）を一項目ずつチェックし、不足があれば具体的なインストール手順を表示する。一切の自動インストールは行わない（Q12）。

`common.sh` に実装されたチェック関数群を `source` し、RFC 処理フロー図の順序で逐次実行する。モデルファイルの不在だけは非終了コードで警告に留め、`setup.sh` の実行を促す。

## Background

本スクリプトはユーザーが最初に実行するエントリポイントである。Apple Silicon Mac 上で MTPLX + Claude Code Proxy を用いて Qwen3.6-27B をローカル実行するための前提条件が全て揃っているかを確認する。

**なぜ doctor.sh が必要か：**

1. **障害箇所の早期特定**: 環境問題なのか設定問題なのかを最初に切り分ける。`doctor.sh` を通過すれば環境は整っており、問題は設定か起動にある。
2. **初心者ユーザーのガイド**: 不足ツールに対して「何が足りないか」「どうインストールするか」を具体的なコマンド例と共に表示する。ユーザーはメッセージを読むだけで次のアクションがわかる。
3. **setup.sh の前提**: `setup.sh` は冒頭で `check_all` を呼び出すが、`doctor.sh` はその前に個別チェックの結果を可視化し、どのツールが不足しているかを明確にする。

**重要な設計判断:**
- `doctor.sh` は一切の自動インストールを行わない（Q12）。不足ツールのインストールはユーザーの判断と操作に委ねる。
- モデルファイルの不在だけは警告に留め、終了コード 0 で通過する（Q12 の例外）。モデルダウンロードは `setup.sh` の責務である。
- Claude Code 不在も手順表示のみで、自動インストールしない（Q14）。

**参照:**
- RFC.md §2. doctor.sh — 環境診断（実装コード例・処理フロー図）
- Tickets.md §M1-1: doctor.sh — 環境診断スクリプト（詳細仕様）
- Q4: Homebrew 不在→エラー終了＋手順表示
- Q12: 不足ツールは一覧表示＋手順提示、自動インストールしない
- Q14: Claude Code 不在は手順表示のみ
- Q15: `uname -m` + `sysctl` で Apple Silicon 確認

## Scope

- `mycc/doctor.sh` ファイルの新規作成

### ファイル構成と動作

#### スクリプト冒頭

```bash
#!/usr/bin/env bash
# doctor.sh — 環境診断スクリプト
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
```

- `#!/usr/bin/env bash` — ポータブルな shebang
- `set -euo pipefail` — エラー時即座停止、未設定変数参照禁止、パイプエラー検出
- `SCRIPT_DIR` / `PROJECT_ROOT` の解決 — `$(dirname "$0")` からの絶対パス
- `source "$SCRIPT_DIR/common.sh"` — 全チェック関数を読み込み

#### 処理フロー（RFC 処理フロー図通り、逐次実行）

各ステップは `check_*` 関数 || `exit 1` の形式で記述し、失敗した段階で即座に停止する。モデル確認のみ任意（非終了）とする。

```text
START
  ├── (1) check_apple_silicon → 不全時 exit 1
  ├── (2) check_brew → 不全時 exit 1
  ├── (3) check_tool "Python 3.12" "python3.12" "--version" → 不全時 exit 1
  ├── (4) check_tool "Git" "git" "--version" → 不全時 exit 1
  ├── (5) check_tool "uv" "uv" "--version" → 不全時 exit 1
  ├── (6) check_tool "Node.js" "node" "--version" → 不全時 exit 1
  ├── (7) check_claude → 不全時 exit 1
  ├── (8) check_model "$MODEL_DIR" → 不全時 警告 + 「setup.sh を実行してください」
  └── 全通過 → 「環境は整っています」 + exit 0
END
```

#### ステップ間の空行

各チェックの後に空行（`echo ""`）を挿入し、出力の可読性を高める。

#### モデルディレクトリパス解決

```
MODEL_DIR="${MODEL_DIR:-$PROJECT_ROOT/models/Qwen3.6-27B-MTPLX-Optimized-Quality}"
```

- 環境変数 `MODEL_DIR` が設定されていればその値を使用
- 未設定時はデフォルトとして Quality 版モデルディレクトリを使用

#### 診断完了表示

全チェック通過時に以下のメッセージを表示する：

```
=== 診断完了 ===
環境は整っています。
```

#### 実行権限

- `doctor.sh` 作成後に `chmod +x doctor.sh` で実行権限を付与する

#### RFC コード例からの差異点

RFC.md §2 の doctor.sh 実装例には以下の差異がある。本実装では RFC を尊重しつつ、実際の運用に即した調整を行う：

| 項目 | RFC | 本実装 |
|------|-----|--------|
| 各チェック後の空行 | `echo ""` あり | 同様に実装 |
| 最終メッセージ | `=== 診断完了 ===" | "=== 診断完了 ===" + "環境は整っています。" |
| MODEL_DIR フォールバック | Quality 版パス | 同様 |
| モデル不在時の追加メッセージ | `echo "  → setup.sh を実行..."` | `info` で同内容を表示 |

## Non-scope

- **自動インストール機能**: 不足ツールの自動インストールは一切行わない（Q12）
- **モデルダウンロード**: モデルファイルのダウンロードは `setup.sh` の責務（M1-2）
- **環境構築**: `.env` 生成、`uv init`、`git clone` 等は `setup.sh` の責務（M1-2）
- **プロセス起動**: MTPLX サーバーや Proxy の起動は `run.sh` の責務（M2-1）
- **`check_all` 関数の呼び出し**: `doctor.sh` は `check_all` を呼び出さず、個別の `check_*` 関数を逐次呼び出す。これにより「どのステップで失敗したか」を明確に表示する
- **詳細なバージョン互換性チェック**: ツールの存在確認とバージョン表示のみ。特定バージョン以上を要求するチェックは将来の課題

## Investigation

### 既存コードベースの状態

```text
mycc/
├── common.sh             — M0-1 + M0-2 実装済み（info, warn, error, die + 6つの check_* 関数、148行）
├── doctor.sh             — 未作成（本チケットで作成）
├── tests/
│   ├── test-common.sh    — M0-1, M0-2 のユニットテスト（17テストケース）
│   └── test-doctor.sh    — 未作成（本チケットで作成）
├── Tickets.md            — M1-1 の仕様記述済み
├── RFC.md                — 実装リファレンス（doctor.sh のコード例含む）
├── CLAUDE.md             — 設計全体マップ
└── .gitignore            — 作成済み
```

`common.sh` 現状の関数定義:
- `info()`、`warn()`、`error()`、`die()` — 色付き出力
- `check_apple_silicon()` — Apple Silicon 確認（異常時 die）
- `check_brew()` — Homebrew 確認（異常時 die）
- `check_tool()` — 汎用ツール確認（異常時 die）
- `check_claude()` — Claude Code 確認（異常時 die）
- `check_model()` — モデル確認（異常時 warn + return 1、非終了）
- `check_all()` — 全チェック集約（本チケットでは使用しない）

### スタブの確認

`find-all-stubs.js` による `mycc/` ディレクトリのスキャン結果: スタブなし。

本チケットで解決すべきスタブは存在しない。`doctor.sh` は新規作成であり、`common.sh` の全関数は既に実装済みであるため。

### 実装上の確認事項

**`set -euo pipefail` との相互作用:**

`doctor.sh` は `set -euo pipefail` が有効な状態で各チェック関数を `|| exit 1` の形で呼び出す。各 `check_*` 関数（`die()` を含む）はこの条件下で正しく動作する:

- `check_apple_silicon()` → 異常時 `die()` → `exit 1`
- `check_brew()` → 異常時 `die()` → `exit 1`
- `check_tool()` → 異常時 `die()` → `exit 1`
- `check_claude()` → 異常時 `die()` → `exit 1`
- `check_model()` → 異常時 `return 1`（`warn` 表示後に評価）→ `set -e` 下の `||` で捕捉

`check_model` は `die` ではなく `return 1` を返すため、`check_model "$MODEL_DIR" || echo "  → setup.sh を実行..."` の形で安全に捕捉できる。

**`doctor.sh` における `check_all` 不使用の根拠:**

`check_all` は全チェックを強行実行し failure 件数を集計するが、`doctor.sh` の目的は「最初の不足箇所で停止し、ユーザーに即座にフィードバックする」ことである。そのため個別の `check_*` 関数を RFC の処理フロー順に逐次呼び出す。`check_all` は `setup.sh` の Phase 1（前提条件チェック）で使用する。

## Test Plan

### ユニットテスト計画

テスト対象スクリプト: `doctor.sh`

テスト方法: サブシェルで `doctor.sh` を実行し、標準出力と終了コードをキャプチャ。`check_*` 関数のモックは `common.sh` のテスト（M0-2）と同様に `PATH` の一時的な上書きで実現する。doctor.sh 自身のテストであるため、`common.sh` の関数を直接モックするのではなく、doctor.sh の制御フローをテストする。

注意: `set -euo pipefail` が有効な `doctor.sh` 全体をサブシェル実行するテスト設計とする。`check_*` 個別の動作検証は M0-2 で実施済みであるため、本テストでは `doctor.sh` の**制御フロー**（逐次実行の順序と終了条件）の正当性を検証する。

| # | 分類 | テストケース | 入力／前提 | 期待結果 |
|---|------|-------------|-----------|---------|
| 1 | 正常系 | 全前提条件充足 | `check_apple_silicon` / `check_brew` / `check_tool` / `check_claude` / `check_model` の全関数が成功するようモック（`PATH` に必要な全バイナリを配置、モデルディレクトリと config.json を作成） | 全項目 `[OK]` + 「環境は整っています。」 + exit 0 |
| 2 | 異常系 | Apple Silicon 以外 | `check_apple_silicon` が失敗するようモック（`uname -m` が `x86_64` を返す） | Step 1 でエラー終了 + メッセージ + exit 1。Step 2 以降が実行されない |
| 3 | 異常系 | Homebrew 不在 | Step 1 通過、`check_brew` が失敗するようモック | Step 2 でエラー終了 + インストール手順表示 + exit 1 |
| 4 | 異常系 | 特定ツール不足（Python 3.12） | Step 1-2 通過、`check_tool "Python 3.12" "python3.12"` が失敗するようモック | Step 3 でエラー終了 + `brew install Python 3.12` 手順表示 + exit 1 |
| 5 | 異常系 | 特定ツール不足（Node.js） | Step 1-5 通過、`check_tool "Node.js" "node"` が失敗するようモック | Step 6 でエラー終了 + 手順表示 + exit 1 |
| 6 | 異常系 | Claude Code 不在 | Step 1-6 通過、`check_claude` が失敗するようモック | Step 7 でエラー終了 + `npm install -g @anthropic-ai/claude-code` 表示 + exit 1 |
| 7 | 警告系 | モデル不在のみ（全ツール通過） | Step 1-7 全通過、`check_model` が `return 1` するようモック（モデルディレクトリ不在） | 全ツール `[OK]` + モデル警告 + 「setup.sh を実行してください」 + exit 0 |
| 8 | 境界値 | `MODEL_DIR` 環境変数指定 | `MODEL_DIR=/custom/path` を設定し、`check_model` に渡されるパスを確認 | `check_model` が `/custom/path` に対して実行される |
| 9 | 境界値 | 空の PATH から一部バイナリ除去 | `PATH` から特定バイナリ（例: `git`）を除去 | Step 4（git）で正常にエラー終了 + exit 1。バイナリ除去前に Step 1-3 が通過することを確認 |
| 10 | 正常系 | 診断完了メッセージの順序確認 | 全チェック通過（テスト1と同じ前提） | 出力が RFC 処理フロー図の順序通りであることを確認（1→2→3→4→5→6→7→8） |

**カバレッジ目標**: 80%（クリティカルパス: 異常系 2-6 および警告系 7 は 100%）

### 外部コマンドモック戦略

`check_*` 関数のモックは M0-2 と同様の戦略（`PATH` の一時的上書き）を採用する。doctor.sh 全体をサブシェル実行するため、モックはサブシェル内でのみ有効となる。

```sh
# テスト: Apple Silicon 以外でエラー終了することを確認
test_non_apple_silicon() {
    local mock_dir
    mock_dir=$(mktemp -d)

    # uname のモック（x86_64 を返す）
    cat > "$mock_dir/uname" <<'EOF'
#!/bin/sh
echo "x86_64"
EOF
    chmod +x "$mock_dir/uname"

    # sysctl のモック（arm64 optional = 0）
    cat > "$mock_dir/sysctl" <<'EOF'
#!/bin/sh
echo "0"
EOF
    chmod +x "$mock_dir/sysctl"

    # doctor.sh をモック PATH でサブシェル実行
    local exit_code=0
    local output
    output=$(PATH="$mock_dir:$PATH" bash "$DOCTOR_SH" 2>&1) || exit_code=$?

    # 検証
    assert_equals 1 "$exit_code" "非 Apple Silicon で exit 1"
    assert_contains "Apple Silicon ではありません" "$output" "エラーメッセージ確認"

    rm -rf "$mock_dir"
}
```

### ユニットテスト不可能な項目（例外）

- **実際の Apple Silicon 上での全チェック通過テスト**: CI 環境が Apple Silicon とは限らないため、Mock ベースのテスト（テスト1, 10）で代替する。モックで全関数が成功することを確認する。
- **実際のモデルディレクトリ検証**: モデルファイルはダウンロードが必要であり、テスト環境に常に存在するとは限らない。一時ディレクトリを作成してモックする（テスト7）。
- **ターミナル色出力の視覚的検証**: `\033[32m` 等の ANSI エスケープコードが正しく埋め込まれているかは出力内容の文字列検証で代替する。

## Boy Scout Rule — 翻訳可能性計画

### 新規コード

新規作成する `doctor.sh` において、以下の翻訳可能性基準を満たす:

1. **関数呼び出しの並びが文章になる**:
   ```bash
   # ✅ 処理の流れが日本語に逐語訳可能
   check_apple_silicon || exit 1   # 「Apple Silicon をチェックする。失敗したら終了」
   check_brew          || exit 1   # 「Homebrew をチェックする。失敗したら終了」
   check_tool ...      || exit 1   # 「ツールをチェックする。失敗したら終了」
   ```
   この並びは「Apple Silicon を確認し、Homebrew を確認し、各ツールを確認する」とそのまま読める。

2. **変数はドメイン概念を表現**:
   - `SCRIPT_DIR` — 「スクリプトのディレクトリ」
   - `PROJECT_ROOT` — 「プロジェクトのルート」
   - `MODEL_DIR` — 「モデルのディレクトリ」

3. **コメントは「なぜ」を説明**:
   - `# shellcheck source=./common.sh` — shellcheck に source の存在を伝える
   - 各チェックブロックの区切りコメント（`# Apple Silicon 確認` 等）

4. **マジックナンバー排除**:
   - モデルディレクトリのデフォルトパスは環境変数 `MODEL_DIR` 経由で指定し、直書きしない
   - フォールバック値は Quality 版のパスとして明確に意味を持つ

### 既存コードの改善

本チケットでは新規ファイル作成のみであり、既存コード（`common.sh`、テストファイル）の翻訳可能性は M0-1 および M0-2 で既に確保済みである。改善対象はない。

## Acceptance Criteria

- [ ] `doctor.sh` が `#!/usr/bin/env bash` + `set -euo pipefail` で始まる
- [ ] `SCRIPT_DIR` / `PROJECT_ROOT` を正しく解決し、`source "$SCRIPT_DIR/common.sh"` で共通関数を読み込める
- [ ] タイトル表示「=== mycc 環境診断 ===" が出力の先頭に表示される
- [ ] RFC 処理フロー図の順序（1→8）で各チェックが逐次実行される
- [ ] Apple Silicon 確認で不全時、exit 1 で即座に終了する
- [ ] Homebrew 確認で不全時、インストール手順を表示して exit 1 で終了する
- [ ] 各ツール確認で不全時、該当ステップでエラー終了 + 手順表示 + exit 1 する
- [ ] Claude Code 確認で不全時、`npm install -g` 手順を表示して exit 1 する
- [ ] モデル不在時は警告メッセージ + 「setup.sh を実行してください」を表示し、exit 0 で終了する
- [ ] 全チェック通過時は「環境は整っています。」と表示し、exit 0 で終了する
- [ ] `MODEL_DIR` 環境変数が未設定の場合、デフォルトで Quality 版モデルディレクトリを使用する
- [ ] `MODEL_DIR` 環境変数が設定されている場合、そのパスを優先する
- [ ] `chmod +x doctor.sh` で実行権限が付与されている
- [ ] 出力順序が RFC 処理フロー図と一致している
- [ ] 全10テストケースがサブシェルで通過する
- [ ] 翻訳可能性基準（関数呼び出しの並びが文章になる、変数名がドメイン概念を表現）を満たしている

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい更新手順である。
-->

### 成果物

- 計画: context/0175-m1-1-doctorsh/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0175-m1-1-doctorsh/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0175-m1-1-doctorsh/review.md（未作成、/review-ticket 全チェック通過後に作成）

### 実装のヒント

RFC.md §2 に doctor.sh の実装コード例が記載されている。これをベースに、Tickets.md の詳細仕様に合致するよう調整すること:

1. RFC の doctor.sh 実装はほぼそのまま採用可能。以下の点を調整:
   - 最終メッセージに「環境は整っています。」を追加
   - 各チェックの前にコメントでステップ番号を明記
2. `MODEL_DIR` のデフォルト値は RFC と同様に `$PROJECT_ROOT/models/Qwen3.6-27B-MTPLX-Optimized-Quality`
3. `check_model` 呼び出しは `||` で捕捉し、追加メッセージを表示する（`die` ではない）

実装時の注意点:
- `set -euo pipefail` が有効な状態で `|| exit 1` パターンが正しく動作することを確認
- 各ステップ間の空行（`echo ""`）を忘れない
- `info` / `warn` / `error` / `die` は `common.sh` から提供される関数であり、doctor.sh 内で再定義しない
