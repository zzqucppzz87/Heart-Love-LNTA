import React, { useRef, useEffect } from 'react';
import GalaxyScene from './components/GalaxyScene';

const MUSIC_SRC = '/music/noi-nay-co-anh.mp3';

export default function App() {
  const containerRef = useRef(null);
  const skipRef = useRef(false);
  const audioRef = useRef(null);
  const startedRef = useRef(false);

  const tryPlayMusic = () => {
    const el = audioRef.current;
    if (!el || startedRef.current) return;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { startedRef.current = true; }).catch(() => {});
    } else {
      startedRef.current = true;
    }
  };

  useEffect(() => {
    tryPlayMusic();
  }, []);

  return (
    <>
      <audio
        ref={audioRef}
        src={MUSIC_SRC}
        loop
        preload="auto"
        style={{ display: 'none' }}
      />
      <div
        ref={containerRef}
        className="canvas-wrap"
        role="button"
        tabIndex={0}
        onClick={tryPlayMusic}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') tryPlayMusic(); }}
        aria-label="Bấm để phát nhạc"
      />
      <GalaxyScene containerRef={containerRef} skipRef={skipRef} />
      {/* Focus nav — heartPhotos.js dùng getElementById để show/hide và gắn button handlers */}
      <div
        id="focusNav"
        style={{
          display: 'none',
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          gap: 12,
        }}
      >
        <button type="button" id="focusPrevBtn" aria-label="Previous">
          ‹ Prev
        </button>
        <button type="button" id="focusNextBtn" aria-label="Next">
          Next ›
        </button>
        <button type="button" id="focusExitBtn" aria-label="Exit">
          Exit (ESC)
        </button>
      </div>
    </>
  );
}
