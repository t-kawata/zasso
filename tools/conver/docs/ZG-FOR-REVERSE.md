# zg（zvec-grep）を用いる許可済みリバースエンジニアリング手順書

> 対象: 自組織のソース、明示的に許可を得た顧客・OSS・監査対象。アクセス制御の回避、ライセンス違反、秘密情報の持出し、第三者サービスへの不正アクセスを目的とした利用は対象外とする。
>
> この手順書でいう「リバースエンジニアリング」は、主に既存の**ソースコード、設定、ドキュメント、テスト、ログ形式**を横断して、構造・責務・データフロー・設計意図を再構成する作業を指す。バイナリ解析を行う場合は、抽出・逆アセンブル・復号済みテキストなどを別途、許可された方法で用意し、その生成物を検索対象にする。

## 1. zg の概要と適用範囲

`zg` は **zvec-grep** のCLIである。ローカルのワークスペースを索引化し、次の検索を単一の操作系に統合する。

| 検索経路 | 使う場面 | 代表例 |
|---|---|---|
| ripgrep互換（`--rg`） | 文字列、識別子、パス、正規表現を漏れなく探す | `AuthService`、`/v1/token`、エラーコード、APIキー名 |
| BM25（`--fts`） | 既知の語を関連度順に集める | `session revoke`、`TLS handshake` |
| ベクトル（`--vector`） | 実装上の命名を知らず、概念から探す | 「資格情報はどこで検証されるか」 |
| ハイブリッド（既定の `zg query`） | 語と意味の両方を使い、入口不明の構造を探索する | 「起動時に設定を復元する流れ」 |

索引検索はファイル、シンボル、行などの出所情報を伴う候補を返す。したがって、LLMや人間の「もっともらしい説明」を採用するのではなく、**検索結果のパス・行・原文を一次証拠として読み、結論を検証する**用途に向く。

### 1.1 強み

- Rust、Go、Java、JavaScript/JSX、TypeScript/TSX、Python、C/C++ は、シンボル、シグネチャ、周辺文脈を保つ構造認識型の抽出対象である。
- Markdown/MDX は見出しとパンくず、JSON/YAML/TOML/CSV と一般テキストはテキストチャンクとして検索できる。
- CLIとAIエージェントは同じワークスペース索引を利用できる。MCP連携では、エージェントに小さく出所付きの証拠を渡せる。
- ローカルモデルを選べば、ファイルと索引および埋め込み推論をローカルに留められる。

### 1.2 限界

- PDF、Office文書、アーカイブ、コンパイル成果物、DB、音声・動画、空ファイル、バイナリ判定されたファイル、サイズ上限超過ファイルは既定で索引化されない。画像も既定では対象外である。
- `zg` は逆コンパイラ、動的トレーサ、デバッガ、SASTの代替ではない。バイナリや実行時挙動の解明には Ghidra/IDA、デバッガ、eBPF、テストなどを併用する。
- 意味検索は候補発見であり完全列挙ではない。既知の識別子、URL、定数、エラー文字列、正規表現は必ず `--rg` で再確認する。
- 索引時点以後に変更されたファイルは、更新が完了するまで検索結果に反映されない場合がある。検索出力の `fresh` / `possibly_stale` 表示を確認する。

## 2. 事前設計: 安全な対象範囲を決める

索引を作る前に、次をチケットや `docs/research-scope.md` に記録する。

1. **権限と目的**: リポジトリURLまたはローカルパス、所有者、契約・OSSライセンス、許可期限、調査目的。
2. **対象コミットの固定**: `git rev-parse HEAD`、ブランチ、サブモジュール状態、必要ならコンテナイメージDigestを保存する。
3. **除外対象**: `.env`、秘密鍵、トークン、顧客データ、production dump、`node_modules`、vendor、ビルド成果物、キャッシュ、巨大生成物。通常は `.gitignore` を尊重し、追加の除外規則も設ける。
4. **外部送信方針**: 機密コードではローカル埋め込みモデルのみを用いる。リモート埋め込みは、認証情報の設定だけでは送信許可にならず、明示的な許可が必要である点を理解する。
5. **成果物の形式**: 「主張 → 根拠ファイル/行 → 未確認事項 → 次の検証」を表形式で残す。根拠なしの推測を設計事実として書かない。

リポジトリ直下に索引を置くため、`.zvec-grep/` をGit管理しない。通常はzg自身が以後の走査からもこのディレクトリを除外するが、チーム運用では `.gitignore` にも明記すると誤コミットを防げる。

```bash
printf '\n# local zg index\n.zvec-grep/\n' >> .gitignore
```

> 既に追跡済みの `.zvec-grep/` がある場合は、チームの合意を得て `git rm -r --cached .zvec-grep` を行う。これはGitの追跡状態を変更する操作なので、勝手に実行しない。

## 3. 完全セットアップ: 既存プロジェクトを検索可能にする

以下は、macOS/Linux上の既存Gitプロジェクトを、ローカルで検索可能な状態まで持っていく標準手順である。WindowsでもNode.js環境があれば利用できるが、更新自動化はタスクスケジューラ等へ読み替える。

### 3.1 Node.jsとzgを導入する

zgはNode.js 22以上を必要とする。まずバージョンとグローバルbinの解決を確認する。

```bash
node --version
npm --version
npm install -g @zvec/zvec-grep
zg version
zg help
zg help index
zg help query
```

`npm`の成功後も `zg: command not found` なら、npmのグローバルbinディレクトリがシェルの `PATH` にない。利用中のNodeバージョンマネージャ（mise、nvm、fnm、Volta等）の設定を確認し、再ログイン後に `command -v zg` を実行する。

オプションはリリースで変わり得るため、本手順書の例を流用する前に、**導入した版の `zg help <command>` を正とする**。

### 3.2 対象を固定して衛生確認する

```bash
git clone <authorized-repository-url> target-repo
cd target-repo
git status --short
git rev-parse HEAD
git submodule status --recursive
find . -maxdepth 3 \( -name '.env' -o -name '*.pem' -o -name '*.key' \) -print
```

- 作業ツリーに未コミット変更があるなら、索引対象とする意図を明確にする。解析の再現性を優先するなら、専用worktreeまたは固定コミットを使う。
- `find` が機密ファイルを示したら、索引対象外であることを確認する。ファイルを別の安全な場所へ移す、ignore規則を追加する、または検索用worktreeを作る。
- ビルドや依存取得の前に初回索引を行えば、`node_modules`等のノイズを持ち込む危険を減らせる。

### 3.3 埋め込みモデルを選ぶ

まず小さなコード中心のプロジェクトなら、既定の `local/potion-code-16m-v2` が最短の出発点である。ローカルモデルのダウンロード先は既定で `~/.zvec-grep/models`。

| プロジェクト特性 | 推奨開始モデル | 留意点 |
|---|---|---|
| 主にコード、初回の速度重視 | `local/potion-code-16m-v2` | Potion系はGPUで高速化されない |
| 日本語を含む仕様・コメント・多言語文書 | `local/potion-multilingual-128m` または `local/multilingual-e5-small` | 初回時間・メモリを測定する |
| 多言語かつ長いコード・文書 | `local/jina-embeddings-v2-base-code` | ONNX Q8。CPU/GPU設定を検証する |
| 品質優先の多言語コード・文書 | `local/embeddinggemma-300m` または `local/qwen3-embedding-0.6b` | より大きい。端末性能・レイテンシを測る |

Transformer/GGUF系は `ZVEC_GREP_DEVICE=auto|cpu|metal|vulkan|cuda` を設定できる。Apple Siliconなら `metal`、CUDA環境なら `cuda` を試す価値がある。一方で、モデルを変えるとベクトル空間が変わるため、既存索引のまま比較してはいけない。モデル変更には再構築が必要である。

### 3.4 初回索引を作成する

最も保守的な初回作成は次である。

```bash
cd /absolute/path/to/target-repo
zg index --embedding local/potion-code-16m-v2
zg status
```

`zg index` はワークスペース直下に `.zvec-grep/` を作る。成功後、以下の4種類の検索を一度ずつ行い、対象プロジェクトが期待通り読めているかを確認する。

```bash
# 構造や責務を、概念から探す（ハイブリッド）
zg query --human --limit 8 "起動時に設定を読み込み、永続化状態を復元する処理"

# 既知の語を関連度順に探す（BM25）
zg query --fts --human --limit 10 "authentication session token"

# 語彙に依存せず概念的に探す（ベクトル）
zg query --vector --human --limit 8 "where access credentials are validated and rejected"

# 既知の識別子を完全列挙する（ripgrep）
zg query --rg -n -F "AuthService" src
```

プロジェクトに合わせて `AuthService` と `src` は実在する識別子・パスに置き換える。既定ハイブリッド検索は入口不明の調査用、`--fts` は既知語の順位付け、`--vector` は概念探索、`--rg` は完全性確認という役割分担にする。

失敗・スキップが疑われる場合は、以下を実行する。

```bash
zg index --debug
zg status --mode direct --debug
zg query --debug "authentication flow"
```

`--debug` はスキップ数・サンプルや、既存索引に記録されたファイル単位の失敗の診断に用いる。大規模リポジトリでは、いきなり全域を索引せず、初回に関連ディレクトリやglob、型、ignoreファイル、深さ、最大ファイルサイズを `zg help index` で確認してスコープする。スコープ設定は最初の索引に保存され、既存索引はその設定を再利用する。

### 3.5 エージェントを接続する（任意）

Claude Code、Codex、Qwen Code、Cursor、OpenCodeは、次で設定できる。

```bash
zg install
# 例: 非対話でOpenCodeだけに設定する場合
zg install --target opencode --yes
```

設定後、エージェントを再起動するか新規セッションを開く。標準のstdio接続はローカルサービスを自動管理するため、通常は別途サーバーを起動しない。

デフォルトでエージェントへ公開されるMCPツールは `zvec_grep_search` のみである。索引作成・再構築・削除は明示的CLI操作に留められるため、エージェントが勝手に永続索引を変更しない。エージェントには次のように依頼する。

```text
このワークスペースの認証フローを再構成してください。
まず未知の責務・データフローはzvec_grep_searchで候補を集め、
既知の識別子・エラー文・パスはrgで完全確認してください。
各結論にファイルパスと行番号を添え、推測と確認済み事実を分けてください。
変更は行わず、調査報告だけを返してください。
```

## 4. リバースエンジニアリング調査プロトコル

### 4.1 原則: 仮説、検索、原文確認、検証

zgの結果を最終結論にしない。次のループで進める。

1. 調査質問を、観測可能な問いにする。
2. ハイブリッド/ベクトル検索で候補となるモジュール、シンボル、文書を発見する。
3. `--rg` で呼び出し元、識別子、設定キー、エラー経路を列挙する。
4. 原文を開き、型、条件分岐、例外、入出力、テストを読む。
5. テスト実行、ログ、トレース、ビルド、静的解析など独立した証拠で仮説を検証する。
6. 根拠行、対象コミット、未確定事項を記録する。

### 4.2 初動: 地図を作る

まず「何があるか」と「どこが起点か」を把握する。

```bash
zg query --human --limit 12 "application entry point startup configuration dependency injection"
zg query --human --limit 12 "HTTP API routes RPC handlers command line entrypoint"
zg query --human --limit 12 "database schema migration repository transaction"
zg query --human --limit 12 "authorization authentication permissions roles policy"
zg query --rg -n -e 'main\(' -e 'createServer' -e 'listen\(' -e 'Router' -e 'routes' .
```

成果物は、少なくとも次の表にする。

| 領域 | 入口候補 | 中心モジュール | 一次証拠 | 未確認 |
|---|---|---|---|---|
| 起動 | `cmd/.../main.go` 等 | 設定読込、DI、サーバー開始 | パス・行範囲 | 本番用フラグとの差分 |
| API | router/handler | 認証middleware、use case | パス・行範囲 | 非同期ジョブの入口 |
| 永続化 | migration/repository | transaction、DAO | パス・行範囲 | ロールバック条件 |

### 4.3 データフローを復元する

例として「HTTPリクエストからDB更新まで」を追う場合、概念検索から開始し、すぐに正確検索へ切り替える。

```bash
zg query --human --limit 10 "request validation authorization transaction persistent update"
zg query --fts --human --limit 20 "validate authorize transaction"
zg query --rg -n -e 'Validate' -e 'Authorize' -e 'BeginTx' -e 'Commit' -e 'Rollback' src
```

各ヒットについて以下を埋める。

| 段階 | 実装位置 | 入力 | 変換/判断 | 出力・副作用 | 根拠 |
|---|---|---|---|---|---|
| 入口 | handler/controller | HTTP/RPC入力 | parse・schema検査 | DTO | パス:行 |
| 認可 | middleware/policy | principal + action | allow/deny | context/error | パス:行 |
| ユースケース | service/usecase | DTO | business rule | command/result | パス:行 |
| 永続化 | repository/DAO | command | transaction/SQL | DB更新 | パス:行 |
| 監査/通知 | outbox/event | domain event | publish/retry | 外部副作用 | パス:行 |

### 4.4 セキュリティ境界を調べる

「暗号化しているはず」「認可しているはず」と意味検索だけで結論しない。以下を併用する。

```bash
zg query --human --limit 12 "token verification signature validation key rotation expiration"
zg query --human --limit 12 "permission check tenant isolation ownership authorization"
zg query --rg -n -i -e 'jwt' -e 'bearer' -e 'verify' -e 'signature' -e 'nonce' -e 'csrf' -e 'tenant' -e 'permission' .
```

確認項目は、認証主体の生成位置、署名/期限/issuer/audience検証、認可の強制点、テナント境界、秘密情報の読み込み元、失敗時の拒否、監査ログ、非同期経路の再検証である。発見した設定キーやエラーコードは `--rg -F` で全参照を列挙し、テストも検索して期待動作を照合する。

### 4.5 依存・設定・実行時差分を調べる

実装だけでなく、設定とデプロイ定義を索引に含める。

```bash
zg query --human --limit 12 "environment variable configuration default production deployment"
zg query --rg -n -e 'process\.env' -e 'os\.Getenv' -e 'std::env' -e 'ENV\[' .
zg query --rg -n -e 'docker-compose' -e 'helm' -e 'kustomize' -e 'terraform' -e 'systemd' .
```

開発・テスト・本番で経路が変わる場合がある。`.env.example`、CI設定、コンテナ定義、IaC、migration、feature flag、テストfixtureを証拠として追う。実データを索引化する必要は原則ない。

### 4.6 バイナリのみを扱う場合

zgはバイナリをそのまま意味検索する道具ではない。許可済みの解析で得た逆アセンブル、疑似コード、文字列一覧、シンボル表、プロトコルログ、設定抽出結果を、専用の隔離ディレクトリにテキストとして置く。

```text
analysis-artifacts/
  decompile/
  strings/
  symbols/
  traces/
  notes/
```

そのディレクトリを別ワークスペースとして索引化し、ソースがある場合は「ソース」と「解析生成物」を混在させず、コミット・バイナリハッシュ・ツール版・抽出コマンドを `notes/provenance.md` に記録する。復号鍵、メモリダンプ、個人情報、第三者の秘密情報を入れない。

## 5. 最新インデックスを保つ運用

### 5.1 使い分けの決定表

| 状況 | 実行 | 理由 |
|---|---|---|
| 通常のソース変更を反映 | `zg index` | 既存モデル・既存スコープを再利用して増分更新する |
| 今のクエリだけ必ず最新で検索したい | `zg query --refresh wait "..."` | 検索前に更新完了を待つ |
| 対話検索で待ち時間を減らしたい | `zg query --refresh background "..."` | 背景更新。結果のfreshnessを確認する |
| 索引の状態や失敗を確認 | `zg status`、必要時 `zg status --mode direct --debug` | ルート違い・失敗・古さを切り分ける |
| 埋め込みモデルを変更 | `zg index --rebuild --embedding <new-model>` | ベクトル空間が異なるため再構築が必要 |
| include/exclude等の保存済みスコープを置換 | `zg index --reset-paths ...` | 意図的にファイル選択規則を置き換える |
| 索引を廃棄 | `zg index --drop --yes` | 破壊的。ソースは消さないが索引は消える |

`--rebuild` を「更新のたび」に使わない。通常変更には `zg index` を使う。再構築は、モデル変更または保存済み設定を意図的に替える場合に限定する。

### 5.2 開発者の基本ルーチン

最小の確実な運用は、次のタイミングで `zg index` を実行することである。

```bash
# 作業開始時: checkout / pull後
zg index

# 大きな編集、コード生成、依存更新、仕様書更新の後
zg index

# 調査で鮮度が絶対必要な場合
zg query --refresh wait --human "変更後の認可経路"
```

この更新は**索引を作った同じワークスペースルート**から実行する。別worktree・別cloneは別索引であり、現在のディレクトリが意図したリポジトリかを `pwd`、`git rev-parse --show-toplevel`、`zg status` で確認する。

### 5.3 Git hookによる更新

頻繁な編集のたびに同期更新すると重くなるため、`post-commit` よりも `post-merge` と `post-checkout` を基本にする。これはリモート反映・ブランチ切替後に索引を追随させる実用的な折衷である。

まず、並行実行を避けるラッパーを作る。

```bash
mkdir -p scripts .zg-lock
cat > scripts/zg-index-update.sh <<'SH'
#!/usr/bin/env sh
set -eu
root=$(git rev-parse --show-toplevel)
cd "$root"
lock="$root/.zg-index.lock"
if ! mkdir "$lock" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$lock"' EXIT HUP INT TERM
zg index
SH
chmod +x scripts/zg-index-update.sh
```

次にhookを入れる。

```bash
for hook in post-merge post-checkout; do
  cat > ".git/hooks/$hook" <<'SH'
#!/usr/bin/env sh
"$(git rev-parse --show-toplevel)/scripts/zg-index-update.sh" >/dev/null 2>&1 &
SH
  chmod +x ".git/hooks/$hook"
done
```

注意事項:

- `.git/hooks/` は通常Git管理されない。チームで配布するなら、hookテンプレート、`core.hooksPath`、またはセットアップスクリプトとして管理する。
- バックグラウンド実行はcheckout/pullを遅らせない代わりに、一時的に `possibly_stale` な検索結果を返し得る。直後の厳密な調査は `--refresh wait` を使う。
- hookは作業ツリー内のコードを実行するセキュリティ境界でもある。信頼できないリポジトリでは、内容をレビューせずhookを有効化しない。
- 同じリポジトリを複数ターミナル・複数エージェントで扱う場合、ロックが多重更新を抑止する。異常終了でロックディレクトリが残った場合だけ、プロセスが動いていないことを確認して `.zg-index.lock` を削除する。

### 5.4 定期更新とCIでの鮮度保証

hookだけでは、外部ツール・IDE・生成器が書き換えた場合や、長時間ブランチで作業した場合を取りこぼし得る。開発端末では15〜30分間隔のユーザータイマー、または作業開始時のタスクで以下を走らせる。

```bash
cd /absolute/path/to/target-repo && ./scripts/zg-index-update.sh
```

CIで索引を生成物として共有するかは慎重に判断する。`.zvec-grep/` はローカルワークスペースに結びつくため、まずは各開発者・各CIジョブがローカルに作る設計を推奨する。CIで保証すべきなのは「索引ファイルをコミットしたこと」ではなく、次のような調査前提の健全性である。

```bash
zg index
zg status
# プロジェクトにある既知の入口を、rgで簡単に検査する例
zg query --rg -n -F "<known-entry-symbol>" <relevant-path>
```

秘密情報を含み得る索引やモデルキャッシュを、共有キャッシュ・外部artifact・リモートログへ不用意に出さない。

### 5.5 変更後の検証ループ

実装更新後、次を一組として実行すると、古い結論に依存しにくい。

```bash
# 1. 増分更新
zg index

# 2. 調査クエリを再実行（厳密に最新が必要ならwait）
zg query --refresh wait --human --limit 10 "<検証したい責務・データフロー>"

# 3. 根拠となる識別子・設定キー・エラーを完全検索
zg query --rg -n -F "<identifier-or-literal>" <path>

# 4. 索引状態を記録
zg status
```

報告には少なくとも「Gitコミット」「zg version」「埋め込みモデル」「索引実行時刻」「クエリ」「根拠パス・行」を含める。これにより、仕様変更後に過去の調査結果を再現・差分比較できる。

## 6. トラブルシューティング・運用チェックリスト

### コマンドや索引

- `zg` が見つからない: Node.jsが22以上か、npmグローバルbinがPATHにあるか、`command -v zg` と `zg version` を確認する。
- 検索が空・弱い: まず `zg status` でワークスペースと索引を確認する。既知語は `--rg`、既知語を順位付けしたいなら `--fts`、場所不明なら既定ハイブリッドを使う。
- 期待ファイルがない: `zg index --debug` でスキップ理由を調べる。形式、バイナリ判定、最大サイズ、ignore、深さ、初回スコープを確認する。
- モデルを変えたのに品質が変わらない: 旧索引を使っている可能性がある。`zg index --rebuild --embedding <model>` を実行する。
- スコープを広げても反映されない: 既存索引が保存済みのファイル選択規則を再利用している。`zg help index` で確認のうえ `--reset-paths` を使って意図的に設定を置換する。
- MCPで見えない: `zg install` 後にエージェントを再起動する。既知の識別子でエージェントがnative rgを選ぶのは正常である。

### 調査品質

- 検索ヒットだけで制御フローを確定しない。呼び出し元・呼び出し先・条件分岐・例外・テストを読む。
- 動的ディスパッチ、reflection、DI、コード生成、macro、feature flag、環境変数、非同期キュー、pluginは静的検索だけで欠落しやすい。実行時検証を計画する。
- `possibly_stale` の結果を設計レビューの確定根拠にしない。`zg index` または `--refresh wait` の後で再検証する。
- 変更作業をするエージェントと、証拠を集めるエージェントの役割を分ける。前者にはテスト・diffを、後者にはパス・行・根拠を要求する。

## 7. 参照先

- [Zvec-Grep documentation](https://zvec.org/en/docs/zvec-grep/)
- [Manage an Index](https://zvec.org/en/docs/zvec-grep/indexing/)
- [Search Guide](https://zvec.org/en/docs/zvec-grep/search/)
- [Embedding Models](https://zvec.org/en/docs/zvec-grep/embedding-models/)
- [Supported Content](https://zvec.org/en/docs/zvec-grep/supported-content/)
- [Connect AI Agents](https://zvec.org/en/docs/zvec-grep/agents/)
- [CLI Reference](https://zvec.org/en/docs/zvec-grep/cli/)
- [Troubleshooting](https://zvec.org/en/docs/zvec-grep/troubleshooting/)

この手順書は公開ドキュメントを基にした運用テンプレートである。実行前には、必ず利用中のバージョンで `zg help`、`zg help index`、`zg help query` を実行し、オプションと挙動を確認すること。
