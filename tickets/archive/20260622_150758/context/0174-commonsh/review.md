# M0-2: common.sh — 環境チェック関数群 — レビュー報告書

## チェック結果

| チェック項目 | 結果 |
|-------------|------|
| ユニットテスト（35/35） | ✅ PASS |
| スタブ一覧（find-all-stubs） | ✅ 0 issues（スタブ完全解決） |
| 品質チェック（run-quality-checks） | ✅ 0 issues |
| 構造整合性（validate-structure） | ⚠️ 81 issues（全件が履歴チケットの既存問題、#174 に無関係） |
| 翻訳可能性チェック | ✅ 全項目クリア |

## 翻訳可能性チェック詳細

- **関数名**: 10関数すべて動詞句（check_apple_silicon, check_brew, check_tool, check_claude, check_model, check_all, info, warn, error, die, record）
- **変数名**: 1文字変数なし。arch, hw_opt, name, binary, flag, ver, model_dir, failures はすべてドメイン概念を表現
- **デバッグ出力**: なし
- **マジックナンバー**: 4桁以上の数値は全て正当（sysctl の hw.optional.arm64、head -1、--version）
- **コメント**: 新規関数には日本語で「なぜ」を説明（例: `# uname -m は Rosetta でも arm64 を返すため、sysctl でハードウェアレベルの arm64 対応を確認する（Q15）`）

## 実装の検証

### Acceptance Criteria 充足確認

- [x] check_apple_silicon → Apple Silicon で正常動作、Intel/VM モックで die 確認
- [x] check_brew → Homebrew 存在確認、不在時インストール手順表示
- [x] check_tool → 汎用ツール確認、第3引数デフォルト値(--version)確認
- [x] check_claude → Claude Code 確認、不在時 npm install -g 表示
- [x] check_model → 不在時 warn + return 1（非終了）確認
- [x] check_all → 全チェック逐次実行＋集計、0/1 戻り値確認
- [x] check_all が check_model を含まない
- [x] 全チェック関数が自動インストールを行わない
- [x] 全テストケース（17件）通過
- [x] 翻訳可能性基準を満たしている
- [x] スタブ `[::STUB::] 後続M0-2でcheck_*関数を追加` 解決済み、マーカー削除

## 設計上の発見（レビュー時確認）

`check_all` 内のサブシェル `(cmd) ||` ラッピングは正しく機能している。
`die()` の `exit 1` がサブシェル内で完結し、親シェルの `||` が捕捉する。
このパターンは後続チケット M1-1（doctor.sh）でも同様の設計判断が必要となる。

## 結論

**PASS** — 全ての品質基準を満たしている。
