import { Keyboard } from "lucide-react";
import React, { useState, useRef, useCallback } from "react";
import { TerminalKeyboard } from "@/components/terminal-keyboard";
import type { TerminalKeyEvent } from "@/components/terminal-keyboard";
import { registerPage } from "../registry";
import type { PageViewProps } from "../types";

interface EventLogEntry {
  id: number;
  event: TerminalKeyEvent;
  formatted: string;
}

function formatEvent(e: TerminalKeyEvent): string {
  const mods: string[] = [];
  if (e.ctrl) mods.push("Ctrl");
  if (e.alt) mods.push("Alt");
  if (e.shift) mods.push("Shift");
  if (e.meta) mods.push("Meta");
  const modStr = mods.length > 0 ? mods.join("+") + "+" : "";
  if (e.type === "char") {
    const display = e.value === " " ? "Space" : e.value;
    return modStr + display;
  }
  return modStr + e.value;
}

const KeyboardTestView: React.FC<PageViewProps> = () => {
  const [lines, setLines] = useState<string[]>(["$ "]);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const nextId = useRef(0);
  const termRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const scrollBottom = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.scrollTop = ref.current.scrollHeight;
      }
    });
  }, []);

  const handleKeyEvent = useCallback(
    (e: TerminalKeyEvent) => {
      const entry: EventLogEntry = {
        id: nextId.current++,
        event: e,
        formatted: formatEvent(e),
      };
      setEventLog((prev) => [...prev.slice(-199), entry]);
      scrollBottom(logRef);

      setLines((prev) => {
        const copy = [...prev];
        const lastIdx = copy.length - 1;

        if (e.type === "key" && e.value === "Enter") {
          return [...copy, "$ "];
        }

        if (e.type === "key" && e.value === "Backspace") {
          if (copy[lastIdx].length > 2) {
            copy[lastIdx] = copy[lastIdx].slice(0, -1);
          }
          return copy;
        }

        if (e.type === "key") {
          copy[lastIdx] += `[${formatEvent(e)}]`;
        } else {
          copy[lastIdx] += e.value;
        }
        return copy;
      });
      scrollBottom(termRef);
    },
    [scrollBottom],
  );

  const handleClear = useCallback(() => {
    setLines(["$ "]);
    setEventLog([]);
  }, []);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--ide-bg)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--ide-border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Keyboard size={18} style={{ color: "var(--ide-accent)" }} />
          <span
            style={{
              fontWeight: 600,
              fontSize: "14px",
              color: "var(--ide-text)",
            }}
          >
            Terminal Keyboard Test
          </span>
        </div>
        <button
          type="button"
          onClick={handleClear}
          style={{
            padding: "4px 12px",
            borderRadius: "6px",
            border: "1px solid var(--ide-border)",
            background: "transparent",
            color: "var(--ide-text)",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", gap: "1px", overflow: "hidden", minHeight: 0 }}>
          <div
            ref={termRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "10px 12px",
              fontFamily: "'SF Mono', 'Menlo', 'Consolas', monospace",
              fontSize: "13px",
              lineHeight: 1.6,
              color: "var(--ide-text)",
              background: "var(--ide-panel)",
            }}
          >
            {lines.map((line, i) => (
              <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", minHeight: "1.6em" }}>
                {line}
                {i === lines.length - 1 && (
                  <span
                    style={{
                      animation: "tktest-blink 1s step-end infinite",
                      opacity: 0.7,
                    }}
                  >
                    |
                  </span>
                )}
              </div>
            ))}
          </div>

          <div
            ref={logRef}
            style={{
              width: "280px",
              overflowY: "auto",
              padding: "8px",
              fontSize: "11px",
              fontFamily: "'SF Mono', 'Menlo', 'Consolas', monospace",
              color: "var(--ide-mute)",
              background: "var(--ide-bg)",
              borderLeft: "1px solid var(--ide-border)",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "6px",
                color: "var(--ide-text)",
                opacity: 0.5,
              }}
            >
              Event Log
            </div>
            {eventLog.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: "2px 4px",
                  borderRadius: "3px",
                  marginBottom: "1px",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    color: entry.event.type === "char" ? "#34c759" : "#007aff",
                  }}
                >
                  {entry.event.type}
                </span>
                <span style={{ color: "var(--ide-text)" }}>{entry.formatted}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flexShrink: 0 }}>
          <TerminalKeyboard onKeyEvent={handleKeyEvent} />
        </div>
      </div>

      <style>{`
        @keyframes tktest-blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

registerPage({
  id: "keyboard-test",
  name: "Keyboard Test",
  icon: Keyboard,
  order: 20,
  category: "tool",
  View: KeyboardTestView,
});

export default KeyboardTestView;
