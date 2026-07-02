#!/bin/bash
# http-proxy startup script with log rotation and background execution

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${HOME}/.cargo/bin/http-proxy"
LOG_DIR="${PROJECT_DIR}/logs"
LOG_FILE="${LOG_DIR}/http-proxy.log"
PID_FILE="${LOG_DIR}/http-proxy.pid"
ROTATOR_PID_FILE="${LOG_DIR}/http-proxy-rotator.pid"
MAX_LOG_SIZE=${MAX_LOG_SIZE:-100}  # 100MB default
CHECK_INTERVAL=${CHECK_INTERVAL:-60}  # check every 60s
KEEP_LOGS=${KEEP_LOGS:-5}          # keep 5 rotated logs

export PRIMARY_API_KEY="${PRIMARY_API_KEY:-sk-sp-ae08bfccda92487ebaa653e7247b2301}"
export BACKUP_API_KEY="${BACKUP_API_KEY:-$(cat /tmp/key.text 2>/dev/null | tr -d '\n')}"
export PROXY_API_KEY="${PROXY_API_KEY:-sk-sp-ae08bfccda92487ebaa653e7247b2301}"
export DEBUG_ANTHROPIC_SSE=1

# ---------------------------------------------------------------------------
# Functions
# ---------------------------------------------------------------------------

rotate_log() {
    if [ -f "$LOG_FILE" ]; then
        local size
        size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
        local max_bytes=$((MAX_LOG_SIZE * 1048576))
        if [ "$size" -ge "$max_bytes" ]; then
            # remove oldest if exceeding KEEP_LOGS
            [ -f "${LOG_FILE}.${KEEP_LOGS}" ] && rm -f "${LOG_FILE}.${KEEP_LOGS}"
            for i in $(seq $((KEEP_LOGS - 1)) -1 1); do
                local next=$((i + 1))
                mv "${LOG_FILE}.${i}" "${LOG_FILE}.${next}" 2>/dev/null || true
            done
            mv "${LOG_FILE}" "${LOG_FILE}.1"
            touch "${LOG_FILE}"
            echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] log rotated (size: ${size} bytes)"
        fi
    fi
}

# Background log rotator daemon
start_rotator() {
    if [ -f "$ROTATOR_PID_FILE" ] && kill -0 "$(cat "$ROTATOR_PID_FILE")" 2>/dev/null; then
        return 0
    fi
    (
        while true; do
            rotate_log
            sleep "$CHECK_INTERVAL"
        done
    ) &
    echo $! > "${ROTATOR_PID_FILE}"
}

stop_rotator() {
    if [ -f "$ROTATOR_PID_FILE" ] && kill -0 "$(cat "$ROTATOR_PID_FILE")" 2>/dev/null; then
        kill "$(cat "$ROTATOR_PID_FILE")"
        rm -f "$ROTATOR_PID_FILE"
    fi
}

start() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "http-proxy is already running (PID $(cat "$PID_FILE"))"
        return 0
    fi

    mkdir -p "$LOG_DIR"
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] starting http-proxy ..."
    "${BIN}" >> "${LOG_FILE}" 2>&1 &
    echo $! > "${PID_FILE}"
    echo "http-proxy started (PID $(cat "$PID_FILE"))"
    echo "log: ${LOG_FILE}"

    # Start background log rotator
    start_rotator
    echo "log rotator started (PID $(cat "$ROTATOR_PID_FILE"), check every ${CHECK_INTERVAL}s, max ${MAX_LOG_SIZE}MB)"
}

stop() {
    # Stop log rotator first
    stop_rotator

    if [ ! -f "$PID_FILE" ]; then
        echo "http-proxy is not running (no pid file)"
        return 0
    fi
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
        kill "$pid"
        rm -f "$PID_FILE"
        echo "http-proxy stopped (PID ${pid})"
    else
        rm -f "$PID_FILE"
        echo "http-proxy was not running (stale pid file removed)"
    fi
}

restart() {
    stop
    sleep 1
    start
}

status() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "http-proxy is running (PID $(cat "$PID_FILE"))"
        if [ -f "$LOG_FILE" ]; then
            local size
            size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
            echo "log: ${LOG_FILE} (${size} bytes)"
        fi
    else
        echo "http-proxy is not running"
        [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
    fi
}

log_tail() {
    local lines=${1:-50}
    if [ -f "$LOG_FILE" ]; then
        tail -n "$lines" -f "$LOG_FILE"
    else
        echo "no log file at ${LOG_FILE}"
    fi
}

build() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] building http-proxy release binary ..."
    cd "$PROJECT_DIR"
    cargo build --release --example http-proxy
    cp target/release/examples/http-proxy "$BIN"
    chmod +x "$BIN"
    codesign --force --sign - "$BIN" 2>/dev/null || true
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] installed to ${BIN}"
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

case "${1:-start}" in
    start)   start ;;
    stop)    stop ;;
    restart) restart ;;
    status)  status ;;
    log|logs|tail) log_tail "${2:-50}" ;;
    rotate)  rotate_log ;;
    build)   build ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|log [N]|rotate|build}"
        echo ""
        echo "  start     Start http-proxy in background"
        echo "  stop      Stop running http-proxy"
        echo "  restart   Stop then start"
        echo "  status    Show running status"
        echo "  log [N]   Tail last N lines (default: 50)"
        echo "  rotate    Manually trigger log rotation"
        echo "  build     Build release binary and install to ~/.cargo/bin/"
        exit 1
        ;;
esac
