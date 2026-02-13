import React, { useRef, useCallback } from 'react';
import GalaxyScene from './components/GalaxyScene';

const MUSIC_SRC = '/music/noi-nay-co-anh.mp3';

export default function App() {
  const containerRef = useRef(null);
  const skipRef = useRef(false);
  const audioRef = useRef(null);
  const startedRef = useRef(false);

  const tryPlayMusic = useCallback(() => {
    const el = audioRef.current;
    if (!el || startedRef.current) return;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { startedRef.current = true; }).catch(() => {});
    } else {
      startedRef.current = true;
    }
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
      <GalaxyScene containerRef={containerRef} skipRef={skipRef} onGalaxyVisible={tryPlayMusic} />
    </>
  );
}
