/**
 * Note Detection Module
 * Uses built-in pitch detection algorithms
 * Handles individual note detection, chord assembly, and note set management
 */

import { detectChord, chordTypes, getDiatonicTetrads, shouldUseFlats } from './pitch-utils.js';

// Simple pitch detection using autocorrelation (no external dependencies)

export class NoteDetection {
    constructor() {
        // Note detection state
        this.isActive = false;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.animationFrame = null;
        
        // Note tracking
        this.detectedNotes = new Map(); // noteKey -> {note, octave, pitch, confidence, timestamp, count}
        this.detectedChords = new Map(); // chordKey -> {chordName, rootNote, chordType, notes, pitches, count, timestamp}
        
        // Configuration
        this.confidenceThreshold = 0.3; // Lower threshold for easier detection
        this.sustainThreshold = 2; // Lower threshold for easier detection
        this.chordDetectionDelay = 500; // ms to wait after last note before chord detection
        
        // Callbacks
        this.onNoteDetected = null;
        this.onChordDetected = null;
        this.onStatusUpdate = null;
        
        // Chord detection timer
        this.chordDetectionTimer = null;
        
        // Key filtering
        this.limitToKey = false;
    }
    
    /**
     * Initialize audio context and microphone
     */
    async initAudio() {

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;
            
            this.microphone.connect(this.analyser);

            
            if (this.onStatusUpdate) {
                this.onStatusUpdate('Audio initialized successfully', 'success');
            }
            
            return true;
        } catch (error) {
            console.error('🎵 [NOTE-DETECTION] Failed to initialize audio:', error);
            if (this.onStatusUpdate) {
                this.onStatusUpdate('Failed to access microphone', 'error');
            }
            return false;
        }
    }
    
    /**
     * Start note detection
     */
    startDetection() {
        if (!this.analyser) {
            console.error('Audio not initialized');
            return false;
        }
        
        this.isActive = true;
        this.detectPitch();
        
        if (this.onStatusUpdate) {
            this.onStatusUpdate('Note detection started', 'info');
        }
        
        return true;
    }
    
    /**
     * Stop note detection
     */
    stopDetection() {
        this.isActive = false;
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        if (this.chordDetectionTimer) {
            clearTimeout(this.chordDetectionTimer);
            this.chordDetectionTimer = null;
        }
        
        // Stop the media stream to remove the microphone indicator
        if (this.microphone && this.microphone.mediaStream) {
            this.microphone.mediaStream.getTracks().forEach(track => {
                track.stop();
            });

        }
        
        if (this.onStatusUpdate) {
            this.onStatusUpdate('Note detection stopped', 'info');
        }
    }
    
    /**
     * Destroy and cleanup all resources
     */
    destroy() {
        this.stopDetection();
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        

    }
    
    /**
     * Main pitch detection loop using autocorrelation
     */
    detectPitch() {
        if (!this.isActive) return;
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Float32Array(bufferLength);
        this.analyser.getFloatTimeDomainData(dataArray);
        
        // Simple autocorrelation-based pitch detection
        const result = this.autocorrelatePitch(dataArray, this.audioContext.sampleRate);
        
        // Debug: Log some audio data occasionally
        if (Math.random() < 0.05) { // Log 5% of the time to see more data
            const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + val * val, 0) / dataArray.length);
            // console.log('🎵 [NOTE-DETECTION] Audio level:', rms.toFixed(4), 'Result:', result);
        }
        
        if (result && result.confidence > this.confidenceThreshold) {
            // Convert frequency to MIDI pitch
            const midiPitch = Math.round(12 * Math.log2(result.frequency / 440) + 69);
            
            // console.log('🎵 [NOTE-DETECTION] Pitch detected:', {
            //     frequency: result.frequency.toFixed(1),
            //     confidence: result.confidence.toFixed(3),
            //     midiPitch: midiPitch
            // });
            
            // Get note information
            const noteInfo = this.getNoteFromPitch(midiPitch);
            if (noteInfo) {
                this.processDetectedNote(noteInfo, midiPitch, result.confidence);
            }
        }
        
        this.animationFrame = requestAnimationFrame(() => this.detectPitch());
    }
    
    /**
     * Improved autocorrelation-based pitch detection
     */
    autocorrelatePitch(buffer, sampleRate) {
        const size = buffer.length;
        
        // Check if there's enough audio activity
        const rms = Math.sqrt(buffer.reduce((sum, val) => sum + val * val, 0) / size);
        if (rms < 0.05) {
            return null; // Too quiet - much higher threshold to filter noise
        }
        
        // Normalize the buffer
        const normalizedBuffer = new Float32Array(size);
        const maxVal = Math.max(...buffer.map(Math.abs));
        if (maxVal > 0) {
            for (let i = 0; i < size; i++) {
                normalizedBuffer[i] = buffer[i] / maxVal;
            }
        }
        
        const correlations = new Float32Array(size);
        
        // Calculate autocorrelation
        for (let lag = 0; lag < size; lag++) {
            let sum = 0;
            for (let i = 0; i < size - lag; i++) {
                sum += normalizedBuffer[i] * normalizedBuffer[i + lag];
            }
            correlations[lag] = sum;
        }
        
        // Find peaks in the autocorrelation
        const peaks = [];
        for (let i = 2; i < size / 2; i++) {
            if (correlations[i] > correlations[i-1] && 
                correlations[i] > correlations[i+1] && 
                correlations[i] > correlations[0] * 0.1) {
                peaks.push({ index: i, value: correlations[i] });
            }
        }
        
        if (peaks.length === 0) {
            return null;
        }
        
        // Sort peaks by value and take the strongest
        peaks.sort((a, b) => b.value - a.value);
        const bestPeak = peaks[0];
        
        // Calculate frequency from lag
        const frequency = sampleRate / bestPeak.index;
        
        // Calculate confidence based on correlation strength and peak sharpness
        const confidence = Math.min(1.0, bestPeak.value / correlations[0]);
        
        // Only return results for reasonable frequencies (80Hz - 2000Hz)
        if (frequency >= 80 && frequency <= 2000 && confidence > 0.05) {
            return { frequency, confidence };
        }
        
        return null;
    }
    
    /**
     * Process a detected note
     */
    processDetectedNote(noteInfo, pitch, confidence) {
        const noteKey = `${noteInfo.note}_${noteInfo.octave}`;
        const now = Date.now();
        
        if (this.detectedNotes.has(noteKey)) {
            // Update existing note
            const existing = this.detectedNotes.get(noteKey);
            existing.count++;
            existing.timestamp = now;
            existing.confidence = Math.max(existing.confidence, confidence);
        } else {
            // Add new note
            this.detectedNotes.set(noteKey, {
                note: noteInfo.note,
                octave: noteInfo.octave,
                pitch: pitch,
                confidence: confidence,
                timestamp: now,
                count: 1
            });
            
            // Trigger chord detection
            this.scheduleChordDetection();
            
            // Call note detected callback
            if (this.onNoteDetected) {
                this.onNoteDetected(noteInfo, pitch, confidence);
            }
        }
    }
    
    /**
     * Schedule chord detection after a delay
     */
    scheduleChordDetection() {
        // Disabled automatic chord detection - now handled by UI layer with filtering
        // if (this.chordDetectionTimer) {
        //     clearTimeout(this.chordDetectionTimer);
        // }
        
        // this.chordDetectionTimer = setTimeout(() => {
        //     this.detectChords();
        // }, this.chordDetectionDelay);
    }
    
    /**
     * Detect chords from current notes
     */
    detectChords() {
        const sustainedNotes = Array.from(this.detectedNotes.values())
            .filter(note => note.count >= this.sustainThreshold)
            .sort((a, b) => b.count - a.count)
            .slice(0, 6); // Top 6 notes
        

        
        if (sustainedNotes.length === 1) {
            // Single note detected - suggest chord from current key

            
            // Get the musical grid reference from the callback context
            // We'll need to pass this through from the UI layer
            if (this.onChordDetected) {
                // For now, we'll handle this in the UI layer

            }
            return;
        }
        
        if (sustainedNotes.length < 2) {

            return;
        }
        
        // Try different combinations of notes
        const combinations = this.generateNoteCombinations(sustainedNotes);

        
        let chordsFound = 0;
        for (const combination of combinations) {
            const chord = this.identifyChord(combination);
            if (chord) {

                this.addDetectedChord(chord, combination);
                chordsFound++;
            }
        }
        

    }
    
    /**
     * Generate note combinations for chord detection
     */
    generateNoteCombinations(notes) {
        const combinations = [];
        
        // Try 2-note combinations (for power chords)
        for (let i = 0; i <= notes.length - 2; i++) {
            for (let j = i + 1; j < notes.length; j++) {
                combinations.push([notes[i], notes[j]]);
            }
        }
        
        // Try 3-note combinations
        for (let i = 0; i <= notes.length - 3; i++) {
            for (let j = i + 1; j <= notes.length - 2; j++) {
                for (let k = j + 1; k < notes.length; k++) {
                    combinations.push([notes[i], notes[j], notes[k]]);
                }
            }
        }
        
        // Try 4-note combinations
        for (let i = 0; i <= notes.length - 4; i++) {
            for (let j = i + 1; j <= notes.length - 3; j++) {
                for (let k = j + 1; k <= notes.length - 2; k++) {
                    for (let l = k + 1; l < notes.length; l++) {
                        combinations.push([notes[i], notes[j], notes[k], notes[l]]);
                    }
                }
            }
        }
        

        
        return combinations;
    }
    

    
    /**
     * Identify chord from note combination using pitch-utils
     */
    identifyChord(notes) {
        // Convert notes to the format expected by detectChord
        const noteNames = notes.map(n => n.note);
        const actualPitches = notes.map(n => n.pitch);
        

        
        // Use the existing detectChord function from pitch-utils
        const chordMatches = detectChord(noteNames, chordTypes, actualPitches);
        

        
        // Test case: A major chord (A, C#, E)
        if (noteNames.includes('A') && noteNames.includes('C#') && noteNames.includes('E')) {

        }
        
        // Test case: Aø7sus4 chord (A, C, D, D#, G)
        if (noteNames.includes('A') && noteNames.includes('C') && noteNames.includes('D') && 
            noteNames.includes('D#') && noteNames.includes('G')) {

        }
        
        if (chordMatches && chordMatches.length > 0) {
            // Take the first (most common) match
            const bestMatch = chordMatches[0];

            
            return {
                rootNote: bestMatch.rootNote,
                chordType: bestMatch.chordType,
                chordName: bestMatch.chordName,
                fullName: bestMatch.fullName,
                notes: noteNames,
                pitches: actualPitches
            };
        }
        

        return null;
    }
    
    /**
     * Add detected chord to the list
     */
    addDetectedChord(chord, notes) {
        const chordKey = `${chord.rootNote}_${chord.chordType}_${notes.map(n => n.pitch).join('_')}`;
        const now = Date.now();
        
        if (this.detectedChords.has(chordKey)) {
            // Update existing chord
            const existing = this.detectedChords.get(chordKey);
            existing.count++;
            existing.timestamp = now;

        } else {
            // Add new chord
            this.detectedChords.set(chordKey, {
                ...chord,
                count: 1,
                timestamp: now
            });
            

            
            // Call chord detected callback
            if (this.onChordDetected) {
                this.onChordDetected(chord);
            }
        }
    }
    
    /**
     * Get note information from MIDI pitch
     */
    getNoteFromPitch(pitch) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const noteIndex = pitch % 12;
        const octave = Math.floor(pitch / 12) - 1;
        
        return {
            note: noteNames[noteIndex],
            octave: octave
        };
    }
    
    /**
     * Set callbacks
     */
    setCallbacks(onNoteDetected, onChordDetected, onStatusUpdate) {
        this.onNoteDetected = onNoteDetected;
        this.onChordDetected = onChordDetected;
        this.onStatusUpdate = onStatusUpdate;
    }
    

    
    /**
     * Get all detected notes
     */
    getDetectedNotes() {
        return Array.from(this.detectedNotes.values());
    }
    
    /**
     * Get all detected chords
     */
    getDetectedChords() {
        return Array.from(this.detectedChords.values());
    }
    
    /**
     * Clear all detected notes and chords
     */
    clearAll() {
        this.detectedNotes.clear();
        this.detectedChords.clear();
        
        if (this.chordDetectionTimer) {
            clearTimeout(this.chordDetectionTimer);
            this.chordDetectionTimer = null;
        }
    }
    
    /**
     * Remove a specific note
     */
    removeNote(noteKey) {
        this.detectedNotes.delete(noteKey);
    }
    
    /**
     * Remove a specific chord
     */
    removeChord(chordKey) {
        this.detectedChords.delete(chordKey);
    }
    
    /**
     * Set whether to limit detection to current key
     */
    setLimitToKey(limit) {
        this.limitToKey = limit;

    }
    
    /**
     * Detect chords from a specific set of notes (for filtering)
     */
    detectChordsFromNotes(notes) {
        if (notes.length < 2) {

            this.detectedChords.clear();
            return;
        }
        

        
        // Clear existing chords
        this.detectedChords.clear();
        
        // Use ALL notes at once (no combinations)
        const chord = this.identifyChord(notes);
        if (chord) {

            this.addDetectedChord(chord, notes);
        } else {

        }
    }
    
    /**
     * Clear all detected chords
     */
    clearChords() {
        this.detectedChords.clear();

    }
    
    /**
     * Suggest chord for single note using current key context
     */
    suggestChordForSingleNote(note, musicalGrid) {

        
        if (!musicalGrid || !musicalGrid.currentKey) {

            return null;
        }
        

        
        const rootNote = note.note;
        const keyRoot = musicalGrid.currentKey.rootNote;
        const keyType = musicalGrid.currentKey.name;
        

        
        // Get key notes using the same logic as createTetradFromRoot
        const keyData = musicalGrid.keys[keyType];
        if (!keyData) {

            return null;
        }
        
        const baseNoteIndex = musicalGrid.noteToPitchClass(keyRoot);
        const keyNotes = keyData.intervals.map(interval => {
            const noteIndex = (baseNoteIndex + interval) % 12;
            return musicalGrid.pitchClassToNote(noteIndex, shouldUseFlats(musicalGrid.noteToPitchClass(keyRoot), keyType));
        });
        

        
        // Find the key degree of the root note using the same logic as createTetradFromRoot
        const rootIndex = keyNotes.findIndex(note => musicalGrid.noteToPitchClass(note) === musicalGrid.noteToPitchClass(rootNote));
        

        
        if (rootIndex === -1) {
            // Note is not in the key (accidental), use dim7

            return {
                rootNote: rootNote,
                chordType: 'dim7',
                chordName: 'dim7',
                fullName: `${rootNote} dim7`,
                notes: [rootNote],
                pitches: [note.pitch],
                isSuggestion: true
            };
        }
        
        // Get the diatonic tetrad for this key degree using the same logic as createTetradFromRoot
        const diatonicTetrads = getDiatonicTetrads(keyType);
        const chordType = diatonicTetrads[rootIndex];
        

        
        // Generate the full chord notes
        const chordTypeData = musicalGrid.chordTypes[chordType];
        if (!chordTypeData) {

            return null;
        }
        
        const rootPitchClass = musicalGrid.noteToPitchClass(rootNote);
        const chordNotes = chordTypeData.intervals.map(interval => {
            const noteIndex = (rootPitchClass + interval) % 12;
            return musicalGrid.pitchClassToNote(noteIndex, false); // Use sharps for internal processing
        });
        
        // Calculate pitches for the chord notes
        const chordPitches = chordTypeData.intervals.map(interval => {
            return note.pitch + interval; // Use the detected note's pitch as base
        });
        

        
        const result = {
            rootNote: rootNote,
            chordType: chordType,
            chordName: chordType,
            fullName: `${rootNote} ${chordType}`,
            notes: chordNotes,
            pitches: chordPitches,
            isSuggestion: true
        };
        

        return result;
    }
} 