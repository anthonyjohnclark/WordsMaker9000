import { NextRequest } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const { content } = await req.json();

    // Initialize the OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Call the OpenAI API to proofread content
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a professional editor. Proofread the content below and return it as clean HTML:",
        },
        { role: "user", content },
      ],
    });

    // Extract proofread content
    const proofreadContent = response.choices[0]?.message?.content || "";

    return new Response(JSON.stringify({ proofreadContent }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in proofread endpoint:", error);
    return new Response(
      JSON.stringify({ error: "Failed to proofread the content" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
