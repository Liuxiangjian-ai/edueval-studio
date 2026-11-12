# 安装脚本

使用前先安装兼容的 DeepSeek Harness。将插件 `.tgz` 放到本目录，与安装脚本相邻。从仓库打包可在根目录执行：

```sh
npm pack --pack-destination installers
```

Windows：完全退出 DSH，双击 `安装 EduEval Studio.cmd`。也可在本目录执行 `powershell -NoProfile -ExecutionPolicy Bypass -File ./install.ps1 -NoLaunch -NoPause`。`-Profile` 可覆盖默认的 `desktop`。

macOS / Linux：在本目录执行 `bash install.sh`，或用 `DSH_BIN="/path/to/dsh" bash install.sh` 指定宿主 CLI；`DSH_PROFILE` 可覆盖默认 Profile。

安装脚本调用 DSH CLI 注册本地 tarball 并查询安装结果，Windows 脚本默认还会尝试启动 DSH。安装后重新打开宿主，从侧栏进入 EduEval Studio。原始说明保存在 [安装说明.txt](安装说明.txt)；其中打包和分发说明是原始交付方式，本仓库以当前 README 为入口。

本目录不跟踪生成的 `.tgz`；分发时应把 `.tgz` 和脚本打包到同一个 ZIP，或直接使用随附 Release 目录中的原始插件安装包。
