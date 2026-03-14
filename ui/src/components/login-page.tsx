import React, { useCallback, useEffect, useRef, useState } from "react";
import { authApi } from "@/api/auth";

const AUTH_KEY_STORAGE = "vibego_auth_key";

export function getStoredAuthKey(): string | null {
  return localStorage.getItem(AUTH_KEY_STORAGE);
}

export function setStoredAuthKey(key: string | null) {
  if (key) {
    localStorage.setItem(AUTH_KEY_STORAGE, key);
  } else {
    localStorage.removeItem(AUTH_KEY_STORAGE);
  }
}

interface LoginPageProps {
  onLoginSuccess: () => void;
  locale: string;
}

const t = (locale: string, key: string): string => {
  const translations: Record<string, Record<string, string>> = {
    en: {
      title: "VibeGo",
      subtitle: "Enter your access key to continue",
      placeholder: "Access Key",
      login: "Login",
      logging: "Logging in...",
      invalidKey: "Invalid access key",
      tooMany: "Too many failed attempts",
      retryIn: "Retry in",
      seconds: "s",
      remaining: "attempts remaining",
      banned: "Temporarily banned",
    },
    zh: {
      title: "VibeGo",
      subtitle: "请输入访问密钥以继续",
      placeholder: "访问密钥",
      login: "登录",
      logging: "登录中...",
      invalidKey: "访问密钥无效",
      tooMany: "尝试次数过多",
      retryIn: "重试等待",
      seconds: "秒",
      remaining: "次剩余尝试",
      banned: "暂时被封禁",
    },
  };
  return translations[locale]?.[key] || translations.en[key] || key;
};

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, locale }) => {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [retryAfter, setRetryAfter] = useState(0);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (retryAfter > 0) {
      timerRef.current = setInterval(() => {
        setRetryAfter((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setError("");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [retryAfter]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!key.trim() || loading || retryAfter > 0) return;

      setLoading(true);
      setError("");

      try {
        const res = await authApi.login(key.trim());
        if (res.ok) {
          setStoredAuthKey(key.trim());
          onLoginSuccess();
        } else {
          setShake(true);
          setTimeout(() => setShake(false), 500);
          if (res.retry_after && res.retry_after > 0) {
            setError(t(locale, "tooMany"));
            setRetryAfter(Math.ceil(res.retry_after));
            setRemaining(0);
          } else {
            setError(t(locale, "invalidKey"));
            setRemaining(res.remaining ?? null);
          }
        }
      } catch {
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setError(t(locale, "invalidKey"));
      } finally {
        setLoading(false);
      }
    },
    [key, loading, retryAfter, locale, onLoginSuccess]
  );

  const isBanned = retryAfter > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ide-bg)",
        zIndex: 99999,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse at 20% 50%, color-mix(in srgb, var(--ide-accent) 8%, transparent) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, color-mix(in srgb, var(--ide-accent) 5%, transparent) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 80%, color-mix(in srgb, var(--ide-accent) 3%, transparent) 0%, transparent 50%)
          `,
          pointerEvents: "none",
        }}
      />

      <form
        onSubmit={handleSubmit}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "24px",
          padding: "48px 40px",
          width: "min(360px, 90vw)",
          background: "var(--ide-panel)",
          border: "1px solid var(--ide-border)",
          borderRadius: "16px",
          boxShadow: `
            0 4px 6px -1px rgba(0,0,0,0.1),
            0 2px 4px -2px rgba(0,0,0,0.1),
            0 0 0 1px color-mix(in srgb, var(--ide-accent) 5%, transparent)
          `,
          animation: shake ? "login-shake 0.5s ease-in-out" : undefined,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "var(--ide-text)",
              letterSpacing: "-0.02em",
              marginBottom: "8px",
            }}
          >
            {t(locale, "title")}
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "var(--ide-mute)",
            }}
          >
            {t(locale, "subtitle")}
          </p>
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px" }}>
          <input
            ref={inputRef}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t(locale, "placeholder")}
            disabled={loading || isBanned}
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: "15px",
              color: "var(--ide-text)",
              background: isBanned
                ? "color-mix(in srgb, var(--ide-border) 30%, var(--ide-bg))"
                : "var(--ide-bg)",
              border: `1px solid ${error ? "var(--destructive, #ef4444)" : "var(--ide-border)"}`,
              borderRadius: "10px",
              outline: "none",
              transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
              boxSizing: "border-box",
              opacity: isBanned ? 0.5 : 1,
            }}
            onFocus={(e) => {
              if (!error) {
                e.currentTarget.style.borderColor = "var(--ide-accent)";
                e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--ide-accent) 15%, transparent)";
              }
            }}
            onBlur={(e) => {
              if (!error) {
                e.currentTarget.style.borderColor = "var(--ide-border)";
                e.currentTarget.style.boxShadow = "none";
              }
            }}
          />

          <button
            type="submit"
            disabled={loading || !key.trim() || isBanned}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--ide-on-accent)",
              background: loading || !key.trim() || isBanned
                ? "color-mix(in srgb, var(--ide-accent) 50%, var(--ide-bg))"
                : "var(--ide-accent)",
              border: "none",
              borderRadius: "10px",
              cursor: loading || !key.trim() || isBanned ? "not-allowed" : "pointer",
              transition: "background 0.2s, transform 0.1s, opacity 0.2s",
              opacity: loading || !key.trim() || isBanned ? 0.6 : 1,
            }}
            onMouseDown={(e) => {
              if (!loading && key.trim() && !isBanned) {
                e.currentTarget.style.transform = "scale(0.98)";
              }
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {loading ? t(locale, "logging") : t(locale, "login")}
          </button>
        </div>

        {(error || remaining !== null) && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              fontSize: "13px",
            }}
          >
            {error && (
              <span style={{ color: "var(--destructive, #ef4444)" }}>
                {error}
                {isBanned && (
                  <span style={{ marginLeft: "6px", fontVariantNumeric: "tabular-nums" }}>
                    ({t(locale, "retryIn")} {retryAfter}{t(locale, "seconds")})
                  </span>
                )}
              </span>
            )}
            {remaining !== null && remaining > 0 && !isBanned && (
              <span style={{ color: "var(--ide-mute)" }}>
                {remaining} {t(locale, "remaining")}
              </span>
            )}
          </div>
        )}
      </form>

      <style>{`
        @keyframes login-shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
};
