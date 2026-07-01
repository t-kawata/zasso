<!--
================================================================================
この CLAUDE.md は汎用雛形です。

- プロジェクト固有の設定値・固有名詞は PROJECT_SPECIFIC のコメントアウトで囲み、
  各ブロック先頭のコメントに従って自プロジェクトの情報に置き換えてください。
- コメント内には「何を書くべきか」と「zasso プロジェクトの記述例」を
  併記しています。自プロジェクトに合わせて例を書き換えてから使用してください。
- コメントで囲まれていないセクション（翻訳可能性、Everything as Code、
  Boy Scout Rule、TDD、[::STUB::] 規則等）は言語非依存の原則です。
  プロジェクトに合わせて取捨選択して構いません。
================================================================================
-->
# CLAUDE.md — <!-- プロジェクト名（例: zasso） --> Project Instructions

このファイルは <!-- プロジェクト名 --> プロジェクトにおける Claude Code の最上位指示です。
以下のルールは、ユーザーが明示的にオプトアウトしない限りすべての作業に適用されます。

---

<!-- PROJECT_SPECIFIC: Project Overview - プロジェクトの概要説明を1〜2行で記述してください。
     例(zasso): zasso は既存OSの上で動作する「OS on OS」— 独自のアイデンティティ管理、アプリ実行環境（Sandbox）、P2P通信網を持つ自律分散型アプリケーションエコシステムです。
-->
## Project Overview

zasso は既存OS（macOS/Windows）の上で動作する「OS on OS」— 独自のアイデンティティ管理、アプリ実行環境（Sandbox）、P2P通信網を持つ自律分散型アプリケーションエコシステムです。
<!-- /PROJECT_SPECIFIC -->

<!-- PROJECT_SPECIFIC: Technology Stack - カテゴリと技術名の表を自プロジェクトの使用技術に書き換えてください。
     例(zasso): Primary Language=Rust, Desktop Framework=Tauri v2, Web Framework=Axum, Database=SeaORM, Frontend=Quasar, ...
-->
### Technology Stack

| Category | Technology |
|----------|-----------|
| Primary Language | Rust (edition 2021) |
| Desktop Framework | Tauri v2 |
| Web Framework | Axum (REST API) |
| Database | SeaORM (SQLite / PostgreSQL / MySQL) |
| Frontend | Quasar (Vue.js) |
| Cryptography | Ed448-Goldilocks |
| P2P Networking | EasyTier |
<!-- /PROJECT_SPECIFIC -->

<!-- PROJECT_SPECIFIC: Port Layout - 自プロジェクトで使用するポート番号一覧に書き換えてください。
     使用するポートがなければテーブルごと削除して構いません。
     例(zasso): 3910=REST API, 3911=Static content, 3912=LLM Proxy
-->
### Port Layout

| Port | Name | Service |
|------|------|---------|
| 3910 | RT_PORT | REST API (Axum) |
| 3911 | SW_PORT | Static content / proxy |
| 3912 | BIFROST_PORT | LLM Proxy |
<!-- /PROJECT_SPECIFIC -->

---

## 言語プロトコル (Language Protocol)

| 対象 | 言語 | 理由 |
|------|------|------|
| チャット・提案・解説 | **日本語** | 100%の理解と承認が品質を担保する |
| コードコメント | **日本語** | 日本人開発者が即座に意図把握 |
| 設計書・計画・タスク | **日本語** | 思考ログの可読性維持 |
| 実行ログ (`log::info!` 等) | **英語** | 国際的なデバッグ環境・検索性確保 |

**「人間への説明は日本語で、システムのログは英語で。」**
コメントの日本語化指示を誤ってログメッセージに適用してはいけません。

---

## Everything as Code — コメントは第一級市民

すべてのコメントは **コードの一部** であり、コードと同等の厳格さで記述・維持されなければなりません。以下の原則に従ってください：

1. **コメントは必然性を持て**: コードだけでは伝えられない意図、制約、背景を説明するために存在する。`// i++  // iをインクリメント` のような自明の言い換えは禁止。
2. **コメントは嘘をつくな**: コードとコメントが矛盾した瞬間、コメントが悪である。嘘のコメントはコードの品質をコード以上に損なう。
3. **コメントは陳腐化を許すな**: コードを変更したなら、対応するコメントも同時に更新しなければならない。コメントの更新漏れはバグとみなす。
4. **コメントはレビュー対象である**: コメントの追加・修正はコード変更と同様にレビューを通過しなければならない。

「動けばいい」は認められない。コードの意図が正確に伝わることまでが、完璧な実装の条件である。

---

## 可読性とは翻訳可能性である

**ソースコードは「実行可能な散文」である。** コードの可読性とは、コードを上から下に読んだときに自然言語（日本語・英語）の文章として完全に翻訳可能であるかどうかで測定される。

### 関数は「文」、クラスは「名詞」、モジュールは「段落」

関数/クラス/構造体に分割するタイミングは、単に「2回以上同じ処理をするから」（DRY）ではない。それだけでは不十分である。**コード自体が語るようにするため**に分割する。具体的には：

- **関数 = 動詞句（「〜を実行する」「〜を検証する」「〜を変換する」）**: 関数呼び出しの並びが、処理の流れを物語る文章になるように構成する
- **クラス/構造体 = 名詞（「ユーザー」「認証トークン」「設定情報」）**: データの構造そのものがドメインの概念を表現する
- **モジュール/ファイル = 段落（「認証処理」「支払いフロー」「ログ管理」）**: 関連する「文」と「名詞」をひとまとまりの議論として整理する

```rust
// ❌ 悪い例: 翻訳不可能なコード
fn process(&self, input: &str) -> Result<String> {
    let x = self.db.query("SELECT status FROM users WHERE id = ?", &[input])?;
    if x == "active" {
        let y = self.cache.get(format!("user:{}", input));
        let z = self.mailer.send(y.unwrap_or("guest@example.com"), "Welcome!")?;
        Ok(z.to_string())
    } else {
        Ok(String::new())
    }
}

// ✅ 良い例: 翻訳可能（日本語に逐語訳できる）コード
fn process(&self, user_id: &str) -> Result<String> {
    let user_status = self.fetch_user_status(user_id)?;
    if user_status.is_active() {
        let user_email = self.resolve_email(user_id);
        self.send_welcome_email(&user_email)?;
        Ok(EmailSendResult::success())
    } else {
        Ok(EmailSendResult::skipped())
    }
}
// 上記コードは「ユーザーステータスを取得し、アクティブならメールを解決して
// ウェルカムメールを送信し、成功を返す。そうでなければスキップを返す」
// と逐語訳できる。
```

この翻訳可能性により、以下の恩恵が得られる：
- **レビュー効率**: 処理の流れを追うために頭の中でコードを日本語に翻訳する必要がない
- **バグの発見率**: 「想定している処理の流れ」と「コードが語る処理の流れ」の不一致が一目でわかる
- **新人のオンボーディング**: ドメイン知識とコードの対応関係を推測できる
- **LLMとの協調**: 翻訳可能なコードは LLM にとっても理解しやすく、正確な修正提案が期待できる

### Boy Scout Rule との連動

既存コードに以下のような「翻訳不可能なコード」を見つけたら、積極的に関数/構造体への抽出リファクタリングを行い、来たときよりも美しくする：

- コメントを読まないと何をしているかわからない   → 処理ブロックごとに関数に抽出し、関数名で語らせる
- 一つの関数が「AND」や「THEN」で繋げられる複数の責務を持つ → 責務ごとに分割する
- 変数名が汎用的すぎる（`x`, `data`, `info`, `tmp`） → ドメインの概念を表す名前に変える
- 値が直接ハードコードされている → 名前付き定数に抽出する

```rust
// ❌ 翻訳不可能: コメントがないと何をしているかわからない
fn apply(v: &[u8], p: &[u8], k: &[u8]) -> Vec<u8> {
    let mut r = v.to_vec();
    for (i, &b) in p.iter().enumerate() {
        r[i % v.len()] ^= b;
    }
    r
}

// ✅ 翻訳可能: 関数名と構造化が語る
fn encrypt_with_xor(plaintext: &[u8], key: &[u8], iv: &[u8]) -> Vec<u8> {
    let mut ciphertext = iv.to_vec();
    xor_with_key(&mut ciphertext, plaintext, key);
    ciphertext
}

fn xor_with_key(buffer: &mut Vec<u8>, data: &[u8], key: &[u8]) {
    for (i, &byte) in data.iter().enumerate() {
        buffer[i % buffer.len()] ^= byte;
    }
}
```

### コメントとの役割分担

このポリシーは Everything as Code（日本語コメントの詳細記述）を**補完**するものであり、**代替**するものではない：

- ソースコード（関数名・変数名・構造）→ **「何をしているか」** を自然言語のように語る
- コメント（日本語の詳細記述）→ **「なぜそうしているか」「どのような制約があるか」** を説明する

コードが何をしているか理解するためにコメントを読ませる設計は可読性が低い。コード自体を読めば処理内容がわかる状態を目指し、コメントは一歩踏み込んだ意図の説明に専念させる。

---

## ワークフロー

### 計画承認ゲート (Plan Gate)

自明でない作業（以下「Tiny Change」を超えるもの）は、即座にコードを編集せず `/make-ticket` からのチケットパイプライン（make → plan → start → review）を開始するべきかどうかをユーザーに確認してください。`/plan` は使用しません。

**Tiny Change の定義（以下のすべてを満たす場合のみ）：**
- 1ファイルのみの変更
- `cargo fmt` またはコメント修正のみ
- 副作用リスクが皆無な1〜2行の明白なバグ修正

**以下は絶対に Tiny ではない（計画必須）：**
- `unsafe` ブロックの変更・追加
- パブリックAPI（構造体フィールド、関数シグネチャ）の変更
- 新しい依存クレートの追加
- アーキテクチャに関わる変更

### TDD の義務化

- バグ修正: 修正前にバグを再現する回帰テストを作成
- 新機能: 機能実装とセットで必ずテストを追加
  - Unit tests: 同一ファイル内の `mod tests`
  - Integration tests: `tests/` ディレクトリ
- テスト不可能な場合は理由を説明し、代替検証手順を提示
- `/tdd` コマンドも利用可能

### 検証の義務化 (Verification)

実装後は必ず以下を提供する：
1. **正確な検証コマンド**: Makefile が存在する場合は `make` 経由で実行
2. **実行結果**: パスしたことを確認した上で報告
3. **自己修正**: 失敗時は完了報告前に修正。未パス状態での報告は禁止

### 品質チェッカー指摘の修正義務 (Zero Tolerance)

`run-quality-checks.js` が報告する issues は、**修正をもってのみ解決する**。
以下のような理由による説明での回避を禁止する：

- 「許容範囲」「問題なし」「プロジェクトルールで許可されている」
- 「テストコードだから」「既存コードだから」
- その他、コードを変更せずに済ませようとする一切の言辞

唯一の例外は、**技術的に修正不可能であり、かつその理由をコードと具体値で示せる場合**のみとする。
その場合も修正不能の理由を説明し、ユーザーの明示的な承認を得た上でスルーする。
一度でも説明でごまかした場合、そのタスクは未完了とみなす。

### 自己レビュー

最終回答前に問題点を分類して報告する：
- **Blocker**: 破壊的変更、正当性のない `unsafe`、テスト失敗
- **Major**: ロジック誤り、型定義不備、エラーハンドリング漏れ
- **Minor/Nit**: コードスタイル、軽微な改善

---

<!-- PROJECT_SPECIFIC: データベース変更手順 - 自プロジェクトのDBマイグレーション手順に書き換えてください。
     DBを使用しないプロジェクトはこのセクションを削除して構いません。
     例(zasso): マイグレーション → make migrate-refresh、エンティティ自動生成 → make gen-entities
-->
## データベース変更時の絶対順序 (Database Independence)

**厳守すべき逐次実行手順：**

① コンパイルが通る状態を維持したまま、**マイグレーションファイルのみ**を修正
② 物理DBのスキーマ更新（`make migrate-refresh` 等）
③ 最新スキーマからエンティティ自動生成（`make gen-entities` 等）
④ ビルドエラーがないことを確認してから、**初めて**ソースコード実装を開始

**並行作業は禁忌。** 未確定のスキーマを先行してコードに書くとデッドロックに陥ります。
<!-- /PROJECT_SPECIFIC -->

---

<!-- PROJECT_SPECIFIC: データベース移植性 - 自プロジェクトで使用するORM/DBに合わせて書き換えてください。
     DBを使用しないプロジェクトはこのセクションを削除して構いません。
     例(zasso): SeaORM + SQLite/MySQL/PostgreSQL。ORM層でDB差異を吸収。
-->
## データベース移植性 (Database Portability)

zasso は SQLite をプライマリDBとしつつ、MySQL および PostgreSQL への差し替えを保証しなければならない。以下のルールを厳守する：

1. **ORM メソッド優先**: すべてのDB操作は ORM のクエリビルダーを使用する。ORMレイヤーでDB差異を吸収する。

2. **Raw SQL の禁止（原則）**: 生SQL実行は、ORM で表現不可能な場合に限り plan 承認を得た上で使用する。

3. **Raw SQL 必須時の条件**:
   - 自プロジェクトがサポートする全DB系統で同一SQLが動作することを検証する
   - DB固有関数は使用禁止。アプリケーション層での処理に置き換える

4. **マイグレーションも ORM 準拠**: 生SQLによるマイグレーションは禁止する。

5. **テストはインメモリDB**: 単体テスト・結合テストは高速なインメモリDBで実施し高速フィードバックを確保。
<!-- /PROJECT_SPECIFIC -->

---

## 「効率化」より「丁寧さ」— 横着は怠慢である

**「効率的に作業する」ことは目標ではない。** 「効率的」は「横着（必要な手順の省略）」の言い換えとして使われやすい。「効率が良い」と言いたくなったとき、それは多くの場合「手を抜きたい」という欲求の裏返しである。

以下の原則を守れ：

1. **安全な順序を省略するな**: データベース変更の逐次実行手順、排他制御、ロック処理 — 「動いているように見えるから」という理由で手順を飛ばしてはならない
2. **「上書きすれば動く」は危険信号**: 状態管理やリソース解放を怠り、上書きに頼る設計は横着である。必ず副作用を考慮した正しい手順を踏め
3. **説明を省略するな**: 「説明が面倒だから」「どうせ読めばわかるから」と Plan や設計判断の説明を省略してはならない
4. **検証を省略するな**: 「ちょっとした修正だから」「たぶん大丈夫だから」という理由でコンパイルやテストをスキップしてはならない

このプロジェクトにおける評価基準は **「どれだけ速く終わらせたか」ではなく「どれだけ正確に、安全に、後戻りなく実装したか」** である。

## Boy Scout Rule — 来たときよりも美しく

既存コードが現在のルールに適合していないことがある。それは既知の状態として受け入れ、一度に全てを修正する必要はない。

しかし、**あなたが触ったコードは、あなたが去るときにより良い状態でなければならない。**
作業の過程でルール違反を発見したら、その部分だけを、**無理のない範囲で**修正すること。具体的には：

- 編集した関数内に `unwrap()` があれば、`Result` 伝播に直す
- 通った行にハードコードされたパスがあれば、定数や設定に抽出する
- 修正したコメントが嘘をついていたら、真実に書き直す
- 触ったコードにテストがなければ、追加する

「今回は関係ない」として放置してはいけない。次に触る人がまた同じ違反コードを見ることになる。1歩ずつでも、常に前進する。

また、ルール違反を既存コードからコピーして新しいコードを書くことも禁止する。ルールは適用可能な時点から適用される。

- **Surgical Diff**: 数行の変更にファイル全体書き換えは禁止。最小差分で対応
- **検証なき完了報告禁止**: 最終編集の直後に必ずコンパイル・テストを実行
- **検証リソースの放置禁止**: 起動したプロセスや一時ファイルは完了前に停止・削除
- **憶測ハードコーディング禁止**: パス・マジックナンバーをハードコードしない
<!-- PROJECT_SPECIFIC: 設定値の一元管理 - 自プロジェクトの設定ファイルパスに書き換えてください。
     例(zasso): src-tauri/src/consts/settings.rs
-->
- **設定値は専用ファイルで一元管理**: ポート番号・パス・閾値等の設定定数は専用の設定ファイルに定義し、モジュール経由で参照する。テストコード内も含めてマジックナンバーの直書きを禁止する。新しい設定値はまず設定ファイルに追加する習慣を徹底する
<!-- /PROJECT_SPECIFIC -->
<!-- PROJECT_SPECIFIC: ビルドコマンドの抽象化 - 自プロジェクトのビルドコマンドに書き換えてください。
     Makefile 以外のビルドツール（package.json scripts, gradle, maven 等）を使用する場合は適宜読み替えてください。
     例(zasso): make check-be / make check-fe / make check-all (Makefile)
-->
- **ビルドツールの抽象化**: `cargo check`, `npm run build` 等の生コマンドを直接使用せず、Makefile またはプロジェクトの統一ビルドスクリプト経由で呼び出す
<!-- /PROJECT_SPECIFIC -->
- **`cd` によるワーキングディレクトリ変更禁止**: Bash で直接 `cd dir && cmd` すると cwd が永続化され、後続コマンドに影響する。Makefile 経由か `(cd dir && cmd)` のサブシェルを使うこと。絶対パスが必要な場合は `$(git rev-parse --show-toplevel)` でプロジェクトルートを取得する。
<!-- PROJECT_SPECIFIC: パッケージマネージャ操作 - 自プロジェクトの言語に合わせて書き換えてください。
     例(zasso): Cargo.toml + cargo add (Rust)
-->
- **依存関係ファイルへの直接手書き禁止**: 新しいパッケージ導入時は必ずパッケージマネージャのCLI（`cargo add`, `npm install`, `go get` 等）を使用する
<!-- /PROJECT_SPECIFIC -->
<!-- PROJECT_SPECIFIC: ビルド生成物同期 - 自プロジェクトのデプロイ手順に合わせて書き換えてください。
     例(zasso): フロントエンド資産配置は cp ではなく rsync --delete 相当のミラーリング
-->
- **ビルド生成物の不完全同期禁止**: ビルド生成物の配置はコピーではなくミラーリング（`rsync --delete` 相当）で行う
<!-- /PROJECT_SPECIFIC -->

---

<!-- PROJECT_SPECIFIC: 言語別コーディング規約 - 自プロジェクトで使用する言語のルールファイルパスに書き換えてください。
     ルールファイルが存在しない場合や、このレベルの詳細ルールが不要な場合はセクションごと削除して構いません。
     例(zasso):
       - rules/rust/coding-style.md
       - rules/rust/testing.md
       - rules/rust/patterns.md
       - rules/rust/security.md
       - rules/rust/hooks.md
-->
## 言語別コーディング規約

<!-- 言語名 --> 特化の詳細なガイドラインは以下のファイルを参照：
- `rules/<!-- 言語名 -->/coding-style.md`
- `rules/<!-- 言語名 -->/testing.md`
- `rules/<!-- 言語名 -->/patterns.md`
- `rules/<!-- 言語名 -->/security.md`
- `rules/<!-- 言語名 -->/hooks.md`
<!-- /PROJECT_SPECIFIC -->

<!-- PROJECT_SPECIFIC: 検証コマンド - 自プロジェクトのビルド・テストコマンドに書き換えてください。
     例(zasso): Makefile + make check-be / make check-fe / make check-all / make test
     Makefile がない場合は cargo test / npm test 等の生コマンドを直接記載してください。
-->
## 検証コマンド (Build & Test)

Makefile が存在するため、常に Makefile 経由でビルド検証・テストを実行する：

### ビルド検証 (`make check-*`)

編集内容に応じて適切なコマンドを選択する：

```bash
make check-be   # Rust（バックエンド）のみ編集時
make check-fe   # フロントエンドのみ編集時
make check-all  # 両方編集時
```

### テスト実行 (`make test`)

```bash
make test
```

Makefile が参照できない特殊な状況でのみ、直接 `cargo test` を使用する。
<!-- /PROJECT_SPECIFIC -->

---

## 第一級規則 — [::STUB::] マーカー絶対義務

不完全な実装（スタブ・モック・仮実装・プレースホルダー等、名称を問わず）には、例外なく `[::STUB::]` マーカーを付与しなければならない。これは本プロジェクトの**第一級規則**であり、**死守すべき絶対的法規**である。違反は「犯罪」として `.claude/commands/Malfeasance.json` に記録され、直ちに解決を要する。

本セクションは旧「スタブポリシー」を全面置き換えるものである。旧ルールと本規則が衝突する場合、本規則が優先される。

### 対象となるコード

以下のパターンはすべて「不完全な実装」とみなされ、`[::STUB::]` マーカーが必須である：

- `todo!()`, `unimplemented!()`, `panic!()` — 未実装を示すマクロ
- 空の関数本体（`fn foo() {}`）— 仮置きの空実装
- 未実装の `return Ok(())` / `return None` / `return Default::default()` — エラー処理未完了
- コメントアウトされた実装コード — 残骸の放置
- `TODO` / `FIXME` / `HACK` / `XXX` コメント — 未完了タスク（`[::STUB::]` と併記必須）
- Mock / Fake オブジェクト — 実結合未完了
- `#[allow(...)]` による警告抑制 — 解決予定の未完了項目

**例外の不存在**: テストコード、サンプルコード、プロトタイプも例外ではない。本プロジェクトの全コードが対象である。

### マーカー書式

```rust
// [::STUB::] <チケットID>: <解決方法の説明>
fn placeholder() -> Result<()> { Ok(()) }
```

解決先チケットが不明な場合：

```rust
// [::STUB::] 要解決: <判明している限りの情報>
fn placeholder() -> Result<()> { Ok(()) }
```

### 犯罪の検出と記録

1. **全フェーズ（make/plan/start/review）で Malfeasance.json を読み取り、未解決の犯罪を確認する**
2. **`[::STUB::]` 未付与の不完全実装を発見したら**：
   a. その場で `[::STUB::]` マーカーを追加する
   b. `malfeasance-create.js` で犯罪として記録する
   c. 直ちに解決する（実装完了・マーカー追加等）
3. **解決不可能な場合**：犯罪レコードの `note` に理由を記録し、`status` を維持する
4. **解決した場合**：`malfeasance-update.js` で `status` を `resolved` に変更する

### スクリプトリファレンス

```bash
# 犯罪スキャン（未解決の犯罪を全て表示、初回時は自動初期化）
.claude/scripts/tickets/scan-crimes.sh

# 犯罪を記録（直接操作が必要な場合）
node .claude/scripts/tickets/malfeasance-create.js "<file>" <line> "<description>" "[note]"

# 犯罪を解決済みに変更
node .claude/scripts/tickets/malfeasance-update.js "<id>" "status" "resolved"

# スタブの一覧取得
node .claude/scripts/tickets/review/find-all-stubs.js src
```

---

## RFC-OMISSIONS-001: anthropx 実装漏れ・不足の是正 設計マップ

### 目的

親 RFC（RFC-ROOT.md）の実装レビューで発見された 6 件の実装漏れ（O-001〜O-006）を是正する。対象は HTTP クライアント接続設定、リクエストレベルタイムアウト、メトリクス登録の冪等性ガード、リクエストメトリクス記録、llm-bridge-core バージョン更新の 5 領域。

### 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|----------|----------|------|
| `src/lifecycle.rs` | 修正 | `build_provider_clients()` で builder 利用 + timeout 設定 |
| `src/provider/transparent.rs` | 修正 | `execute_with_failover()` に `.timeout()` / `proxy_sse_stream()` に idle timeout |
| `src/provider/translate.rs` | 修正 | `translate_non_stream()` に `.timeout()` / `translate_stream()` に idle timeout |
| `src/observability/metrics.rs` | 修正 | `OnceLock<()>` ガード追加 |
| `Cargo.toml` | 修正 | `llm-bridge-core` v0.2.6 → v0.3.0 |

### 依存グラフ（5層モデル）

| 層 | 該当チケット | 内容 | 外部依存 |
|----|-------------|------|---------|
| Layer 0（型定義） | — | 新規型なし | なし |
| Layer 1（純粋関数） | P0 | `register_metrics()` OnceLock ガード | なし |
| Layer 2（非同期ランタイム） | P1, P2 | HTTP Client builder / timeout 設定 | tokio, reqwest |
| Layer 3（ライフサイクル管理） | — | 該当なし | — |
| Layer 4（統合・プラットフォーム） | P3 | llm-bridge-core v0.3.0 更新 | crates.io |

### 親RFCとのOMISSIONS対応

| チケット | OMISSIONS | 親RFC § | 設計判断 |
|----------|-----------|---------|---------|
| P1-1 | O-001 | §F.1, §F.6 | N1-B: 標準構成（YAGNI） |
| P2-1, P2-2 | O-002, O-003 | §F.1 | N2-A: 即時切断（Anthropic 標準） |
| P0-1 | O-004 | §F.2 | N3-A: OnceLock<()> |
| — | O-005 | §10.4 | 実装済みのため変更不要 |
| P3-1 | O-006 | §1.1, §6.2 | N5-A: 今すぐ更新 |
```
