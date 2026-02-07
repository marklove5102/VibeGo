import { toast } from "sonner";
import { useSettingsStore } from "@/lib/settings";

export interface TerminalNotificationPayload {
  body: string;
  isActive: boolean;
  terminalId: string;
  title: string;
}

let autoPermissionRequested = false;

const canUseDesktopNotifications = (): boolean => {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
};

const areDesktopNotificationsEnabled = (): boolean => {
  return useSettingsStore.getState().get("terminalDesktopNotifications") === "true";
};

const isPageInBackground = (): boolean => {
  return document.visibilityState !== "visible" || !document.hasFocus();
};

const showToastFallback = ({ title, body }: Pick<TerminalNotificationPayload, "title" | "body">): void => {
  toast.info(title, { description: body });
};

const showDesktopNotification = ({ title, body, terminalId }: TerminalNotificationPayload): boolean => {
  if (!canUseDesktopNotifications() || Notification.permission !== "granted") {
    return false;
  }

  try {
    const notification = new Notification(title, {
      body,
      tag: `terminal:${terminalId}`,
    });

    notification.onclick = () => {
      try {
        window.focus();
      } catch {}
      notification.close();
    };

    return true;
  } catch {
    return false;
  }
};

export async function requestTerminalNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!canUseDesktopNotifications()) {
    return "unsupported";
  }

  if (Notification.permission !== "default") {
    return Notification.permission;
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

const getDesktopNotificationPermission = async (): Promise<NotificationPermission | "unsupported"> => {
  if (!canUseDesktopNotifications()) {
    return "unsupported";
  }

  if (Notification.permission !== "default") {
    return Notification.permission;
  }

  if (!areDesktopNotificationsEnabled()) {
    return Notification.permission;
  }

  if (autoPermissionRequested) {
    return Notification.permission;
  }

  autoPermissionRequested = true;
  return requestTerminalNotificationPermission();
};

export function notifyTerminal(payload: TerminalNotificationPayload): void {
  const title = payload.title.trim();
  const body = payload.body.trim();

  if (!title || !body) {
    return;
  }

  if (payload.isActive || !isPageInBackground()) {
    return;
  }

  void (async () => {
    if (areDesktopNotificationsEnabled()) {
      const permission = await getDesktopNotificationPermission();
      if (permission === "granted" && showDesktopNotification({ ...payload, title, body })) {
        return;
      }
    }

    showToastFallback({ title, body });
  })();
}
