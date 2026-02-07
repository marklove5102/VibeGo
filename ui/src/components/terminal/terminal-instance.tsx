import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { type ITheme, Terminal } from "@xterm/xterm";
import React, { useCallback, useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { terminalApi } from "@/api/terminal";
import { useTranslation } from "@/lib/i18n";
import { type Theme, useAppStore } from "@/stores";

interface TerminalInstanceProps {
  terminalId: string;
  isActive: boolean;
  isExited?: boolean;
  onExited?: () => void;
}

interface CallbackRefs {
  isExited: boolean;
  onExited?: () => void;
  t: (key: string) => string;
}

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
      background: "#0d0208", // Darker matrix-like
      foreground: "#00ff41",
      cursor: "#00ff41",
      selectionBackground: "rgba(0, 255, 65, 0.3)",
      black: "#0d0208",
      red: "#ff0000",
      green: "#00ff41",
      yellow: "#008f11",
      blue: "#003b00",
      magenta: "#bd00ff", // Neon-ish
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
      background: "#18181b", // zinc-950
      foreground: "#d4d4d8", // zinc-300
      cursor: "#a1a1aa", // zinc-400
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

  // Light Theme
  return {
    background: "#ffffff",
    foreground: "#18181b", // zinc-950
    cursor: "#52525b", // zinc-600
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

const TerminalInstance: React.FC<TerminalInstanceProps> = ({ terminalId, isActive, isExited = false, onExited }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const initializedRef = useRef(false);
  const isUnmountingRef = useRef(false);
  const callbacksRef = useRef<CallbackRefs>({ isExited, onExited, t: (key: string) => key });

  const theme = useAppStore((s) => s.theme);
  const locale = useAppStore((s) => s.locale);
  const t = useTranslation(locale);

  useEffect(() => {
    callbacksRef.current = { isExited, onExited, t };
    if (isExited && terminalRef.current) {
      terminalRef.current.options.cursorBlink = false;
      terminalRef.current.options.disableStdin = true;
    }
  }, [isExited, onExited, t]);

  const connectWebSocket = useCallback(
    (terminal: Terminal) => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      const wsUrl = terminalApi.wsUrl(terminalId);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const decoder = new TextDecoder("utf-8", { fatal: false });

      ws.onopen = () => {
        terminal.focus();
        if (terminalRef.current && fitAddonRef.current) {
          fitAddonRef.current.fit();
          const { cols, rows } = terminalRef.current;
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "cmd") {
            try {
              const binaryString = atob(msg.data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const decoded = decoder.decode(bytes, { stream: true });
              terminal.write(decoded);
            } catch (e) {
              console.warn("Failed to decode base64:", e);
            }
          } else if (msg.type === "pty_exited") {
            const { t: translate, onExited: exitCallback } = callbacksRef.current;
            terminal.write(`\r\n[${translate("terminal.processExited")}]\r\n`);
            terminal.options.cursorBlink = false;
            terminal.options.disableStdin = true;
            callbacksRef.current.isExited = true;
            exitCallback?.();
          }
        } catch (e) {
          console.warn("Failed to parse WebSocket message:", e);
        }
      };

      ws.onclose = () => {
        if (isUnmountingRef.current) return;
        const { t: translate, onExited: exitCallback } = callbacksRef.current;
        terminal.write(`\r\n[${translate("terminal.connectionClosed")}]\r\n`);
        terminal.options.cursorBlink = false;
        terminal.options.disableStdin = true;
        callbacksRef.current.isExited = true;
        exitCallback?.();
      };

      ws.onerror = () => {
        const { t: translate } = callbacksRef.current;
        terminal.write(`\r\n[${translate("terminal.connectionError")}]\r\n`);
      };
    },
    [terminalId]
  );

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getXtermTheme(theme);
    }
  }, [theme]);

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;

    initializedRef.current = true;
    isUnmountingRef.current = false;

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

    terminal.onData((data) => {
      if (callbacksRef.current.isExited) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const msg = {
          type: "cmd",
          data: encodeUtf8Base64(data),
        };
        wsRef.current.send(JSON.stringify(msg));
      }
    });

    connectWebSocket(terminal);

    return () => {
      isUnmountingRef.current = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      initializedRef.current = false;
    };
  }, [terminalId, connectWebSocket]); // Removed 'theme' from deps to prevent re-init

  useEffect(() => {
    if (isActive && fitAddonRef.current && terminalRef.current) {
      // Small delay to ensure container is visible/sized
      setTimeout(() => {
        fitAddonRef.current?.fit();
        terminalRef.current?.focus();

        // Sync size to backend
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
