import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

export const runtime = 'nodejs'; 
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const { text, previousNotes = "" } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ notes: [] });
    }

    const prompt = `
      You are a student taking structured notes in a live lecture.
      Here are the notes you have produced so far (in JSON):
      ${previousNotes}

      Based on the NEW classroom lecture transcript segment below AND the previous notes, update and rewrite the ENTIRE structured notes.
      CRITICAL RULES:
      1. Output the FULL structured notes combining the old notes with the new information. Do not just append new notes. Repackage everything beautifully.
      2. Group related points under the same topic. HOWEVER, when the lecture transitions to a meaningfully distinct concept, you MUST create a NEW topic object for it. Do NOT force unrelated points into the same old topic.
      3. Focus heavily on technical details, definitions, and core concepts.
      4. Respond ONLY with a raw JSON object containing a "notes" array of objects. No markdown formatting.
      Format:
      {
        "notes": [
          {
            "topic": "Main Topic",
            "details": ["Detail 1", "Detail 2"]
          }
        ]
      }

      NEW Transcript Segment:
      ${text}
    `;

    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" }
    });

    const notesText = response.choices[0]?.message?.content || "";
    if (!notesText) throw new Error("No response from Groq");

    const parsed = JSON.parse(notesText.trim());
    return NextResponse.json({ notes: parsed.notes || [] });
  } catch (apiError: any) {
    console.error("Groq API Error (Notes):", apiError);
    return NextResponse.json({ notes: [{ topic: "Error generating notes", details: [apiError.message] }] });
  }
}
