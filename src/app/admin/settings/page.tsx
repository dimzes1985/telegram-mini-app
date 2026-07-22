"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Save, Bot, ExternalLink, CheckCircle, XCircle } from "lucide-react";

interface WorkingHoursDay {
  start: string;
  end: string;
  enabled: boolean;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DEFAULT_WORKING_HOURS: Record<string, WorkingHoursDay> = {
  monday: { start: "09:00", end: "18:00", enabled: true },
  tuesday: { start: "09:00", end: "18:00", enabled: true },
  wednesday: { start: "09:00", end: "18:00", enabled: true },
  thursday: { start: "09:00", end: "18:00", enabled: true },
  friday: { start: "09:00", end: "18:00", enabled: true },
  saturday: { start: "10:00", end: "14:00", enabled: false },
  sunday: { start: "10:00", end: "14:00", enabled: false },
};

export default function SettingsPage() {
  const [businessName, setBusinessName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [workingHours, setWorkingHours] = useState<Record<string, WorkingHoursDay>>(DEFAULT_WORKING_HOURS);
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [botTokenSet, setBotTokenSet] = useState(false);
  const [botWebhookSet, setBotWebhookSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingUpBot, setSettingUpBot] = useState(false);
  const [botError, setBotError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setBusinessName(data.business_name || "");
        setSystemPrompt(data.system_prompt || "");
        if (data.working_hours) {
          setWorkingHours(data.working_hours);
        }
        setBotTokenSet(data.bot_token_set || false);
        setBotUsername(data.bot_username || "");
        setLoading(false);
      });

    // Check bot webhook status
    fetch("/api/bot/setup")
      .then((res) => res.json())
      .then((data) => {
        if (data.configured) {
          setBotUsername(data.username || "");
          setBotWebhookSet(data.webhook_set || false);
        }
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setBotError("");

    const updateData: Record<string, unknown> = {
      business_name: businessName,
      system_prompt: systemPrompt,
      working_hours: workingHours,
    };

    // Only include bot_token if user entered a new one
    if (botToken && !botToken.startsWith("••••")) {
      updateData.bot_token = botToken;
    }

    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSetupBot = async () => {
    setSettingUpBot(true);
    setBotError("");

    try {
      const res = await fetch("/api/bot/setup", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setBotWebhookSet(true);
      } else {
        setBotError(data.error || "Failed to setup bot");
      }
    } catch {
      setBotError("Connection error");
    }

    setSettingUpBot(false);
  };

  const updateDay = (day: string, field: keyof WorkingHoursDay, value: string | boolean) => {
    setWorkingHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Business Information</CardTitle>
            <CardDescription>
              This information is displayed to your customers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your Business Name"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Telegram Bot
            </CardTitle>
            <CardDescription>
              Connect your Telegram bot to let customers book appointments directly from Telegram.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="botToken">Bot Token</Label>
              <div className="flex gap-2">
                <Input
                  id="botToken"
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={botTokenSet ? "••••••••" : "Enter bot token from @BotFather"}
                />
                {botTokenSet && (
                  <Badge variant="secondary" className="whitespace-nowrap">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Set
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Get a token from{" "}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline inline-flex items-center gap-1"
                >
                  @BotFather <ExternalLink className="h-3 w-3" />
                </a>{" "}
                on Telegram
              </p>
            </div>

            {botUsername && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm">
                  <span className="font-medium">Bot:</span> @{botUsername}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Webhook:</span>{" "}
                  {botWebhookSet ? (
                    <span className="text-green-600">Active</span>
                  ) : (
                    <span className="text-yellow-600">Not set</span>
                  )}
                </p>
              </div>
            )}

            {botTokenSet && !botWebhookSet && (
              <Button onClick={handleSetupBot} disabled={settingUpBot}>
                {settingUpBot ? "Setting up..." : "Setup Webhook"}
              </Button>
            )}

            {botError && (
              <p className="text-sm text-red-500">{botError}</p>
            )}

            {botWebhookSet && (
              <div className="p-3 bg-green-50 rounded-lg text-green-700 text-sm">
                Your bot is ready! Customers can now interact with it on Telegram.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Working Hours</CardTitle>
            <CardDescription>
              Set your business hours. Customers can only book appointments during these times.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {DAYS.map((day) => (
              <div key={day} className="flex items-center gap-4">
                <div className="w-24">
                  <Label className="text-sm font-medium">{DAY_LABELS[day]}</Label>
                </div>
                <Switch
                  checked={workingHours[day]?.enabled ?? false}
                  onCheckedChange={(checked) => updateDay(day, "enabled", checked)}
                />
                {workingHours[day]?.enabled && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={workingHours[day]?.start || "09:00"}
                      onChange={(e) => updateDay(day, "start", e.target.value)}
                      className="w-32"
                    />
                    <span className="text-gray-500">to</span>
                    <Input
                      type="time"
                      value={workingHours[day]?.end || "18:00"}
                      onChange={(e) => updateDay(day, "end", e.target.value)}
                      className="w-32"
                    />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Assistant Configuration</CardTitle>
            <CardDescription>
              Customize how your AI assistant communicates with customers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="systemPrompt">System Prompt</Label>
              <Textarea
                id="systemPrompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant for..."
                rows={10}
              />
              <p className="text-sm text-gray-500 mt-2">
                Tip: Include your business hours, policies, and any specific
                information you want the AI to share with customers.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
