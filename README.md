# VibeGo

[中文](README.zh-CN.md) | English

A Web IDE built for Vibe Coding anytime, anywhere. Freely use your Claude Code, Gemini CLI, CodeX, OpenCode, and more.

Specially designed and optimized for mobile devices, the interface is built with aesthetics and intuitive use as top priorities, letting other complex features take a back seat.
Therefore, the application is designed entirely around three core pillars: File Explorer, Git, and Terminal.

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

## Quick Start

In active development. Experience the beta version directly via npx without manual installation:

```bash
npx -y vibego@latest
```

Or using pnpm:

```bash
pnpm dlx vibego@latest
```

By default, VibeGo starts at `http://localhost:1984`.

## Features

- **File Editor:** File browsing and code editing with syntax highlighting, file tree management, and quick navigation.
- **Built-in Terminal:** Fully interactive web terminal supporting vertical and horizontal split panes, making it easy to run complex command-line tools and AI CLIs.
- **Git Integration:** A simple yet comprehensive Git GUI for viewing status, diffs, committing, pushing, pulling, force pushing, and managing branches (including merges).
- **Flexible UI:** Modern and responsive UI design supporting dark/light modes and customizable themes.
- **Secure Access:** Built-in authentication, LAN access controls, and rate limiting (Fail2ban) to protect your development environment.

## Install

Install and update VibeGo globally via npm:

```bash
npm i -g vibego@latest
```

Or using pnpm:

```bash
pnpm i -g vibego@latest
```

Start the application:

```bash
vibego
```

## Configuration

You can configure VibeGo's behavior using command-line arguments or environment variables (prefixed with `VG_`):

- `-p, --port` / `VG_PORT`: Specify the listening port (default: `1984`).
- `--host` / `VG_HOST`: Define the server host address (default: `0.0.0.0`).
- `-k, --key` / `VG_KEY`: Set an access key. If omitted, WAN access is strictly disabled for security.
- `--need-key` / `VG_NEED_KEY`: Enforce key authentication even on local networks. Automatically enforced if `--allow-wan` is used with a valid `--key`.
- `-a, --allow-wan` / `VG_ALLOW_WAN`: Enable WAN access. **Note:** Requires a valid access key.
- `--shell` / `VG_SHELL`: Default shell executable for terminal sessions.
- `--log-level` / `VG_LOG_LEVEL`: Log level (`debug`, `info`, `warn`, `error`).

## The Origin Story

I've had the idea for this project for a long time: in the future of AI Coding, we definitely won't need bloated, all-in-one IDEs, but rather only the essential features.
I've also used many feature-heavy AI Agent tools on the market (such as vibe-kanban, coolvibe, and the web version of opencode):

They are either too complex and heavy, making them hard to learn, and unable to keep up with the rapid iteration speeds of the official CLIs from various AI companies; or they hand over complete control to the AI, completely isolating the human from the code. Current AI isn't ready to be left completely unsupervised, otherwise, it can easily generate unmaintainable "spaghetti code."

Official model providers usually offer GUI interfaces, so I chose not to wrap the CLIs into standard chat interfaces. Instead, I kept the terminal to give users complete freedom.
Additionally, AI tasks often take time. To avoid interrupting workflow and to provide timely notifications, optimizing for mobile interfaces became a priority—allowing you to truly _Go Anywhere, Anytime_.

Finally, it's a personal pursuit. I have always admired Apple's design philosophy: a software must be minimalist and intuitive to be a great tool. Because the interface prioritizes aesthetics and intuition, other complex features are deprioritized. I encourage you to click around everywhere—you'll discover some clever little design touches!

Since setting the design goals, I've been continuously refining it. Developed intermittently in my spare time during a busy work schedule, the design is now polished, and the core features are complete. There might still be a few bugs in the Git operations, but feel free to dive in, report issues, and contribute your ideas and code!
