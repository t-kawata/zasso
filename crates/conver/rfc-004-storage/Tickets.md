# RFC_004: 永続化ストレージ（conver-storage） 実装チケット分解設計書

> **生成元:** crates/conver/rfc-004-storage/RFC_004.md
> **生成日:** 2026-06-23
> **分析済みセクション:** §1 Abstract, §2 Motivation, §3 System Structure, §4 StorageBackend trait, §5 AtomicWriter, §6 CrudStore trait, §7 Checkpoint, §8 round_log, §9 TamperDetector, §10 Manifest, §11 PathResolver, §12 Error, §13 Public API, §Implementation

---

## Phase 0: 基盤 — 型定義と純粋関数

> **外部依存:** serde, serde_json, thiserror（Cargo.toml で定義）
> **このフェーズの方針:** 全ファイルがコンパイル可能。外部 I/O なし。テストはすべてメモリ内完結。

### M0-1: StorageError — エラー型の定義

> **DB:** メモリ内完結（DB不使用）

#### チケット M0-1-1: StorageError 列挙型の定義

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§10, §11)
- **依存・関連チケットID:** なし（最基盤）。全チケットが依存。
- **対象不変条件 / 規範:**
  - 9 variants がすべて定義される
  - 各 variant が意味的に適切なエラーメッセージを持つ
  - `From<serde_json::Error>`, `From<std::io::Error>`, `From<walkdir::Error>` が実装される
  - `NotFound` と `AlreadyExists` がパス文字列を含む
  - `NoCheckpoint` と `CheckpointNotFound` が排他的（同時に発生しないエラー状態であること）
- **実装の背景と目的:**
  本 crate の全モジュールが使用する最下層のエラー型。thiserror の `#[derive(Error)]` で
  実装し、`Display` の自動導出と `#[source]` によるエラーチェインを提供する。
  このチケットが最初に実装される理由は、全モジュールが StorageError を返すため。
  後続のあらゆるチケットはこのエラー型の存在を前提とする。
- **実装スコープ:**
  - `conver-storage/src/error.rs` ファイルの新規作成
  - `StorageError` 列挙型（9 variants）:
    - `NotFound(String)` — ファイルが存在しない
    - `AlreadyExists(String)` — ファイルが既に存在する
    - `Deserialize(String, serde_json::Error)` — JSON デシリアライズ失敗
    - `Serialize(serde_json::Error)` — JSON シリアライズ失敗（#[from]）
    - `Io(std::io::Error)` — I/O エラー（#[from]）
    - `IoError(String)` — 詳細な I/O エラー
    - `NoCheckpoint` — チェックポイント未存在
    - `CheckpointNotFound(PathBuf)` — チェックポイントディレクトリ未存在
    - `ParseError(String)` — パースエラー
  - `impl From<walkdir::Error> for StorageError` — walkdir エラーの変換
  - 各 variant の `#[error("...")]` 表示形式
- **テストコードによる検証:**
  1. **正常系**: 各 variant を生成し、`Display` 出力が期待文字列を含むことを確認
  2. **異常系**: なし（エラー型自体の生成は常に成功する）
  3. **境界値**: `NotFound("")`（空文字列パス）が許容されること
  4. **決定論性**: 同一 variant は常に同一の `Display` 出力を生成する
  5. **コンパイル時検証**: `Send + Sync` 境界を満たすこと
- **計装方法・観測対象:**
  `Display` 出力のスナップショットテスト（文字列包含検証）。
  エラーの `source()` チェーンが正しいことの検証。

---

### M0-2: PathResolver — ルート相対パス解決

> **DB:** メモリ内完結（DB不使用）

#### チケット M0-2-1: PathResolver 構造体とメソッドの実装

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§9)
- **依存・関連チケットID:** なし（純粋関数、依存なし）。M2-1-1（FileBackend）が依存。
- **対象不変条件 / 規範:**
  - `resolve(".")` は `root` をそのまま返す
  - `resolve("sub/path")` は `root/sub/path` を返す
  - `rfc_file(id, path)` は `dir/RFC_{id}.md` を返す
  - `tickets_file(path)` は `dir/Tickets.json` を返す
  - すべてのメソッドが I/O を伴わない純粋関数
- **実装の背景と目的:**
  RFC_TREE.json の `path` フィールド（"." や "rfc-001-cli" 等）をファイルシステム上の
  絶対パスに解決するための純粋ユーティリティ。I/O を伴わないため Phase 0 で実装可能。
  FileBackend（M2-1-1）が内部で使用する。
  このモジュールが独立している理由は、パス解決ロジックがアプリケーション全体で
  統一されている必要があり、かつテスト容易性を確保するため。
- **実装スコープ:**
  - `conver-storage/src/path.rs` ファイルの新規作成
  - `PathResolver` 構造体:
    - `new(root: PathBuf) -> Self`
    - `resolve(rfc_path: &str) -> PathBuf` — `.` は root、それ以外は root/rel_path
    - `rfc_file(node_id: &str, rfc_path: &str) -> PathBuf` — RFC_XXX.md のパス
    - `tickets_file(rfc_path: &str) -> PathBuf` — Tickets.json のパス
    - `root() -> &Path` — root の参照を返す
- **テストコードによる検証:**
  1. **正常系**: `.` → root、`sub` → root/sub、`a/b/c` → root/a/b/c
  2. **異常系**: なし（純粋関数、不正入力の余地なし）
  3. **境界値**: `.`（root 自身）、長いパス、空文字列（`resolve("")` は root を返す）
  4. **決定論性**: 同一入力 → 同一出力（何度実行しても同じ）
  5. **コンパイル時検証**: メソッドが `&self` のみをとり、ミュータビリティがないこと
- **計装方法・観測対象:**
  各メソッドの戻り値を `Path::new()` 期待値と直接比較。
  不変条件（`.` と空文字列のハンドリング）を網羅。

---

### M0-3: 純粋データ型 — Manifest / ManifestAsset / BuildInfo / RfcNodeInfo

> **DB:** メモリ内完結（DB不使用）

#### チケット M0-3-1: Manifest / ManifestAsset / BuildInfo の型定義

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§8)
- **依存・関連チケットID:** M0-1-1（StorageError — ManifestStore の read/write が使用）。
  後続: M3-2-1（ManifestStore 完全実装）。
- **対象不変条件 / 規範:**
  - 全フィールドが `Serialize + Deserialize` を満たす
  - `version` は `u32`
  - `sha256` は 64 文字の16進文字列（呼出し側の責任だが、型の制約として明記）
  - 各構造体が `#[derive(Debug, Clone, Serialize, Deserialize)]` を持つ
- **実装の背景と目的:**
  Manifest / ManifestAsset / BuildInfo はインストールマニフェストのデータ構造。
  これらは純粋なデータ型であり、I/O 操作を含まない。M3-2-1（ManifestStore）が
  これらの型を使用してファイル読み書きを行う。
  データ型を先に定義することで、ManifestStore の実装時に型の存在を前提にできる。
- **実装スコープ:**
  - `conver-storage/src/manifest.rs` ファイルの新規作成（型定義のみ、Store 実装は M3-2-1）
  - `Manifest` 構造体:
    - `version: u32`
    - `installed_by: String`
    - `updated_at: String`
    - `assets: Vec<ManifestAsset>`
    - `rfc_tree_hash: Option<String>`
  - `ManifestAsset` 構造体:
    - `logical_name: String`, `relative_path: PathBuf`, `sha256: String`
    - `asset_kind: String`, `version: String`
    - `compatible_runtimes: Vec<String>`, `dependencies: Vec<String>`
    - `build_info: Option<BuildInfo>`
  - `BuildInfo` 構造体:
    - `git_rev: String`
- **テストコードによる検証:**
  1. **正常系**: 各構造体を構築し、`serde_json::to_string` / `from_str` でラウンドトリップ
  2. **異常系**: 不全な JSON からの deserialize が適切にエラーを返す
  3. **境界値**: 空の `assets: Vec`、空文字列フィールド、`None` の `rfc_tree_hash`
  4. **決定論性**: 同一構造体 → 同一 JSON 出力（Serialize の順序が安定していること）
  5. **コンパイル時検証**: `Serialize + Deserialize + Debug + Clone` の auto-trait 充足
- **計装方法・観測対象:**
  `serde_json` のラウンドトリップテスト。JSON 出力が予期したキーと構造を持つことの確認。

#### チケット M0-3-2: RfcNodeInfo の型定義

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§7)
- **依存・関連チケットID:** なし（純粋データ型）。M3-1-1（TamperDetector）が使用。
- **対象不変条件 / 規範:**
  - `id` は RFC ノードの ID 文字列
  - `path` は RFC_TREE.json の path フィールドに対応
  - `sha256` は SHA-256 ハッシュ（64文字の16進文字列）
  - `#[derive(Debug, Clone)]` — Serialize/Deserialize は必要に応じて追加（現在は不要）
- **実装の背景と目的:**
  改竄検出で使用される RFC ノード情報。TamperDetector の `verify_all()` に
  ノード一覧を渡すためのデータ型。`sha2` / `hex` クレートへの依存は
  TamperDetector 側（M3-1-1）で解決し、この型は純粋データとして定義する。
  設計書では Serialize/Deserialize を要求しないが、将来的に JSON 永続化が必要な場合は
  後方互換を保ったまま追加可能。
- **実装スコープ:**
  - `conver-storage/src/tamper.rs` ファイルの新規作成（RfcNodeInfo 型定義のみ、Detector 実装は M3-1-1）
  - `RfcNodeInfo` 構造体:
    - `pub id: String`
    - `pub path: String`
    - `pub sha256: String`
- **テストコードによる検証:**
  1. **正常系**: 構造体を構築しフィールドが正しく設定される
  2. **異常系**: なし（ゲッター/セッターなし、パブリックフィールド）
  3. **境界値**: 空文字列の `id` を持つインスタンス（アプリケーション層での制約は呼出し側に委ねる）
  4. **決定論性**: 同一入力 → 同一構造体
  5. **コンパイル時検証**: `Debug + Clone` の auto-trait 充足
- **計装方法・観測対象:**
  フィールドアクセスのみ、特に複雑な振る舞いなし。構造体の構築と `assert_eq!` による検査。

---

## Phase 1: I/O プリミティブ — 同期的ファイル操作

> **外部依存:** serde, serde_json, log（Cargo.toml で定義）
> **このフェーズの方針:** 単一ファイル/単一ディレクトリへの操作を実装する。
> 各モジュールは独立してテスト可能。テストは tempfile で一時ディレクトリを使用。

### M1-1: AtomicWriter — write-temp → fsync → rename

> **DB:** メモリ内完結（tempfile ベースの一時ディレクトリでテスト）

#### チケット M1-1-1: AtomicWriter の実装と耐久性保証

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§3, Appendix B)
- **依存・関連チケットID:**
  - 先行実装必須: M0-1-1（StorageError）
  - 後続: M2-1-1（FileBackend、AtomicWriter を使用）
  - 並列可能: M1-2-1（AppendOnlyLog）、M1-3-1（CheckpointStore）
- **対象不変条件 / 規範:**
  - write() 完了後、目標ファイルの内容が指定された content と一致する
  - 書き込み成功後、.tmp ファイルが残らない（完全クリーンアップ）
  - 書き込み失敗時、元のファイルは変更されない（クラッシュ耐性）
  - 親ディレクトリが存在しない場合は自動的に作成される
  - fsync（sync_all）が必ず実行される（データ + メタデータのディスクフラッシュ）
  - 親ディレクトリの fsync も実行される（メタデータの耐久性保証）
- **実装の背景と目的:**
  この crate の最重要コンポーネント。全書き込み（`write_json`, `create`, `update` 等）
  はすべてこの AtomicWriter を経由する。`write-temp → fsync → rename` の3段階パターン
  により、書き込み途中のクラッシュでも目標ファイルが破損しないことを保証する。
  書き込みパターン:
  1. `<target>.tmp` に内容を書き込む
  2. `fsync` でディスクへの書き込み完了を保証
  3. `rename` で一時ファイルを目標ファイルに置き換え（同一ファイルシステム上の atomic 操作）
  4. 親ディレクトリの `fsync` でメタデータ（ディレクトリエントリ）の耐久性保証
  失敗時は .tmp ファイルをクリーンアップしてからエラーを返す。
  `write_sync()` メソッドはテスト用の同期的書き込みとして提供する（本番では `write()` を使用）。
  **絶対条件:** .tmp ファイルが書き込み後に残ってはならない。これが満たせない場合は
  `[::STUB::]` マーカーを付け、解決不能の理由を明記すること。
- **実装スコープ:**
  - `conver-storage/src/atomic.rs` ファイルの新規作成
  - `AtomicWriter` 構造体:
    - `new() -> Self`
    - `write(path: &Path, content: &[u8]) -> Result<(), StorageError>`:
      1. 親ディレクトリの存在確認・作成 (`fs::create_dir_all`)
      2. 一時ファイル `<target>.tmp` への書き込み (`fs::File::create`, `write_all`)
      3. `file.sync_all()` によるディスクフラッシュ
      4. `fs::rename` による atomic 置き換え
      5. 親ディレクトリの `fs::File::open` + `sync_all` によるメタデータ耐久性保証
      6. 失敗時は `fs::remove_file` で .tmp クリーンアップ
    - `write_sync(path: &Path, content: &[u8]) -> Result<(), StorageError>` — テスト用
  - モジュール内 `write_tmp()` 関数（非公開: Step 1 + Step 2 を担当）
- **テストコードによる検証:**
  1. **正常系**: ファイル書き込み後、内容が正しいこと + .tmp が存在しないこと
  2. **異常系**: 存在しない親ディレクトリ → 自動的に作成される（正常系に含む）
  3. **境界値**: 空ファイル（`b""`）の書き込み、大容量データ（1MB以上）の書き込み
  4. **決定論性**: 同一内容 → 同一ファイルサイズ・内容
  5. **冪等性**: 同一ファイルへの複数回書き込み（上書き）が正しく動作すること
  6. **残留物検査**: 書き込み成功後に .tmp ファイルが決して残らないこと
- **計装方法・観測対象:**
  書き込み完了後のファイル内容と .tmp ファイル不存在を `std::fs::metadata` で確認。
  `write_sync` との動作比較による正当性検証。

---

### M1-2: AppendOnlyLog — 追記専用ログ

> **DB:** メモリ内完結（tempfile ベースの一時ディレクトリでテスト）

#### チケット M1-2-1: AppendOnlyLog 構造体と append/read 操作

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§6)
- **依存・関連チケットID:**
  - 先行実装必須: M0-1-1（StorageError）
  - 並列可能: M1-1-1（AtomicWriter、I/O レベルが異なる独立した操作）
- **対象不変条件 / 規範:**
  - append() の行は既存行の末尾に追記される（既存行は変更されない）
  - 1 行が 1 件の JSON（自動的に改行で区切られる）
  - read_all() が全行を Vec\<String\> で返す（空ファイルは空 Vec）
  - read_latest() が最終行のみを返す（空なら None）
  - count() が行数と一致する
  - 存在しないファイルの read_all() は空 Vec（エラーではない）
  - 全 append 後に fsync(sync_all) が実行される
- **実装の背景と目的:**
  round_log.jsonl は各ループの観測ベクトルを追記専用で保存する。
  append-only によりファイル全体のロック不要で書き込め、追記のみのため改竄耐性が高い。
  1 行が 1 つの ObservationVector に対応する。
  **設計上の制約:** 追記は atomic ではない。書き込み途中のクラッシュで最終行が欠落する
  可能性があるが、これは許容範囲とする（次回起動時に最終完全行まで読み直す）。
- **実装スコープ:**
  - `conver-storage/src/round_log.rs` ファイルの新規作成
  - `AppendOnlyLog` 構造体:
    - `new(base_path: &Path) -> Self` — `round_log.jsonl` のパスを設定
    - `append(line: &str) -> Result<(), StorageError>`:
      - `OpenOptions::new().create(true).append(true)` でファイルを開く
      - `writeln!(file, "{}", line)` で JSON Lines 形式で追記
      - `file.sync_all()` でディスク耐久性保証
    - `read_all() -> Result<Vec<String>, StorageError>`:
      - ファイルが存在しない場合は空 Vec を返す（エラーではない）
      - `fs::read_to_string` + `lines().map(|l|l.to_string()).collect()`
    - `read_latest() -> Result<Option<String>, StorageError>`:
      - read_all() の結果の `.last().cloned()`
    - `count() -> Result<usize, StorageError>`
  - 自由関数:
    - `append_observation<T: serde::Serialize>(base_path: &Path, observation: &T) -> Result<(), StorageError>`
- **テストコードによる検証:**
  1. **正常系**: 2行追記 → read_all() が2行返す
  2. **異常系**: 不正なパス（権限不足）→ 適切な StorageError
  3. **境界値**: 空ファイルからの read_all() → 空 Vec、count() → 0
  4. **決定論性**: 同一順序の append → 同一内容の read_all()
  5. **追記不変性**: append 後、既存行の内容が変化しないことを確認
  6. **行区切り**: writeln により必ず改行で終わること
- **計装方法・観測対象:**
  各操作前後の行数・内容を直接比較。`read_latest()` が最新の追記行のみを
  返すことの検証。空ファイルのハンドリング確認。

---

### M1-3: CheckpointStore — チェックポイント永続化

> **DB:** メモリ内完結（tempfile ベースの一時ディレクトリでテスト）

#### チケット M1-3-1: CheckpointStore の commit / rollback / cleanup

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§5, Appendix A)
- **依存・関連チケットID:**
  - 先行実装必須: M0-1-1（StorageError）
  - 並列可能: M1-1-1, M1-2-1
  - リソース共有: M2-1-1（FileBackend が委譲して使用）
- **対象不変条件 / 規範:**
  - commit() 後、`cp_NNNN/` ディレクトリに対象ファイルがコピーされる
  - 保存対象: Status.json, DesignTree.json, RFC_TREE.json, round_log.jsonl（存在する場合のみ）
  - rollback() 後、現在の状態ファイルがチェックポイント時点の内容に復元される
  - 古いチェックポイントは最大 10 世代まで保持される（cleanup）
  - チェックポイントが存在しない状態での rollback() は `NoCheckpoint` エラー
  - `latest` へのシンボリックリンクが維持される（unix は symlink, windows は symlink_dir）
- **実装の背景と目的:**
  ワークフロー状態のスナップショット保存と復元。commit_checkpoint() により現在の
  全状態ファイルをチェックポイントディレクトリにコピーする。rollback_to_checkpoint()
  によりチェックポイント時点の状態に復元する。
  チェックポイントは機械的に（LLM呼出しなしで）副作用として実行される。
  ファイル構造:
  ```
  .conver/checkpoints/
    cp_0001/
      Status.json / DesignTree.json / RFC_TREE.json / round_log.jsonl
    cp_0002/ ...
    latest → cp_0002  (symlink)
  ```
- **実装スコープ:**
  - `conver-storage/src/checkpoint.rs` ファイルの新規作成
  - `CheckpointStore` 構造体:
    - `new(base_path: PathBuf) -> Self` — `counter: 0` で初期化
    - `commit() -> Result<(), StorageError>`:
      1. `fs::create_dir_all` でチェックポイントディレクトリ作成
      2. 対象ファイル（Status.json, DesignTree.json, RFC_TREE.json）を `fs::copy` で保存
      3. round_log.jsonl も存在すれば保存
      4. latest シンボリックリンクを更新（`#[cfg(unix)]` / `#[cfg(windows)]`）
      5. `cleanup_old(10)` で古いチェックポイント削除
      6. `log::info!` でログ出力
    - `rollback() -> Result<(), StorageError>`:
      1. latest リンクを `fs::read_link` で解決
      2. 対象ファイルを `fs::copy` でチェックポイントから復元
    - `cleanup_old(max_generations: usize) -> Result<(), StorageError>`:
      1. チェックポイントディレクトリ内のディレクトリ一覧を名前でソート
      2. 最大世代数を超えた古いものを `fs::remove_dir_all` で削除
  - 補助メソッド:
    - `cp_dir(&self) -> PathBuf` — `.conver/checkpoints` パス
    - `next_id(&mut self) -> String` — `cp_NNNN` 形式の ID 生成（self.counter をインクリメント）
- **テストコードによる検証:**
  1. **正常系**: commit → ファイル作成 → rollback → 状態復元
  2. **異常系**: チェックポイント未存在での rollback → NoCheckpoint エラー
  3. **境界値**: 最大10世代のクリーンアップ（15回 commit 後、10ディレクトリ以下）
  4. **決定論性**: 同一操作順序 → 同一ファイル構成
  5. **シンボリックリンク**: latest リンクが常に最新の cp_NNNN を指すこと
- **計装方法・観測対象:**
  チェックポイントディレクトリ内のディレクトリ数とファイル内容の直接比較。
  シンボリックリンクの解決結果の検証。世代数制限の確認。

---

## Phase 2: バックエンド統合 — FileBackend と CRUD 抽象化

> **外部依存:** serde, serde_json, walkdir, log（Cargo.toml で定義）
> **このフェーズの方針:** Phase 1 の I/O プリミティブを統合し、StorageBackend trait を実装する。
> CrudStore は FileBackend の上に CRUD 操作の統一インターフェースを提供する。

### M2-1: FileBackend — StorageBackend trait の実装

> **DB:** メモリ内完結（tempfile ベースの一時ディレクトリでテスト）

#### チケット M2-1-1: StorageBackend trait と FileBackend 実装

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§2, §11, Appendix C)
- **依存・関連チケットID:**
  - 先行実装必須: M0-1-1（StorageError）、M0-2-1（PathResolver）、M1-1-1（AtomicWriter）、M1-3-1（CheckpointStore）
  - 後続: M2-2-1（CrudStore）、M3-1-1（TamperDetector）
  - **注意点:** RFC では StorageBackend trait は「conver-core で定義」と記載されているが、
    conver-core が未実装のため、本 crate の backend.rs 内に trait 定義も含める。
    将来 conver-core 実装時に trait 定義を移譲する場合は、`pub use conver_core::StorageBackend`
    形式で再公開する（後方互換性を維持した移行が可能）。
- **対象不変条件 / 規範:**
  - new() 時に base_path が存在しない場合は作成される
  - 全パスは base_path からの相対として解決される
  - 全書き込みは AtomicWriter を経由する
  - all_files() は指定された拡張子でフィルタリングする
  - all_files() は `.` で始まるエントリ（隠しファイル/ディレクトリ）をスキップする
  - append() は OpenOptions::append(true) で逐次的ファイルオープンを行う
  - commit_checkpoint() / rollback_to_checkpoint() は CheckpointStore に委譲する
- **実装の背景と目的:**
  本 crate の中核。StorageBackend trait はストレージバックエンドの抽象化であり、
  FileBackend はそのファイルベース実装。すべての上位操作（CRUD、改竄検出、マニフェスト）
  はこの FileBackend を通じてファイル操作を行う。
  エラーの基準となる操作:
  - `read_json`: ファイルが存在しない → NotFound。JSON がパースできない → Deserialize
  - `write_json`: 中間ファイル作成に失敗 → Io（AtomicWriter から伝播）
  - `create`: ファイルが既に存在 → AlreadyExists
  - `update`: ファイルが存在しない → NotFound
- **実装スコープ:**
  - `conver-storage/src/backend.rs` ファイルの新規作成
  - `StorageBackend` trait（次回 conver-core 移譲を注記）:
    - `read_json<T: DeserializeOwned>(&self, path: &str) -> Result<T, StorageError>`
    - `write_json<T: Serialize>(&mut self, path: &str, data: &T) -> Result<(), StorageError>`
    - `exists(&self, path: &str) -> bool`
    - `remove(&mut self, path: &str) -> Result<(), StorageError>`
    - `read_to_string(&self, path: &str) -> Result<String, StorageError>`
    - `append(&mut self, path: &str, data: &[u8]) -> Result<(), StorageError>`
    - `all_files(&self, extension: Option<&str>) -> Result<Vec<PathBuf>, StorageError>`
    - `commit_checkpoint(&mut self) -> Result<(), StorageError>`
    - `rollback_to_checkpoint(&mut self) -> Result<(), StorageError>`
    - `base_path(&self) -> &Path`
  - `FileBackend` 構造体:
    - `base_path: PathBuf`, `atomic_writer: AtomicWriter`
    - `new(base_path: impl Into<PathBuf>) -> Result<Self, StorageError>`:
      - `fs::create_dir_all` + `canonicalize`
      - `AtomicWriter::new()` で初期化
    - `resolve(&self, path: &str) -> PathBuf`（非公開: `self.base_path.join(path)`）
  - impl StorageBackend for FileBackend:
    - 各メソッドの実装（設計書のコードそのまま）
    - `read_json`: resolve → exists 確認 → read_to_string → serde_json::from_str
    - `write_json`: serialize → atomic_writer.write
    - `all_files`: walkdir で再帰検索（`.` プレフィックスフィルタ、拡張子フィルタ）
    - `commit_checkpoint` / `rollback_to_checkpoint`: CheckpointStore 経由
- **テストコードによる検証:**
  1. **正常系**: write_and_read_json → ラウンドトリップ一致
  2. **異常系**: read_nonexistent → NotFound エラー
  3. **境界値**: 空の JSON（`{}`）の読み書き、ネストしたディレクトリパス
  4. **決定論性**: 同一データの write → read → 同一データ
  5. **all_files**: 異なる拡張子ファイル作成後、フィルタリングが正しいこと
  6. **hidden file filter**: `.` で始まるエントリが all_files に含まれないこと
  7. **冪等性**: remove の多重呼出しがエラーにならないこと
  8. **append**: 追記が既存内容に追加されること
- **計装方法・観測対象:**
  各操作の入出力比較。特に `resolve` によるパス解決が base_path に束縛されることを
  確認（ディレクトリトラバーサル防止 — 相対パス解決が正しいこと）。

---

### M2-2: CrudStore — CRUD 操作の統一インターフェース

> **DB:** メモリ内完結（tempfile ベースの一時ディレクトリでテスト）

#### チケット M2-2-1: CrudStore trait と FileBackend への実装

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§4)
- **依存・関連チケットID:**
  - 先行実装必須: M2-1-1（FileBackend）
  - 並列可能: なし（FileBackend のインターフェースに依存）
- **対象不変条件 / 規範:**
  - create() は既存ファイルに対して `AlreadyExists` エラーを返す
  - update() は存在しないファイルに対して `NotFound` エラーを返す
  - search() は指定パスを順次読み取り、成功したものを結果として返す
  - all() は all_files + read_json のコンポジション
  - batch_update() / batch_delete() は逐次実行（**atomicity 保証なし** — 設計上の制約）
  - delete() は存在しないファイルの削除を試みてもエラーにしない（FileBackend::remove に委譲）
- **実装の背景と目的:**
  CrudStore は全ファイル操作の統一インターフェース。FileBackend の低レベル操作の上に
  意味的な CRUD 操作（「新規作成」「更新」「検索」等）を提供する。
  **既知の制約:** batch_update / batch_delete は逐次実行であり、中途でのエラーに
  よるロールバックは保証されない。この制約は上位層で補償する（親RFC §4 のトランザクション
  管理は本 crate のスコープ外）。
  search() の実装は単純なパス列挙であり、全文検索等ではない。これは効率的な検索が必要な
  場合に上位層でインメモリインデックスを構築するための基盤として位置づける。
- **実装スコープ:**
  - `conver-storage/src/crud.rs` ファイルの新規作成
  - `CrudStore` trait:
    - `search<T: DeserializeOwned>(&self, query: &str, paths: &[&str]) -> Result<Vec<(String, T)>, StorageError>`
    - `get<T: DeserializeOwned>(&self, path: &str) -> Result<T, StorageError>`
    - `all<T: DeserializeOwned>(&self, extension: &str) -> Result<Vec<(String, T)>, StorageError>`
    - `create<T: Serialize>(&mut self, path: &str, data: &T) -> Result<(), StorageError>`
    - `update<T: Serialize>(&mut self, path: &str, data: &T) -> Result<(), StorageError>`
    - `delete(&mut self, path: &str) -> Result<(), StorageError>`
    - `batch_update<T: Serialize>(&mut self, updates: Vec<(String, T)>) -> Result<(), StorageError>`
    - `batch_delete(&mut self, paths: &[&str]) -> Result<(), StorageError>`
  - `impl CrudStore for FileBackend`:
    - search: 各パスを read_json で試行、成功したものを結果に追加
    - get: read_json に委譲
    - all: all_files → 各ファイルを read_json で読み取り
    - create: exists 確認 → AlreadyExists または write_json
    - update: exists 確認 → NotFound または write_json
    - delete: remove に委譲
    - batch_update: 各要素を write_json
    - batch_delete: 各パスを remove
- **テストコードによる検証:**
  1. **正常系**: create → get でラウンドトリップ確認
  2. **異常系**: 既存ファイルへの create → AlreadyExists / 存在しないファイルの update → NotFound
  3. **境界値**: 空文字列パスでの操作、空 Vec での batch 操作
  4. **決定論性**: 同一操作順序 → 同一ファイル状態
  5. **batch 操作**: batch 更新後の全ファイルの状態が期待通りであること
  6. **search**: 全パスが見つかる場合・一部のみ見つかる場合・全部見つからない場合
  7. **結合テスト**: create → batch_update → batch_delete → exists 確認
- **計装方法・観測対象:**
  各操作の成否とファイル内容の直接比較。batch 操作の逐次性（通しの commit 管理は
  上位層で行うことを確認するための空テスト — 本 crate は単一ファイル操作の組み合わせのみ）。

---

## Phase 3: 検証・管理機能 — TamperDetector と ManifestStore

> **外部依存:** sha2, hex, chrono, serde, serde_json（Cargo.toml で定義）
> **このフェーズの方針:** Phase 2 の FileBackend の上に検証・管理機能を追加する。

### M3-1: TamperDetector — SHA-256 改竄検出

> **DB:** メモリ内完結（tempfile ベースの一時ディレクトリでテスト）

#### チケット M3-1-1: TamperDetector の実装 — SHA-256 ハッシュ検証

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§7)
- **依存・関連チケットID:**
  - 先行実装必須: M0-3-2（RfcNodeInfo 型定義）、M2-1-1（FileBackend / StorageBackend trait）
  - 並列可能: M3-2-1（ManifestStore）
- **対象不変条件 / 規範:**
  - verify_all() が全ノードの RFC_XXX.md と Tickets.json の SHA-256 ハッシュを検証する
  - ハッシュ不一致のファイルを violations（`Vec<String>`）として報告する
  - `node.path == "."` のノードはスキップする（RFC_ROOT.md は manifest.json で検証）
  - 存在しないファイルは violations に `"missing file"` として追加される
  - compute_hash() は同一内容に同一ハッシュを返す（決定論性）
  - compute_hash() は異なる内容に異なるハッシュを返す
  - verify_manifest() が manifest.json の rfc_tree_hash と RFC_TREE.json のハッシュを照合する
  - refresh_hash() が既存ノードの sha256 を更新する
- **実装の背景と目的:**
  SHA-256 ハッシュによるファイル改竄の自動検出。RFC_TREE.json の各ノードに内蔵された
  sha256 フィールドと実際のファイル内容から計算したハッシュを比較する。
  RFC_TREE.json 自身のハッシュは `.conver/manifest.json` に保存される（自己検証不可能のため）。
  全操作は同期 I/O（`std::fs::read`）で行われる。
  hex::encode(Sha256::digest(&content)) の形式でハッシュ文字列を生成する。
- **実装スコープ:**
  - `conver-storage/src/tamper.rs` ファイルの拡張（M0-3-2 で定義した RfcNodeInfo に加えて）
  - `TamperDetector` 構造体（メソッドのみ、フィールドなし）:
    - `verify_all(nodes: &[RfcNodeInfo], storage: &dyn StorageBackend) -> Result<Vec<String>, StorageError>`:
      - 各ノードの `node.path` を解決
      - `node.path == "."` はスキップ
      - RFC_XXX.md と Tickets.json の両方を検証
      - 存在確認 → SHA-256 計算 → node.sha256 と比較
      - 不一致は violations に追加
    - `compute_hash(path: &Path) -> Result<String, StorageError>`:
      - `fs::read(path)` → `Sha256::digest` → `hex::encode`
    - `verify_manifest(base_path: &Path) -> Result<bool, StorageError>`:
      - manifest.json の rfc_tree_hash と RFC_TREE.json の実際のハッシュを照合
      - どちらかが存在しない場合は `Ok(false)`
    - `refresh_hash(node: &mut RfcNodeInfo, base_path: &Path, storage: &mut dyn StorageBackend) -> Result<(), StorageError>`:
      - RFC_XXX.md のハッシュを再計算し、node.sha256 を更新
- **テストコードによる検証:**
  1. **正常系**: 作成 → ハッシュ保存 → verify → violations 空
  2. **異常系**: ファイル内容変更 → verify → violations 非空
  3. **境界値**: 存在しないファイルパス → `"missing file"` violations 追加
  4. **決定論性**: 同一ファイルの compute_hash → 同一ハッシュ
  5. **異内容検出**: 異なるファイル内容 → 異なるハッシュ（`assert_ne!`）
  6. **manifest 検証**: 正常時 true / 改竄時 false / 未存在時 false
  7. **refresh 検証**: refresh_hash 後のノードハッシュが最新のファイル内容と一致
  8. **`.` スキップ**: path="." のノードが violations に含まれないこと
- **計装方法・観測対象:**
  ハッシュ値の文字列表現（`hex::encode` が 64 文字を返すこと）の確認。
  violations ベクタの要素数・内容の直接検証。

---

### M3-2: ManifestStore — インストールマニフェスト管理

> **DB:** メモリ内完結（tempfile ベースの一時ディレクトリでテスト）

#### チケット M3-2-1: ManifestStore の完全実装 — read/write/store_hash/should_update

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§8)
- **依存・関連チケットID:**
  - 先行実装必須: M0-1-1（StorageError）、M0-3-1（Manifest / ManifestAsset / BuildInfo 型定義）
  - 並列可能: M3-1-1（TamperDetector）
- **対象不変条件 / 規範:**
  - read() がファイル未存在時は None を返す（エラーではない）
  - write() が正しく JSON ファイルを生成する
  - store_rfc_tree_hash() が既存のマニフェストに hash を追加/更新する
  - マニフェスト未存在時に store_rfc_tree_hash() はデフォルトマニフェストを new して書き込む
  - should_update() が SHA-256 の一致/不一致を正しく判定する（純粋関数）
  - `CARGO_PKG_NAME` がコンパイル時に解決されること
  - `chrono::Utc::now()` が updated_at に使用される
- **実装の背景と目的:**
  インストールマニフェスト（`.conver/manifest.json`）の管理。conver のインストール状態と
  RFC_TREE.json のハッシュを保存する。これにより自己改竄検証が可能になる。
  ManifestStore は独立した I/O 操作を持ち、FileBackend を経由せず直接 `std::fs` で
  ファイルを読み書きする。これは ManifestStore が FileBackend の前提条件（base_path が
  存在すること）より前に起動する可能性があるため（init フェーズ等）。
  **設計判断:** ManifestStore は FileBackend を経由せず直接 I/O を行う。これは以下
  の理由による：(1) init フェーズでは FileBackend より先にマニフェストが必要、
  (2) ManifestStore は `.conver/manifest.json` という固定パスにのみ書き込むため、
  FileBackend の抽象化層を経由するメリットが小さい。
- **実装スコープ:**
  - `conver-storage/src/manifest.rs` ファイルの拡張（M0-3-1 の型定義に加えて）
  - `ManifestStore` 構造体:
    - `base_path: PathBuf`
    - `new(base_path: PathBuf) -> Self`
    - `read() -> Result<Option<Manifest>, StorageError>`:
      - `.conver/manifest.json` を読み取り `serde_json::from_str`
      - ファイル未存在時は `Ok(None)`
    - `write(manifest: &Manifest) -> Result<(), StorageError>`:
      - `fs::create_dir_all` で親ディレクトリ作成
      - `serde_json::to_string_pretty` + `fs::write`
    - `store_rfc_tree_hash(hash: &str) -> Result<(), StorageError>`:
      - read() + hash 設定 + write()
      - 未存在時はデフォルトマニフェスト作成（`version: 1`, `installed_by: env!("CARGO_PKG_NAME")`, `updated_at: chrono::Utc::now().to_rfc3339()`）
  - 関連する静的メソッド:
    - `should_update(installed: &ManifestAsset, embedded_sha256: &str) -> bool` — 純粋比較
- **テストコードによる検証:**
  1. **正常系**: write → read でラウンドトリップ一致
  2. **異常系**: マニフェスト未存在の read → None
  3. **境界値**: 空 assets のマニフェストのラウンドトリップ
  4. **決定論性**: 同一マニフェストの write → read → 全フィールド一致
  5. **store_rfc_tree_hash**: 書き込み後の read でハッシュが一致する
  6. **should_update**: 異なる sha256 → true / 同一 → false
  7. **デフォルト作成**: マニフェスト未存在からの store_rfc_tree_hash が新しいマニフェストを生成すること
- **計装方法・観測対象:**
  マニフェストファイルの JSON 内容を直接読み取り、期待値と比較。
  `store_rfc_tree_hash` の冪等性（複数回呼出しで最新のハッシュのみ保持）。

---

## Phase 4: Crate 完成 — アセンブリ・テスト・ビルド検証

> **外部依存:** 全クレート依存（Cargo.toml に集約）
> **このフェーズの方針:** 最終的な crate 構成、acceptance test、ビルド検証。

### M4-1: Crate 構成と公開 API

> **DB:** メモリ内完結

#### チケット M4-1-1: Cargo.toml — 依存関係と crate メタデータ

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§Implementation)
- **依存・関連チケットID:**
  - 先行実装必須: M0-1-1〜M3-2-1（全モジュールの実装完了）
  - 後続: M4-1-2（lib.rs — Cargo.toml のモジュール群を利用）
- **対象不変条件 / 規範:**
  - edition 2021
  - 全依存関係が RFC の Cargo.toml と一致する
  - dev-dependencies に tempfile が含まれる
  - `cargo check` がパスすること
  - 不要な依存関係がないこと（`cargo-udeps` 等で検証可能）
- **実装の背景と目的:**
  crate の依存関係とメタデータを定義する。本 crate の依存は以下：
  - serde (derive) + serde_json: JSON 入出力
  - thiserror: エラー型導出
  - sha2 + hex: SHA-256 ハッシュ計算
  - walkdir: ディレクトリ再帰検索
  - log: ログ出力（チェックポイント等）
  - chrono (serde): タイムスタンプ生成
  dev-dependencies: tempfile: テスト用一時ディレクトリ
  `cargo add` を使用して依存関係を追加すること（Cargo.toml の直接手書き禁止）。
- **実装スコープ:**
  - `conver-storage/Cargo.toml` ファイルの新規作成
  - `[package]` セクション: name, version (0.1.0), edition (2021)
  - `[dependencies]`: serde, serde_json, thiserror, sha2, hex, walkdir, log, chrono
  - `[dev-dependencies]`: tempfile
  - 必要に応じて `[lib]` セクション（デフォルトで lib.rs を使用）
- **テストコードによる検証:**
  1. **正常系**: `cargo check -p conver-storage` がパスすること
  2. **異常系**: なし
  3. **境界値**: なし
  4. **決定論性**: 同じ Cargo.toml → 同じ依存解決結果
  5. **コンパイル時検証**: `--locked` で再現可能なビルド
- **計装方法・観測対象:**
  `cargo check` の終了コード。

#### チケット M4-1-2: lib.rs — モジュール宣言と公開 API の再公開

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§11)
- **依存・関連チケットID:**
  - 先行実装必須: 全 Phase 0〜3 の実装完了、M4-1-1（Cargo.toml）
- **対象不変条件 / 規範:**
  - 全 9 モジュールが宣言される
  - 全公開型・trait・関数が `pub use` で再公開される
  - モジュールの可視性が適切に設定される（外部に公開するもののみ pub）
  - ドキュメンテーションコメントが crate レベルで提供される
- **実装の背景と目的:**
  crate のエントリポイント。全モジュールを宣言し、外部に公開する API のみを
  `pub use` で再公開する。これにより crate 利用者（conver-core 等）は
  `conver_storage::FileBackend` のようにフラットなパスでアクセスできる。
- **実装スコープ:**
  - `conver-storage/src/lib.rs` ファイルの新規作成
  - モジュール宣言: `pub mod backend;`, `pub mod crud;`, `pub mod atomic;`,
    `pub mod checkpoint;`, `pub mod round_log;`, `pub mod tamper;`,
    `pub mod manifest;`, `pub mod path;`, `pub mod error;`
  - 再公開（RFC 準拠）:
    - `pub use backend::{StorageBackend, FileBackend};`
    - `pub use crud::CrudStore;`
    - `pub use atomic::AtomicWriter;`
    - `pub use checkpoint::CheckpointStore;`
    - `pub use round_log::{AppendOnlyLog, append_observation};`
    - `pub use tamper::{TamperDetector, RfcNodeInfo};`
    - `pub use manifest::{Manifest, ManifestAsset, ManifestStore, BuildInfo};`
    - `pub use path::PathResolver;`
    - `pub use error::StorageError;`
  - crate レベルのドキュメンテーションコメント（日本語で設計書参照）
- **テストコードによる検証:**
  1. **正常系**: `cargo doc --no-deps -p conver-storage` がパスすること
  2. **異常系**: なし
  3. **境界値**: なし
  4. **決定論性**: 同一ソース → 同一公開 API
  5. **コンパイル時検証**: すべての `pub use` 参照が実際の定義を指していること（コンパイラが保証）
- **計装方法・観測対象:**
  公開 API の一覧が RFC の §11 と完全一致することを目視確認（または doc test で自動検証）。

---

### M4-2: 結合テスト・受入テスト

> **DB:** メモリ内完結（tempfile ベースの一時ディレクトリでテスト）

#### チケット M4-2-1: acceptance test — test-run.rs の実装

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§D 受入テスト)
- **依存・関連チケットID:**
  - 先行実装必須: M4-1-2（lib.rs — 全モジュールの公開 API 確定）
  - 後続: すべてのチケット完了
- **対象不変条件 / 規範:**
  - RFC の完了条件（16項目）すべてが検証される
  - 各セクション（AtomicWriter / FileBackend / Checkpoint / TamperDetector / AppendOnlyLog）
    の基本動作が PASS すること
  - `cargo run --bin test-run -p conver-storage` が exit code 0 で終了すること
- **実装の背景と目的:**
  本 RFC の完了条件を検証する受入テスト。`cargo run --bin test-run -p conver-storage` で
  実行可能なバイナリとして実装する。各機能の正常系を実行し、PASS/FAIL を出力する。
  このテストは「すでに実装されている機能が正しく動作する」ことを確認するためのもの。
  各モジュールの詳細なテストは各チケットの単体テストでカバーする。
- **実装スコープ:**
  - `conver-storage/tests/test-run.rs` ファイルの新規作成
  - テスト内容（RFC §D 準拠）:
    1. AtomicWriter: write-temp→fsync→rename + .tmp 不在確認
    2. FileBackend CRUD: write_json → read_json ラウンドトリップ
    3. Checkpoint commit + rollback: 状態変更前後の復元確認
    4. TamperDetector SHA-256: compute_hash → 64文字 hex 確認
    5. AppendOnlyLog: append → count 一致確認
  - 実行フォーマット: 各テストの結果を `println!` で出力
  - 最終行に PASS/FAIL を表示
- **テストコードによる検証:**
  1. **正常系**: 全5項目が PASS すること
  2. **異常系**: なし（受入テストは正常系のみ）
  3. **境界値**: 各操作の基本的な正しさを確認
  4. **決定論性**: 同一環境で同一結果（キャッシュ等の影響を受けない）
  5. **ビルド**: `cargo build --bin test-run -p conver-storage` がパスすること
- **計装方法・観測対象:**
  標準出力のテキスト検証（"PASS" 文字列の存在確認）。終了コードの確認。

#### チケット M4-2-2: 全テスト一括実行とカバレッジ検証

- **参照設計書:** crates/conver/rfc-004-storage/RFC_004.md (§D 完了条件)
- **依存・関連チケットID:**
  - 先行実装必須: 全チケット完了
- **対象不変条件 / 規範:**
  - `cargo test -p conver-storage` が全テストをパスすること
  - テスト数が 30 以上であること（RFC 完了条件 #14）
  - 回帰テストがすべてパスすること
- **実装の背景と目的:**
  全チケット完了後の最終検証。各チケットで実装したテストを一括実行し、
  RFC の完了条件（#14: 全テスト30種以上パス、#15: cargo test パス）を満たすことを確認する。
  テストコード自体は各チケットで実装済み。ここでは実行と結果確認のみ。
- **実装スコープ:**
  - テストコードの追加は不要（各チケットで実装済み）
  - 検証のみ:
    - `cargo test -p conver-storage` の実行
    - テスト数のカウント（30 以上であること）
    - 全テストの PASS 確認
    - 必要に応じて `.cargo/config.toml` の `[target.'cfg(not(target_os = "windows"))']` 設定の確認
- **テストコードによる検証:**
  1. **正常系**: `cargo test -p conver-storage` → test result: ok（30+ tests passed）
  2. **異常系**: なし
  3. **境界値**: テスト数が30未満の場合は追加テストが必要
  4. **決定論性**: 同一コード → 同一テスト結果
  5. **回帰防止**: 全チケットのテストが互いに干渉しないこと
- **計装方法・観測対象:**
  `cargo test` の標準出力からテスト数と PASS 数をパース。テスト数が 30 を超えることの確認。
  テストの並行実行による競合がないことの確認（tempfile の隔離性）。

---

## 実装順序サマリ

```
Phase 0: 基盤 — 型定義と純粋関数
  M0-1-1: StorageError ─────────────────────→ 全モジュールの基盤
  M0-2-1: PathResolver ─────────────────────→ FileBackend で使用
  M0-3-1: Manifest 型定義 ─────────────────→ ManifestStore で使用
  M0-3-2: RfcNodeInfo 型定義 ──────────────→ TamperDetector で使用

Phase 1: I/O プリミティブ ──── 並列実装可能 ────
  M1-1-1: AtomicWriter ────────────────────→ FileBackend で使用
  M1-2-1: AppendOnlyLog ──────────────────→ 独立
  M1-3-1: CheckpointStore ────────────────→ FileBackend で委譲

Phase 2: バックエンド統合
  M2-1-1: FileBackend + StorageBackend ───→ CrudStore / TamperDetector で使用
  M2-2-1: CrudStore trait ────────────────→ FileBackend のインターフェース層

Phase 3: 検証・管理機能 ──── 並列実装可能 ────
  M3-1-1: TamperDetector ─────────────────→ 独立（StorageBackend に依存）
  M3-2-1: ManifestStore ──────────────────→ 独立（StorageError + 型定義に依存）

Phase 4: Crate 完成
  M4-1-1: Cargo.toml ─────────────────────→ 依存解決
  M4-1-2: lib.rs ─────────────────────────→ 公開 API
  M4-2-1: acceptance test ────────────────→ 受入テスト
  M4-2-2: 全テスト実行 ───────────────────→ 最終検証
```

## チケット総数: 14

- Phase 0: 4 チケット（M0-1-1, M0-2-1, M0-3-1, M0-3-2）
- Phase 1: 3 チケット（M1-1-1, M1-2-1, M1-3-1）
- Phase 2: 2 チケット（M2-1-1, M2-2-1）
- Phase 3: 2 チケット（M3-1-1, M3-2-1）
- Phase 4: 3 チケット（M4-1-1, M4-1-2, M4-2-1, M4-2-2）
