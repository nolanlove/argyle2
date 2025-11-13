// Audio Manager Module
// Handles all audio-related functionality including Tone.js, MIDI, and playback

import * as PitchUtils from './pitch-utils.js';
import { pitchToNoteAndOctave } from './pitch-utils.js';

export class AudioManager {
    constructor() {
        // Tone.js audio system
        this.piano = null;
        this.melodyPiano = null;
        this.chordPiano = null;
        this.reverb = null;
        
        // Audio state
        this.audioContext = null;
        this.audioReady = false;
        this.hasUserInteracted = false;
        this.forceAudioInit = false;
        
        // MIDI system
        this.midiAccess = null;
        this.midiOutputs = [];
        this.midiOutput = null;
        
        // Playback state
        this.currentNotes = [];
        this.currentlyPlayingNotes = new Set();
        this.sustainPedalActive = false;
        
        // Key playback
            this.isPlayingScale = false;
    this.scalePlaybackIndex = 0;
    this.scalePlaybackTimer = null;
        this.keyPlaybackPattern = [];
        
        // Sequencer playback
        this.isSequencePlaying = false;
        this.isPlaying = false;
        this.sequencerInterval = 1000;
        this.sequencerTimer = null;
    }

    // Initialize Tone.js audio system
    async initAudio() {
        const startTime = performance.now();

        
        // Start audio context first
        if (Tone.context.state !== 'running') {
            const contextStartTime = performance.now();
            try {
                await Tone.start();
                const contextEndTime = performance.now();

            } catch (error) {
                console.error('🎵 [AUDIO] Failed to start audio context:', error);
                return;
            }
        }
        
        if (!this.piano) {
            const pianoStartTime = performance.now();

            
            // Create chord piano sampler (lower volume for accompaniment)
            this.piano = new Tone.Sampler({
                urls: {
                    "C2": "C2.mp3",
                    "C3": "C3.mp3",
                    "C4": "C4.mp3",
                    "C5": "C5.mp3",
                    "D#2": "Ds2.mp3",
                    "D#3": "Ds3.mp3", 
                    "D#4": "Ds4.mp3",
                    "D#5": "Ds5.mp3",
                    "F#2": "Fs2.mp3",
                    "F#3": "Fs3.mp3",
                    "F#4": "Fs4.mp3",
                    "F#5": "Fs5.mp3",
                },
                baseUrl: "https://tonejs.github.io/audio/salamander/",
                onload: () => {
                    const loadEndTime = performance.now();

                    this.audioReady = true;
                    
                    // Pre-warm the audio context by playing a silent note
                    const preWarmStart = performance.now();
                    const originalVolume = this.piano.volume.value;
                    this.piano.volume.value = -Infinity; // Mute for pre-warm
                    this.piano.triggerAttackRelease("C4", 0.001);
                    this.piano.volume.value = originalVolume; // Restore volume
                    const preWarmEnd = performance.now();

                },
                onerror: (error) => {
                    console.error('🎵 [AUDIO] Error loading chord piano samples:', error);
                    // Fallback to basic oscillator if samples fail to load
                    this.createFallbackOscillator();
                    this.audioReady = true;
                }
            }).toDestination();
            
            // Create melody piano sampler (higher volume for lead melody)
            this.melodyPiano = new Tone.Sampler({
                urls: {
                    "C2": "C2.mp3",
                    "C3": "C3.mp3",
                    "C4": "C4.mp3",
                    "C5": "C5.mp3",
                    "D#2": "Ds2.mp3",
                    "D#3": "Ds3.mp3", 
                    "D#4": "Ds4.mp3",
                    "D#5": "Ds5.mp3",
                    "F#2": "Fs2.mp3",
                    "F#3": "Fs3.mp3",
                    "F#4": "Fs4.mp3",
                    "F#5": "Fs5.mp3",
                },
                baseUrl: "https://tonejs.github.io/audio/salamander/",
                onload: () => {

                },
                onerror: (error) => {
                    console.error('🎵 [AUDIO] Error loading melody piano samples:', error);
                }
            }).toDestination();
            
            // Add reverb for better sound quality
            this.reverb = new Tone.Reverb({
                decay: 1.5,
                wet: 0.3
            }).toDestination();
            
            // Connect both pianos to reverb
            this.piano.connect(this.reverb);
            this.melodyPiano.connect(this.reverb);
            
            // Set different volumes for chord vs melody
            this.piano.volume.value = -6; // Lower volume for chords (accompaniment)
            this.melodyPiano.volume.value = 0; // Higher volume for melody (lead)
            
            // Set a shorter timeout to mark audio as ready
            setTimeout(() => {
                if (!this.audioReady) {
                    const timeoutTime = performance.now();

                    this.audioReady = true;
                }
            }, 1000);
        }
        
        const endTime = performance.now();

    }

    // Fallback oscillator if piano samples fail to load
    createFallbackOscillator() {
        // Create a better-sounding fallback with multiple oscillators
        this.piano = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: "sine"
            },
            envelope: {
                attack: 0.02,
                decay: 0.1,
                sustain: 0.3,
                release: 1
            },
            volume: -12
        }).toDestination();
        
        // Add some reverb to the fallback
        this.reverb = new Tone.Reverb({
            decay: 1.0,
            wet: 0.2
        }).toDestination();
        
        this.piano.connect(this.reverb);
        console.log('Using improved fallback synthesizer');
        this.audioReady = true;
    }

    // Ensure audio is ready for playback
    ensureAudioReady() {
        // Ensure audio context is ready and resumed
        if (!this.audioContext) {
            this.initAudio();
        } else if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        // Reinitialize MIDI if needed
        if (!this.midiOutput) {
            this.initMIDI();
        }
    }

    // Play a single note using Tone.js
    playNote(note, octave = 3, duration = 2.0) {
        const startTime = performance.now();
        

        
        if (!this.piano || !this.audioReady) {

            return null;
        }
        
        // Create note name with octave (e.g., "C3", "D#4")
        const noteName = `${note}${octave}`;
        
        try {
            const playStartTime = performance.now();
            
            // Play the note using Tone.js piano with immediate scheduling
            this.piano.triggerAttackRelease(noteName, duration, Tone.now());
            const playEndTime = performance.now();
            

            
            return { note: noteName, duration: duration };
        } catch (error) {
            const errorTime = performance.now();
            console.error('🎵 [PLAY] Error playing note:', {
                note: noteName,
                error: error,
                duration: errorTime - startTime
            });
            return null;
        }
    }

    // Play chord notes (requires chordNotes and actualClickedNotes from MusicalGrid)
    async playActiveNotes(chordNotes, actualClickedNotes, getPitchAt) {
        const startTime = performance.now();

        
        // Check if there are chord notes to play
        if (chordNotes.size === 0) {

            return;
        }
        
        // Ensure audio is initialized and ready
        const audioCheckStart = performance.now();
        this.ensureAudioReady();
        if (!this.piano || !this.audioReady) {

            await this.initAudio();
        }
        const audioCheckEnd = performance.now();

        
        this.currentNotes = [];
        const playStartTime = performance.now();
        
        // Play each chord note at its exact highlighted position
        chordNotes.forEach((noteWithOctave, index) => {
            const noteStartTime = performance.now();
            const actualCoord = actualClickedNotes.get(noteWithOctave);
            if (actualCoord) {
                // Get the exact pitch at the highlighted coordinate
                const pitch = getPitchAt(actualCoord.x, actualCoord.y);
                // Extract just the pitch class (without octave) for playNote
                const pitchClass = noteWithOctave.replace(/\d+$/, '');
                const noteData = this.playNote(pitchClass, pitch.octave, 2.4);
                if (noteData) {
                    this.currentNotes.push(noteData);
                }
            } else {
                // Fallback to default octave if no coordinate found
                const pitchClass = noteWithOctave.replace(/\d+$/, '');
                const noteData = this.playNote(pitchClass, 3, 2.4);
                if (noteData) {
                    this.currentNotes.push(noteData);
                }
            }
            const noteEndTime = performance.now();

        });
        
        const playEndTime = performance.now();

        
        // Send MIDI data if available
        const midiStartTime = performance.now();
        this.sendMIDINotes(chordNotes, actualClickedNotes, getPitchAt);
        const midiEndTime = performance.now();

    }

    // Stop all playing notes
    stopPlaying(onUIUpdate = null) {
        // Stop all notes using Tone.js
        if (this.piano) {
            this.piano.releaseAll();
        }
        
        this.currentNotes = [];
        
        // Stop MIDI notes
        this.stopMIDINotes();
        
        // Stop sequencer timer
        this.stopSequencerTimer();
        
        // Update playing state
        this.isPlaying = false;
        
        // Call UI update callback if provided
        if (onUIUpdate && typeof onUIUpdate === 'function') {
            onUIUpdate();
        }
    }

    // Play a set of pitches (coordinates)
    playPitches(pitches, duration = 2.0) {

        
        if (!pitches || pitches.length === 0) {

            return;
        }
        
        // Stop any currently playing notes
        this.stopPlaying();
        
        // Play all pitches simultaneously for better chord sound
        pitches.forEach(pitch => {
            if (pitch !== undefined && pitch !== null) {

                this.playPitch(pitch, duration);
            } else {

            }
        });
    }

    playPitch(pitch, duration = 2.0) {
        // Convert numeric pitch to note and octave using utility function
        const { note, octave } = pitchToNoteAndOctave(pitch);
        

        this.playNote(note, octave, duration);
    }

    // Initialize MIDI
    async initMIDI() {
        if (!navigator.requestMIDIAccess) {
            console.log('MIDI not supported');
            return;
        }
        
        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            this.midiOutputs = Array.from(this.midiAccess.outputs.values());
            console.log('MIDI outputs:', this.midiOutputs.length);
        } catch (error) {
            console.log('MIDI access denied:', error);
        }
    }

    // Send MIDI note on messages (chord notes only)
    sendMIDINotes(chordNotes, actualClickedNotes, getPitchAt) {
        if (!this.midiOutputs.length) return;
        
        const output = this.midiOutputs[0]; // Use first available output
        const channel = 0;
        const velocity = 100;
        
        chordNotes.forEach(note => {
            const actualCoord = actualClickedNotes.get(note);
            if (actualCoord) {
                // Get the exact pitch at the highlighted coordinate
                const pitch = getPitchAt(actualCoord.x, actualCoord.y);
                output.send([0x90 + channel, pitch.pitch, velocity]); // Note on
            } else {
                // Fallback to default octave if no coordinate found
                const noteIndex = PitchUtils.noteToPitchClass(note);
                if (noteIndex !== -1) {
                    const midiNote = 48 + noteIndex; // C3 = 48
                    output.send([0x90 + channel, midiNote, velocity]); // Note on
                }
            }
        });
    }

    // Stop MIDI notes (chord notes only)
    stopMIDINotes() {
        if (!this.midiOutputs.length) return;
        
        const output = this.midiOutputs[0];
        const channel = 0;
        
        // Note: This method needs chordNotes to be passed in, but for now we'll handle it differently
        // The actual implementation will need to be updated when this is integrated
    }

    // Send single MIDI note with octave
    sendMIDINoteWithOctave(note, octave) {
        if (!this.midiOutputs.length) return;
        
        const output = this.midiOutputs[0];
        const channel = 0;
        const velocity = 100;
        
        const noteIndex = PitchUtils.noteToPitchClass(note);
        if (noteIndex !== -1) {
            const midiNote = (octave * 12) + noteIndex;
            output.send([0x90 + channel, midiNote, velocity]); // Note on
            
            // Send note off after 600ms
            setTimeout(() => {
                output.send([0x80 + channel, midiNote, 0]); // Note off
            }, 600);
        }
    }

    // Send single MIDI note (legacy method for chord playback)
    sendMIDINote(note) {
        this.sendMIDINoteWithOctave(note, 3); // Default to octave 3
    }

            // Play scale sequentially
        playScaleSequentially(activeNotes, keyRootSelect, keyTypeSelect) {
            if (this.isPlayingScale) {
                this.stopScalePlayback();
            return;
        }
        
        if (activeNotes.size === 0) {
            return;
        }
        
        this.isPlayingScale = true;
        this.scalePlaybackIndex = 0;
        
        // Get the root note and key type for proper octave calculation
        const rootNote = keyRootSelect ? keyRootSelect.value.split('/')[0] : 'C';
        const keyType = keyTypeSelect ? keyTypeSelect.value : 'major';
        
        // Create the full scale pattern with octaves
        this.scalePlaybackPattern = this.createScalePatternWithOctaves(rootNote, keyType);
        
        // Start sequential playback
        this.playNextScaleNoteWithOctaves();
    }

    // Create scale pattern with proper octaves (repeated 3 times)
    createScalePatternWithOctaves(rootNote, keyType) {
        const keyRootIndex = PitchUtils.noteToPitchClass(rootNote);
        if (keyRootIndex === -1) return [];
        
        const keys = PitchUtils.keys;
        const keyData = keys[keyType];
        if (!keyData) return [];
        
        const keyPattern = [];
        
        // Repeat the key pattern 3 times
        for (let repeat = 0; repeat < 3; repeat++) {
            const lowOctave = 2; // Start from octave 2
            const highOctave = 3; // End at octave 3
            
            // Add two full octaves
            for (let octave = lowOctave; octave <= highOctave; octave++) {
                keyData.intervals.forEach(interval => {
                    const noteIndex = (keyRootIndex + interval) % 12;
                    const note = PitchUtils.pitchClassToNote(noteIndex, false); // Use sharps for internal processing
                    keyPattern.push({ note, octave });
                });
            }
            
            // Add final tonic note in octave 4
            const finalTonic = PitchUtils.pitchClassToNote(keyRootIndex, false); // Use sharps for internal processing
            keyPattern.push({ note: finalTonic, octave: 4 });
        }
        
        return keyPattern;
    }

            // Play next note in scale sequence with proper octaves
    playNextScaleNoteWithOctaves() {
        if (!this.isPlayingScale || this.scalePlaybackIndex >= this.scalePlaybackPattern.length) {
            this.stopScalePlayback();
            return;
        }
        
        const { note, octave } = this.scalePlaybackPattern[this.scalePlaybackIndex];
        const noteData = this.playNote(note, octave, 0.8); // Use the correct octave
        
        if (noteData) {
            this.currentNotes.push(noteData);
        }
        
        // Send MIDI note with correct octave
        this.sendMIDINoteWithOctave(note, octave);
        
        // Schedule next note
        this.scalePlaybackTimer = setTimeout(() => {
            this.scalePlaybackIndex++;
            this.playNextScaleNoteWithOctaves();
        }, 600); // 600ms between notes (100 BPM)
    }

    // Stop scale playback
    stopScalePlayback() {
        this.isPlayingScale = false;
        
        if (this.scalePlaybackTimer) {
            clearTimeout(this.scalePlaybackTimer);
            this.scalePlaybackTimer = null;
        }
        
        // Stop all notes using Tone.js
        if (this.piano) {
            this.piano.releaseAll();
        }
        
        this.currentNotes = [];
        
        // Stop MIDI notes
        this.stopMIDINotes();
    }

    // Start sequencer timer
    startSequencerTimer() {
        this.stopSequencerTimer(); // Clear any existing timer
        
        this.sequencerTimer = setInterval(() => {
            // This will be handled by the main MusicalGrid class
            // The timer just needs to exist for coordination
        }, this.sequencerInterval);
    }

    // Stop sequencer timer
    stopSequencerTimer() {
        if (this.sequencerTimer) {
            clearInterval(this.sequencerTimer);
            this.sequencerTimer = null;
        }
    }

    // Adjust sequencer speed
    adjustSpeed(delta) {
        const newInterval = Math.max(200, Math.min(3000, this.sequencerInterval + delta));
        this.sequencerInterval = newInterval;
        
        // Restart timer with new interval if currently playing
        if (this.isPlaying) {
            this.startSequencerTimer();
        }
    }

    // Tap note (for sustain behavior)
    tapNote(note, octave = null) {
        const startTime = performance.now();
        const playOctave = octave !== null ? octave : 3;
        const noteName = `${note}${playOctave}`;
        

        
        // Ensure audio is ready
        this.ensureAudioReady();
        
        if (!this.melodyPiano || !this.audioReady) {

            return;
        }
        
        try {
            const playStartTime = performance.now();
            
            // Use melody piano for tapped notes (already at higher volume)
            this.melodyPiano.triggerAttack(noteName, Tone.now());
            this.currentlyPlayingNotes.add(noteName);
            
            const playEndTime = performance.now();
            

        } catch (error) {
            console.error('🎵 [TAP] Error starting note:', {
                note: noteName,
                error: error
            });
        }
    }

    // Release a specific note
    releaseNote(note, octave = null) {
        const playOctave = octave !== null ? octave : 3;
        const noteName = `${note}${playOctave}`;
        
        // If sustain pedal is active, don't release the note yet
        if (this.sustainPedalActive) {

            return;
        }
        
        if (this.currentlyPlayingNotes.has(noteName)) {
            try {
                this.melodyPiano.triggerRelease(noteName, Tone.now());
                this.currentlyPlayingNotes.delete(noteName);

            } catch (error) {
                console.error('🎵 [RELEASE] Error releasing note:', {
                    note: noteName,
                    error: error
                });
            }
        }
    }

    // Release all currently playing notes
    releaseAllNotes() {
        this.currentlyPlayingNotes.forEach(noteName => {
            try {
                this.melodyPiano.triggerRelease(noteName, Tone.now());

            } catch (error) {
                console.error('🎵 [RELEASE] Error releasing note:', {
                    note: noteName,
                    error: error
                });
            }
        });
        this.currentlyPlayingNotes.clear();
    }

    // Release sustain pedal - release all currently playing notes
    releaseSustainPedal() {
        if (this.sustainPedalActive) {

            this.sustainPedalActive = false;
            this.releaseAllNotes();
        }
    }

    // Play chord audio for musical typing
    playChordAudio(rootNote, chordType, chordNotes, actualClickedNotes, getPitchAt) {
        // Ensure audio is ready
        this.ensureAudioReady();
        
        // Use the actual chord notes with octaves from the grid
        const chordNotesWithOctaves = Array.from(chordNotes);
        if (!chordNotesWithOctaves || chordNotesWithOctaves.length === 0) {

            return;
        }
        

        
        // Play all notes simultaneously as a chord using optimized pitch system
        chordNotesWithOctaves.forEach((noteWithOctave) => {
            // Extract note and octave from "D3" format
            const match = noteWithOctave.match(/^([A-G]#?b?)(\d+)$/);
            if (match) {
                const [, note, octave] = match;
                const pitch = PitchUtils.getPitchFromNote(note, parseInt(octave));

                this.playNote(note, parseInt(octave), 2.0);
            } else {
                // Fallback to default octave if parsing fails

                this.playNote(noteWithOctave, 3, 2.0);
            }
        });
    }

    // Get audio state
    getAudioState() {
        return {
            audioReady: this.audioReady,
            hasUserInteracted: this.hasUserInteracted,
            forceAudioInit: this.forceAudioInit,
            isPlaying: this.isPlaying,
            isPlayingScale: this.isPlayingScale,
            isSequencePlaying: this.isSequencePlaying,
            currentlyPlayingNotes: Array.from(this.currentlyPlayingNotes),
            sustainPedalActive: this.sustainPedalActive
        };
    }

    // Set audio state
    setAudioState(state) {
        this.audioReady = state.audioReady || false;
        this.hasUserInteracted = state.hasUserInteracted || false;
        this.forceAudioInit = state.forceAudioInit || false;
        this.isPlaying = state.isPlaying || false;
        this.isPlayingScale = state.isPlayingScale || false;
        this.isSequencePlaying = state.isSequencePlaying || false;
        this.sustainPedalActive = state.sustainPedalActive || false;
        
        if (state.currentlyPlayingNotes) {
            this.currentlyPlayingNotes = new Set(state.currentlyPlayingNotes);
        }
    }
} 