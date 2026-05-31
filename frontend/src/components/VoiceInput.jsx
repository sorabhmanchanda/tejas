import { useEffect, useRef, useState } from 'react';

// Web Speech API wrapper. Falls back gracefully to a plain text field
// where the API is unavailable (e.g. Firefox, some mobile browsers).
function getRecognition() {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'en-IN';
  rec.interimResults = true;
  rec.continuous = false;
  return rec;
}

export default function VoiceInput({ value, onChange, onFinal, placeholder }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef(null);

  useEffect(() => {
    setSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
    };
  }, []);

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) {
      setSupported(false);
      return;
    }
    recRef.current = rec;
    let finalText = '';

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }
      onChange?.((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) onFinal?.(finalText.trim());
    };

    setListening(true);
    rec.start();
  }

  return (
    <div className="relative">
      <textarea
        className="input min-h-[72px] resize-none pr-12"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        rows={2}
      />
      {supported && (
        <button
          type="button"
          onClick={toggle}
          className={`absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-lg border transition ${
            listening
              ? 'border-red-500/50 bg-red-500/15 text-red-400'
              : 'border-line bg-base/60 text-zinc-400 hover:text-zinc-100'
          }`}
          aria-label={listening ? 'Stop recording' : 'Start voice input'}
          title={listening ? 'Stop' : 'Speak'}
        >
          {listening ? (
            <span className="h-3 w-3 animate-pulseDot rounded-sm bg-red-400" />
          ) : (
            <span className="text-base">🎙️</span>
          )}
        </button>
      )}
      {listening && (
        <span className="absolute -bottom-5 left-1 text-[10px] text-red-400">listening…</span>
      )}
      {!supported && (
        <span className="absolute -bottom-5 left-1 text-[10px] text-zinc-600">
          voice not supported — type instead
        </span>
      )}
    </div>
  );
}
