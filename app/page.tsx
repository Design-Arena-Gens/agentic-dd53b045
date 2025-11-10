"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Segment = {
  id: string;
  start: number; // seconds inclusive
  end: number;   // seconds exclusive
  label: string;
  caption?: string;
};

const SEGMENTS: Segment[] = [
  { id: "intro", start: 0, end: 8, label: "Intro", caption: "In the lanes of Allahabad, where love met sacrifice, lived a man ? Chander." },
  { id: "love", start: 9, end: 18, label: "Love Blooms", caption: "Chander? tum itne chup kyu rehte ho?" },
  { id: "conflict", start: 19, end: 32, label: "Conflict", caption: "He loved her ? deeply, silently, purely?" },
  { id: "outro", start: 32, end: 60, label: "Epilogue", caption: "Some letters are never sent. Some loves never fade." },
];

function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{ master: GainNode; rain: GainNode; noise: AudioBufferSourceNode | null; } | null>(null);
  const timersRef = useRef<number[]>([]);

  const createNoiseBuffer = useCallback((ctx: AudioContext) => {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.2;
    }
    return buffer;
  }, []);

  const start = useCallback(async () => {
    let ctx = ctxRef.current;
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctxRef.current = ctx;
    }
    if (ctx.state === 'suspended') await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);

    // Ambient drone (tanpura-like)
    const drone = ctx.createOscillator();
    const droneGain = ctx.createGain();
    drone.type = 'sine';
    drone.frequency.value = 146.83; // D3-ish
    droneGain.gain.value = 0.06;
    drone.connect(droneGain).connect(master);
    drone.start();

    const drone2 = ctx.createOscillator();
    const drone2Gain = ctx.createGain();
    drone2.type = 'sine';
    drone2.frequency.value = 293.66; // D4-ish
    drone2Gain.gain.value = 0.04;
    drone2.connect(drone2Gain).connect(master);
    drone2.start();

    // Simple pluck pattern for intro/love
    const playPluck = (time: number, freq: number, length = 0.8) => {
      const osc = ctx!.createOscillator();
      const g = ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0, time);
      g.gain.linearRampToValueAtTime(0.18, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + length);
      osc.connect(g).connect(master);
      osc.start(time);
      osc.stop(time + length + 0.05);
    };

    // Rain noise for conflict
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.0;
    rainGain.connect(master);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = createNoiseBuffer(ctx);
    noiseSrc.loop = true;
    noiseSrc.connect(rainGain);
    noiseSrc.start();

    nodesRef.current = { master, rain: rainGain, noise: noiseSrc };

    const now = ctx.currentTime + 0.1;
    // Schedule first 20s of gentle plucks
    for (let i = 0; i < 20; i++) {
      const t = now + i * 1.2;
      const base = i < 8 ? 220 : 261.63; // intro lower, love a bit higher
      playPluck(t, base);
      if (i % 4 === 0) playPluck(t + 0.4, base * 1.5, 0.6);
    }

    // Bring in rain during conflict (19s)
    rainGain.gain.setTargetAtTime(0.0, now, 0.01);
    rainGain.gain.setTargetAtTime(0.18, now + 19, 0.6);
    rainGain.gain.setTargetAtTime(0.05, now + 32, 1.2);

    // Fade master near end
    master.gain.setTargetAtTime(0.6, now, 0.5);
    master.gain.setTargetAtTime(0.15, now + 56, 1.5);
  }, [createNoiseBuffer]);

  const stop = useCallback(async () => {
    const ctx = ctxRef.current;
    nodesRef.current?.noise?.stop();
    if (ctx) {
      try { await ctx.close(); } catch {}
    }
    ctxRef.current = null;
    nodesRef.current = null;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  return { start, stop };
}

function speak(text: string, lang = 'hi-IN') {
  if (typeof window === 'undefined') return;
  const supports = 'speechSynthesis' in window;
  if (!supports) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  u.pitch = 1.0;
  window.speechSynthesis.speak(u);
}

export default function Page() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [t, setT] = useState(0); // seconds elapsed
  const startAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const { start, stop } = useAudioEngine();

  const currentSegment = useMemo(() => SEGMENTS.find(s => t >= s.start && t < s.end) ?? SEGMENTS[SEGMENTS.length - 1], [t]);

  const begin = useCallback(async () => {
    await start();
    startAtRef.current = performance.now();
    setIsPlaying(true);

    speak("In the lanes of Allahabad, where love met sacrifice, lived a man ? Chander.", 'en-IN');
    setTimeout(() => speak("Chander? tum itne chup kyu rehte ho?", 'hi-IN'), 9000);
    setTimeout(() => speak("He loved her ? deeply, silently, purely?", 'en-IN'), 19000);
  }, [start]);

  const end = useCallback(async () => {
    await stop();
    setIsPlaying(false);
    setT(0);
    startAtRef.current = null;
  }, [stop]);

  useEffect(() => {
    if (!isPlaying) return;
    const loop = () => {
      const now = performance.now();
      const started = startAtRef.current ?? now;
      const elapsedSec = Math.min(60, (now - started) / 1000);
      setT(elapsedSec);
      if (elapsedSec >= 60) {
        setIsPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying]);

  const progressPct = Math.min(100, (t / 60) * 100);

  return (
    <div className="container">
      <header className="header">
        <div className="brand">Gunahon Ka Devta ? Cinematic Reel</div>
        <div style={{opacity:0.7, fontSize:12}}>00:00 ? 01:00</div>
      </header>
      <main className="main">
        <div className="panel" aria-label="Reel frame" role="region">
          <div className="badge">{currentSegment.label}</div>
          <Scene t={t} />
          <div className="overlay-fade" />
          <div className="caption">{currentSegment.caption}</div>
        </div>
      </main>
      <footer className="controls">
        <button className="button" onClick={isPlaying ? end : begin}>
          {isPlaying ? 'Stop' : 'Start' }
        </button>
        <div className="timeline" aria-label="Timeline">
          <div className="progress" style={{ width: `${progressPct}%` }} />
        </div>
        <button className="button" onClick={() => window.location.reload()}>Reset</button>
      </footer>
    </div>
  );
}

function Scene({ t }: { t: number }) {
  if (t < 8) return <IntroScene />;
  if (t < 18) return <LoveScene />;
  if (t < 32) return <ConflictScene />;
  return <OutroScene />;
}

function IntroScene() {
  return (
    <div className="scene sunrise">
      <div className="sun" />
      <div className="horizon" />
      <div className="book">
        <div className="book-shape">
          <div className="page p1" />
          <div className="page p2" />
          <div className="page p3" />
        </div>
      </div>
    </div>
  );
}

function LoveScene() {
  return (
    <div className="scene corridor">
      <div className="light" />
      <div className="pillars">
        {Array.from({ length: 7 }).map((_, i) => (
          <div className="pillar" key={i} />
        ))}
      </div>
      <div className="char m" />
      <div className="char f" />
      <div className="book-prop" />
    </div>
  );
}

function ConflictScene() {
  return (
    <div className="scene desk">
      <div className="letter">
        ????? ????,
        <br />
        ??? ????? ??? ?? ?? ???? ?????
        <br />
        ???? ?? ????? ??? ???
      </div>
      <div className="pen" />
      <div className="rain" />
    </div>
  );
}

function OutroScene() {
  return (
    <div className="scene sunrise" style={{ filter: 'grayscale(0.2) contrast(1.1)' }}>
      <div className="sun" />
      <div className="horizon" />
      <div className="book" style={{ opacity: 0.5 }}>
        <div className="book-shape">
          <div className="page p3" />
        </div>
      </div>
    </div>
  );
}
