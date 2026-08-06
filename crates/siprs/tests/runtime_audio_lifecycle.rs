
// [::TICKET::] P8-1: Runtime Infrastructure — ABC closure integration tests.
//
// This integration test file closes the O-001 and O-003 ABC inspection gaps:
//
//   O-001: No test submitted RuntimeCommand::ConfConnect / ConfDisconnect
//          end-to-end through a live CoreReactor + MockBackend.
//   O-003: No test submitted AddAudioSource / RemoveAudioSource /
//          SetAudioSourceGain / MuteAudioSource through the reactor.
//
// Each test drives the public RuntimeHandle API against a spawned CoreReactor
// and asserts the oneshot reply — the observable that proves the command
// flowed through the MPSC channel into the reactor loop.

use std::sync::Arc;
use std::time::Duration;

use siprs::runtime::reactor::BootConfig;
// [::TICKET::] P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-4 --for-spec --no-implementation-order`.
use siprs::runtime::{
    AudioMixer, AudioWorkerTask, CoreReactor, MockAsyncAudioSource, Reply, RuntimeCommand,
    RuntimeHandle,
};

// [::TICKET::] P8-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-1 --for-spec --no-implementation-order`.
fn spawn_reactor() -> (RuntimeHandle, std::thread::JoinHandle<()>) {
    CoreReactor::spawn(BootConfig::default()).expect("reactor must spawn")
}

#[tokio::test]
// @verifies C011
// [::TICKET::] P8-1: O-001 — ConfConnect flows through MPSC to Backend and returns a oneshot reply.
async fn conf_connect_flows_through_reactor_and_returns_ok() {
    let (handle, join) = spawn_reactor();

    let (tx, _rx) = tokio::sync::oneshot::channel();
    let cmd = RuntimeCommand::ConfConnect {
        call_id: 42,
        reply: Reply::new(tx),
    };
    let result = handle.submit(cmd).await;

    assert!(
        result.is_ok(),
        "ConfConnect must complete via backend.conf_connect, got {result:?}"
    );

    drop(handle);
    let _ = join.join();
}

#[tokio::test]
// @verifies C011
// [::TICKET::] P8-1: O-001 — ConfDisconnect flows through MPSC to Backend and returns a oneshot reply.
async fn conf_disconnect_flows_through_reactor_and_returns_ok() {
    let (handle, join) = spawn_reactor();

    let (tx, _rx) = tokio::sync::oneshot::channel();
    let cmd = RuntimeCommand::ConfDisconnect {
        call_id: 7,
        reply: Reply::new(tx),
    };
    let result = handle.submit(cmd).await;

    assert!(
        result.is_ok(),
        "ConfDisconnect must complete via backend.conf_disconnect, got {result:?}"
    );

    drop(handle);
    let _ = join.join();
}

#[tokio::test]
// @verifies C035
// [::TICKET::] P8-1: O-003 — AddAudioSource → SetAudioSourceGain → MuteAudioSource → RemoveAudioSource
// completes through the reactor with correct typed replies.
async fn audio_source_lifecycle_sequence_through_reactor() {
    let (handle, join) = spawn_reactor();

    let source = Box::new(MockAsyncAudioSource::new(vec![1i16; 160]));
    let source_id = handle
        .submit_add_audio_source(source)
        .await
        .expect("add must return a source_id");
    assert_eq!(source_id, 0, "reactor mixer assigns source_id 0 first");

    let second_id = handle
        .submit_add_audio_source(Box::new(MockAsyncAudioSource::new(vec![2i16; 160])))
        .await
        .expect("second add must return a source_id");
    assert!(
        second_id > source_id,
        "reactor mixer next_source_id must advance: {second_id} > {source_id}"
    );

    handle
        .submit_set_audio_source_gain(source_id, 0.5)
        .await
        .expect("set_gain must succeed on existing source");
    handle
        .submit_mute_audio_source(source_id, true)
        .await
        .expect("mute must succeed on existing source");
    handle
        .submit_remove_audio_source(source_id)
        .await
        .expect("remove must succeed on existing source");

    drop(handle);
    let _ = join.join();
}

#[tokio::test]
// @verifies C035
// [::TICKET::] P8-1: O-003 — audio lifecycle commands on a non-existent source_id return an error reply.
async fn audio_source_lifecycle_nonexistent_source_returns_error() {
    let (handle, join) = spawn_reactor();

    let remove_result = handle.submit_remove_audio_source(999).await;
    assert!(
        remove_result.is_err(),
        "remove of non-existent source must return Err"
    );

    let gain_result = handle.submit_set_audio_source_gain(999, 0.5).await;
    assert!(
        gain_result.is_err(),
        "set_gain on non-existent source must return Err"
    );

    let mute_result = handle.submit_mute_audio_source(999, true).await;
    assert!(
        mute_result.is_err(),
        "mute on non-existent source must return Err"
    );

    drop(handle);
    let _ = join.join();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
// @verifies C036
// [::TICKET::] P8-1: O-002 — AudioWorkerTask spawns on the blocking pool, runs process_frame,
// and produces a mixed i16 frame in out_queue from a MockAsyncAudioSource.
async fn audio_worker_spawns_and_produces_mixed_output() {
    let mixer = Arc::new(AudioMixer::new());
    mixer.add_source(Box::new(MockAsyncAudioSource::new(vec![100i16; 160])));
    let mut worker = AudioWorkerTask::spawn(mixer.clone(), 1, Duration::from_millis(10));
    assert!(worker.is_running(), "worker must be running after spawn");

    // Allow a few process_frame iterations to accumulate frames.
    tokio::time::sleep(Duration::from_millis(60)).await;

    let frame = mixer
        .out_queue
        .pop()
        .expect("worker must push at least one mixed frame");
    assert_eq!(frame.len(), 160, "frame length must be MIXER_FRAME_SAMPLES");
    assert!(
        frame.iter().all(|&s| s == 100i16),
        "single source must pass through unchanged"
    );

    worker.shutdown().await;
    assert!(!worker.is_running(), "worker must stop after shutdown");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
// @verifies C035
// [::TICKET::] P8-1: O-002 — multiple AudioWorker instances each manage an independent AudioMixer.
async fn multiple_audio_workers_use_independent_mixers() {
    let mixer1 = Arc::new(AudioMixer::new());
    let mixer2 = Arc::new(AudioMixer::new());
    mixer1.add_source(Box::new(MockAsyncAudioSource::new(vec![1i16; 160])));
    mixer2.add_source(Box::new(MockAsyncAudioSource::new(vec![2i16; 160])));

    let mut worker1 = AudioWorkerTask::spawn(mixer1.clone(), 1, Duration::from_millis(10));
    let mut worker2 = AudioWorkerTask::spawn(mixer2.clone(), 2, Duration::from_millis(10));

    tokio::time::sleep(Duration::from_millis(40)).await;

    let frame1 = mixer1.out_queue.pop().expect("mixer1 must produce frames");
    let frame2 = mixer2.out_queue.pop().expect("mixer2 must produce frames");
    assert!(
        frame1.iter().all(|&s| s == 1i16),
        "mixer1 output must reflect mixer1 sources only"
    );
    assert!(
        frame2.iter().all(|&s| s == 2i16),
        "mixer2 output must reflect mixer2 sources only"
    );

    worker1.shutdown().await;
    worker2.shutdown().await;
}
