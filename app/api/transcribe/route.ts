import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@deepgram/sdk";

export const runtime = 'nodejs'; 
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY as string);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

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

    const transcript = result?.results?.channels[0]?.alternatives[0]?.transcript || "";
    return NextResponse.json({ transcript });

  } catch (e: any) {
    console.error("Request handling error:", e);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
