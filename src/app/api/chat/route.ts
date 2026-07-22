import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { messages, businessId } = await req.json();

  const supabase = await createClient();

  // Fetch business owner's system prompt
  const { data: user } = await supabase
    .from("users")
    .select("system_prompt, business_name")
    .eq("id", businessId)
    .single();

  // Fetch available services
  const { data: services } = await supabase
    .from("services")
    .select("title, description, price, duration_minutes")
    .eq("user_id", businessId)
    .eq("active", true);

  const servicesContext = services
    ?.map(
      (s) =>
        `- ${s.title}: $${s.price} (${s.duration_minutes} min)${s.description ? ` - ${s.description}` : ""}`
    )
    .join("\n") || "No services available.";

  const systemPrompt = `${user?.system_prompt || "You are a helpful assistant."}

Business: ${user?.business_name || "Our Business"}

Available Services:
${servicesContext}

You can help customers:
1. Learn about our services and pricing
2. Answer questions about availability
3. Guide them through the booking process

When a customer wants to book, ask for:
- Which service they want
- Their preferred date and time
- Their name and phone number

Be friendly, professional, and helpful.`;

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages,
  });

  return result.toTextStreamResponse();
}
