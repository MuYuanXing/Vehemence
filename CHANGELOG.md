# 更新日志

## V1.1 (versionCode 11)

- 修复：一加15（SM8850）CPU 伪装失效，新增 `cpullc-`、`qmx-` 节点匹配
- 修复：天玑处理器（MT6895/MT6991 等）CPU/DDR 伪装失效，新增 `cpu_`、`soc-`、`soc_max` 节点匹配
- 新增：WebUI 系统温控压制开关（Horae / thermal-engine / ormsHal 等服务一键开关）
- 优化：ConfigLoader 支持 `horae_stop` 热加载，LoopEngine 按开关状态决定是否压制系统温控

## V1.0 (versionCode 10)

- 初始版本
- C++ 守护进程，动态节点发现，bind-mount 温度伪装
- KernelSU WebUI 控制面板
