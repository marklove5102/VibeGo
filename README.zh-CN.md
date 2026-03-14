# VibeGo

中文 | [English](README.md)

支持随时随地 Vibe Coding 的 Web IDE。自由使用你的 Claude Code、Gemini CLI、CodeX、OpenCode 及更多工具。

专为移动端设计和优化，界面设计以美观和符合使用直觉优先，其他一切复杂功能都要让步。
因此，围绕核心三大功能点：文件、Git、终端，设计了这个应用。

## 预览

<p align="center">
  <img src="assets/previews/file.png" width="30%" alt="文件浏览器" />
  <img src="assets/previews/git.png" width="30%" alt="Git 集成" />
  <img src="assets/previews/terminal.png" width="30%" alt="终端" />
</p>

<p align="center">
  <img src="assets/previews/menu.png" width="30%" alt="菜单" />
  <img src="assets/previews/setting.png" width="30%" alt="设置" />
  <img src="assets/previews/theme1_file.png" width="30%" alt="主题1" />
</p>

## 快速开始

当前激情开发功能中，使用 `npx` 可直接体验预览版，无需手动安装：

```bash
npx vibego@latest
```

默认情况下，VibeGo 启动后可通过 `http://localhost:1984` 访问。

## 特性

- **文件编辑：** 文件浏览、代码编辑，支持语法高亮、文件树管理和快速导航。
- **内置终端：** 完全交互式的 Web 终端，支持垂直和水平分屏，轻松运行复杂的命令行工具和 AI CLI。
- **Git 集成：** 完善简单的 Git 图形界面，支持查看状态、比较差异、提交、推送、拉取、强制推送以及分支管理和合并。
- **灵活的 UI：** 现代化、响应式的 UI 设计，支持深浅色模式与自定义主题。
- **安全访问：** 内置安全验证、局域网访问控制及防爆破机制，保护你的开发环境。

## 项目起源

我很早就有了关于这个项目的想法，就是未来 AI Coding 肯定是不再需要大而全的 IDE，只需要必要的部分功能。
我也使用了市面上的许多功能复杂的 Agent 工具（如 vibe-kanban、coolvibe、opencode 的网页端）：
 
它们要么功能太全太重了，上手难度比较大，同时每家推出的 CLI 迭代速度很快，这导致许多项目不能充分利用 CLI 程序；要么完全将控制权交给了 AI，将人类与代码完全隔离了，而当下的 AI 还不能完全放手，否则会产生巨大的“屎山”。

模型官方一般也提供了 GUI 界面，因此我没有选择将 CLI 封装为普通对话界面，而是保留了终端，把自由留给用户。
还有就是 AI 工作往往需要时间，最好能够不中断工作并且及时通知，所以 VibeGo 首选适配了移动端界面，让你真正能做到 Go Anywhere，Anytime。

最后也是我的个人追求，我一直很喜欢 Apple 的设计理念：简约、符合直觉的软件才是一个优秀的工具。由于界面坚持以美观和直觉优先，其他复杂功能都被暂时靠后。你可以到处多点一点，就会发现在设计上的一些小巧思~

确定了设计目标之后就一直在尝试完善。因为工作较忙，在空闲时间断断续续的开发，现在设计已经完善，核心功能也已经完成。Git 操作可能还有一些 Bug，欢迎使用提出问题和或者贡献你的创意和代码！

## 配置说明

你可以灵活地通过命令行参数或环境变量（以 `VG_` 为前缀）来定制 VibeGo 的运行状态：

- `-p, --port` / `VG_PORT`: 指定服务监听端口 (默认值: `1984`)。
- `--host` / `VG_HOST`: 指定服务监听地址 (默认值: `0.0.0.0`)。
- `-k, --key` / `VG_KEY`: 设置访问密钥。出于安全考量，若未设置密钥，将强制禁用广域网访问。
- `--need-key` / `VG_NEED_KEY`: 即使在本地局域网环境下，也强制要求输入密钥登录。当同时启用 `--allow-wan` 并配置 `--key` 时，此选项将自动生效。
- `-a, --allow-wan` / `VG_ALLOW_WAN`: 允许广域网访问。**注意：** 此选项仅在已配置访问密钥时生效。
- `--shell` / `VG_SHELL`: 自定义终端会话默认使用的 Shell 解释器。
- `--log-level` / `VG_LOG_LEVEL`: 配置应用日志级别 (`debug`, `info`, `warn`, `error`)。
