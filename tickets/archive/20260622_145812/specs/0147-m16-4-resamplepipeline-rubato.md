---
ticket_id: 147
title: "M16-4: ResamplePipeline — rubato 実装完了"
slug: m16-4-resamplepipeline-rubato
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0147-m16-4-resamplepipeline-rubato/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0147-m16-4-resamplepipeline-rubato/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0147-m16-4-resamplepipeline-rubato/review.md
---
# M16-4: `ResamplePipeline` — rubato 実装完了

## Summary

`ResamplePipeline` は現在同一レートのパススルーのみ対応（異なるレートは `InvalidConfig` エラー）。
本チケットで `rubato::FftFixedIn<f64>` を用いたサンプルレート変換を実装し、`src/audio/resampler.rs:7` の `[::STUB::]` を解決する。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§26)

## Background

M16-2（#129）で `ResamplePipeline` の骨格は実装されたが、rubato を使用した実際のサンプルレート変換が未完了のままスタブとして残っている。`rubato` crate（`rubato = "3.0.0"`）は既に Cargo.toml の dependencies に追加済み。

## Investigation

### 証拠 1: 現状はパススルーのみ

```rust
pub fn new(in_rate: u32, out_rate: u32) -> Result<Self, SipError> {
    if in_rate != out_rate {
        return Err(SipError::invalid_config(
            "ResamplePipeline: sample rate conversion requires rubato (see M17-2)",
        ));
    }
    Ok(Self { in_rate, out_rate })
}
```

`in_rate != out_rate` で即エラー。rubato が一切使われていない。

### 証拠 2: rubato crate は依存関係に存在

`Cargo.toml`:
```toml
rubato = "3.0.0"
```

使用準備は整っている。

### 証拠 3: データフロー

```
i16 → f64（i16::MAX で除算して正規化）
    → rubato::FftFixedIn<f64>.process()
    → f64 → i16（i16::MAX で乗算）
```

rubato は f64 入出力を扱う。i16/f32 との変換はラッパー側で行う。

## Scope

### 1. `src/audio/resampler.rs` — rubato 統合

`ResamplePipeline` に `rubato::FftFixedIn<f64>` を追加し、異なるレート間の変換を実装する。

```rust
pub(crate) struct ResamplePipeline {
    in_rate: u32,
    out_rate: u32,
    /// rubato リサンプラー（in_rate == out_rate の場合は None）。
    resampler: Option<rubato::FftFixedIn<f64>>,
    /// rubato 入力チャンクサイズ（FftFixedIn の要件に合わせて計算）。
    chunk_size: usize,
}
```

**コンストラクタ:**

```rust
pub fn new(in_rate: u32, out_rate: u32) -> Result<Self, SipError> {
    if in_rate == out_rate {
        return Ok(Self { in_rate, out_rate, resampler: None, chunk_size: 0 });
    }
    // FftFixedIn<f64>::new() に必要なパラメータ
    let fft_size = 256; // rubato 推奨値
    let resampler = rubato::FftFixedIn::<f64>::new(
        in_rate as f64 / out_rate as f64, // リサンプル比
        1.0,  // 追加スケール係数
        rubato::InterpolationType::Linear,
        fft_size,
        1,    // チャネル数（mono）
    ).map_err(|e| SipError::invalid_config(format!("rubato init failed: {e}")))?;
    let chunk_size = resampler.input_frames_next();
    Ok(Self { in_rate, out_rate, resampler: Some(resampler), chunk_size })
}
```

**process_in / process_out:**

```rust
pub fn process_in(&mut self, in_mono_i16: &[i16]) -> Result<Vec<i16>, SipError> {
    if let Some(ref mut resampler) = self.resampler {
        // i16 → f64 変換（正規化）
        let in_f64: Vec<f64> = in_mono_i16.iter()
            .map(|&s| s as f64 / i16::MAX as f64)
            .collect();
        // rubato 処理
        let waves = resampler.process(&[&in_f64], None)
            .map_err(|e| SipError::invalid_config(format!("rubato process failed: {e}")))?;
        // f64 → i16 変換（非正規化）
        Ok(waves[0].iter().map(|&s| (s * i16::MAX as f64) as i16).collect())
    } else {
        Ok(in_mono_i16.to_vec()) // パススルー
    }
}
```

`process_out` は `process_in` と同一の変換を行う（IN/OUT とも同一レート比）。

**reset:**

```rust
pub fn reset(&mut self) {
    if let Some(ref mut resampler) = self.resampler {
        resampler.reset();
    }
}
```

### 2. 既存スタブの解決

`resampler.rs:7` の `[::STUB::]` マーカーを削除する。

### 3. `#[allow(dead_code)]` の削除

rubato 実装完了により全てのメソッドが使用可能になるため、`#[allow(dead_code)]` を削除する。

## Non-scope

- M16-3（subscribe_audio のフォーマット変換統合）: ResamplePipeline の呼び出し側の統合は M16-3 の範囲。
- I16↔F32 変換: 本チケットは i16→f64→rubato→f64→i16 のパスのみ。
- 複数チャネル: mono のみ対応。stereo は呼び出し側でチャネルごとに処理。

## Test Plan

### ユニットテスト

| # | テスト | 種別 | 内容 |
|---|--------|------|------|
| 1 | 同一レートパススルー | 正常 | 16kHz→16kHz で入出力一致 |
| 2 | 16kHz→8kHz 変換 | 正常 | サンプル数が半分になる |
| 3 | 8kHz→48kHz 変換 | 正常 | サンプル数が約6倍になる |
| 4 | 空入力 | 境界 | 空配列入力 → 空または最小出力 |
| 5 | reset 後動作 | 正常 | reset() 呼び出し後も変換が継続 |
| 6 | 既存 390 テスト維持 | 回帰 | cargo test -p siprs 全通過 |

### ユニットテスト不可能な項目

なし（全テストはユニットテストでカバー可能）。

## Acceptance Criteria

- [ ] `cargo test -p siprs` 全 390 テスト + 新規テスト通過
- [ ] `cargo test -p siprs --features pjsip` 全 389 テスト通過
- [ ] `make check-be` 成功
- [ ] `cargo fmt --check` 通過
- [ ] `resampler.rs:7` の `[::STUB::]` が削除されていること
- [ ] `resampler.rs` の `#[allow(dead_code)]` が削除されていること
