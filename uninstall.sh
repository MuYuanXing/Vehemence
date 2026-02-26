#!/system/bin/sh

MODDIR=${0%/*}
BIN="$MODDIR/bin/Vehemence"
PIDFILE="$MODDIR/state/Vehemence.pid"
WDPIDFILE="$MODDIR/state/watchdog.pid"

# Stop daemon via binary
if [ -x "$BIN" ]; then
    "$BIN" --stop --moddir "$MODDIR" >/dev/null 2>&1
fi

# Kill by PID as fallback with SIGKILL escalation
if [ -f "$PIDFILE" ]; then
    pid=$(cat "$PIDFILE" 2>/dev/null)
    case "$pid" in
        ''|*[!0-9]*) ;;
        *)
            kill "$pid" 2>/dev/null
            sleep 1
            kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
            ;;
    esac
fi

# Kill watchdog process
if [ -f "$WDPIDFILE" ]; then
    wdpid=$(cat "$WDPIDFILE" 2>/dev/null)
    case "$wdpid" in
        ''|*[!0-9]*) ;;
        *)
            kill "$wdpid" 2>/dev/null
            sleep 1
            kill -0 "$wdpid" 2>/dev/null && kill -9 "$wdpid" 2>/dev/null
            ;;
    esac
fi

sleep 1

# Restore system thermal services
start horae 2>/dev/null
start thermal-engine 2>/dev/null
start vendor.oplus.ormsHalService-aidl-defaults 2>/dev/null

# Restore cpufreq
[ -f /proc/game_opt/disable_cpufreq_limit ] && echo 0 > /proc/game_opt/disable_cpufreq_limit 2>/dev/null
[ -f /sys/module/cpufreq_bouncing/parameters/enable ] && echo 1 > /sys/module/cpufreq_bouncing/parameters/enable 2>/dev/null

# Clear emul_temp
for zone in /sys/class/thermal/thermal_zone*; do
    [ -f "$zone/emul_temp" ] && echo 0 > "$zone/emul_temp" 2>/dev/null
done
for i in 0 1 2 3 4 5; do echo "$i 0" > /proc/shell-temp 2>/dev/null; done

# Unmount and clean all bind-mount residuals
if [ -d /dev/mount_masks ]; then
    if [ -f "$MODDIR/state/battery_mounts.list" ]; then
        while IFS= read -r node; do
            case "$node" in
                /sys/*|/proc/*) umount "$node" 2>/dev/null ;;
            esac
        done < "$MODDIR/state/battery_mounts.list"
    fi
    rm -f /dev/mount_masks/btmp_*
    rmdir /dev/mount_masks 2>/dev/null
fi

rm -rf "$MODDIR/state"
