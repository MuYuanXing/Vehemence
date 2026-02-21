#!/system/bin/sh

MODDIR=${0%/*}
BIN="$MODDIR/bin/Vehemence"
PIDFILE="$MODDIR/state/Vehemence.pid"

if [ -x "$BIN" ]; then
    "$BIN" --stop --moddir "$MODDIR" >/dev/null 2>&1
fi

if [ -f "$PIDFILE" ]; then
    pid=$(cat "$PIDFILE" 2>/dev/null)
    case "$pid" in
        ''|*[!0-9]*) ;;
        *) kill "$pid" 2>/dev/null ;;
    esac
fi

sleep 1

rm -rf "$MODDIR/state"
