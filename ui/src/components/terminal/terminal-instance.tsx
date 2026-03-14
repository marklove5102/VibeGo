import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { ProgressAddon } from "@xterm/addon-progress";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { type ITheme, Terminal } from "@xterm/xterm";
import { ChevronDown, ChevronUp, Copy, Check, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { terminalApi } from "@/api/terminal";
import { useTranslation } from "@/lib/i18n";
import { notifyTerminal } from "@/services/terminal-notification-service";
import { type Theme, useAppStore } from "@/stores";

interface TerminalInstanceProps {
  terminalId: string;
  terminalName: string;
  isActive: boolean;
  isExited?: boolean;
  onExited?: () => void;
}

interface CallbackRefs {
  isActive: boolean;
  isExited: boolean;
  onExited?: () => void;
  terminalName: string;
  t: (key: string) => string;
}

interface ParsedTerminalNotification {
  body: string;
  title: string;
}

type TerminalDisposable = { dispose: () => void };

const encodeUtf8Base64 = (data: string): string => {
  const bytes = new TextEncoder().encode(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const getXtermTheme = (appTheme: Theme): ITheme => {
  const isDark = appTheme !== "light";

  if (appTheme === "hacker") {
    return {
      background: "#0d0208",
      foreground: "#00ff41",
      cursor: "#00ff41",
      selectionBackground: "rgba(0, 255, 65, 0.3)",
      black: "#0d0208",
      red: "#ff0000",
      green: "#00ff41",
      yellow: "#008f11",
      blue: "#003b00",
      magenta: "#bd00ff",
      cyan: "#00fdff",
      white: "#00ff41",
      brightBlack: "#003b00",
      brightRed: "#ff3e3e",
      brightGreen: "#00ff41",
      brightYellow: "#008f11",
      brightBlue: "#003b00",
      brightMagenta: "#bd00ff",
      brightCyan: "#00fdff",
      brightWhite: "#ffffff",
    };
  }

  if (appTheme === "ocean") {
    return {
      background: "#0a1628",
      foreground: "#e0f2fe",
      cursor: "#22d3ee",
      selectionBackground: "rgba(34, 211, 238, 0.3)",
      black: "#0a1628",
      red: "#f472b6",
      green: "#34d399",
      yellow: "#fbbf24",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#22d3ee",
      white: "#e0f2fe",
      brightBlack: "#1a3a5c",
      brightRed: "#fb7185",
      brightGreen: "#6ee7b7",
      brightYellow: "#fcd34d",
      brightBlue: "#93c5fd",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#ffffff",
    };
  }

  if (appTheme === "sunset") {
    return {
      background: "#1a0f0a",
      foreground: "#fef3c7",
      cursor: "#f59e0b",
      selectionBackground: "rgba(245, 158, 11, 0.3)",
      black: "#1a0f0a",
      red: "#fb7185",
      green: "#a3e635",
      yellow: "#f59e0b",
      blue: "#60a5fa",
      magenta: "#e879f9",
      cyan: "#22d3ee",
      white: "#fef3c7",
      brightBlack: "#4a2c1a",
      brightRed: "#fda4af",
      brightGreen: "#bef264",
      brightYellow: "#fbbf24",
      brightBlue: "#93c5fd",
      brightMagenta: "#f0abfc",
      brightCyan: "#67e8f9",
      brightWhite: "#ffffff",
    };
  }

  if (appTheme === "nord") {
    return {
      background: "#2e3440",
      foreground: "#eceff4",
      cursor: "#88c0d0",
      selectionBackground: "rgba(136, 192, 208, 0.3)",
      black: "#3b4252",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      white: "#e5e9f0",
      brightBlack: "#4c566a",
      brightRed: "#bf616a",
      brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1",
      brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb",
      brightWhite: "#eceff4",
    };
  }

  if (appTheme === "solarized") {
    return {
      background: "#002b36",
      foreground: "#fdf6e3",
      cursor: "#b58900",
      selectionBackground: "rgba(181, 137, 0, 0.3)",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#586e75",
      brightRed: "#cb4b16",
      brightGreen: "#859900",
      brightYellow: "#b58900",
      brightBlue: "#268bd2",
      brightMagenta: "#6c71c4",
      brightCyan: "#2aa198",
      brightWhite: "#fdf6e3",
    };
  }

  if (isDark) {
    return {
      background: "#18181b",
      foreground: "#d4d4d8",
      cursor: "#a1a1aa",
      selectionBackground: "rgba(161, 161, 170, 0.3)",
      black: "#18181b",
      red: "#ef4444",
      green: "#22c55e",
      yellow: "#eab308",
      blue: "#3b82f6",
      magenta: "#a855f7",
      cyan: "#06b6d4",
      white: "#d4d4d8",
      brightBlack: "#52525b",
      brightRed: "#f87171",
      brightGreen: "#4ade80",
      brightYellow: "#facc15",
      brightBlue: "#60a5fa",
      brightMagenta: "#c084fc",
      brightCyan: "#22d3ee",
      brightWhite: "#ffffff",
    };
  }

  return {
    background: "#ffffff",
    foreground: "#18181b",
    cursor: "#52525b",
    selectionBackground: "rgba(82, 82, 91, 0.3)",
    black: "#000000",
    red: "#ef4444",
    green: "#22c55e",
    yellow: "#eab308",
    blue: "#3b82f6",
    magenta: "#a855f7",
    cyan: "#06b6d4",
    white: "#a1a1aa",
    brightBlack: "#52525b",
    brightRed: "#f87171",
    brightGreen: "#4ade80",
    brightYellow: "#facc15",
    brightBlue: "#60a5fa",
    brightMagenta: "#c084fc",
    brightCyan: "#22d3ee",
    brightWhite: "#18181b",
  };
};

const parseOsc9Notification = (data: string, defaultTitle: string): ParsedTerminalNotification | null => {
  const body = data.trim();
  const title = defaultTitle.trim();
  if (!title || !body) {
    return null;
  }
  return { title, body };
};

const parseOsc777Notification = (data: string): ParsedTerminalNotification | null => {
  const [command = "", title = "", ...bodyParts] = data.split(";");
  if (command !== "notify") {
    return null;
  }

  const normalizedTitle = title.trim();
  const body = bodyParts.join(";").trim();
  if (!normalizedTitle || !body) {
    return null;
  }

  return { title: normalizedTitle, body };
};

const TerminalInstance: React.FC<TerminalInstanceProps> = ({
  terminalId,
  terminalName,
  isActive,
  isExited = false,
  onExited,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const oscHandlersRef = useRef<TerminalDisposable[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const wasOpenRef = useRef(false);
  const initializedRef = useRef(false);
  const isUnmountingRef = useRef(false);
  const lastCursorRef = useRef(0);
  const lastAckCursorRef = useRef(0);
  const replayServerDoneRef = useRef(false);
  const pendingReplayWritesRef = useRef(0);
  const inputReadyRef = useRef(false);
  const callbacksRef = useRef<CallbackRefs>({
    isActive,
    isExited,
    onExited,
    terminalName,
    t: (key: string) => key,
  });

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchRegex, setSearchRegex] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchVisibleRef = useRef(false);
  const openSearchRef = useRef<() => void>(() => {});
  const closeSearchRef = useRef<() => void>(() => {});

  const [progress, setProgress] = useState<{ value: number; state: 0 | 1 | 2 | 3 | 4 } | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const progressAddonRef = useRef<ProgressAddon | null>(null);

  const theme = useAppStore((s) => s.theme);
  const locale = useAppStore((s) => s.locale);
  const t = useTranslation(locale);

  const disposeOscHandlers = () => {
    oscHandlersRef.current.forEach((handler) => handler.dispose());
    oscHandlersRef.current = [];
  };

  const handleOscNotification = useCallback(
    (data: string, parser: (value: string) => ParsedTerminalNotification | null) => {
      if (!inputReadyRef.current) {
        return true;
      }

      const notification = parser(data);
      if (!notification) {
        return true;
      }

      const currentCallbacks = callbacksRef.current;
      if (currentCallbacks.isExited) {
        return true;
      }

      notifyTerminal({
        body: notification.body,
        isActive: currentCallbacks.isActive,
        terminalId,
        title: notification.title,
      });

      return true;
    },
    [terminalId]
  );

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const connectWebSocket = useCallback(
    (terminal: Terminal) => {
      clearReconnectTimer();

      if (wsRef.current) {
        const prev = wsRef.current;
        wsRef.current = null;
        prev.onopen = null;
        prev.onmessage = null;
        prev.onclose = null;
        prev.onerror = null;
        try {
          prev.close();
        } catch {}
      }

      replayServerDoneRef.current = false;
      pendingReplayWritesRef.current = 0;
      inputReadyRef.current = false;
      terminal.options.cursorBlink = false;
      terminal.options.disableStdin = true;

      const cursor = lastAckCursorRef.current > 0 ? lastAckCursorRef.current : undefined;
      const wsUrl = terminalApi.wsUrl(terminalId, cursor);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      let decoder = new TextDecoder("utf-8", { fatal: false });

      const sendAck = (cursorValue: number) => {
        if (!Number.isFinite(cursorValue) || cursorValue <= lastAckCursorRef.current) {
          return;
        }
        lastAckCursorRef.current = cursorValue;
        if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: "ack", cursor: cursorValue }));
          } catch {}
        }
      };

      const tryEnableInput = () => {
        if (!replayServerDoneRef.current) return;
        if (pendingReplayWritesRef.current > 0) return;
        if (callbacksRef.current.isExited) return;
        inputReadyRef.current = true;
        terminal.options.cursorBlink = true;
        terminal.options.disableStdin = false;
        terminal.focus();
      };

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        wasOpenRef.current = true;
        reconnectAttemptsRef.current = 0;
        if (terminalRef.current && fitAddonRef.current) {
          fitAddonRef.current.fit();
          const { cols, rows } = terminalRef.current;
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "replay" || msg.type === "output") {
            const hasCursor = typeof msg.cursor === "number" && Number.isFinite(msg.cursor);
            const cursorValue = hasCursor ? msg.cursor : undefined;
            if (cursorValue !== undefined && !msg.reset && cursorValue <= lastCursorRef.current) {
              return;
            }
            if (msg.reset) {
              terminal.reset();
              decoder = new TextDecoder("utf-8", { fatal: false });
              pendingReplayWritesRef.current = 0;
            }

            let hasOutput = false;
            try {
              if (typeof msg.data === "string" && msg.data.length > 0) {
                const binaryString = atob(msg.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                const decoded = decoder.decode(bytes, { stream: true });
                hasOutput = decoded.length > 0;
                if (hasOutput && msg.type === "replay") {
                  pendingReplayWritesRef.current += 1;
                }
                terminal.write(decoded, () => {
                  if (cursorValue !== undefined) {
                    lastCursorRef.current = cursorValue;
                    sendAck(cursorValue);
                  }
                  if (hasOutput && msg.type === "replay") {
                    pendingReplayWritesRef.current = Math.max(0, pendingReplayWritesRef.current - 1);
                  }
                  tryEnableInput();
                });
              }
            } catch (e) {
              console.warn("Failed to decode base64:", e);
            }
            if (!hasOutput && cursorValue !== undefined) {
              lastCursorRef.current = cursorValue;
              sendAck(cursorValue);
            }
          } else if (msg.type === "replay_done") {
            replayServerDoneRef.current = true;
            tryEnableInput();
          } else if (msg.type === "state") {
            if (typeof msg.cursor === "number" && Number.isFinite(msg.cursor) && msg.cursor > lastCursorRef.current) {
              lastCursorRef.current = msg.cursor;
            }
            if (typeof msg.status === "string" && msg.status !== "running") {
              terminal.options.cursorBlink = false;
              terminal.options.disableStdin = true;
              callbacksRef.current.isExited = true;
              inputReadyRef.current = false;
            }
          } else if (msg.type === "pty_exited") {
            const { t: translate, onExited: exitCallback } = callbacksRef.current;
            terminal.write(`\r\n[${translate("terminal.processExited")}]\r\n`);
            terminal.options.cursorBlink = false;
            terminal.options.disableStdin = true;
            callbacksRef.current.isExited = true;
            inputReadyRef.current = false;
            clearReconnectTimer();
            try {
              ws.close();
            } catch {}
            exitCallback?.();
          }
        } catch (e) {
          console.warn("Failed to parse WebSocket message:", e);
        }
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        inputReadyRef.current = false;
        if (isUnmountingRef.current) return;
        if (callbacksRef.current.isExited) return;

        if (wasOpenRef.current) {
          wasOpenRef.current = false;
          const { t: translate } = callbacksRef.current;
          terminal.write(`\r\n[${translate("terminal.connectionClosed")}]\r\n`);
        }

        terminal.options.cursorBlink = false;
        terminal.options.disableStdin = true;

        const attempt = reconnectAttemptsRef.current;
        reconnectAttemptsRef.current = attempt + 1;
        const baseDelay = 400;
        const maxDelay = 10_000;
        const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt)) + Math.floor(Math.random() * 250);
        reconnectTimerRef.current = setTimeout(() => {
          if (isUnmountingRef.current) return;
          if (callbacksRef.current.isExited) return;
          connectWebSocket(terminal);
        }, delay);
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        const { t: translate } = callbacksRef.current;
        terminal.write(`\r\n[${translate("terminal.connectionError")}]\r\n`);
        try {
          ws.close();
        } catch {}
      };
    },
    [terminalId]
  );

  const openSearch = useCallback(() => {
    setSearchVisible(true);
    searchVisibleRef.current = true;
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    searchVisibleRef.current = false;
    terminalRef.current?.focus();
  }, []);

  openSearchRef.current = openSearch;
  closeSearchRef.current = closeSearch;

  const handleSearchNext = useCallback(() => {
    if (!searchAddonRef.current || !searchTerm) return;
    searchAddonRef.current.findNext(searchTerm, { caseSensitive: searchCaseSensitive, regex: searchRegex });
  }, [searchTerm, searchCaseSensitive, searchRegex]);

  const handleSearchPrev = useCallback(() => {
    if (!searchAddonRef.current || !searchTerm) return;
    searchAddonRef.current.findPrevious(searchTerm, { caseSensitive: searchCaseSensitive, regex: searchRegex });
  }, [searchTerm, searchCaseSensitive, searchRegex]);

  useEffect(() => {
    callbacksRef.current = { isActive, isExited, onExited, terminalName, t };
    if (isExited && terminalRef.current) {
      terminalRef.current.options.cursorBlink = false;
      terminalRef.current.options.disableStdin = true;
    }
    if (isExited) {
      inputReadyRef.current = false;
      clearReconnectTimer();
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch {}
      }
    }
  }, [isActive, isExited, onExited, t, terminalName]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getXtermTheme(theme);
    }
  }, [theme]);

  useEffect(() => {
    if (!searchAddonRef.current || !searchTerm) return;
    searchAddonRef.current.findNext(searchTerm, { caseSensitive: searchCaseSensitive, regex: searchRegex });
  }, [searchTerm, searchCaseSensitive, searchRegex]);

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;

    initializedRef.current = true;
    isUnmountingRef.current = false;
    lastCursorRef.current = 0;
    lastAckCursorRef.current = 0;
    replayServerDoneRef.current = false;
    pendingReplayWritesRef.current = 0;
    inputReadyRef.current = false;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      theme: getXtermTheme(theme),
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const serializeAddon = new SerializeAddon();
    const unicode11Addon = new Unicode11Addon();
    const webLinksAddon = new WebLinksAddon();
    const clipboardAddon = new ClipboardAddon();
    const imageAddon = new ImageAddon();
    const progressAddon = new ProgressAddon();

    terminal.loadAddon(unicode11Addon);
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(serializeAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(clipboardAddon);
    terminal.loadAddon(imageAddon);
    terminal.loadAddon(progressAddon);

    progressAddon.onChange((p) => {
      if (p.state === 0) {
        setProgress(null);
      } else {
        setProgress({ value: p.value, state: p.state });
      }
    });

    terminal.open(containerRef.current);
    terminal.unicode.activeVersion = "11";

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
      try {
        const ligaturesAddon = new LigaturesAddon();
        terminal.loadAddon(ligaturesAddon);
      } catch {}
    } catch {}

    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    serializeAddonRef.current = serializeAddon;
    progressAddonRef.current = progressAddon;

    oscHandlersRef.current = [
      terminal.parser.registerOscHandler(9, (data) => {
        const defaultTitle = callbacksRef.current.terminalName.trim() || callbacksRef.current.t("sidebar.terminal");
        return handleOscNotification(data, (value) => parseOsc9Notification(value, defaultTitle));
      }),
      terminal.parser.registerOscHandler(777, (data) => {
        return handleOscNotification(data, parseOsc777Notification);
      }),
    ];

    terminal.attachCustomKeyEventHandler((event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && event.type === "keydown") {
        event.preventDefault();
        openSearchRef.current();
        return false;
      }
      if (event.key === "Escape" && event.type === "keydown" && searchVisibleRef.current) {
        closeSearchRef.current();
        return false;
      }
      return true;
    });

    terminal.onData((data) => {
      if (callbacksRef.current.isExited) return;
      if (!inputReadyRef.current) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const msg = {
          type: "input",
          data: encodeUtf8Base64(data),
        };
        wsRef.current.send(JSON.stringify(msg));
      }
    });

    connectWebSocket(terminal);

    return () => {
      isUnmountingRef.current = true;
      inputReadyRef.current = false;
      clearReconnectTimer();
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch {}
      }
      disposeOscHandlers();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      serializeAddonRef.current = null;
      progressAddonRef.current = null;
      initializedRef.current = false;
    };
  }, [connectWebSocket, handleOscNotification, terminalId]);

  useEffect(() => {
    if (isActive && fitAddonRef.current && terminalRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        terminalRef.current?.focus();

        if (wsRef.current?.readyState === WebSocket.OPEN && terminalRef.current) {
          const { cols, rows } = terminalRef.current;
          wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      }, 50);
    }
  }, [isActive]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !fitAddonRef.current) return;

    const observer = new ResizeObserver(() => {
      if (isActive && fitAddonRef.current) {
        fitAddonRef.current.fit();
        if (wsRef.current?.readyState === WebSocket.OPEN && terminalRef.current) {
          const { cols, rows } = terminalRef.current;
          wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [isActive]);

  const touchStartRef = useRef<{ y: number } | null>(null);
  const touchAccumRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        touchStartRef.current = { y };
        touchAccumRef.current = 0;
      } else {
        touchStartRef.current = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !touchStartRef.current) return;
      e.preventDefault();
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const delta = touchStartRef.current.y - y;
      touchAccumRef.current += delta;
      touchStartRef.current.y = y;
      const fontSize = terminalRef.current?.options.fontSize ?? 14;
      const lineHeight = terminalRef.current?.options.lineHeight ?? 1;
      const linePixels = fontSize * lineHeight;
      const lines = Math.round(touchAccumRef.current / linePixels);
      if (lines !== 0 && terminalRef.current) {
        terminalRef.current.scrollLines(lines);
        touchAccumRef.current -= lines * linePixels;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        touchStartRef.current = null;
        touchAccumRef.current = 0;
      }
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return (
    <div
      className="absolute inset-0"
      style={{
        display: isActive ? "block" : "none",
        backgroundColor: getXtermTheme(theme).background,
      }}
      onKeyDownCapture={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
          e.preventDefault();
          e.stopPropagation();
          openSearchRef.current();
        }
      }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 [&_.xterm]:!p-0 [&_.xterm]:!m-0 [&_.xterm-viewport]:!p-0 [&_.xterm-screen]:!p-0 [&_.xterm-screen]:!m-0"
      />
      {progress && (
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <div
            className={`h-0.5 transition-all duration-300 ${
              progress.state === 2
                ? "bg-red-500"
                : progress.state === 4
                  ? "bg-yellow-500"
                  : "bg-blue-500"
            }`}
            style={{
              width: progress.state === 3 ? "100%" : `${progress.value}%`,
              animation: progress.state === 3 ? "pulse 1.5s ease-in-out infinite" : undefined,
            }}
          />
        </div>
      )}
      {searchVisible && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-md border border-ide-border bg-ide-panel/95 px-2 py-1.5 shadow-lg backdrop-blur-sm">
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.shiftKey ? handleSearchPrev() : handleSearchNext();
              } else if (e.key === "Escape") {
                closeSearch();
              }
            }}
            placeholder="Search..."
            className="w-40 bg-transparent text-xs text-ide-text outline-none placeholder:text-ide-mute/50"
          />
          <button
            onClick={() => setSearchCaseSensitive((v) => !v)}
            title="Case Sensitive"
            className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${searchCaseSensitive ? "bg-ide-accent text-white" : "text-ide-mute hover:text-ide-text hover:bg-ide-bg"}`}
          >
            Aa
          </button>
          <button
            onClick={() => setSearchRegex((v) => !v)}
            title="Use Regex"
            className={`rounded px-1.5 py-0.5 font-mono text-xs transition-colors ${searchRegex ? "bg-ide-accent text-white" : "text-ide-mute hover:text-ide-text hover:bg-ide-bg"}`}
          >
            .*
          </button>
          <div className="h-4 w-px bg-ide-border" />
          <button
            onClick={handleSearchPrev}
            title="Previous (Shift+Enter)"
            className="rounded p-0.5 text-ide-mute transition-colors hover:text-ide-text hover:bg-ide-bg"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={handleSearchNext}
            title="Next (Enter)"
            className="rounded p-0.5 text-ide-mute transition-colors hover:text-ide-text hover:bg-ide-bg"
          >
            <ChevronDown size={14} />
          </button>
          <div className="h-4 w-px bg-ide-border" />
          <button
            onClick={() => {
              const text = serializeAddonRef.current?.serialize();
              if (!text) return;
              navigator.clipboard.writeText(text).then(() => {
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 1500);
              });
            }}
            title="Copy all output"
            className="rounded p-0.5 text-ide-mute transition-colors hover:text-ide-text hover:bg-ide-bg"
          >
            {copySuccess ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
          <button
            onClick={closeSearch}
            title="Close (Escape)"
            className="rounded p-0.5 text-ide-mute transition-colors hover:text-ide-text hover:bg-ide-bg"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default TerminalInstance;
