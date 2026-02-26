'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Sparkles, ChevronDown, Volume2, Copy, Check, Settings, Save } from 'lucide-react';

interface RecordingState {
  isRecording: boolean;
  audioBlob: Blob | null;
  transcript: string;
  correctedText: string;
  isProcessing: boolean;
  isTranscribing: boolean;
  selectedInput: string;
  audioLevel: number;
  copiedText: string | null;
}

interface TranscriptionHistory {
  id: string;
  transcript: string;
  correctedText: string;
  timestamp: Date;
}

interface AudioInputDevice {
  deviceId: string;
  label: string;
  kind: string;
}

export default function RecordingApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(`You are a helpful assistant that corrects grammar and improves the flow of text. ONLY work with English and Chinese Simplified text. Your tasks:

1. Fix basic grammar, punctuation, and sentence structure
2. Convert spoken lists into proper numbered lists or bullet points when you detect list structures
3. Improve sentence formatting and structure for better readability
4. Preserve the original meaning and language mix
5. Do not add unnecessary words or translate between languages
6. If the text contains any other languages besides English or Chinese Simplified, leave it unchanged

Format lists properly:
- Use numbered lists (1., 2., 3.) for sequential items
- Use bullet points (- or •) for non-sequential items
- Ensure proper indentation and spacing`);
  
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    audioBlob: null,
    transcript: '',
    correctedText: '',
    isProcessing: false,
    isTranscribing: false,
    selectedInput: 'default',
    audioLevel: 0,
    copiedText: null,
  });

  const [audioInputs, setAudioInputs] = useState<AudioInputDevice[]>([]);
  const [transcriptionHistory, setTranscriptionHistory] = useState<TranscriptionHistory[]>([]);
  const [autoEnhance, setAutoEnhance] = useState<boolean>(true); // Default to enabled
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRecordingRef = useRef<boolean>(false);


  // Get available audio input devices
  const getAudioInputs = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
          kind: device.kind
        }));
      setAudioInputs(audioInputs);
    } catch (error) {
      console.error('Error getting audio inputs:', error);
    }
  };

  // Monitor audio levels for animation
  const monitorAudioLevel = (stream: MediaStream) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.1; // Very little smoothing for immediate response
      analyserRef.current = analyser;
      
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateAudioLevel = () => {
        if (analyserRef.current && isRecordingRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          // Get the average of the first 8 frequency bins (voice range)
          const relevantData = dataArray.slice(0, 8);
          const average = relevantData.reduce((a, b) => a + b) / relevantData.length;
          // Scale the audio level to be more responsive to voice
          const scaledLevel = Math.min(255, average * 4);
          setState(prev => ({ ...prev, audioLevel: scaledLevel }));
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        }
      };
      
      updateAudioLevel();
    } catch (error) {
      console.error('Error setting up audio monitoring:', error);
    }
  };

  // Clean up audio monitoring
  const stopAudioMonitoring = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setState(prev => ({ ...prev, audioLevel: 0 }));
  };

  useEffect(() => {
    getAudioInputs();
    // Load saved custom prompt from localStorage
    const savedPrompt = localStorage.getItem('wordio-custom-prompt');
    if (savedPrompt) {
      setCustomPrompt(savedPrompt);
    }
    return () => {
      stopAudioMonitoring();
    };
  }, []);

  const startRecording = async () => {
    try {
      const constraints = {
        audio: state.selectedInput === 'default' 
          ? true 
          : { deviceId: { exact: state.selectedInput } }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Start audio level monitoring for animation
      isRecordingRef.current = true;
      monitorAudioLevel(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stopAudioMonitoring();
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setState(prev => ({ ...prev, audioBlob }));
        
        // Automatically transcribe after recording stops
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      
      setState(prev => ({ 
        ...prev, 
        isRecording: true,
        transcript: '',
        correctedText: ''
      }));
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && state.isRecording) {
      isRecordingRef.current = false;
      mediaRecorderRef.current.stop();

      // Stop all audio tracks
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

      // Stop audio monitoring
      stopAudioMonitoring();
      
      setState(prev => ({ ...prev, isRecording: false }));
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setState(prev => ({ ...prev, isTranscribing: true }));

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.wav');
      formData.append('language', 'auto');

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to transcribe audio');
      }

      const { transcript } = await response.json();
      setState(prev => ({ ...prev, transcript, isTranscribing: false }));
      
      // Add to history immediately after transcription
      const historyItem: TranscriptionHistory = {
        id: Date.now().toString(),
        transcript: transcript,
        correctedText: '', // Will be updated if auto-enhance is enabled
        timestamp: new Date(),
      };
      setTranscriptionHistory(prev => [historyItem, ...prev]);
      
      // Automatically enhance the transcript if toggle is enabled
      if (autoEnhance) {
        await enhanceTranscript(transcript);
      }
    } catch (error) {
      console.error('Error transcribing audio:', error);
      alert('Failed to transcribe audio. Please check your API key.');
      setState(prev => ({ ...prev, isTranscribing: false }));
    }
  };

  const enhanceTranscript = async (text: string) => {
    if (!text.trim()) return;

    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      const response = await fetch('/api/correct-grammar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: text,
          customPrompt: customPrompt 
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to enhance text');
      }

      const { correctedText } = await response.json();
      setState(prev => ({ ...prev, correctedText, isProcessing: false }));
      
      // Update the most recent history item with enhanced text
      setTranscriptionHistory(prev => {
        const newHistory = [...prev];
        if (newHistory.length > 0) {
          // Update the most recent item (index 0) with enhanced text
          newHistory[0] = {
            ...newHistory[0],
            correctedText: correctedText
          };
        }
        return newHistory;
      });
    } catch (error) {
      console.error('Error enhancing text:', error);
      alert('Failed to enhance text. Please check your API key.');
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  };


  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setState(prev => ({ ...prev, copiedText: text }));
      setTimeout(() => {
        setState(prev => ({ ...prev, copiedText: null }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
      alert('Failed to copy text to clipboard');
    }
  };

  const copyHistoryItem = async (text: string, itemId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setState(prev => ({ ...prev, copiedText: itemId }));
      setTimeout(() => {
        setState(prev => ({ ...prev, copiedText: null }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
      alert('Failed to copy text to clipboard');
    }
  };

  const handleLogin = () => {
    if (password === 'wordio2024') {
      setIsAuthenticated(true);
    } else {
      alert('Wrong password');
    }
  };

  const saveCustomPrompt = () => {
    // Save to localStorage for persistence
    localStorage.setItem('wordio-custom-prompt', customPrompt);
    setShowSettings(false);
    alert('Custom prompt saved! It will be used for future enhancements.');
  };

  const clearAll = () => {
    stopAudioMonitoring();
    setState({
      isRecording: false,
      audioBlob: null,
      transcript: '',
      correctedText: '',
      isProcessing: false,
      isTranscribing: false,
      selectedInput: state.selectedInput, // Preserve current input selection
      audioLevel: 0,
      copiedText: null,
    });
    setTranscriptionHistory([]); // Clear all history
  };


  // Password protection screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 max-w-md w-full mx-4">
          <h1 className="text-2xl font-bold mb-4 text-center">Word-IO</h1>
          <p className="text-gray-600 mb-4 text-center">Enter password to access:</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter password"
          />
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Access App
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1"></div>
              <h1 className="text-3xl font-light text-gray-900">
                Word-IO
              </h1>
              <div className="flex-1 flex justify-end">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="flex items-center space-x-1 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <Settings className="w-5 h-5" />
                  <span className="text-sm">Settings</span>
                </button>
              </div>
            </div>
            <p className="text-gray-600 text-sm">
              Multilingual Voice Recording with AI Enhancement
            </p>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="mb-8 p-6 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">AI Enhancement Settings</h3>
                <button
                  onClick={saveCustomPrompt}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Prompt</span>
                </button>
              </div>
              
              {/* Auto-Enhance Toggle */}
              <div className="mb-6">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoEnhance}
                    onChange={(e) => setAutoEnhance(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Auto-enhance after recording (GPT-5 nano)
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-7">
                  When enabled, text will be automatically enhanced after transcription. When disabled, you can manually enhance using the button.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom AI Prompt (System Message)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                  placeholder="Enter your custom AI prompt here..."
                />
                <p className="text-xs text-gray-500 mt-2">
                  This prompt will be used to instruct the AI on how to enhance your transcribed text. 
                  You can customize the behavior, language preferences, formatting rules, etc.
                </p>
              </div>
            </div>
          )}

          {/* Voice Input Selection */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <select
                value={state.selectedInput}
                onChange={(e) => setState(prev => ({ ...prev, selectedInput: e.target.value }))}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              >
                <option value="default">Default Microphone</option>
                {audioInputs.map((input) => (
                  <option key={input.deviceId} value={input.deviceId}>
                    {input.label.includes('AirPods') ? '🎧 AirPods' : 
                     input.label.includes('Bluetooth') ? '🔵 Bluetooth' :
                     input.label.includes('Built-in') ? '💻 Built-in' :
                     `🎤 ${input.label}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>


          {/* Recording Controls */}
          <div className="flex justify-center space-x-3 mb-8">
            {!state.isRecording ? (
              <button
                onClick={startRecording}
                className="flex items-center space-x-2 bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                <Mic className="w-4 h-4" />
                <span>Start Recording</span>
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center space-x-2 bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                <Square className="w-4 h-4" />
                <span>Stop Recording</span>
              </button>
            )}
          </div>

          {/* Copy Buttons - Right below recording controls */}
          {(state.transcript || state.correctedText) && (
            <div className="flex justify-center space-x-4 mb-8">
              {/* Copy Original Button */}
              {state.transcript && (
                <button
                  onClick={() => copyToClipboard(state.transcript)}
                  className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  {state.copiedText === state.transcript ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                  <span>
                    {state.copiedText === state.transcript ? 'Copied!' : 'Copy Original'}
                  </span>
                </button>
              )}
              
              {/* Copy Enhanced Button */}
              {state.correctedText && (
                <button
                  onClick={() => copyToClipboard(state.correctedText)}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  {state.copiedText === state.correctedText ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                  <span>
                    {state.copiedText === state.correctedText ? 'Copied!' : 'Copy Enhanced'}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Status Indicator with Audio Animation */}
          {(state.isRecording || state.isTranscribing) && (
            <div className="text-center mb-6">
              <div className="inline-flex items-center space-x-3 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg">
                {state.isRecording ? (
                  <div className="flex items-center space-x-3">
                    {/* Cool Wave Animation */}
                    <div className="flex items-end space-x-0.5 h-12 relative">
                      {[...Array(16)].map((_, i) => {
                        const delay = i * 0.05;
                        // Always show animation when recording, with audio level enhancement
                        const baseHeight = state.audioLevel > 5 ? 
                          Math.max(2, (state.audioLevel / 255) * 32 + 2) : 
                          Math.max(1, Math.sin((Date.now() / 200 + i) * 0.3) * 4 + 6);
                        
                        // Add variation for natural wave effect
                        const variation = Math.sin((Date.now() / 150 + i) * 0.2) * 2;
                        const height = baseHeight + variation;
                        
                        // Dynamic color based on audio level and position
                        const hue = state.audioLevel > 10 ? 
                          (200 + (state.audioLevel / 255) * 140 + i * 6) % 360 : 
                          (200 + i * 8) % 360;
                        const saturation = state.audioLevel > 20 ? 85 : 70;
                        const lightness = state.audioLevel > 30 ? 70 : 60;
                        const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                        
                        return (
                          <div
                            key={i}
                            className="rounded-full transition-all duration-75 ease-out relative"
                            style={{
                              width: '3px',
                              height: `${Math.max(1, height)}px`,
                              backgroundColor: color,
                              boxShadow: state.audioLevel > 15 ? 
                                `0 0 ${height/2}px ${color}, 0 0 ${height}px ${color}50` : 
                                `0 0 ${height/3}px ${color}40`,
                              animationDelay: `${delay}s`,
                              animation: 'wave 0.6s ease-in-out infinite alternate',
                              filter: state.audioLevel > 25 ? 'brightness(1.3)' : 'brightness(1)'
                            }}
                          />
                        );
                      })}
                    </div>
                    <Volume2 className="w-5 h-5 text-blue-500 animate-pulse" />
                  </div>
                ) : (
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse" style={{animation: 'pulse-glow 1.5s ease-in-out infinite'}}></div>
                    <div className="w-3 h-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-pulse" style={{animation: 'pulse-glow 1.5s ease-in-out infinite', animationDelay: '0.3s'}}></div>
                    <div className="w-3 h-3 bg-gradient-to-r from-pink-500 to-red-500 rounded-full animate-pulse" style={{animation: 'pulse-glow 1.5s ease-in-out infinite', animationDelay: '0.6s'}}></div>
                  </div>
                )}
                <span className="text-sm font-medium">
                  {state.isRecording ? 'Recording...' : 'Transcribing...'}
                </span>
              </div>
            </div>
          )}

          {/* Transcript Section - Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Original Transcript */}
            <div>
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Original Transcript</h3>
                  {!autoEnhance && state.transcript && !state.isProcessing && (
                    <button
                      onClick={() => enhanceTranscript(state.transcript)}
                      className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Enhance</span>
                    </button>
                  )}
                </div>
                {state.isProcessing && (
                  <div className="text-xs text-blue-600 mt-1 flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 animate-spin" />
                    <span>Enhancing with AI...</span>
                  </div>
                )}
              </div>
              <textarea
                value={state.transcript}
                onChange={(e) => setState(prev => ({ ...prev, transcript: e.target.value }))}
                placeholder="Your speech will be transcribed here automatically after recording..."
                className="w-full h-64 p-4 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
              />
            </div>

            {/* Enhanced Text */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Enhanced Text (GPT-5 nano)</h3>
                <button
                  onClick={clearAll}
                  className="flex items-center space-x-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-medium transition-colors border border-gray-200"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All</span>
                </button>
              </div>
              <div className="h-64 p-4 bg-gray-50 border border-gray-200 rounded-lg overflow-y-auto">
                {state.correctedText ? (
                  <p className="text-gray-800 whitespace-pre-wrap text-sm">{state.correctedText}</p>
                ) : (
                  <p className="text-gray-500 text-sm italic">Enhanced text will appear here after recording...</p>
                )}
              </div>
            </div>
          </div>


          {/* Transcription History */}
          {transcriptionHistory.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-medium text-gray-700 mb-4 uppercase tracking-wide">Transcription History ({transcriptionHistory.length} items)</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {transcriptionHistory.map((item) => (
                  <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">
                        {item.timestamp.toLocaleString()}
                      </span>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => copyHistoryItem(item.transcript, `history-original-${item.id}`)}
                          className="flex items-center space-x-1 text-gray-600 hover:text-gray-800 transition-colors"
                        >
                          {state.copiedText === `history-original-${item.id}` ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                          <span className="text-xs">
                            {state.copiedText === `history-original-${item.id}` ? 'Copied!' : 'Copy Original'}
                          </span>
                        </button>
                        {item.correctedText && (
                          <button
                            onClick={() => copyHistoryItem(item.correctedText, `history-enhanced-${item.id}`)}
                            className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            {state.copiedText === `history-enhanced-${item.id}` ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                            <span className="text-xs">
                              {state.copiedText === `history-enhanced-${item.id}` ? 'Copied!' : 'Copy Enhanced'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1">Original:</p>
                        <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded border">{item.transcript}</p>
                      </div>
                      {item.correctedText && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-1">Enhanced:</p>
                          <p className="text-sm text-gray-800 font-medium bg-blue-50 p-2 rounded border border-blue-200">{item.correctedText}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}