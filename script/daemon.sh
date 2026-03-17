#!/bin/bash
#
# Rainbow Bridge Process Daemon Script
# Usage: ./daemon.sh {start|stop|restart|status|reload|force-reload}
#

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
APP_NAME="rainbow-bridge"
BINARY_NAME="hertz_service"
BINARY_PATH="${SCRIPT_DIR}/bin/${BINARY_NAME}"
PID_FILE="${SCRIPT_DIR}/${APP_NAME}.pid"
LOG_FILE="${SCRIPT_DIR}/logs/${APP_NAME}.log"
CONFIG_FILE="${SCRIPT_DIR}/config.yaml"

PID=0
RETVAL=0

check_binary() {
    if [ ! -f "$BINARY_PATH" ]; then
        echo "Error: Binary not found at ${BINARY_PATH}"
        echo "Please run 'make build' or './build.sh' first"
        exit 1
    fi
}

check_pid() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
            return 0
        else
            rm -f "$PID_FILE"
            PID=0
        fi
    fi
    return 1
}

start() {
    check_binary
    
    if check_pid; then
        echo "${APP_NAME} is already running (PID: ${PID})"
        return 1
    fi
    
    echo "Starting ${APP_NAME}..."
    
    mkdir -p "$(dirname "$LOG_FILE")"
    
    nohup "$BINARY_PATH" -config "$CONFIG_FILE" >> "$LOG_FILE" 2>&1 &
    PID=$!
    echo $PID > "$PID_FILE"
    
    sleep 1
    
    if check_pid; then
        echo "${APP_NAME} started successfully (PID: ${PID})"
        echo "Log file: ${LOG_FILE}"
        return 0
    else
        echo "Failed to start ${APP_NAME}"
        echo "Check log file: ${LOG_FILE}"
        return 1
    fi
}

stop() {
    if ! check_pid; then
        echo "${APP_NAME} is not running"
        return 0
    fi
    
    echo "Stopping ${APP_NAME} (PID: ${PID})..."
    
    kill "$PID" 2>/dev/null
    
    local count=0
    local timeout=30
    
    while kill -0 "$PID" 2>/dev/null; do
        sleep 1
        count=$((count + 1))
        if [ $count -ge $timeout ]; then
            echo "Timeout waiting for process to stop, force killing..."
            kill -9 "$PID" 2>/dev/null
            break
        fi
    done
    
    rm -f "$PID_FILE"
    echo "${APP_NAME} stopped"
    return 0
}

restart() {
    stop
    sleep 1
    start
}

reload() {
    if ! check_pid; then
        echo "${APP_NAME} is not running"
        return 1
    fi
    
    echo "Reloading ${APP_NAME} (PID: ${PID})..."
    kill -HUP "$PID" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "${APP_NAME} reloaded successfully"
        return 0
    else
        echo "Failed to reload ${APP_NAME}"
        return 1
    fi
}

force_reload() {
    restart
}

status() {
    if check_pid; then
        echo "${APP_NAME} is running (PID: ${PID})"
        ps -p "$PID" -o pid,ppid,%cpu,%mem,vsz,rss,etime,cmd 2>/dev/null || true
        return 0
    else
        echo "${APP_NAME} is not running"
        return 3
    fi
}

case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    reload)
        reload
        ;;
    force-reload)
        force_reload
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|reload|force-reload|status}"
        exit 2
        ;;
esac

exit $?
