"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Last-resort error screen; the error is reported to Sentry.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Что-то пошло не так</h1>
          <p style={{ color: "#64748b", marginBottom: 20 }}>
            Мы уже получили сообщение об ошибке. Попробуйте ещё раз.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 20px",
              borderRadius: 12,
              border: 0,
              background: "#2563eb",
              color: "white",
              fontSize: 15,
            }}
          >
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
