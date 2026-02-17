# Vehemence

**星驰引擎 · 狂暴温控** — OPLUS 设备温控优化模块

## 简介

OPLUS 设备（一加 / OPPO / 真我）的温控模块，压制系统温控降频，CPU/GPU/DDR 温度伪装 40°C，电池温控阈值提升至 45°C。

## 功能

- 伪装 CPU、GPU、DDR 温度至 40°C
- 提高电池温控阈值至 45°C
- 自动接管系统温控服务，防止冲突

## 支持设备

- **品牌**: 一加 (OnePlus) / OPPO / 真我 (realme)
- **SoC**: Qualcomm Snapdragon 平台
- **系统**: Android 14 / 15+
- **Root**: Magisk 20.4+ / KernelSU

## 兼容性说明

- **APatch 及其分支版本**：可能存在兼容性问题，遇到异常请反馈
- **天玑处理器设备**：温控节点与骁龙平台存在差异，部分功能可能无法完全生效

## 安装

1. 从 [Releases](https://github.com/MuYuanXing/Vehemence/releases) 下载最新刷入包
2. 在 Magisk / KernelSU 管理器中刷入
3. 重启生效

## 注意事项

- 温度伪装不影响手机实际散热，但可能影响充电速度的自动调节
- 模块运行期间会自动接管系统温控服务
- 如遇异常，在模块管理器中关闭模块，重启即可完全恢复
- 仅支持 OPLUS 系设备，其他品牌安装时会被拦截

## 作者

穆远星 · [酷安 @穆远星](http://www.coolapk.com/u/28719807)

## 许可

本项目为闭源项目，仅提供编译后的刷入包。
