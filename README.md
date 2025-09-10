# Word-IO

A modern bilingual voice recording application that supports English and Chinese Simplified dictation, with AI-powered text enhancement for improved grammar and flow.

## Features

- 🌍 **Bilingual Support**: English and Chinese Simplified dictation
- 🎤 **Audio Recording**: Record audio directly in the browser using Web Audio API
- 📝 **Speech-to-Text**: Real-time transcription using Web Speech API
- ✨ **AI Text Enhancement**: Uses OpenAI GPT to improve grammar and text flow
- 🎵 **Audio Playback**: Play back recorded audio
- 💾 **Download Options**: Download both audio and text files
- 📱 **Modern UI**: Clean, minimal design that works on desktop and mobile

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here
```

Get your OpenAI API key from: https://platform.openai.com/api-keys

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Start Recording**: Click the "Start Recording" button and allow microphone access
2. **Speak**: The app will automatically transcribe your speech in real-time
3. **Pause/Resume**: Use the pause/resume button during recording
4. **Stop Recording**: Click "Stop" to end the recording
5. **Correct Grammar**: Click "Correct Grammar" to use AI to improve the text
6. **Download**: Download the audio file or text transcript

## Security Notes

- The OpenAI API key is stored only in your local environment variables
- No API keys are stored in the codebase or committed to version control
- The app runs entirely in your browser for recording and transcription
- Only the grammar correction feature requires the OpenAI API

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add your `OPENAI_API_KEY` environment variable in Vercel dashboard
4. Deploy!

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- Render
- AWS Amplify

Make sure to set the `OPENAI_API_KEY` environment variable in your deployment platform.

## Browser Compatibility

- Chrome/Chromium (recommended for best speech recognition)
- Firefox
- Safari
- Edge

Note: Speech recognition works best in Chrome-based browsers.

## Troubleshooting

### Microphone Access Issues
- Make sure to allow microphone permissions when prompted
- Check your browser's microphone settings
- Try refreshing the page

### Speech Recognition Not Working
- Ensure you're using a supported browser (Chrome recommended)
- Check that your microphone is working
- Try speaking more clearly and at a normal pace

### Grammar Correction Failing
- Verify your OpenAI API key is correct
- Check that you have sufficient API credits
- Ensure you have an active OpenAI account

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: TailwindCSS
- **Icons**: Lucide React
- **Audio**: Web Audio API, MediaRecorder API
- **Speech**: Web Speech API
- **AI**: OpenAI GPT-3.5-turbo
- **Deployment**: Vercel (or any Next.js-compatible platform)