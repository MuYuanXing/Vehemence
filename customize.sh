#!/system/bin/sh
# shellcheck disable=SC2034
SKIPUNZIP=1

unzip -o "$ZIPFILE" -d "$MODPATH" >&2 || abort "解压失败，安装取消"
rm -rf "$MODPATH/META-INF"

set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/post-fs-data.sh" 0 0 0755
set_perm_recursive "$MODPATH/odm" 0 0 0755 0644 u:object_r:vendor_configs_file:s0
set_perm_recursive "$MODPATH/system" 0 0 0755 0644 u:object_r:vendor_configs_file:s0
set_perm_recursive "$MODPATH/bin" 0 0 0755 0755 u:object_r:system_file:s0
[ -d "$MODPATH/webroot" ] && set_perm_recursive "$MODPATH/webroot" 0 0 0755 0644

mkdir -p /dev/mount_masks

GETPROP="/system/bin/getprop"
DEVICE_MODEL=$("$GETPROP" ro.product.model)
[ -z "$DEVICE_MODEL" ] && DEVICE_MODEL=$("$GETPROP" ro.product.odm.model)

MARKET_NAME=$("$GETPROP" ro.vendor.oplus.market.name)
[ -z "$MARKET_NAME" ] && MARKET_NAME=$("$GETPROP" ro.product.market.name)
[ -z "$MARKET_NAME" ] && MARKET_NAME="$DEVICE_MODEL"

BRAND=$("$GETPROP" ro.product.brand)
[ -z "$BRAND" ] && BRAND=$("$GETPROP" ro.product.system.brand)
BRAND=$(echo "$BRAND" | tr '[:upper:]' '[:lower:]')

MANUFACTURER=$("$GETPROP" ro.product.manufacturer)
[ -z "$MANUFACTURER" ] && MANUFACTURER=$("$GETPROP" ro.product.system.manufacturer)
MANUFACTURER=$(echo "$MANUFACTURER" | tr '[:upper:]' '[:lower:]')

ui_print "=========================================="
ui_print "   星驰引擎 · 狂暴温控"
ui_print "=========================================="
ui_print "  正在监测设备信息…"

sleep 1
ui_print "  ◉ 设备监测通过: $BRAND / $MANUFACTURER"
ui_print " "
sleep 0.5
ui_print "=========================================="
ui_print "  安装须知（请务必阅读）"
ui_print "=========================================="
ui_print " "
ui_print "  1. 本模块会伪装 CPU、GPU、DDR、电池壳温度"
ui_print "     通过降低系统感知温度来提升温控墙阈值"
ui_print "     让手机不会因为发热而降低性能"
ui_print " "
ui_print "  2. 温度伪装不影响手机实际散热"
ui_print "     但可能影响充电速度的自动调节"
ui_print " "
ui_print "  3. 模块运行期间会自动接管系统温控服务"
ui_print "     以防止系统温控与模块冲突"
ui_print " "
ui_print "  4. OPLUS 设备（一加/OPPO/真我）兼容性最佳"
ui_print "     其他品牌可用但部分节点可能无法覆盖"
ui_print " "
ui_print "  5. 使用 APatch 及其分支版本时"
ui_print "     可能存在兼容性问题，请留意"
ui_print " "
ui_print "  6. 天玑处理器设备已适配（V1.1）"
ui_print "     如仍有异常请反馈"
ui_print " "
ui_print "  7. 如遇异常，在模块管理器中关闭模块"
ui_print "     重启即可完全恢复"
ui_print " "
ui_print "=========================================="
ui_print "  [ 音量上 (+) ] 已了解，继续安装"
ui_print "  [ 音量下 (-) ] 取消安装"
ui_print "=========================================="

key_check() {
    _kc_total=0
    while [ "$_kc_total" -lt 300 ]; do
        INPUT=$(timeout 0.1 getevent -l 2>/dev/null | grep -E "KEY_VOLUME|0072|0073")
        case "$INPUT" in
            *KEY_VOLUMEUP*DOWN*|*0073*DOWN*)
                echo "KEY_VOLUMEUP"; return ;;
            *KEY_VOLUMEDOWN*DOWN*|*0072*DOWN*)
                echo "KEY_VOLUMEDOWN"; return ;;
        esac
        _kc_total=$((_kc_total + 1))
    done
    echo "KEY_VOLUMEDOWN"
    return 0
}

key=$(key_check)

if [ "$key" = "KEY_VOLUMEDOWN" ]; then
    ui_print " "
    ui_print "  ✕ 用户取消安装"
    ui_print "=========================================="
    abort "  安装已取消"
fi

ui_print " "
ui_print "  ◉ 用户确认继续安装"
ui_print " "
sleep 1
ui_print "=========================================="
ui_print "  正在监测…"
ui_print " "

ANDROID_VER=$("$GETPROP" ro.build.version.release)
ROM_VERSION=$("$GETPROP" ro.build.display.id)
KERNEL_VER=$(uname -r)
SOC_MODEL=$("$GETPROP" ro.soc.model)
[ -z "$SOC_MODEL" ] && SOC_MODEL=$("$GETPROP" ro.board.platform)

BAT_LEVEL="未知"
BAT_TEMP="未知"
CPU_TEMP="未知"
GPU_TEMP="未知"
DDR_TEMP="未知"

if [ -f /sys/class/power_supply/battery/capacity ]; then
    v=$(cat /sys/class/power_supply/battery/capacity 2>/dev/null)
    [ -n "$v" ] && BAT_LEVEL="${v}%"
fi

if [ -f /sys/class/power_supply/battery/temp ]; then
    v=$(cat /sys/class/power_supply/battery/temp 2>/dev/null)
    if [ -n "$v" ]; then
        BAT_TEMP="$((v / 10))°C"
    fi
fi

for tz in /sys/class/thermal/thermal_zone*; do
    [ -f "$tz/type" ] || continue
    [ -f "$tz/temp" ] || continue
    t=$(cat "$tz/type" 2>/dev/null)
    v=$(cat "$tz/temp" 2>/dev/null)
    [ -z "$v" ] && continue
    case "$v" in
        *[!0-9]*) continue ;;
    esac
    [ "$v" -le 0 ] 2>/dev/null && continue

    if [ "$CPU_TEMP" = "未知" ]; then
        if echo "$t" | grep -qiE "^cpu-|^cpuss-|^socd$"; then
            CPU_TEMP="$((v / 1000))°C"
        fi
    fi

    if [ "$GPU_TEMP" = "未知" ]; then
        if echo "$t" | grep -qiE "^gpuss-|^gpu|^kgsl$"; then
            GPU_TEMP="$((v / 1000))°C"
        fi
    fi

    if [ "$DDR_TEMP" = "未知" ]; then
        if echo "$t" | grep -qiE "^ddr$|^ddr-|^dram"; then
            DDR_TEMP="$((v / 1000))°C"
        fi
    fi
done

HORAE_STATUS=$("$GETPROP" init.svc.horae)
[ -z "$HORAE_STATUS" ] && HORAE_STATUS="未知"

THERMAL_STATUS=$("$GETPROP" init.svc.thermal-engine)
[ -z "$THERMAL_STATUS" ] && THERMAL_STATUS="未知"

CHARGE_STATUS="未知"
if [ -f /sys/class/power_supply/battery/status ]; then
    v=$(cat /sys/class/power_supply/battery/status 2>/dev/null)
    [ -n "$v" ] && CHARGE_STATUS="$v"
fi

THERMAL_FILES=$(find /odm/etc /vendor/etc /system/vendor/etc -name "*thermal*" -type f 2>/dev/null | wc -l)

MARKET_NAME=$(printf '%s' "$MARKET_NAME" | tr -d '\n\r')
DEVICE_MODEL=$(printf '%s' "$DEVICE_MODEL" | tr -d '\n\r')

cat > "$MODPATH/module.prop" <<PROP
id=Vehemence
name=星驰引擎_狂暴温控
version=V1.1
versionCode=11
author=酷安@穆远星
description=为${MARKET_NAME}(${DEVICE_MODEL})提供狂暴温控，通过伪装壳温度提升温控墙阈值，手动调节CPU/GPU/DDR的伪装值。
updateJson=https://raw.githubusercontent.com/MuYuanXing/Vehemence/main/update.json
PROP

ui_print "◆ 设备信息"
ui_print "  ● 机型型号:   $DEVICE_MODEL"
ui_print "  ● 机型名称:   $MARKET_NAME"
ui_print "  ● 处理器:     $SOC_MODEL"
ui_print "  ● 安卓版本:   Android $ANDROID_VER"
ui_print "  ● 内核版本:   $KERNEL_VER"
ui_print "  ● 系统版本:   $ROM_VERSION"
ui_print " "
sleep 0.5
ui_print "◆ 温控状态"
ui_print "  ● 当前电量:   $BAT_LEVEL"
ui_print "  ● 电池温度:   $BAT_TEMP"
ui_print "  ● CPU 温度:   $CPU_TEMP"
ui_print "  ● GPU 温度:   $GPU_TEMP"
ui_print "  ● DDR 温度:   $DDR_TEMP"
ui_print "  ● 充电状态:   $CHARGE_STATUS"
ui_print " "
sleep 0.5
ui_print "◆ 系统服务"
ui_print "  ● Horae 状态: $HORAE_STATUS"
ui_print "  ● 温控引擎:   $THERMAL_STATUS"
ui_print "  ● 温控配置数: $THERMAL_FILES"
ui_print " "
ui_print "=========================================="
ui_print "  监测完成，环境安全。"
ui_print " "
ui_print "=========================================="
ui_print "  安装完成！重启后生效"
ui_print "=========================================="

BOOT_COMPLETED=$("$GETPROP" sys.boot_completed)
if [ "$BOOT_COMPLETED" = "1" ]; then
    sleep 2
    ui_print "  正在跳转交流群…"
    am start -a android.intent.action.VIEW -d "https://qun.qq.com/universal-share/share?ac=1&authKey=rFPKOq6ZD3BVyaiZrX%2FLTMil5LQMGhf1xwU9jBV5w9ff7xC2a8Doo8LJ%2F6F2Qx63&busi_data=eyJncm91cENvZGUiOiI5NzkyMjE4MjIiLCJ0b2tlbiI6InQ3S1Z5MGFtTFFsYVRPSTlScDVBaHNhNU4xTk9WUzYyMisvV1lqajlGMVJDUlFacGljSFJzR0RidHllaENXcTMiLCJ1aW4iOiIzODk0Mzc0NzQxIn0%3D&data=fWutlDOTodaQjyKmE44Rf1q9T61akqanrpuwc3hwYJP1FZ71vN_MMcv2f95clPlkP9KIcbsr5k-cblX9Tw82MQ&svctype=4&tempid=h5_group_info" >/dev/null 2>&1
fi
