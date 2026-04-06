import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@deepgram/sdk";

// We need to use Node.js filesystem so make sure standard runtime is used
export const runtime = 'nodejs'; 

// Disable body parsing by Next.js since we will use request.formData()
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Initialize clients inside the handler so they pick up hot-reloaded environment variables
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY as string);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert the file stream to a Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("Transcribing audio with Deepgram...");
    
    const { result, error: deepgramError } = await deepgram.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: "nova-3",
        smart_format: true,
      }
    );

    if (deepgramError) {
      console.error("Deepgram API Error:", deepgramError);
      return NextResponse.json({ error: "Failed to transcribe audio with Deepgram." }, { status: 500 });
    }

    const transcript = result?.results?.channels[0]?.alternatives[0]?.transcript;

    if (!transcript || transcript.trim().length === 0) {
      // If there's 60 seconds of silence, just return empty so the UI ignores it
      return NextResponse.json({ summary: "", notes: [], transcript: "" });
    }
    
    console.log("Transcription complete. Length:", transcript.length);

    try {
      // 2. Prompt Gemini with the transcript
      const prompt = `
        You are an expert educational assistant. 
        Read the following classroom lecture transcript.
        Please provide a detailed summary and structured notes.

        Transcript:
        ${transcript}

        Respond ONLY with a raw JSON object containing exactly these properties:
        {
          "summary": "A concise paragraph summarizing the entire recording.",
          "notes": [
            {
              "topic": "Main Topic 1",
              "details": ["Detail 1", "Detail 2"]
            }
          ]
        }
      `;

      console.log("Generating summary from transcript...");
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      console.log("Content generated successfully.");

      // Parse and return the JSON
      if (!response.text) {
        throw new Error("No text response from Gemini.");
      }

      const rawText = response.text.trim();
      const parsedData = JSON.parse(rawText);
      
      // Attach transcript for UI checking
      parsedData.transcript = transcript;

      return NextResponse.json(parsedData);
    } catch (apiError: any) {
      console.error("Gemini API Error:", apiError);
      // Fallback: return 200 with the transcript so the UI can still display it if Gemini fails
      return NextResponse.json({ 
        summary: `Gemini failed to generate a summary. Error: ${apiError?.message || JSON.stringify(apiError)}`,
        notes: [],
        transcript: transcript 
      });
    }
  } catch (e: any) {
    console.error("Request handling error:", e);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
