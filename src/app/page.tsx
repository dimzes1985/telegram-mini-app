import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Calendar, Settings, Smartphone } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
          AI-Powered CRM & Booking System
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          A complete Telegram Mini App solution for small businesses. Let AI
          handle customer inquiries while you manage bookings effortlessly.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/admin">
            <Button size="lg" className="text-lg px-8">
              Open Dashboard
            </Button>
          </Link>
          <Link href="/app">
            <Button size="lg" variant="outline" className="text-lg px-8">
              Try Mini App
            </Button>
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-4 pb-20">
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Bot className="h-10 w-10 text-blue-500 mb-2" />
              <CardTitle>AI Chat Assistant</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Your AI assistant answers customer questions, recommends services,
                and helps with bookings 24/7.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Calendar className="h-10 w-10 text-green-500 mb-2" />
              <CardTitle>Smart Booking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Customers can browse services, pick available time slots, and
                book appointments in seconds.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Smartphone className="h-10 w-10 text-purple-500 mb-2" />
              <CardTitle>Telegram Mini App</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                No app download needed. Your customers access everything
                directly from Telegram.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Settings className="h-10 w-10 text-orange-500 mb-2" />
              <CardTitle>Easy Management</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Manage services, view bookings, and customize your AI assistant
                from the admin dashboard.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
