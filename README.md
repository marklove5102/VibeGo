# VibeGo

A Web IDE built for professionals, designed for Vibe Coding anytime, anywhere. Freely use your Claude Code, Gemini CLI, CodeX, OpenCode, and more.

为专业人士打造，支持随时随地 Vibe Coding 的 Web IDE。自由使用你的 Claude Code、Gemini CLI、CodeX、OpenCode 及更多工具。

## Preview

<p align="center">
  <img src="assets/previews/file.png" width="30%" alt="File Explorer" />
  <img src="assets/previews/git.png" width="30%" alt="Git Integration" />
  <img src="assets/previews/terminal.png" width="30%" alt="Terminal" />
</p>

<p align="center">
  <img src="assets/previews/menu.png" width="45%" alt="Menu" />
  <img src="assets/previews/setting.png" width="45%" alt="Settings" />
</p>

<p align="center">
  <img src="assets/previews/theme1_file.png" width="45%" alt="Theme 1" />
  <img src="assets/previews/theme2_file.png" width="45%" alt="Theme 2" />
</p>

## What is VibeGo? | 什么是 VibeGo？

VibeGo is a lightweight yet powerful Web IDE that allows you to access your local codebase, run terminal commands, and manage your Git repository entirely from your browser. It is optimized for AI-assisted coding (Vibe Coding), providing a secure, seamless remote development environment without the heavy overhead of traditional desktop IDEs.

VibeGo 是一个轻量级但功能强大的 Web IDE，允许你在浏览器中完全访问本地代码库、运行终端命令以及管理 Git 仓库。它专为 AI 辅助编程 (Vibe Coding) 优化，提供了安全、无缝的远程开发环境，而没有传统桌面 IDE 的沉重负担。

## Features | 核心特性

- **File Editor (基于 Monaco Editor):** Full-featured code editor with syntax highlighting, file tree management, and quick file navigation.
  - 全功能代码编辑器，支持语法高亮、文件树管理和快速导航。
- **Built-in Terminal (基于 Xterm.js):** Fully interactive web terminal supporting split-screen (vertical and horizontal) layouts, handling complex command line tools and AI CLIs seamlessly.
  - 完全交互式的 Web 终端，支持垂直和水平分屏，轻松运行复杂的命令行工具和 AI CLI。
- **Git Integration:** Comprehensive Git GUI for tracking status, viewing diffs, committing, pushing, pulling, force pushing, and managing branches (including merges).
  - 完善的 Git 图形界面，支持查看状态、比较差异、提交、推送、拉取、强制推送以及分支管理和合并。
- **Secure Access:** Built-in key-based authentication, local/LAN access controls, and IP-level rate limiting (Fail2ban mechanism) to protect against unauthorized access.
  - 内置基于 Key 的安全验证、局域网访问控制，以及防爆破机制，保护你的开发环境免受未授权访问。
- **Modern UI & Theming:** Sleek, responsive design built with Tailwind CSS, supporting dark/light modes and customizable themes.
  - 现代化、响应式的 UI 设计，支持深浅色模式与自定义主题。

## Quick Start | 快速开始

In active development. Experience the beta version directly via npx without manual installation:

激情开发功能中，使用 `npx` 直接体验预览版，无需手动安装：

```bash
npx vibego@latest
```

By default, VibeGo starts at `http://localhost:1984`.

## Configuration | 配置说明

You can configure VibeGo using command-line flags or environment variables prefixed with `VG_`:

可以通过命令行参数或以 `VG_` 为前缀的环境变量来配置 VibeGo：

- `--port, -p` / `VG_PORT`: Specify the port (default: `1984`). (指定端口，默认 `1984`)
- `--host` / `VG_HOST`: Server host address (default: `0.0.0.0`). (服务器监听地址，默认 `0.0.0.0`)
- `--key, -k` / `VG_KEY`: Access key. If empty, WAN access will be disabled for security reasons. (访问密钥。如果为空，出于安全考虑将禁用广域网访问。)
- `--need-key` / `VG_NEED_KEY`: Require key authentication even for local networking. This will be automatically enforced when `--allow-wan` is enabled alongside a `--key`. (即使在本地局域网也强制要求密钥登录。当启用允许外网访问 `--allow-wan` 并提供了密钥 `--key` 时，此选项将自动生效。)
- `--allow-wan, -a` / `VG_ALLOW_WAN`: Allow WAN access. Note: Only works if a key is provided. (允许广域网访问。注意：仅在提供密钥时生效。)
- `--shell` / `VG_SHELL`: Default shell for terminal sessions. (终端会话的默认 Shell)
- `--log-level` / `VG_LOG_LEVEL`: Log level (debug, info, warn, error). (日志级别)
