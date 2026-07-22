"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TestAuthPage() {
  const [result, setResult] = useState<string>("Testing...");
  const [error, setError] = useState<string>("");

  const runTest = async () => {
    try {
      setResult("Creating Supabase client...");
      const supabase = createClient();
      
      setResult("Attempting sign up...");
      const { data, error } = await supabase.auth.signUp({
        email: `test-${Date.now()}@example.com`,
        password: "testpassword123",
        options: {
          data: { business_name: "Test Business" },
        },
      });

      if (error) {
        setError(`Supabase error: ${error.message}`);
        setResult("Done with errors");
      } else {
        setResult(`Success! User: ${JSON.stringify(data.user?.id)}`);
      }
    } catch (err) {
      setError(`JS error: ${err instanceof Error ? err.message : String(err)}`);
      setResult("Done with JS error");
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Auth Test Page</h1>
      <button
        onClick={runTest}
        className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
      >
        Run Test
      </button>
      <div className="bg-gray-100 p-4 rounded">
        <p><strong>Status:</strong> {result}</p>
        {error && <p className="text-red-500 mt-2"><strong>Error:</strong> {error}</p>}
      </div>
    </div>
  );
}
