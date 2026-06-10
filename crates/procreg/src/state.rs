//! # ProcessState — プロセスのライフサイクル状態
//!
//! プロセスレジストリ内の各プロセスが取りうる状態を表現する。
//! serde により Tauri フロントエンドに JSON として返却可能。

/// プロセスのライフサイクル状態を表現する列挙型。
///
/// 全6バリアントでプロセスの一生をカバーする。
/// JSON シリアライズ時は `#[serde(tag = "state")]` により
/// `{"state": "running", "pid": 42}` のような形式になる。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ProcessState {
    /// `start_all()` への登録待ち。まだ spawn されていない。
    Pending,

    /// `ReadyCondition` を待機中。
    Starting,

    /// `ReadyCondition` を満たし、正常稼働中。
    Running {
        /// プロセスの OS 上の PID。
        pid: u32,
    },

    /// プロセス終了後、再起動までのディレイ中。
    ///
    /// `retry_in_ms` が `Duration` ではなく `u64`（ミリ秒）なのは、
    /// `Duration` が `serde::Serialize` を実装しないため。
    Restarting {
        /// 今回の再起動試行回数（0始まり）。
        attempt: u32,
        /// 次の再起動までの待機時間（ミリ秒）。
        retry_in_ms: u64,
    },

    /// 再起動リトライ上限に達した、または `RestartPolicy::Never`
    /// でプロセスが終了した。
    Failed {
        /// プロセスの終了コード。シグナル kill 等で取得できない場合は `None`。
        exit_code: Option<i32>,
        /// 失敗理由の説明。
        message: String,
    },

    /// `shutdown_all()` または `stop()` により正常停止した。
    Stopped,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Pending バリアントが JSON にシリアライズ/デシリアライズできることを確認する。
    #[test]
    fn process_state_pending_serde() {
        let state = ProcessState::Pending;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, r#"{"state":"pending"}"#);

        let deserialized: ProcessState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, state);
    }

    /// Starting バリアントが JSON ラウンドトリップできることを確認する。
    #[test]
    fn process_state_starting_serde() {
        let state = ProcessState::Starting;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, r#"{"state":"starting"}"#);

        let deserialized: ProcessState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, state);
    }

    /// Running バリアントが PID を保持したまま JSON ラウンドトリップできることを確認する。
    #[test]
    fn process_state_running_serde() {
        let state = ProcessState::Running { pid: 42 };
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, r#"{"state":"running","pid":42}"#);

        let deserialized: ProcessState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, state);
        if let ProcessState::Running { pid } = deserialized {
            assert_eq!(pid, 42);
        } else {
            panic!("Expected Running variant");
        }
    }

    /// Restarting バリアントが attempt と retry_in_ms を保持したまま
    /// JSON ラウンドトリップできることを確認する。
    #[test]
    fn process_state_restarting_serde() {
        let state = ProcessState::Restarting {
            attempt: 2,
            retry_in_ms: 3000,
        };
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(
            json,
            r#"{"state":"restarting","attempt":2,"retry_in_ms":3000}"#
        );

        let deserialized: ProcessState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, state);
    }

    /// Failed バリアントが exit_code と message を保持したまま
    /// JSON ラウンドトリップできることを確認する。
    #[test]
    fn process_state_failed_serde() {
        let state = ProcessState::Failed {
            exit_code: Some(1),
            message: "Process exited with error".to_string(),
        };
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(
            json,
            r#"{"state":"failed","exit_code":1,"message":"Process exited with error"}"#
        );

        let deserialized: ProcessState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, state);
    }

    /// Failed バリアントで exit_code が None の場合も
    /// JSON ラウンドトリップできることを確認する。
    #[test]
    fn process_state_failed_no_exit_code() {
        let state = ProcessState::Failed {
            exit_code: None,
            message: "Killed by signal".to_string(),
        };
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(
            json,
            r#"{"state":"failed","exit_code":null,"message":"Killed by signal"}"#
        );

        let deserialized: ProcessState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, state);
    }

    /// Stopped バリアントが JSON ラウンドトリップできることを確認する。
    #[test]
    fn process_state_stopped_serde() {
        let state = ProcessState::Stopped;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, r#"{"state":"stopped"}"#);

        let deserialized: ProcessState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, state);
    }

    /// JSON 出力の `"state"` タグの値が snake_case であることを確認する。
    #[test]
    fn process_state_tag_name() {
        let states: Vec<(ProcessState, &str)> = vec![
            (ProcessState::Pending, "pending"),
            (ProcessState::Starting, "starting"),
            (ProcessState::Running { pid: 1 }, "running"),
            (
                ProcessState::Restarting {
                    attempt: 0,
                    retry_in_ms: 0,
                },
                "restarting",
            ),
            (
                ProcessState::Failed {
                    exit_code: None,
                    message: "".to_string(),
                },
                "failed",
            ),
            (ProcessState::Stopped, "stopped"),
        ];

        for (state, expected_tag) in states {
            let json = serde_json::to_value(&state).unwrap();
            let tag = json.get("state").and_then(|v| v.as_str()).unwrap();
            assert_eq!(
                tag, expected_tag,
                "Expected tag '{expected_tag}' for {state:?}"
            );
        }
    }
}
