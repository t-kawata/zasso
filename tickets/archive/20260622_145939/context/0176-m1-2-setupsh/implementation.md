# M1-2: setup.sh — 環境構築スクリプト（冪等） 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `mycc/setup.sh` | 新規作成 | 6 Phase の環境構築スクリプト（RFC.md §3 準拠、全 181 行） |
| `mycc/tests/test-setup.sh` | 新規作成 | setup.sh のユニットテスト（BASH, record 形式、全 16 テストケース） |

## テスト結果

- **setup.sh 単体テスト**: 16/16 パス
- **common.sh テスト**: 35/35 パス（回帰なし）
- **doctor.sh テスト**: 26/26 パス（回帰なし）
- **品質チェック**: 0 issues
- **翻訳可能性チェック**: 問題なし（デバッグ出力の残骸なし、1文字変数なし）

## テストケース一覧

| # | ケース | 種別 | 結果 |
|---|--------|------|------|
| 1 | Phase 2: pyproject.toml 既存 → スキップ | 冪等性 | ✓ |
| 2 | Phase 2: 新規初期化 → pyproject.toml 生成 | 正常系 | ✓ |
| 3 | Phase 4: config.json 既存 → スキップ | 冪等性 | ✓ |
| 4 | Phase 4: 新規 DL → config.json 生成 | 正常系 | ✓ |
| 5 | Phase 4: MODEL_VARIANT=speed → Speed 版 | 切替 | ✓ |
| 6 | Phase 4: MODEL_VARIANT=invalid → エラー終了 | 異常系 | ✓ |
| 7 | Phase 5: .git 既存 → ディレクトリ維持 | 冪等性 | ✓ |
| 8 | Phase 5: 新規クローン → .git 作成 | 正常系 | ✓ |
| 9 | Phase 5: 中途半端なディレクトリ → cleanup | 境界値 | ✓ |
| 10 | Phase 6: ルート .env 生成 | 正常系 | ✓ |
| 11 | Phase 6: proxy/.env（.env.example 有） | 正常系 | ✓ |
| 12 | Phase 6: proxy/.env（.env.example 無） | 境界値 | ✓ |
| 13 | Phase 6: .gitignore 新規生成 | 正常系 | ✓ |
| 14 | Phase 6: .gitignore 既存 → スキップ | 冪等性 | ✓ |
| 15 | Phase 1: check_all 不全 → エラー終了 | 異常系 | ✓ |
| 16 | 2回連続実行（冪等性全体） | 冪等性 | ✓ |

## 留意点

- shellcheck は実行環境に未インストールのため未実施（品質チェックスクリプトは通過）
- RFC.md §3 の実装コードをベースに、日本語コメントで「なぜ」を説明する形に改善
- テストは外部コマンドをすべてモック化し、一時ディレクトリで実行
- Boy Scout: モデルリポジトリURLとクローンURLは変数化してハードコードを回避
