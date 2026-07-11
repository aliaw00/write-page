// Synthesize typewriter sounds using Web Audio API

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playKeyClick() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // We synthesize a mechanical typing click with an oscillator and filter
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    // Slightly randomize frequency to sound more natural
    osc.frequency.setValueAtTime(150 + Math.random() * 100, now);
    
    // Fast frequency sweep down
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.05);

    // Bandpass filter to make it "hollow" and "clicky"
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.Q.setValueAtTime(5, now);

    // Exponential volume decay
    gainNode.gain.setValueAtTime(0.08, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  } catch (err) {
    // Ignore audio context errors (e.g., user interaction gesture policy)
  }
}

export function playBell() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // A bell sound uses multiple sine waves (overtones)
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.0, now);
    gainNode.gain.linearRampToValueAtTime(0.12, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    // Principal frequency
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1100, now); // ~C6

    // Overtone
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1650, now); // Perfect 5th overtone

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(400, now);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    
    osc1.stop(now + 0.8);
    osc2.stop(now + 0.8);
  } catch (err) {
    // Ignore audio context errors
  }
}
