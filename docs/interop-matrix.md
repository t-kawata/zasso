# siprs 相互接続試験マトリクス

> 最終更新: 2026-06-22
> 次の更新予定: 実 PBX 接続試験実施後

## 凡例

| 記号 | 意味 |
|------|------|
| ✅ PASS | 試験成功 |
| ❌ FAIL | 試験失敗（issue 起票済み） |
| ⏸️ SKIP | スキップ（理由あり） |
| ⬜ PENDING | 未実施 |
| 🚧 WIP | 実装中 |
| ❓ N/A | 非該当 |

---

## Asterisk LTS 相互接続

### Docker Asterisk（`tests/docker/asterisk/`）

| 試験項目 | ステータス | 試験日 | 備考 |
|---------|-----------|-------|------|
| REGISTER 認証成功 | ⬜ PENDING | — | |
| INVITE / BYE 正常切断 | ⬜ PENDING | — | |
| DTMF (RFC4733) 送信 | ⬜ PENDING | — | |
| Opus / PCMU コーデック交渉 | ⬜ PENDING | — | |
| Hold / Unhold | ⬜ PENDING | — | |
| Blind Transfer | ⬜ PENDING | — | |
| SRTP (SDES) | ⬜ PENDING | — | Asterisk 側の SRTP 設定が必要 |

### 実 Asterisk LTS

| 試験項目 | ステータス | 試験日 | 備考 |
|---------|-----------|-------|------|
| REGISTER 認証成功 | ⬜ PENDING | — | |
| INVITE / BYE 正常切断 | ⬜ PENDING | — | |
| DTMF (RFC4733) 送信 | ⬜ PENDING | — | |
| Opus / PCMU コーデック交渉 | ⬜ PENDING | — | |
| Hold / Unhold | ⬜ PENDING | — | |
| Blind Transfer | ⬜ PENDING | — | |
| SRTP (SDES) | ⬜ PENDING | — | |

---

## FreeSWITCH 相互接続

| 試験項目 | ステータス | 試験日 | 備考 |
|---------|-----------|-------|------|
| REGISTER 認証成功 | ⬜ PENDING | — | |
| INVITE / BYE 正常切断 | ⬜ PENDING | — | |
| DTMF (SIP INFO) 送信 | ⬜ PENDING | — | |
| Opus / PCMU コーデック交渉 | ⬜ PENDING | — | |
| ICE / TURN negotiation | ⬜ PENDING | — | FreeSWITCH 側の ICE/TURN 設定が必要 |

---

## P1 相互接続（1.0 以降に延期）

| 試験対象 | 試験項目 | ステータス | 備考 |
|---------|---------|-----------|------|
| OpenSIPS | — | ⬜ PENDING | テストケース定義のみ |
| Kamailio | — | ⬜ PENDING | テストケース定義のみ |
| 3CX | — | ⬜ PENDING | テストケース定義のみ |

---

## 試験環境メモ

- **Docker Asterisk**: `docker compose -f tests/docker/docker-compose.yml up -d`
- **実 Asterisk**: バージョン ``, ホスト ``
- **FreeSWITCH**: バージョン ``, ホスト ``
- **接続方式**: UDP / TCP / TLS
- **NAT 環境**: あり / なし
