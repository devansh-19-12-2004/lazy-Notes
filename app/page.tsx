"use client";

import { useState, useRef, useEffect } from "react";

// pseudo-streaming typewriter component
const TypewriterText = ({ text, speed = 15 }: { text: string; speed?: number }) => {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed(""); // Reset when text changes to ensure fresh start

    const interval = setInterval(() => {
      setDisplayed((prev) => {
        // Pure updater function: derive next char from current length
        if (prev.length >= text.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + text.charAt(prev.length);
      });
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return <span>{displayed}</span>;
};

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [processingMsg, setProcessingMsg] = useState<string | null>(null);

  // Chunk state buckets
  const [transcriptChunks, setTranscriptChunks] = useState<string[]>([]);
  const [summaryChunks, setSummaryChunks] = useState<string[]>([]);
  const [notesChunks, setNotesChunks] = useState<{ topic: string; details: string[] }[]>([]);

  // Stable refs to read最新 state inside setInterval closures
  const summaryHistoryRef = useRef<string[]>([]);
  const notesHistoryRef = useRef<{ topic: string; details: string[] }[]>([]);

  useEffect(() => { summaryHistoryRef.current = summaryChunks; }, [summaryChunks]);
  useEffect(() => { notesHistoryRef.current = notesChunks; }, [notesChunks]);

  // Refs for logic
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const summaryBufferRef = useRef<string>("");
  const notesBufferRef = useRef<string>("");

  // Silence detection refs
  const lastAudioTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setIsRecording(true);
      setErrorMsg(null);
      setProcessingMsg(null);
      setRecordingDuration(0);
      setTranscriptChunks([]);
      setSummaryChunks([]);
      setNotesChunks([]);
      summaryBufferRef.current = "";
      notesBufferRef.current = "";

      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // Web Audio API for Silence Detection
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      lastAudioTimeRef.current = Date.now();

      silenceCheckIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((acc, val) => acc + val, 0);
        const avg = sum / dataArray.length;

        if (avg > 10) {
          lastAudioTimeRef.current = Date.now();
        } else {
          if (Date.now() - lastAudioTimeRef.current > 20000) {
            console.log("20 seconds of silence detected, auto-stopping recording...");
            stopRecording();
          }
        }
      }, 1000);

      startChunkSequence(stream);
    } catch (err: any) {
      setErrorMsg("Microphone access denied or not available. Please allow mic usage.");
      console.error(err);
    }
  };

  const startChunkSequence = (stream: MediaStream) => {
    if (!streamRef.current) return; // recording stopped

    const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorderRef.current = mediaRecorder;

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      if (chunks.length > 0) {
        const blob = new Blob(chunks, { type: "audio/webm" });
        processAudioChunk(blob);
      }

      if (streamRef.current) {
        startChunkSequence(stream);
      }
    };

    mediaRecorder.start();

    // Schedule 10-second chunks for transcribing context
    chunkTimerRef.current = setTimeout(() => {
      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
    }, 10000);
  };

  const stopRecording = () => {
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }

    setIsRecording(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const generateSummary = async () => {
    if (summaryBufferRef.current.trim().length > 10) {
      const textToProcess = summaryBufferRef.current;
      const previousSummaryContext = summaryHistoryRef.current.join(" ");
      summaryBufferRef.current = ""; // flush
      try {
        const response = await fetch("/api/summary", {
          method: "POST",
          body: JSON.stringify({
            text: textToProcess,
            previousSummary: previousSummaryContext
          }),
          headers: { "Content-Type": "application/json" },
        });
        const data = await response.json();
        if (data.summary) {
          setSummaryChunks((prev) => [...prev, data.summary]);
        }
      } catch (err) {
        console.error("Summary execution failed:", err);
      }
    }
  };

  const generateNotes = async () => {
    if (notesBufferRef.current.trim().length > 10) {
      const textToProcess = notesBufferRef.current;
      const previousNotesContext = JSON.stringify(notesHistoryRef.current);
      notesBufferRef.current = ""; // flush
      try {
        const response = await fetch("/api/notes", {
          method: "POST",
          body: JSON.stringify({
            text: textToProcess,
            previousNotes: previousNotesContext
          }),
          headers: { "Content-Type": "application/json" },
        });
        const data = await response.json();
        if (data.notes && data.notes.length > 0) {
          setNotesChunks(data.notes);
        }
      } catch (err) {
        console.error("Notes execution failed:", err);
      }
    }
  };

  const processAudioChunk = async (blob: Blob) => {
    const formData = new FormData();
    formData.append("file", blob, "chunk.webm");
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });
      if (response.ok) {
        const data = await response.json();
        if (data.transcript && data.transcript.trim()) {
          const txt = data.transcript;
          setTranscriptChunks((prev) => [...prev, txt]);
          summaryBufferRef.current += txt + " ";
          notesBufferRef.current += txt + " ";
        }
      }
    } catch (err) {
      console.error("Deepgram Error:", err);
    }

    if (!streamRef.current) {
      await generateSummary();
      await generateNotes();
    }
  };

  // 30s Executive Summary and 60s Structured Notes loop
  useEffect(() => {
    if (!isRecording) return;
    
    let tick = 0;
    const interval = setInterval(async () => {
      tick += 30;
      
      const tasks = [generateSummary()];
      if (tick % 60 === 0) {
        setProcessingMsg("Processing summary & notes...");
        tasks.push(generateNotes());
      } else {
        setProcessingMsg("Processing 30s summary...");
      }
      
      await Promise.all(tasks);
      setProcessingMsg(null);
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [isRecording]);

  return (
    <div
      className={`min-h-screen font-sans transition-colors duration-500 selection:bg-indigo-500/30 ${isDarkMode ? "bg-neutral-900 text-white" : "bg-neutral-50 text-neutral-900"
        }`}
    >
      {/* Theme Toggle */}
      <div className="absolute top-6 right-6 z-50">
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className={`p-3 rounded-full transition-all duration-300 shadow-lg border ${isDarkMode
              ? "bg-neutral-800 border-neutral-700 text-yellow-400 hover:bg-neutral-700"
              : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100 shadow-sm"
            }`}
          title="Toggle Light/Dark Mode"
        >
          {isDarkMode ? (
            <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          )}
        </button>
      </div>



      <main className="relative z-10 container mx-auto px-6 py-12 max-w-4xl flex flex-col items-center justify-center min-h-screen">
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 text-transparent bg-clip-text">
            lazyNotes
          </h1>
          <p
            className={`text-lg md:text-xl max-w-2xl mx-auto ${isDarkMode ? "text-neutral-400" : "text-neutral-600"
              }`}
          >
            Instantly transform your classroom lectures into structured and comprehensive notes.
          </p>
        </div>

        {/* Recorder Section */}
        <div
          className={`w-full backdrop-blur-xl rounded-3xl p-8 shadow-2xl transition-all mb-8 relative overflow-hidden border ${isDarkMode
              ? "bg-neutral-800/50 border-neutral-700/50"
              : "bg-white/70 border-neutral-200 shadow-neutral-200/50"
            }`}
        >
          <div className="flex flex-col items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <div
                className={`text-sm font-medium tracking-widest uppercase ${isDarkMode ? "text-neutral-400" : "text-neutral-500"
                  }`}
              >
                {isRecording ? "Listening..." : "Ready to Record"}
              </div>
              {isRecording && (
                <div
                  className={`font-mono text-3xl font-semibold tracking-wider ${isDarkMode ? "text-indigo-400" : "text-indigo-600"
                    }`}
                >
                  {formatDuration(recordingDuration)}
                </div>
              )}
            </div>

            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`relative group flex items-center justify-center w-24 h-24 rounded-full transition-all duration-300 ${isRecording
                  ? "bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.3)] hover:shadow-[0_0_40px_rgba(239,68,68,0.5)] scale-110"
                  : "bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-500/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.4)]"
                }`}
            >
              {isRecording ? (
                <div className="w-8 h-8 bg-red-500 rounded-sm animate-pulse" />
              ) : (
                <svg
                  className="w-10 h-10 text-indigo-400 ml-1 group-hover:scale-110 transition-transform"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              )}
            </button>

            {errorMsg && (
              <div className="mt-4 text-red-400 text-sm bg-red-400/10 px-4 py-2 rounded-lg border border-red-400/20">
                {errorMsg}
              </div>
            )}

            {processingMsg && (
              <div className={`mt-2 text-sm font-medium animate-pulse flex items-center gap-2 ${isDarkMode ? "text-indigo-400" : "text-indigo-600"
                }`}>
                <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {processingMsg}
              </div>
            )}
          </div>
        </div>

        {/* Results Section */}
        {transcriptChunks.length > 0 && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
            {/* Raw Transcript */}
            <div
              className={`backdrop-blur-md rounded-2xl p-6 shadow-xl mb-6 border ${isDarkMode ? "bg-neutral-800/40 border-neutral-700/50" : "bg-white/80 border-neutral-200"
                }`}
            >
              <h2
                className={`text-xl font-bold mb-3 flex items-center gap-2 ${isDarkMode ? "text-green-300" : "text-green-600"
                  }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Deepgram Live Transcript
              </h2>
              <div
                className={`leading-relaxed text-sm p-4 rounded-xl border max-h-60 overflow-y-auto font-mono ${isDarkMode
                    ? "text-neutral-300 bg-neutral-900/50 border-neutral-700/30"
                    : "text-neutral-700 bg-neutral-50 border-neutral-200"
                  }`}
              >
                {transcriptChunks.map((chunk, idx) => (
                  <span key={idx}>
                    <TypewriterText text={chunk + " "} speed={5} />
                  </span>
                ))}
              </div>
            </div>

            {/* Summary */}
            {summaryChunks.length > 0 && (
              <div
                className={`backdrop-blur-md rounded-2xl p-6 shadow-xl mb-6 border ${isDarkMode ? "bg-neutral-800/40 border-neutral-700/50" : "bg-white/80 border-neutral-200"
                  }`}
              >
                <h2
                  className={`text-xl font-bold mb-3 flex items-center gap-2 ${isDarkMode ? "text-indigo-300" : "text-indigo-600"
                    }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Executive Summary
                </h2>
                <div
                  className={`leading-relaxed text-lg whitespace-pre-wrap ${isDarkMode ? "text-neutral-300" : "text-neutral-700"
                    }`}
                >
                  {summaryChunks.map((chunk, idx) => (
                    <span key={idx}>
                      <TypewriterText text={(idx > 0 && !chunk.startsWith("\n") ? "\n\n" : "") + chunk + " "} speed={10} />
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {notesChunks.length > 0 && (
              <div
                className={`backdrop-blur-md rounded-2xl p-6 shadow-xl border ${isDarkMode ? "bg-neutral-800/40 border-neutral-700/50" : "bg-white/80 border-neutral-200"
                  }`}
              >
                <h2
                  className={`text-xl font-bold mb-6 flex items-center gap-2 ${isDarkMode ? "text-purple-300" : "text-purple-600"
                    }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  Structured Notes
                </h2>
                <div className="grid gap-6">
                  {notesChunks.map((note, index) => (
                    <div
                      key={index}
                      className={`rounded-xl p-5 border ${isDarkMode
                          ? "bg-neutral-900/50 border-neutral-700/30"
                          : "bg-neutral-50 border-neutral-200"
                        }`}
                    >
                      <h3
                        className={`text-lg font-semibold mb-3 flex items-center gap-2 ${isDarkMode ? "text-white" : "text-neutral-800"
                          }`}
                      >
                        <span
                          className={`flex items-center justify-center w-6 h-6 rounded-full text-xs text-center border ${isDarkMode
                              ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
                              : "bg-indigo-100 text-indigo-700 border-indigo-200"
                            }`}
                        >
                          {index + 1}
                        </span>
                        {note.topic}
                      </h3>
                      <ul className="space-y-2">
                        {note.details.map((detail, dIndex) => (
                          <li
                            key={dIndex}
                            className={`pl-4 relative before:content-[''] before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full ${isDarkMode
                                ? "text-neutral-400 before:bg-neutral-600"
                                : "text-neutral-600 before:bg-neutral-400"
                              }`}
                          >
                            {detail}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
