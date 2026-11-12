# 材料来源与整合记录

输入：用户提供的 `教育评测-刘祥健.zip`。原包保留不动，本次只在新目录整理。源文件大小与 SHA-256 见 [source-inventory.json](source-inventory.json)。清单记录原文件指纹，不表示所有原始文件仍逐个作为独立文件提交。

| 原材料 | 整合后位置 | 处理 |
| --- | --- | --- |
| 项目 PDF（原 ZIP 中文文件名编码异常） | `docs/edueval-report.zh.pdf` | 以内容确认标题，改为稳定文件名，PDF 字节不变，共 49 页 |
| `edueval-benchmark.zip` | `data/`、`benchmark/`、`scripts/` | 展开为可维护文件，原 ZIP 另作 Release 附件 |
| `EduEval-dsh-plugin.zip` 内 `.tgz` | 仓库根目录及 `src/` 等 | 展开完整插件源码与文档，保留原 MIT License；原 ZIP 另作附件 |
| 插件 ZIP 内安装脚本与说明 | `installers/` | 原样保留，补充仓库打包方式说明 |
| `EduEval-Studio-v0.1.5-Windows-x64.exe` | 不纳入本次交付 | 按用户要求排除桌面应用；原始输入包保留不动 |

## 合并与调整

- 独立题库 `benchmark_10q_v0.2.jsonl` 与插件内 `data/benchmark_v0.2.jsonl` 字节完全一致，仅保留后者作为唯一数据源。
- 评审 Markdown 存在差异：插件包标题为 v0.1，建议至少抽样 8 题；独立题库包为 v0.2，建议全量 10 题，时间有限时至少 5 题。本仓库采用题库包 v0.2；实际模型调用提示词仍定义于 `src/host/judge.js`，没有改变引擎评分协议。
- 插件原英文 `README.md` 改名为 `README.en.md`，原中文 `README.zh.md` 保留。两份原指南记录此前的开发与 UI 验证情况，本次整理的状态以根 README 和核验记录为准。
- 删除 `package.json` 中未经确认的固定 GitHub 仓库地址。保留插件版本号、入口、DSH 声明与运行时实现。
- `scripts/check.mjs` 使用 Node.js `fileURLToPath` 解析仓库路径，支持含空格或中文的检出目录。
- Python 题库校验脚本改为读取唯一数据源，使用显式错误检查，并核对选题 CSV。
- 新增仓库首页、上传指南、贡献说明、CI、忽略规则、换行规范和来源指纹。打包排除项目 PDF 和本地生成文件；报告仍包含在 Git 源码仓库。

## 材料边界

本次仅发布 DSH 插件、题库及文档，不包含桌面应用。项目 PDF 原样保留，其中的桌面版实测与设计说明作为历史材料供参考。报告提到的原始逐条 Run JSON / CSV 不在输入压缩包中；没有凭空补造运行记录。运行报告中的排名和 UI 验证记录均属于原始材料，不等于本次重新完成了真实模型或宿主验证。

原始插件 ZIP 与本次 `npm pack` 制品均标注插件 v1.0.0，但后者包含本次文档、路径检查和题库模板整合，文件哈希会不同。发布时应按附件说明区分原始交付包与整理后插件，避免将它们视为字节相同的制品。
