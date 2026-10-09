"use client";

import { useEffect, useState } from "react";
import { reachGoal } from "@/lib/metrika";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/demo")
      .then((res) => res.json())
      .then((data) => {
        const demo = Boolean(data.demo_available);
        setDemoMode(demo);
        if (demo) {
          setEmail("demo@slot.app");
          setPassword("demo");
        }
      })
      .catch(() => {});
  }, []);

  const enterAdmin = async (payload: Record<string, unknown>) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось войти");
        return;
      }
      if (data.needs_confirmation) {
        setError(data.message || "Проверьте почту для подтверждения.");
        return;
      }
      if (payload.action === "signup") reachGoal("signup");
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Нет соединения с сервером. Обновите страницу и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Панель управления</CardTitle>
          <CardDescription>Войдите, чтобы управлять своим бизнесом</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Вход</TabsTrigger>
              <TabsTrigger value="signup">Регистрация</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void enterAdmin({ action: "login", email, password });
                }}
                className="space-y-4 mt-4"
              >
                <div>
                  <Label htmlFor="email">Почта</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Пароль</Label>
                    {!demoMode && (
                      <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">
                        Забыли пароль?
                      </Link>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Вход..." : "Войти"}
                </Button>
                {demoMode && (
                  <p className="text-xs text-gray-500 text-center">
                    Сейчас база не подключена — вход откроет демо-панель Slot Studio.
                  </p>
                )}
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void enterAdmin({
                    action: "signup",
                    email,
                    password,
                    business_name: businessName,
                    accept_terms: acceptTerms,
                  });
                }}
                className="space-y-4 mt-4"
              >
                <div>
                  <Label htmlFor="businessName">Название бизнеса</Label>
                  <Input
                    id="businessName"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Название вашего бизнеса"
                  />
                </div>
                <div>
                  <Label htmlFor="emailSignup">Почта</Label>
                  <Input
                    id="emailSignup"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="passwordSignup">Пароль</Label>
                  <Input
                    id="passwordSignup"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug text-gray-600">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-blue-600"
                  />
                  <span>
                    Я принимаю{" "}
                    <a href="/terms" target="_blank" rel="noopener" className="text-blue-600 underline">
                      договор-оферту
                    </a>
                    , даю согласие на обработку персональных данных и принимаю{" "}
                    <a href="/privacy" target="_blank" rel="noopener" className="text-blue-600 underline">
                      политику конфиденциальности
                    </a>
                  </span>
                </label>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading || !acceptTerms}>
                  {loading ? "Создание аккаунта..." : "Создать аккаунт"}
                </Button>
                {demoMode && (
                  <p className="text-xs text-gray-500 text-center">
                    Без Supabase регистрация тоже откроет демо-панель.
                  </p>
                )}
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
