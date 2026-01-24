import React, { createContext, useCallback, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { type Locale, useTranslation } from "@/lib/i18n";
import { useSettingsStore } from "@/lib/settings";

type DialogType = "alert" | "confirm" | "prompt";

interface DialogState {
  type: DialogType;
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "default" | "danger";
  resolve: (value: boolean | string | null) => void;
}

interface DialogContextType {
  alert: (title: string, message?: string) => Promise<void>;
  confirm: (title: string, message?: string, options?: { confirmText?: string; cancelText?: string; confirmVariant?: "default" | "danger" }) => Promise<boolean>;
  prompt: (title: string, options?: { defaultValue?: string; placeholder?: string; confirmText?: string; cancelText?: string }) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextType | null>(null);

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useDialog must be used within DialogProvider");
  return context;
};

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const locale = (useSettingsStore((s) => s.settings.locale) || "zh") as Locale;
  const t = useTranslation(locale);

  const alert = useCallback((title: string, message?: string): Promise<void> => {
    return new Promise((resolve) => {
      setDialog({
        type: "alert",
        title,
        message,
        resolve: () => resolve(),
      });
    });
  }, []);

  const confirm = useCallback(
    (title: string, message?: string, options?: { confirmText?: string; cancelText?: string; confirmVariant?: "default" | "danger" }): Promise<boolean> => {
      return new Promise((resolve) => {
        setDialog({
          type: "confirm",
          title,
          message,
          confirmText: options?.confirmText,
          cancelText: options?.cancelText,
          confirmVariant: options?.confirmVariant,
          resolve: (value) => resolve(value as boolean),
        });
      });
    },
    []
  );

  const prompt = useCallback(
    (title: string, options?: { defaultValue?: string; placeholder?: string; confirmText?: string; cancelText?: string }): Promise<string | null> => {
      setInputValue(options?.defaultValue || "");
      return new Promise((resolve) => {
        setDialog({
          type: "prompt",
          title,
          defaultValue: options?.defaultValue,
          placeholder: options?.placeholder,
          confirmText: options?.confirmText,
          cancelText: options?.cancelText,
          resolve: (value) => resolve(value as string | null),
        });
      });
    },
    []
  );

  const handleClose = useCallback(() => {
    if (!dialog) return;
    if (dialog.type === "alert") {
      dialog.resolve(true);
    } else {
      dialog.resolve(dialog.type === "confirm" ? false : null);
    }
    setDialog(null);
    setInputValue("");
  }, [dialog]);

  const handleConfirm = useCallback(() => {
    if (!dialog) return;
    if (dialog.type === "prompt") {
      dialog.resolve(inputValue);
    } else {
      dialog.resolve(true);
    }
    setDialog(null);
    setInputValue("");
  }, [dialog, inputValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && dialog?.type === "prompt") {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === "Escape") {
        handleClose();
      }
    },
    [dialog, handleConfirm, handleClose]
  );

  return (
    <DialogContext.Provider value={{ alert, confirm, prompt }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          data-state="open"
          onClick={handleClose}
        >
          <div
            className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-lg sm:max-w-lg"
            data-state="open"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <div className="grid gap-1.5 text-center sm:text-left">
              <h2 className="text-lg font-semibold">{dialog.title}</h2>
              {dialog.message && <p className="text-sm text-muted-foreground">{dialog.message}</p>}
            </div>
            {dialog.type === "prompt" && (
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={dialog.placeholder || ""}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                autoFocus
              />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {dialog.type !== "alert" && (
                <Button variant="outline" onClick={handleClose}>
                  {dialog.cancelText || t("common.cancel")}
                </Button>
              )}
              <Button
                variant={dialog.confirmVariant === "danger" ? "destructive" : "default"}
                onClick={handleConfirm}
                autoFocus={dialog.type !== "prompt"}
              >
                {dialog.confirmText || (dialog.type === "alert" ? t("dialog.ok") : t("dialog.confirm"))}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
