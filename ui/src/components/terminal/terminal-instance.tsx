import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { type ITheme, Terminal } from "@xterm/xterm";
import React, { useCallback, useEffect, useRef } from "react";
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
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    oscHandlersRef.current = [
      terminal.parser.registerOscHandler(9, (data) => {
        const defaultTitle = callbacksRef.current.terminalName.trim() || callbacksRef.current.t("sidebar.terminal");
        return handleOscNotification(data, (value) => parseOsc9Notification(value, defaultTitle));
      }),
      terminal.parser.registerOscHandler(777, (data) => {
        return handleOscNotification(data, parseOsc777Notification);
      }),
    ];

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

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 [&_.xterm]:!p-0 [&_.xterm]:!m-0 [&_.xterm-viewport]:!p-0 [&_.xterm-screen]:!p-0 [&_.xterm-screen]:!m-0"
      style={{
        display: isActive ? "block" : "none",
        backgroundColor: getXtermTheme(theme).background,
      }}
    />
  );
};

export default TerminalInstance;
