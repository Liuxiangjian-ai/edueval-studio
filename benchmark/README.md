# EduEval Benchmark v0.2.0

从原始 v0.1 的 30 题中筛选 10 题，适用于评测工作流验证和初步比较。

- 完整教案 5 题、PPT 逐页大纲 5 题。
- 小学 3 题、初中 4 题、高中 3 题；基础 2 题、进阶 4 题、挑战 4 题。
- 题目 ID 为 `EDU-01` 至 `EDU-10`，每题 6 项 Rubric、权重合计 100。
- 合成题集尚未完成教师专家验证或大规模区分度测试，不适合据此推断广泛教育能力排名。

## 文件

| 文件 | 用途 |
| --- | --- |
| [../data/benchmark_v0.2.jsonl](../data/benchmark_v0.2.jsonl) | 唯一的结构化题库；与原 `benchmark_10q_v0.2.jsonl` 字节一致 |
| [benchmark_readable.md](benchmark_readable.md) | 人类可读题面、Rubric 与 Critical Errors |
| [selection_manifest.csv](selection_manifest.csv) | 学段、学科、难度与筛选理由 |
| [评审协议](../data/judge_prompt_and_blind_review.md) | v0.2 人工调用模板与盲评建议 |
| [校验脚本](../scripts/validate_benchmark.py) | Python 标准库校验，无第三方依赖 |

在仓库根目录执行 `python scripts/validate_benchmark.py`，也可从任意工作目录通过脚本绝对路径运行。脚本核对题号、版本、任务分布、学段、难度、评分维度、权重和选题清单。

每项给 0 / 1 / 2 分，总分 `Σ(weight × score / 2)`。Critical Errors 单列，不额外扣分；相关问题仍可按 Rubric 影响维度分数。插件实际调用的提示词定义于 [judge.js](../src/host/judge.js)，Markdown 模板供人工和外部脚本参考。

## 原始 ID 对照

| 新 ID | 原 ID |
| --- | --- |
| EDU-01 | EDU-L01 |
| EDU-02 | EDU-L02 |
| EDU-03 | EDU-L06 |
| EDU-04 | EDU-L13 |
| EDU-05 | EDU-L15 |
| EDU-06 | EDU-S01 |
| EDU-07 | EDU-S07 |
| EDU-08 | EDU-S09 |
| EDU-09 | EDU-S14 |
| EDU-10 | EDU-S15 |
