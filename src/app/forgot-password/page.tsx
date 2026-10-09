"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось отправить письмо");
        return;
      }
      setSent(data.message);
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
          <CardTitle className="text-2xl">Восстановление пароля</CardTitle>
          <CardDescription>
            Укажите почту, с которой вы регистрировались, — пришлём ссылку для смены пароля.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{sent}</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="email">Почта</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading || !email}>
                {loading ? "Отправляем..." : "Отправить ссылку"}
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm">
            <Link href="/login" className="text-blue-600 hover:underline">
              Вернуться ко входу
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
