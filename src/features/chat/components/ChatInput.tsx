import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { Send, Square, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ── Web Speech API types (webkit prefix not in lib.dom) ─────────────────────
type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList;
  resultIndex: number;
};

type SpeechRecognitionInstance = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: Event & { error: string }) => void) | null;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    SpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

const getSpeechRecognition = () => window.SpeechRecognition || window.webkitSpeechRecognition;

// ── ChatInput ───────────────────────────────────────────────────────────────

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function ChatInput({ onSend, onStop, isStreaming }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [isListening, setIsListening] = useState(false);
  // Accumulated finalized text from voice (before current interim)
  const voiceBaseRef = useRef("");

  const resizeTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  };

  const handleSend = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const value = textarea.value.trim();
    if (!value || isStreaming) return;

    // Stop voice if active
    recognitionRef.current?.stop();

    onSend(value);
    textarea.value = "";
    textarea.style.height = "auto";
    voiceBaseRef.current = "";
  }, [isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    resizeTextarea();
  }, []);

  // ── Voice input ─────────────────────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const SR = getSpeechRecognition();
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognitionRef.current = recognition;

    // Start from current textarea content
    voiceBaseRef.current = textareaRef.current?.value ?? "";

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result?.[0]) continue;
        const transcript = result[0].transcript;
        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Append finalized text to base
      if (finalTranscript) {
        const sep = voiceBaseRef.current && !voiceBaseRef.current.endsWith(" ") ? " " : "";
        voiceBaseRef.current += sep + finalTranscript;
      }

      // Display base + interim preview
      const textarea = textareaRef.current;
      if (textarea) {
        const sep =
          voiceBaseRef.current && interimTranscript && !voiceBaseRef.current.endsWith(" ")
            ? " "
            : "";
        textarea.value = voiceBaseRef.current + (interimTranscript ? sep + interimTranscript : "");
        resizeTextarea();
      }
    };

    recognition.onend = () => {
      // Set final value (without interim)
      if (textareaRef.current) {
        textareaRef.current.value = voiceBaseRef.current;
        resizeTextarea();
      }
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (e) => {
      console.error("[Voice]", e.error);
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.start();
    setIsListening(true);
  }, [isListening]);

  const hasSpeechAPI = !!getSpeechRecognition();

  return (
    <div className="border-t border-white/[0.06] p-2">
      <div
        className={cn(
          "bg-k-bg-secondary flex items-end gap-1.5 rounded-lg border px-2 py-1.5",
          isListening ? "border-red-400/40" : "border-white/[0.06]",
        )}
      >
        <textarea
          ref={textareaRef}
          placeholder={isListening ? t("voiceListening") : t("chatPlaceholder")}
          disabled={isStreaming}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          rows={1}
          className={cn(
            "flex-1 resize-none bg-transparent text-[13px] leading-relaxed outline-none",
            "text-k-text placeholder:text-k-text-tertiary",
            "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10",
            "max-h-[150px]",
          )}
        />

        {/* Voice button */}
        {hasSpeechAPI && !isStreaming && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleVoice}
            className={cn(
              isListening
                ? "text-red-400 hover:text-red-300"
                : "text-k-text-tertiary hover:text-k-accent",
            )}
            title={isListening ? t("voiceStop") : t("voiceStart")}
          >
            {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </Button>
        )}

        {/* Send / Stop */}
        {isStreaming ? (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onStop}
            className="text-red-400 hover:text-red-300"
            title={t("chatStop")}
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleSend}
            disabled={isStreaming}
            className="text-k-text-tertiary hover:text-k-accent"
            title={t("chatSend")}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Status indicators */}
      {isStreaming && (
        <div className="text-k-text-tertiary mt-1 flex items-center gap-1.5 px-1 text-[10px]">
          <span className="bg-k-accent inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
          {t("chatStreaming")}
        </div>
      )}
      {isListening && (
        <div className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-red-400">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
          {t("voiceListening")}
        </div>
      )}
    </div>
  );
}
