import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, MicOff, Volume2, VolumeX, Languages, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onLanguageChange?: (language: string) => void;
  supportedLanguages?: { code: string; name: string; flag: string }[];
  isListening?: boolean;
  className?: string;
}

const DEFAULT_LANGUAGES = [
  { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', name: 'English (UK)', flag: '🇬🇧' },
  { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
  { code: 'de-DE', name: 'German', flag: '🇩🇪' },
  { code: 'it-IT', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt-BR', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'ru-RU', name: 'Russian', flag: '🇷🇺' },
  { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko-KR', name: 'Korean', flag: '🇰🇷' },
  { code: 'zh-CN', name: 'Chinese (Mandarin)', flag: '🇨🇳' },
  { code: 'ar-SA', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
];

export default function VoiceInput({
  onTranscript,
  onLanguageChange,
  supportedLanguages = DEFAULT_LANGUAGES,
  isListening = false,
  className
}: VoiceInputProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [confidence, setConfidence] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showLanguageSelect, setShowLanguageSelect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationRef = useRef<number>();

  // Check for speech recognition support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsSupported(true);
      recognitionRef.current = new SpeechRecognition();
      
      // Configure recognition
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = selectedLanguage;
      recognitionRef.current.maxAlternatives = 1;

      // Handle results
      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
            setConfidence(result[0].confidence || 0);
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        setTranscript(prev => prev + finalTranscript);
        setInterimTranscript(interimTranscript);

        if (finalTranscript) {
          onTranscript(finalTranscript);
        }
      };

      // Handle errors
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setError(event.error);
        setIsRecording(false);
      };

      // Handle end
      recognitionRef.current.onend = () => {
        setIsRecording(false);
        setInterimTranscript('');
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [selectedLanguage, onTranscript]);

  // Setup audio visualization
  const setupAudioVisualization = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      microphoneRef.current.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const updateAudioLevel = () => {
        if (analyserRef.current && isRecording) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / bufferLength;
          setAudioLevel(average / 255);
          animationRef.current = requestAnimationFrame(updateAudioLevel);
        }
      };
      
      updateAudioLevel();
    } catch (error) {
      console.error('Error setting up audio visualization:', error);
    }
  };

  const startRecording = async () => {
    if (!isSupported || !recognitionRef.current) return;

    try {
      setError(null);
      setTranscript('');
      setInterimTranscript('');
      setIsRecording(true);

      await setupAudioVisualization();
      recognitionRef.current.start();
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Failed to start recording');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleLanguageChange = (langCode: string) => {
    setSelectedLanguage(langCode);
    setShowLanguageSelect(false);
    onLanguageChange?.(langCode);
    
    if (recognitionRef.current) {
      recognitionRef.current.lang = langCode;
    }
  };

  const selectedLang = supportedLanguages.find(lang => lang.code === selectedLanguage);

  if (!isSupported) {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <Card>
          <CardContent className="p-4 text-center">
            <MicOff className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              Speech recognition is not supported in your browser
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main Voice Input Interface */}
      <div className="flex items-center space-x-4">
        {/* Microphone Button */}
        <div className="relative">
          <Button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!isSupported}
            className={cn(
              "w-16 h-16 rounded-full transition-all duration-300",
              isRecording 
                ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                : "bg-blue-500 hover:bg-blue-600 text-white"
            )}
          >
            {isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
          </Button>
          
          {/* Audio Level Visualization */}
          {isRecording && (
            <div className="absolute inset-0 rounded-full border-4 border-red-300 animate-ping" 
                 style={{ 
                   transform: `scale(${1 + audioLevel * 0.3})`,
                   opacity: 0.3 + audioLevel * 0.7 
                 }} 
            />
          )}
        </div>

        {/* Language Selection */}
        <div className="relative">
          <Button
            variant="outline"
            onClick={() => setShowLanguageSelect(!showLanguageSelect)}
            className="flex items-center space-x-2"
          >
            <Languages className="w-4 h-4" />
            <span className="text-lg">{selectedLang?.flag}</span>
            <span className="hidden sm:inline">{selectedLang?.name}</span>
          </Button>

          {showLanguageSelect && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
              {supportedLanguages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={cn(
                    "w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3",
                    selectedLanguage === lang.code && "bg-blue-50 dark:bg-blue-900/20"
                  )}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <span className="text-sm">{lang.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status Indicators */}
        <div className="flex items-center space-x-2">
          {isRecording && (
            <Badge variant="default" className="bg-red-500 text-white">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Listening
            </Badge>
          )}
          
          {confidence > 0 && (
            <Badge variant="outline">
              Confidence: {Math.round(confidence * 100)}%
            </Badge>
          )}
        </div>
      </div>

      {/* Transcript Display */}
      {(transcript || interimTranscript) && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Transcript
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTranscript('');
                    setInterimTranscript('');
                  }}
                >
                  Clear
                </Button>
              </div>
              
              <div className="text-sm text-gray-900 dark:text-white">
                {transcript}
                {interimTranscript && (
                  <span className="text-gray-500 dark:text-gray-400 italic">
                    {interimTranscript}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
              <VolumeX className="w-4 h-4" />
              <span className="text-sm">Error: {error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audio Level Indicator */}
      {isRecording && (
        <div className="flex items-center space-x-2">
          <Volume2 className="w-4 h-4 text-gray-500" />
          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-100"
              style={{ width: `${audioLevel * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {Math.round(audioLevel * 100)}%
          </span>
        </div>
      )}

      {/* Instructions */}
      <div className="text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isRecording 
            ? "Speak now... Click the microphone to stop recording"
            : "Click the microphone to start voice input"
          }
        </p>
      </div>
    </div>
  );
}

// Extend the Window interface to include webkitSpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}