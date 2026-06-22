# 実装サマリー: Makefile に archive-tickets コマンドを追加する

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `.claude/scripts/tickets/archive-tickets.sh` | 新規作成 | アーカイブ実行シェルスクリプト |
| `Makefile` | 編集 | `.PHONY` に `archive-tickets` 追加、ターゲット定義追加 |
| `.gitignore` | 編集 | `tickets/archive/` を git 追跡対象外に追加 |

## コマンド動作

1. `tickets/archive/YYYYmmdd_HHMMSS/` ディレクトリを作成
2. `tickets/queue.md` を上記にコピー
3. `tickets/specs/` 内の全ファイルを再帰コピー
4. `tickets/context/` 内の全ディレクトリを再帰コピー
5. コピー元をクリア（queue.md はヘッダーのみ、specs/context は空）

## 検証結果

| 検証項目 | 結果 |
|----------|------|
| `make archive-tickets` 正常終了 | ✅ |
| アーカイブ先に queue.md/specs/context が存在 | ✅ |
| コピー元がクリアされている | ✅ |
| 冪等性（再実行も正常） | ✅ |
| `.gitignore` により archive が非追跡 | ✅ |
| `[::STUB::]` マーカー漏れなし | ✅ |
| 品質チェック 0 issues | ✅ |

## その他

- スクリプトは `set -euo pipefail` でエラーを確実に検出
- 空ディレクトリに対するコピー・削除は安全にスキップされる
- make 経由でもスクリプト直接実行でも動作可能
