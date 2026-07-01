import { CONFIG } from '../core/config.js';

export class AudioEngine {
    constructor() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        
        // Master Gain to prevent global clipping
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.7; // Headroom
        this.masterGain.connect(this.ctx.destination);

        this.lastPlayTime = 0;
        this.cooldown = 0.008; // 8ms cooldown for rapid sequential impacts
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playCollision(event) {
        const now = this.ctx.currentTime;
        
        // Cooldown check (Spam Prevention)
        if (now - this.lastPlayTime < this.cooldown) return;
        this.lastPlayTime = now;

        // --- Physical Audio Mappings ---
        const impulse = Math.min(Math.max(event.impulse, 0), 10.0);
        if (impulse < 0.05) return; // Ignore micro-collisions noise

        const volume = Math.min(impulse * 0.25, 1.0);
        const pitchMult = 0.8 + impulse * 0.15;
        const resonance = Math.sqrt(impulse);

        // Spatial Audio Layer (Stereo Panning based on X Position)
        // Normalize position based on system width (approx -5 to 5)
        const panValue = Math.max(-1, Math.min(1, event.pos.x / ((CONFIG.N * CONFIG.D) / 2)));
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = panValue;
        panner.connect(this.masterGain);

        // Trigger Layers
        this.playTransient(now, volume, panner);
        this.playMetalResonance(now, volume, pitchMult, resonance, panner);
        this.playWavePropagation(now, volume, event.dir, panner);
    }

    // Layer A: Impact transient (Sharp click/attack)
    playTransient(time, vol, outputNode) {
        const bufferSize = this.ctx.sampleRate * 0.05; // 50ms burst
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            // White noise with exponential decay baked in
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
        }

        const noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = buffer;

        // Highpass filter for that "click" sound
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 5000;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol * 0.8, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

        // Connect
        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(outputNode);

        noiseSource.start(time);
    }

    // Layer B & C: Metal resonance and body vibration
    playMetalResonance(time, vol, pitchMult, res, outputNode) {
        // Typical modal frequencies for a steel ball impact
        const frequencies = [600, 1400, 3200, 4800];
        const baseDuration = 0.1 + res * 0.4;

        frequencies.forEach((freq, index) => {
            const osc = this.ctx.createOscillator();
            osc.type = index === 0 ? 'sine' : 'triangle'; // Fundamental is sine, overtones are triangle
            osc.frequency.value = freq * pitchMult;

            const gain = this.ctx.createGain();
            // Higher frequencies have lower volume and shorter decay
            const overtoneDecay = baseDuration / (index + 1);
            const overtoneVol = vol * (0.4 / (index + 1));

            gain.gain.setValueAtTime(overtoneVol, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + overtoneDecay);

            osc.connect(gain);
            gain.connect(outputNode);

            osc.start(time);
            osc.stop(time + overtoneDecay);
        });

        // Layer C: Low frequency thud
        const bodyOsc = this.ctx.createOscillator();
        bodyOsc.type = 'sine';
        bodyOsc.frequency.value = 120 * pitchMult;
        
        const bodyGain = this.ctx.createGain();
        bodyGain.gain.setValueAtTime(vol * 0.5, time);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

        bodyOsc.connect(bodyGain);
        bodyGain.connect(outputNode);
        
        bodyOsc.start(time);
        bodyOsc.stop(time + 0.15);
    }

    // Layer D: Wave propagation ambience (Subtle pressure sweep)
    playWavePropagation(time, vol, dir, outputNode) {
        const sweepOsc = this.ctx.createOscillator();
        sweepOsc.type = 'sine';

        const startFreq = dir > 0 ? 300 : 800;
        const endFreq = dir > 0 ? 800 : 300;

        sweepOsc.frequency.setValueAtTime(startFreq, time);
        sweepOsc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.12);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol * 0.15, time + 0.03);
        gain.gain.linearRampToValueAtTime(0.001, time + 0.12);

        // Independent spatial sweep for the wave
        const sweepPanner = this.ctx.createStereoPanner();
        sweepPanner.pan.setValueAtTime(dir > 0 ? -0.4 : 0.4, time);
        sweepPanner.pan.linearRampToValueAtTime(dir > 0 ? 0.4 : -0.4, time + 0.12);

        sweepOsc.connect(gain);
        gain.connect(sweepPanner);
        sweepPanner.connect(this.masterGain);

        sweepOsc.start(time);
        sweepOsc.stop(time + 0.12);
    }
}