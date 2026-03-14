import React, { useCallback, useMemo, useRef, useState } from "react";
import { keyFeedback } from "@/components/keyboard/core/key-feedback";
import { KEYBOARD_QWERTY } from "@/components/keyboard/core/layouts";
import type { SherpaStatus } from "@/components/keyboard/core/sherpa-asr";
import { startRecording, stopAndRecognize } from "@/components/keyboard/core/sherpa-asr";
import type { KeyEvent, LayoutDef, ModifiersState } from "@/components/keyboard/core/types";
import { MODIFIER_KEYS } from "@/components/keyboard/core/types";
import KeyButton from "@/components/keyboard/key-button";
import "@/components/keyboard/keyboard.css";

interface KeyboardProps {
  onKeyEvent: (event: KeyEvent) => void;
  layout?: LayoutDef;
}

const INITIAL_MOD = { active: false, locked: false };

const Keyboard: React.FC<KeyboardProps> = ({ onKeyEvent, layout = KEYBOARD_QWERTY }) => {
  const [modifiers, setModifiers] = useState<ModifiersState>({
    ctrl: { ...INITIAL_MOD },
    alt: { ...INITIAL_MOD },
    shift: { ...INITIAL_MOD },
    meta: { ...INITIAL_MOD },
    select: { ...INITIAL_MOD },
    fn: { ...INITIAL_MOD },
  });

  const [asrStatus, setAsrStatus] = useState<SherpaStatus>("idle");
  const [asrProgress, setAsrProgress] = useState("");
  const recordingRef = useRef(false);

  const emitText = useCallback(
    (text: string) => {
      for (const ch of text) {
        onKeyEvent({ type: "char", value: ch, ctrl: false, alt: false, shift: false, meta: false, select: false, fn: false });
      }
    },
    [onKeyEvent]
  );

  const handleMicToggle = useCallback(() => {
    if (recordingRef.current) {
      recordingRef.current = false;
      const text = stopAndRecognize();
      setAsrStatus("idle");
      setAsrProgress("");
      if (text) emitText(text);
    } else {
      recordingRef.current = true;
      setAsrProgress("");
      startRecording((status, progress) => {
        setAsrStatus(status);
        if (typeof progress === "string") setAsrProgress(progress);
        else if (status !== "loading") setAsrProgress("");
        if (status === "error") recordingRef.current = false;
      });
    }
  }, [emitText]);

  const modName = useCallback((value: string): keyof ModifiersState | null => {
    const map: Record<string, keyof ModifiersState> = {
      Ctrl: "ctrl",
      Alt: "alt",
      Shift: "shift",
      Meta: "meta",
      Select: "select",
      Fn: "fn",
    };
    return map[value] ?? null;
  }, []);

  const clearLatched = useCallback(() => {
    setModifiers((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of ["ctrl", "alt", "shift", "meta", "select", "fn"] as const) {
        if (prev[k].active && !prev[k].locked) {
          next[k] = { active: false, locked: false };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const handleKeyOutput = useCallback(
    (value: string, special: boolean) => {
      keyFeedback(value, special ? "modifier" : "char");
      if (MODIFIER_KEYS.has(value)) {
        const name = modName(value);
        if (!name) return;
        setModifiers((prev) => {
          const cur = prev[name];
          let next: { active: boolean; locked: boolean };
          if (!cur.active) {
            next = { active: true, locked: false };
          } else if (!cur.locked) {
            next = { active: true, locked: true };
          } else {
            next = { active: false, locked: false };
          }
          return { ...prev, [name]: next };
        });
        return;
      }

      if (value === "Mic") {
        handleMicToggle();
        return;
      }

      const event: KeyEvent = {
        type: special ? "key" : "char",
        value,
        ctrl: modifiers.ctrl.active,
        alt: modifiers.alt.active,
        shift: modifiers.shift.active,
        meta: modifiers.meta.active,
        select: modifiers.select.active,
        fn: modifiers.fn.active,
      };
      onKeyEvent(event);
      clearLatched();
    },
    [modifiers, onKeyEvent, clearLatched, modName, handleMicToggle]
  );

  const handleSlide = useCallback(
    (dir: "left" | "right") => {
      const event: KeyEvent = {
        type: "key",
        value: dir === "left" ? "ArrowLeft" : "ArrowRight",
        ctrl: modifiers.ctrl.active,
        alt: modifiers.alt.active,
        shift: modifiers.shift.active,
        meta: modifiers.meta.active,
        select: modifiers.select.active,
        fn: modifiers.fn.active,
      };
      onKeyEvent(event);
    },
    [modifiers, onKeyEvent]
  );

  const getModState = useCallback(
    (value: string): "inactive" | "latched" | "locked" => {
      const name = modName(value);
      if (!name) return "inactive";
      let m = modifiers[name];
      if (name === "shift" && (modifiers.select.active || modifiers.select.locked)) {
        m = modifiers.select;
      }
      if (name === "ctrl" && (modifiers.meta.active || modifiers.meta.locked)) {
        m = modifiers.meta;
      }
      if (name === "alt" && (modifiers.fn.active || modifiers.fn.locked)) {
        m = modifiers.fn;
      }
      if (m.locked) return "locked";
      if (m.active) return "latched";
      return "inactive";
    },
    [modifiers, modName]
  );

  const shiftActive = modifiers.shift.active;

  const rowClasses = useMemo(() => {
    return layout.rows.map((row) => {
      let c = "tk-row";
      if (row.height && row.height < 1) c += " tk-row--short";
      if (row.height && row.height > 1) c += " tk-row--tall";
      return c;
    });
  }, [layout]);

  const showLoadingBar = asrStatus === "loading" || asrStatus === "error";

  return (
    <div
      className="tk-keyboard"
      onPointerDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {showLoadingBar && (
        <div className="tk-speech-indicator">
          <span className="tk-speech-dot" />
          <span className="tk-speech-text">{asrProgress}</span>
        </div>
      )}
      {layout.rows.map((row, ri) => (
        <div key={ri} className={rowClasses[ri]}>
          {row.keys.map((keyDef, ki) => {
            let edge: "left" | "right" | undefined;
            if (ki === 0) edge = "left";
            else if (ki === row.keys.length - 1) edge = "right";

            return (
              <KeyButton
                key={keyDef.id}
                keyDef={keyDef}
                modState={
                  keyDef.type === "modifier"
                    ? getModState(keyDef.value)
                    : keyDef.value === "Mic" && asrStatus === "recording"
                      ? "latched"
                      : undefined
                }
                shiftActive={shiftActive}
                onKeyOutput={handleKeyOutput}
                onSlide={handleSlide}
                edge={edge}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default Keyboard;
