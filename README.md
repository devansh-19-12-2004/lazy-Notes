# lazyNotes

lazyNotes is an intelligent, real-time classroom note-taking application. It listens to your lectures, automatically transcribes the audio, and uses advanced AI models to generate detailed executive summaries and structured short notes on the fly. Say goodbye to frantically typing during class and focus on understanding the material instead.

## Features

- 🎙️ **Real-Time Audio Transcription**: Uses Deepgram's high-speed speech-to-text API to transcribe your lectures as they happen.
- 📝 **Detailed Executive Summaries**: Automatically generates comprehensive summaries of the lecture context every 30 seconds using Google's Gemini/Groq models.
- 💡 **Structured Short Notes**: Extracts key topics and bullet points every 60 seconds, creating a clean, organized study guide.
- 📄 **PDF Export**: Instantly export your transcript, summary, and short notes into a beautifully formatted PDF document.
- 🌓 **Dark/Light Mode**: A sleek, responsive UI with a built-in theme toggle to suit your viewing preferences.
- 🔇 **Silence Detection**: Automatically stops recording after detecting prolonged periods of silence (20 seconds) to save processing power.

## Use Cases

- **Students**: Record college lectures and automatically generate study materials without missing a beat.
- **Professionals**: Use it during meetings to automatically capture meeting minutes, action items, and key takeaways.
- **Journalists & Interviewers**: Quickly transcribe interviews and generate summaries of the most important talking points.
- **Content Creators**: Turn podcasts or video audio into structured written content.

## Tech Stack

- **Frontend Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Audio Processing**: Web Audio API & MediaRecorder API
- **Speech-to-Text**: [Deepgram SDK](https://deepgram.com/)
- **Generative AI**: Google Gemini (`@google/genai`) & Groq (`groq-sdk`)
- **PDF Generation**: [html2pdf.js](https://ekoopmans.github.io/html2pdf.js/)

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- API keys for Deepgram and your chosen LLM provider (Google Gemini / Groq).

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd audio-summarizer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory and add your API keys:
   ```env
   DEEPGRAM_API_KEY=your_deepgram_api_key
   GEMINI_API_KEY=your_gemini_api_key
   GROQ_API_KEY=your_groq_api_key
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to start using lazyNotes.

## How it Works

1. **Record**: Click the record button. The browser requests microphone access and begins capturing audio.
2. **Chunking**: The audio is processed in chunks and sent to the `/api/transcribe` endpoint (powered by Deepgram).
3. **Summarization & Notes**: The frontend maintains a buffer of the transcript. Every 30 seconds, it sends the accumulated text to `/api/summary` for a detailed summary. Every 60 seconds, it sends the text to `/api/notes` to generate structured bullet points.
4. **Export**: Once the recording is stopped, the application automatically handles finishing the generations and creates a PDF document for download.

## License

This project is open-source and available under the MIT License.
