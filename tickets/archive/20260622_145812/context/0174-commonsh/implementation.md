# M0-2: common.sh — 環境チェック関数群 — 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `mycc/common.sh` | 編集 | 既存48行 + info/warn/error/die の後方に6関数（check_apple_silicon, check_brew, check_tool, check_claude, check_model, check_all）を追記。合計約135行に拡張。 |
| `mycc/tests/test-common.sh` | 編集 | 既存8テスト + 104行から、17テストケース（Test 9-25）を追記。合計25テスト、約350行。 |
| `mycc/Tickets.md` | 編集 | L30の `[::STUB::]` マーカーを削除（スタブ解決）。 |

## 実装の詳細

### common.sh の変更

- **check_apple_silicon**: `uname -m` が `arm64` かつ `sysctl -n hw.optional.arm64` が `1` であることを確認。非対応時は `die`。`local` 変数は個別宣言（`set -u` 対策）。
- **check_brew**: `command -v brew` で確認。不在時はインストール手順（公式スクリプト）を表示して `die`。
- **check_tool**: 汎用ツール確認。第3引数のデフォルトは `${3:---version}`（クォート位置に注意）。不在時は `brew install <name>` を表示。
- **check_claude**: `command -v claude` で確認。不在時は `npm install -g @anthropic-ai/claude-code` を表示。
- **check_model**: モデルディレクトリ + config.json の存在確認。`warn` + `return 1` で非終了（`die` 不使用）。
- **check_all**: 7項目を逐次実行。各チェックはサブシェル `(cmd) ||` でラップし、`die()` の `exit` を捕捉できるようにした。これにより全チェック実行＋集計が正しく動作する。

### 発見された設計上の調整

`check_all` 内で各チェック関数を `(check_brew) || { failures++; }` のようにサブシェルでラップする必要があった。なぜなら `check_brew` が内部で `die()`（→ `exit 1`）を呼ぶため、そのまま `check_brew ||` と書くと `exit` が呼ばれた時点でプロセスが終了し、以降のチェックが実行されない。サブシェル化により `exit` はサブシェル内で完結し、親シェルの `||` が正しく捕捉する。この知見は類似の設計パターンを持つ後続チケット（M1-1 doctor.sh, M1-2 setup.sh）でも活用できる。

### テスト

- **フレームワーク**: 既存のサブシェル方式を踏襲
- **モック戦略**: 外部コマンドは `mktemp -d` + `PATH` 上書きでモック。異常系テストでは `PATH` をモックディレクトリ**のみ**に設定し、実コマンドが混入しないようにした。
- **結果**: 35/35 passed, 0 failed
