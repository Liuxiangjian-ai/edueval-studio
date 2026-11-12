# 本次整理核验

核验日期：2026-11-12。环境：Windows x64，Node.js 24.14.0、npm 11.9.0、Python 3.12.0。

| 检查 | 结果 |
| --- | --- |
| `npm ci --ignore-scripts --offline` | 通过；无第三方运行时依赖 |
| `npm run verify` | 插件结构检查通过；现有 13 项测试全部通过 |
| `python scripts/validate_benchmark.py` | 10 题、版本、任务/学段/难度覆盖、6 维 Rubric、权重及选题清单通过 |
| 本地 Markdown 链接 | 仓库中所有本地链接目标存在 |
| 数据完整性 | 两份输入 JSONL 字节一致；保留一份作为唯一数据源 |
| 原始附件 | PDF、插件与题库原始分发 ZIP 以 SHA-256 核对保留；交付包排除桌面 EXE |

本地 HTTP 适配器测试仅访问 `127.0.0.1` 的 Stub。首次受限沙箱执行中该请求被拦截，解除本机访问限制后 13 项全部通过，没有修改或跳过失败断言，也没有调用真实厂商接口。

GitHub Actions 已配置 Windows / Linux、Node.js 22 / 24 的自动检查；远程 CI 尚未运行。本次未重新验证 DSH 宿主 UI、Windows EXE 启动或真实付费模型调用。原始指南中的 UI 和厂商调用记录属于此前交付材料。
