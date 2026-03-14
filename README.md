# VibeGo

[中文](README.zh-CN.md) | English

A Web IDE built for professionals, designed for Vibe Coding anytime, anywhere. Freely use your Claude Code, Gemini CLI, CodeX, OpenCode, and more.

## Preview

<p align="center">
  <img src="assets/previews/file.png" width="30%" alt="File Explorer" />
  <img src="assets/previews/git.png" width="30%" alt="Git Integration" />
  <img src="assets/previews/terminal.png" width="30%" alt="Terminal" />
</p>

<p align="center">
  <img src="assets/previews/menu.png" width="30%" alt="Menu" />
  <img src="assets/previews/setting.png" width="30%" alt="Settings" />
  <img src="assets/previews/theme1_file.png" width="30%" alt="Theme 1" />
</p>

## What is VibeGo?

VibeGo is a lightweight yet powerful Web IDE that allows you to access your local codebase, run terminal commands, and manage your Git repository entirely from your browser. It is optimized for AI-assisted coding (Vibe Coding), providing a secure, seamless remote development environment without the heavy overhead of traditional desktop IDEs.

## Features

- **File Editor (based on Monaco Editor):** Full-featured code editor with syntax highlighting, file tree management, and quick file navigation.
- **Built-in Terminal (based on Xterm.js):** Fully interactive web terminal supporting split-screen (vertical and horizontal) layouts, handling complex command line tools and AI CLIs seamlessly.
- **Git Integration:** Comprehensive Git GUI for tracking status, viewing diffs, committing, pushing, pulling, force pushing, and managing branches (including merges).
- **Secure Access:** Built-in key-based authentication, local/LAN access controls, and IP-level rate limiting (Fail2ban mechanism) to protect against unauthorized access.
- **Modern UI & Theming:** Sleek, responsive design built with Tailwind CSS, supporting dark/light modes and customizable themes.

## Quick Start

In active development. Experience the beta version directly via npx without manual installation:

```bash
npx vibego@latest
```

By default, VibeGo starts at `http://localhost:1984`.

## Configuration

You can configure VibeGo using command-line flags or environment variables prefixed with `VG_`:

- `--port, -p` / `VG_PORT`: Specify the port (default: `1984`).
- `--host` / `VG_HOST`: Server host address (default: `0.0.0.0`).
- `--key, -k` / `VG_KEY`: Access key. If empty, WAN access will be disabled for security reasons.
- `--need-key` / `VG_NEED_KEY`: Require key authentication even for local networking. This will be automatically enforced when `--allow-wan` is enabled alongside a `--key`.
- `--allow-wan, -a` / `VG_ALLOW_WAN`: Allow WAN access. Note: Only works if a key is provided.
- `--shell` / `VG_SHELL`: Default shell for terminal sessions.
- `--log-level` / `VG_LOG_LEVEL`: Log level (debug, info, warn, error).
