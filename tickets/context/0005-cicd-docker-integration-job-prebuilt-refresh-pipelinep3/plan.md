# 実装計画: #5 CI/CD — Docker Integration Job + Prebuilt Refresh Pipeline（P3）

## 要件
GitHub Actions 上で以下 2 ワークフローを新規作成する：
1. integration-test.yml — Ubuntu 22.04 + Docker Asterisk で統合テスト自動実行
2. prebuilt-refresh.yml — macOS 14 (Apple Silicon) で PJSIP prebuilt 自動ビルド＋保存

Rust コード変更は含まない。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| .github/workflows/integration-test.yml | 新規作成 | Docker Asterisk 統合テスト CI（RFC02 §11.1） |
| .github/workflows/prebuilt-refresh.yml | 新規作成 | PJSIP prebuilt 自動ビルド pipeline（RFC02 §11.2） |

## Boy Scout 改善
本チケットは新規 YAML のみ。YAML 内で step名明確化、コメント記載、env 変数化を徹底。

## テスト計画
- Rust 変更なしのためユニットテスト追加不要
- CI ワークフロー検証は GitHub Actions 上で事後確認
- make test で既存テスト非破壊確認

## 実装手順
1. .github/workflows/ ディレクトリ作成
2. integration-test.yml 作成（RFC02 §11.1準拠、トリガー: push/PR/workflow_dispatch）
3. prebuilt-refresh.yml 作成（RFC02 §11.2準拠、トリガー: workflow_dispatch + 月次schedule）
4. make check-be + make test で既存コード非破壊確認
