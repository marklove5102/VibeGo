import React, { createContext, useCallback, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
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
      <Drawer open={!!dialog} onOpenChange={(open) => !open && handleClose()}>
        {dialog && (
          <DrawerContent onKeyDown={handleKeyDown} className="max-h-[80vh]">
            <DrawerHeader>
              <DrawerTitle>{dialog.title}</DrawerTitle>
              {dialog.message && <DrawerDescription>{dialog.message}</DrawerDescription>}
            </DrawerHeader>
            {dialog.type === "prompt" && (
              <div className="px-4">
                <Input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={dialog.placeholder || ""}
                  autoFocus
                />
              </div>
            )}
            <DrawerFooter className="pt-3">
              {dialog.type !== "alert" && (
                <Button variant="outline" onClick={handleClose} className="h-11 w-full">
                  {dialog.cancelText || t("common.cancel")}
                </Button>
              )}
              <Button
                variant={dialog.confirmVariant === "danger" ? "destructive" : "default"}
                onClick={handleConfirm}
                autoFocus={dialog.type !== "prompt"}
                className="h-11 w-full"
              >
                {dialog.confirmText || (dialog.type === "alert" ? t("dialog.ok") : t("dialog.confirm"))}
              </Button>
            </DrawerFooter>
          </DrawerContent>
        )}
      </Drawer>
    </DialogContext.Provider>
  );
};
