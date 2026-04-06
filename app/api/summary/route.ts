import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const { text, previousSummary = "" } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ summary: "" });
    }

    const prompt = `
      You are a brilliant student taking notes in a live lecture. 
      Here is what you have already written for the executive summary so far:
      "${previousSummary}"

      Based on the NEW classroom lecture transcript segment below, write the next part of the summary.
      - ONLY output the NEW continuation of the summary.
      - Provide a DETAILED, comprehensive summary of the new information. Avoid filler, but ensure all important technical details, examples, and context are captured.
      - Do NOT repeat ANY information or concepts that were already covered in the previous summary.
      - Write 2 to 3 well-structured sentences depending on the density of the new information.
      - Introduce proper paragraph breaks (using double newlines: \n\n) organically ONLY when the topic shifts.
      - Do not output any markdown formatting (like asterisks or hashes). Just the raw text of the CONTINUATION.

      NEW Transcript Segment:
      ${text}
    `;

    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
    });

    const summaryText = response.choices[0]?.message?.content || "";
    if (!summaryText) {
      throw new Error("No text response from Groq.");
    }

    return NextResponse.json({ summary: summaryText.trim() });
  } catch (apiError: any) {
    console.error("Groq API Error (Summary):", apiError);
    return NextResponse.json({ summary: `[Error generating summary: ${apiError.message}]` });
  }
}
