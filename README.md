# Word IO

Record speech, transcribe English and Chinese audio, and improve the resulting text with AI. Built with Next.js 15, React 19, and TypeScript.

[Open the app](https://word-io.vercel.app)

## Features

- Record, pause, resume, and play back audio in the browser.
- Transcribe recordings through the server's OpenAI Whisper integration.
- Correct grammar and adjust text using a customizable prompt.
- Download recordings and transcripts.
- Use browser speech recognition where the browser supports it.

## Run locally

From a clone of this repository:

```bash
npm ci
```

Create `.env.local` in the project root:

```dotenv
OPENAI_API_KEY=your_openai_api_key
```

Then start the development server:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000) and allow microphone access when recording.

## How data is processed

Recording and playback happen in the browser. Audio submitted for transcription goes to `/api/transcribe`, which sends it to OpenAI using `whisper-1`. Text submitted for correction goes to `/api/correct-grammar`, which uses `gpt-5-nano`. Both server routes require `OPENAI_API_KEY`.

The custom correction prompt is saved in the browser's local storage. Do not put the API key in client code or a `NEXT_PUBLIC_` variable.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm start` | Serve a production build |

No automated test script is configured in `package.json`.

## Browser requirements

Microphone recording requires browser permission and a secure context, such as HTTPS or localhost. Speech-recognition availability varies by browser; support for recording does not guarantee support for browser-native transcription.

If recording fails, check microphone permission and device selection. If transcription or correction fails, check the server's API-key configuration and provider response.

## Source map

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | Recording and editing interface |
| `src/app/api/transcribe/route.ts` | Audio transcription |
| `src/app/api/correct-grammar/route.ts` | Text correction |
| `src/types/speech-recognition.d.ts` | Browser speech-recognition types |

## Deployment

Use a Next.js-compatible host and configure `OPENAI_API_KEY` in its server environment. Before opening a deployment to others, review access controls and usage limits on the paid AI routes.
