# VibeGo

中文 | [English](README.md)

为专业人士打造，支持随时随地 Vibe Coding 的 Web IDE。自由使用你的 Claude Code、Gemini CLI、CodeX、OpenCode 及更多工具。

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

## 什么是 VibeGo？

VibeGo 是一个轻量级但功能强大的 Web IDE，允许你在浏览器中完全访问本地代码库、运行终端命令以及管理 Git 仓库。它专为 AI 辅助编程 (Vibe Coding) 优化，提供了安全、无缝的远程开发环境，而没有传统桌面 IDE 的沉重负担。

## 核心特性

- **文件编辑器 (基于 Monaco Editor):** 全功能代码编辑器，支持语法高亮、文件树管理和快速导航。
- **内置终端 (基于 Xterm.js):** 完全交互式的 Web 终端，支持垂直和水平分屏，轻松运行复杂的命令行工具和 AI CLI。
- **Git 集成:** 完善的 Git 图形界面，支持查看状态、比较差异、提交、推送、拉取、强制推送以及分支管理和合并。
- **安全访问:** 内置基于 Key 的安全验证、局域网访问控制，以及防爆破机制，保护你的开发环境免受未授权访问。
- **现代 UI 与主题:** 现代化、响应式的 UI 设计，支持深浅色模式与自定义主题。

## 快速开始

激情开发功能中，使用 `npx` 直接体验预览版，无需手动安装：

```bash
npx vibego@latest
```

默认情况下，VibeGo 启动在 `http://localhost:1984`。

## 配置说明

可以通过命令行参数或以 `VG_` 为前缀的环境变量来配置 VibeGo：

- `--port, -p` / `VG_PORT`: 指定端口，默认 `1984`。
- `--host` / `VG_HOST`: 服务器监听地址，默认 `0.0.0.0`。
- `--key, -k` / `VG_KEY`: 访问密钥。如果为空，出于安全考虑将禁用广域网访问。
- `--need-key` / `VG_NEED_KEY`: 即使在本地局域网也强制要求密钥登录。当启用允许外网访问 `--allow-wan` 并提供了密钥 `--key` 时，此选项将自动生效。
- `--allow-wan, -a` / `VG_ALLOW_WAN`: 允许广域网访问。注意：仅在提供密钥时生效。
- `--shell` / `VG_SHELL`: 终端会话的默认 Shell。
- `--log-level` / `VG_LOG_LEVEL`: 日志级别 (debug, info, warn, error)。
