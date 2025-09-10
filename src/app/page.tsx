'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Sparkles, ChevronDown, Volume2, Copy, Check } from 'lucide-react';

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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);


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
        if (analyserRef.current && state.isRecording) {
          analyserRef.current.getByteFrequencyData(dataArray);
          // Get the average of the first 8 frequency bins (voice range)
          const relevantData = dataArray.slice(0, 8);
          const average = relevantData.reduce((a, b) => a + b) / relevantData.length;
          // Scale the audio level to be more responsive to voice
          const scaledLevel = Math.min(255, average * 4);
          console.log('Audio level:', scaledLevel, 'Average:', average);
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
        correctedText: '', // Will be updated if user clicks enhance
        timestamp: new Date(),
      };
      setTranscriptionHistory(prev => [historyItem, ...prev]);
    } catch (error) {
      console.error('Error transcribing audio:', error);
      alert('Failed to transcribe audio. Please check your API key.');
      setState(prev => ({ ...prev, isTranscribing: false }));
    }
  };

  const correctGrammar = async () => {
    if (!state.transcript.trim()) return;

    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      const response = await fetch('/api/correct-grammar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: state.transcript }),
      });

      if (!response.ok) {
        throw new Error('Failed to correct grammar');
      }

      const { correctedText } = await response.json();
      setState(prev => ({ ...prev, correctedText, isProcessing: false }));
      
      // Update the most recent history item with corrected text
      setTranscriptionHistory(prev => {
        const newHistory = [...prev];
        if (newHistory.length > 0) {
          // Update the most recent item (index 0) with corrected text
          newHistory[0] = {
            ...newHistory[0],
            correctedText: correctedText
          };
        }
        return newHistory;
      });
    } catch (error) {
      console.error('Error correcting grammar:', error);
      alert('Failed to correct grammar. Please check your API key.');
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
      // Show feedback for history item copy
      setState(prev => ({ ...prev, copiedText: `history-${itemId}` }));
      setTimeout(() => {
        setState(prev => ({ ...prev, copiedText: null }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
      alert('Failed to copy text to clipboard');
    }
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


  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-light text-gray-900 mb-2">
              Word-IO
            </h1>
            <p className="text-gray-600 text-sm">
              Multilingual Voice Recording with AI Enhancement
            </p>
          </div>

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

          {/* Big Copy Button - Right below recording controls */}
          {(state.transcript || state.correctedText) && (
            <div className="flex justify-center mb-8">
              <button
                onClick={() => copyToClipboard(state.correctedText || state.transcript)}
                className="flex items-center space-x-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-medium transition-colors text-lg"
              >
                {state.copiedText === (state.correctedText || state.transcript) ? (
                  <Check className="w-6 h-6" />
                ) : (
                  <Copy className="w-6 h-6" />
                )}
                <span>
                  {state.copiedText === (state.correctedText || state.transcript) ? 'Copied!' : 'Copy Text'}
                </span>
              </button>
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
                    {/* Debug: Show audio level */}
                    <div className="text-xs text-gray-500 ml-2">
                      Level: {Math.round(state.audioLevel)}
                    </div>
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

          {/* Transcript Section */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Transcript</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={correctGrammar}
                    disabled={!state.transcript.trim() || state.isProcessing}
                    className="flex items-center space-x-1 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white px-3 py-2 rounded text-sm font-medium transition-colors"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{state.isProcessing ? 'Processing...' : 'Enhance'}</span>
                  </button>
                </div>
              </div>
              <textarea
                value={state.transcript}
                onChange={(e) => setState(prev => ({ ...prev, transcript: e.target.value }))}
                placeholder="Your speech will be transcribed here automatically after recording..."
                className="w-full h-32 p-4 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
              />
            </div>

            {/* Corrected Text Section */}
            {state.correctedText && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Enhanced Text</h3>
                  <button
                    onClick={clearAll}
                    className="flex items-center space-x-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-medium transition-colors border border-gray-200"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear All</span>
                  </button>
                </div>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-gray-800 whitespace-pre-wrap text-sm">{state.correctedText}</p>
                </div>
              </div>
            )}

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
                      <button
                        onClick={() => copyHistoryItem(item.correctedText || item.transcript, item.id)}
                        className="flex items-center space-x-1 text-gray-600 hover:text-gray-800 transition-colors"
                      >
                        {state.copiedText === `history-${item.id}` ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        <span className="text-xs">
                          {state.copiedText === `history-${item.id}` ? 'Copied!' : 'Copy'}
                        </span>
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1">Original:</p>
                        <p className="text-sm text-gray-700">{item.transcript}</p>
                      </div>
                      {item.correctedText && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-1">Enhanced:</p>
                          <p className="text-sm text-gray-800 font-medium">{item.correctedText}</p>
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