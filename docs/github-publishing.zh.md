# 上传 GitHub 与发布附件

建议仓库名 `edueval-studio`，Description 可填写：

> 教育场景多模型评测工作台：10Q Benchmark、逐题 Rubric、LLM Judge、人工盲评与 DSH 插件。

建议 Topics：`llm-evaluation`、`education`、`benchmark`、`llm-as-a-judge`、`deepseek-harness`。

## 网页上传

1. 在 GitHub 创建仓库。首次上传时可保持为空，不勾选自动生成 README、License 或 `.gitignore`。
2. 打开仓库上传文件入口，把本地 `edueval-studio` 文件夹内的文件和目录上传到仓库根目录，避免再套一层 `edueval-studio/`。
3. 确认 `.github/`、`.gitignore`、`.gitattributes` 等隐藏项目也已上传；网页不便处理时使用下方 Git 命令。不要上传 `.git/`。
4. 提交后检查首页 README、截图链接和 Actions 结果。

## 使用 Git 推送

在 `edueval-studio` 目录执行；将最后的地址替换为自己刚创建的真实仓库地址。下列地址是占位符。

```sh
git init -b main
git add .
git diff --cached --stat
git commit -m "Initial import of EduEval Studio"
git remote add origin https://github.com/YOUR_USERNAME/edueval-studio.git
git push -u origin main
```

如果使用随附的已初始化目录，第一步可省略。如果 Git 提示身份未设置，在本仓库运行 `git config user.name "你的名字"` 和 `git config user.email "你的 GitHub 提交邮箱"`，然后重试提交。

仓库所有者尚未提供，`package.json` 中原有的固定 GitHub 地址已移除，避免指向其他仓库。创建远端后可将 `repository` 和 `homepage` 补充为自己的真实地址。

## 发布 Release

随附的 `release-assets` 文件夹在源码仓库外，包含原始插件安装 ZIP、原始题库 ZIP、由本次源码生成的新插件包及校验和。本次不发布 Windows 桌面应用。

1. 推送源码并确认 Actions 通过。
2. 在 GitHub 创建 Release，选择这次源码对应的提交并创建版本标签。
3. 上传需要分发的附件及 `SHA256SUMS.txt`。原始插件安装 ZIP 与本次重新打包的插件是两份不同制品，区别见材料来源文档。
4. 在说明中明确版本分别为：DSH 插件 `1.0.0`、Benchmark `0.2.0`。
5. 发布后可把真实 Release 链接加入根 README；当前未填写虚构下载地址。

可用以下命令核对附件：

```powershell
Get-FileHash -Algorithm SHA256 .\dsh-plugin-edueval-1.0.0.tgz
```

上传前核对许可范围见 [license-scope.zh.md](license-scope.zh.md)。本次整理只生成本地材料，没有创建远程仓库或发布 Release。
