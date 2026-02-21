#!/system/bin/sh

MODDIR=${0%/*}
BIN="$MODDIR/bin/Vehemence"
PIDFILE="$MODDIR/state/Vehemence.pid"
STARTLOG="$MODDIR/state/startup.log"

[ -x "$BIN" ] || exit 0
mkdir -p "$MODDIR/state"

if [ -f "$STARTLOG" ] && [ "$(wc -l < "$STARTLOG" 2>/dev/null)" -gt 200 ]; then
    tail -n 100 "$STARTLOG" > "${STARTLOG}.tmp" && mv "${STARTLOG}.tmp" "$STARTLOG"
fi

printf '%s service_start\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$STARTLOG"

if [ -f "$PIDFILE" ]; then
    oldpid=$(cat "$PIDFILE" 2>/dev/null)
    case "$oldpid" in
        ''|*[!0-9]*) ;;
        *) kill -0 "$oldpid" 2>/dev/null && exit 0 ;;
    esac
fi

wait_count=0
while [ "$(/system/bin/getprop sys.boot_completed)" != "1" ]; do
    sleep 1
    wait_count=$((wait_count + 1))
    if [ "$wait_count" -ge 120 ]; then
        printf '%s boot_wait_timeout\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$STARTLOG"
        break
    fi
done

sleep 3

mkdir -p /dev/mount_masks
chmod 0755 /dev/mount_masks

if [ -f "$MODDIR/state/battery_mounts.list" ]; then
    while IFS= read -r node; do
        case "$node" in
            /sys/*|/proc/*) umount "$node" 2>/dev/null ;;
        esac
    done < "$MODDIR/state/battery_mounts.list"
    rm -f "$MODDIR/state/battery_mounts.list"
fi
rm -f /dev/mount_masks/btmp_*

start_once() {
    "$BIN" --start --moddir "$MODDIR" >> "$STARTLOG" 2>&1 &
    echo $! > "$PIDFILE"
    sleep 2
    pid_now=$(cat "$PIDFILE" 2>/dev/null)
    case "$pid_now" in
        ''|*[!0-9]*) return 1 ;;
    esac
    kill -0 "$pid_now" 2>/dev/null
}

attempt=1
max_attempts=3
while [ "$attempt" -le "$max_attempts" ]; do
    if start_once; then
        printf '%s daemon_started attempt=%s pid=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$attempt" "$(cat "$PIDFILE" 2>/dev/null)" >> "$STARTLOG"
        break
    fi

    printf '%s daemon_exit_early attempt=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$attempt" >> "$STARTLOG"
    attempt=$((attempt + 1))
done

if [ "$attempt" -gt "$max_attempts" ]; then
    rm -f "$PIDFILE"
    printf '%s daemon_start_failed\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$STARTLOG"
fi
