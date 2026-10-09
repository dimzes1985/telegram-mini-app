"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const tokenHash = useSearchParams().get("token_hash") || "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Пароль должен быть не короче 6 символов");
    if (password !== repeat) return setError("Пароли не совпадают");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось сменить пароль");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Нет соединения с сервером. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Новый пароль</CardTitle>
          <CardDescription>Придумайте новый пароль для входа в панель управления.</CardDescription>
        </CardHeader>
        <CardContent>
          {!tokenHash ? (
            <p className="text-sm text-red-500">
              Ссылка неполная. Откройте ссылку из письма ещё раз или{" "}
              <Link href="/forgot-password" className="text-blue-600 underline">
                запросите новую
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="password">Новый пароль</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Не короче 6 символов"
                />
              </div>
              <div>
                <Label htmlFor="repeat">Повторите пароль</Label>
                <Input
                  id="repeat"
                  type="password"
                  autoComplete="new-password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-red-500">
                  {error}{" "}
                  {error.includes("Запросите новую") && (
                    <Link href="/forgot-password" className="text-blue-600 underline">
                      Запросить
                    </Link>
                  )}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Сохраняем..." : "Сохранить и войти"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
