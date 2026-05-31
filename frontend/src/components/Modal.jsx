import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, accent = '#F59E0B' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 animate-fadeIn bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 max-h-[92vh] w-full max-w-md animate-slideUp overflow-y-auto rounded-t-2xl border border-line bg-card p-5 shadow-glow sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-head text-base font-bold text-zinc-50" style={{ color: accent }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
