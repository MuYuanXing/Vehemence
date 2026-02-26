# Vehemence

**星驰引擎 · 狂暴温控** — Android 温控优化模块

## 简介

C++ 原生守护进程动态发现温度节点，通过 bind-mount 遮罩实现 CPU/GPU/DDR/电池四维温度伪装，压制系统温控降频。配合 KernelSU WebUI 实时调节，全品牌通用。

## 功能

- 四通道独立温度伪装（CPU / GPU / DDR / 电池），滑块自由调节
- 应用触发：按前台应用独立配置温度，精准控温
- 充电触发：充电时自动切换专属温度配置
- 三级温度优先级：充电 > 应用 > 全局
- bind-mount 遮罩机制，不存在被内核刷新的问题
- 主动压制系统温控服务（Horae / thermal-engine / thermal-HAL）
- emul_temp + /proc/shell-temp 双路径壳温覆盖
- KernelSU WebUI 控制面板，深色/浅色主题，实时状态监控 + 热加载
- WebUI 新手引导 + 配置变更历史记录
- C++ 原生守护进程，低功耗稳定运行

## 支持设备

- **品牌**: 全品牌通用（OPLUS 设备兼容性最佳）
- **SoC**: Qualcomm Snapdragon / MediaTek Dimensity
- **系统**: Android 14 / 15+
- **Root**: KernelSU（完整功能）/ Magisk（无 WebUI）

## 兼容性说明

- **OPLUS 设备**（一加/OPPO/真我）：温控服务压制完整适配，效果最佳
- **其他品牌**：节点发现通用可用，温控服务压制效果可能有差异
- **天玑处理器**：V1.1 已适配 MT6895/MT6991 等天玑平台节点命名
- **APatch 及其分支**：可能存在兼容性问题，遇到异常请反馈

## 安装

1. 从 [Releases](https://github.com/MuYuanXing/Vehemence/releases) 下载最新刷入包
2. 在 KernelSU / Magisk 管理器中刷入
3. 重启生效

## 使用

KernelSU 用户打开模块管理器 → 找到「星驰引擎_狂暴温控」→ 点击 WebUI 图标，即可调节四通道温度。

Magisk 用户需手动编辑 `/data/adb/modules/Vehemence/` 下的配置文件。

## 注意事项

- 温度伪装 ≠ 散热，长时间高负载请注意手感温度
- 可能影响充电策略的自动调节
- 如遇异常，模块管理器中禁用模块 → 重启即可完全恢复
- 不建议与其他温控模块同时使用

## 作者

穆远星 · [酷安 @穆远星](http://www.coolapk.com/u/28719807)

## 许可

本项目为闭源项目，仅提供编译后的刷入包。源码不包含在此仓库中。
