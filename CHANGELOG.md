# 更新日志

## V1.2 (versionCode 12)

- 新增：应用触发功能（按前台应用独立配置温度伪装值）
- 新增：充电触发功能（充电时自动切换独立温度配置）
- 新增：三级温度优先级（充电 > 应用 > 全局）
- 新增：WebUI 底部胶囊导航（应用 / 温控 / 充电 三页切换）
- 新增：WebUI 深色主题
- 新增：WebUI 配置变更历史记录
- 新增：WebUI 新手引导
- 新增：WebUI 应用列表分类筛选（第三方/系统/全部）+ 全选/反选
- 修复：解决某些机型偶现 CPU 频率锁定问题
- 优化：守护进程自适应休眠策略，低开销稳定运行

## V1.1 (versionCode 11)

- 修复：一加15（SM8850）CPU 伪装失效，新增 `cpullc-`、`qmx-` 节点匹配
- 修复：天玑处理器（MT6895/MT6991 等）CPU/DDR 伪装失效，新增 `cpu_`、`soc-`、`soc_max` 节点匹配
- 新增：WebUI 系统温控压制开关（Horae / thermal-engine / ormsHal 等服务一键开关）
- 优化：ConfigLoader 支持 `horae_stop` 热加载，LoopEngine 按开关状态决定是否压制系统温控

## V1.0 (versionCode 10)

- 初始版本
- C++ 守护进程，动态节点发现，bind-mount 温度伪装
- KernelSU WebUI 控制面板
