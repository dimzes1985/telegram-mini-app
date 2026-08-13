"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      console.log("Creating Supabase client...");
      const supabase = createClient();
      console.log("Attempting sign in with:", email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log("Sign in result:", { error: error?.message, userId: data?.user?.id });

      if (error) {
        setError(error.message);
      } else {
        router.push("/admin");
        router.refresh();
      }
    } catch (err) {
      console.error("Sign in error:", err);
      setError(`Ошибка соединения: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      console.log("Creating Supabase client...");
      const supabase = createClient();
      console.log("Attempting sign up with:", email);
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            business_name: businessName,
          },
        },
      });

      console.log("Sign up result:", { error: error?.message, userId: data?.user?.id });

      if (error) {
        setError(error.message);
      } else {
        setError("Аккаунт создан! Проверьте почту для подтверждения, либо войдите.");
      }
    } catch (err) {
      console.error("Sign up error:", err);
      setError(`Ошибка соединения: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`);
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
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="email">Почта</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password">Пароль</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-500">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Вход..." : "Войти"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="businessName">Название бизнеса</Label>
                  <Input
                    id="businessName"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Название вашего бизнеса"
                    required
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
                    required
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
                    required
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-500">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Создание аккаунта..." : "Создать аккаунт"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
