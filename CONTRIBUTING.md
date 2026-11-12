# 参与贡献

开发需要 Node.js 22+；额外题库检查需要 Python 3.10+。插件无运行时第三方 npm 依赖，不需要构建前端。`client.js` 是手写 DSH Client 模块，可直接维护。

```sh
npm ci
npm run verify
python scripts/validate_benchmark.py
npm pack --dry-run
```

修改引擎、评分、存储或接口时运行现有测试，并为行为变化补充必要的覆盖。修改题目时同步维护 `data/benchmark_v0.2.jsonl`、可读题库和选题清单；改变评分口径应明确版本，避免与已有结果混用。

提交 PR 时描述触发场景、行为变化及验证结果。不要提交 API Key、宿主凭据、个人运行数据、付费模型调用结果或安装程序；截图和新样本先检查是否包含个人信息。

CI 使用 Windows / Linux 与 Node.js 22 / 24 检查插件和打包，在 Linux 上额外校验题库。CI 无需模型 Key，不代表真实 DSH UI 或模型服务已通过验证。
