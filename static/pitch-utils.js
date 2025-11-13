/**
 * Pitch System Utilities
 * ES6 Module - works in both Node.js and browsers
 * 
 * Note: Our pitch values follow MIDI pitch convention where C2 = 36, C4 = 60, etc.
 * This allows direct mapping to MIDI note numbers while keeping the API simple.
 * 
 * Features:
 * - Input validation and error handling
 * - Comprehensive musical theory support
 * - Grid coordinate system integration
 * - Chord and key detection
 * - Pitch class and note name conversions
 */

'use strict';

    // Musical notes in chromatic order (C to B)
    const musicalNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const musicalNotesFlats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // Chord types with their interval patterns
    const chordTypes = {
        // Most common chords first (by frequency of use in popular music/jazz)
        
        // Basic triads (most fundamental)
        'maj': { name: '', intervals: [0, 4, 7], commonness: 10 },
        'min': { name: 'm', intervals: [0, 3, 7], commonness: 10 },
        'dim': { name: 'dim', intervals: [0, 3, 6], commonness: 6 },
        'aug': { name: 'aug', intervals: [0, 4, 8], commonness: 4 },
        
        // 7th chords (very common in jazz/pop)
        'min7': { name: 'min7', intervals: [0, 3, 7, 10], commonness: 9 },
        'dom7': { name: '7', intervals: [0, 4, 7, 10], commonness: 9 },
        'maj7': { name: 'maj7', intervals: [0, 4, 7, 11], commonness: 8 },
        'half-dim7': { name: 'ø7', intervals: [0, 3, 6, 10], commonness: 7 },
        'dim7': { name: 'dim7', intervals: [0, 3, 6, 9], commonness: 6 },
        'minmaj7': { name: 'minmaj7', intervals: [0, 3, 7, 11], commonness: 5 },
        'maj7#5': { name: 'maj7#5', intervals: [0, 4, 8, 11], commonness: 4 },
        'min7b5': { name: 'min7b5', intervals: [0, 3, 6, 10], commonness: 4 },
        
        // Extended chords (common in jazz)
        'dom9': { name: '9', intervals: [0, 4, 7, 10, 14], commonness: 7 },
        'maj9': { name: 'maj9', intervals: [0, 4, 7, 11, 14], commonness: 6 },
        'min9': { name: 'min9', intervals: [0, 3, 7, 10, 14], commonness: 6 },
        'dom13': { name: '13', intervals: [0, 4, 7, 10, 14, 21], commonness: 6 },
        'maj13': { name: 'maj13', intervals: [0, 4, 7, 11, 14, 21], commonness: 5 },
        'min13': { name: 'min13', intervals: [0, 3, 7, 10, 14, 21], commonness: 5 },
        'maj11': { name: 'maj11', intervals: [0, 4, 7, 11, 14, 17], commonness: 4 },
        'min11': { name: 'min11', intervals: [0, 3, 7, 10, 14, 17], commonness: 4 },
        'dom11': { name: '11', intervals: [0, 4, 7, 10, 14, 17], commonness: 4 },
        
        // Altered chords (jazz)
        'dom7#9': { name: '7#9', intervals: [0, 4, 7, 10, 15], commonness: 5 },
        'dom7b9': { name: '7b9', intervals: [0, 4, 7, 10, 13], commonness: 5 },
        'dom7#5': { name: '7#5', intervals: [0, 4, 8, 10], commonness: 4 },
        'dom7b5': { name: '7b5', intervals: [0, 4, 6, 10], commonness: 4 },
        'dom7#11': { name: '7#11', intervals: [0, 4, 7, 10, 14, 18], commonness: 3 },
        'dom9#11': { name: '9#11', intervals: [0, 4, 7, 10, 14, 18], commonness: 2 },
        'dom7b13': { name: '7b13', intervals: [0, 4, 7, 10, 14, 20], commonness: 3 },
        'alt': { name: 'alt', intervals: [0, 4, 6, 10, 13, 15], commonness: 3 },
        
        // Suspended chords
        'sus4': { name: 'sus4', intervals: [0, 5, 7], commonness: 6 },
        'sus2': { name: 'sus2', intervals: [0, 2, 7], commonness: 5 },
        'sus2sus4': { name: 'sus2/4', intervals: [0, 2, 5, 7], commonness: 3 },
        '7sus4': { name: '7sus4', intervals: [0, 5, 7, 10], commonness: 5 },
        '7sus2': { name: '7sus2', intervals: [0, 2, 7, 10], commonness: 4 },
        
        // Complex suspended chords
        'half-dim7sus4': { name: 'ø7sus4', intervals: [0, 5, 6, 10], commonness: 3 },
        'dim7sus4': { name: 'dim7sus4', intervals: [0, 5, 6, 9], commonness: 2 },
        
        // Add chords
        'add8': { name: 'add8', intervals: [0, 4, 7, 12], commonness: 5 },
        'min add8': { name: 'madd8', intervals: [0, 3, 7, 12], commonness: 5 },
        'add9': { name: 'add9', intervals: [0, 4, 7, 14], commonness: 4 },
    'min add9': { name: 'madd9', intervals: [0, 3, 7, 14], commonness: 4 },
        'add11': { name: 'add11', intervals: [0, 4, 7, 17], commonness: 3 },
        'add13': { name: 'add13', intervals: [0, 4, 7, 21], commonness: 3 },
        
        // 6th chords (least common, moved to bottom)
        '6': { name: '6', intervals: [0, 4, 7, 9], commonness: 5 },
        'm6': { name: 'm6', intervals: [0, 3, 7, 9], commonness: 5 },
        
        // Power chords (root + 5th, no 3rd)
        '5': { name: '5', intervals: [0, 7], commonness: 7 }
    };

    // Key definitions
    const keys = {
        // Major keys
        'major': { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
        'natural-minor': { name: 'Natural Minor (Aeolian)', intervals: [0, 2, 3, 5, 7, 8, 10] },
        'harmonic-minor': { name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
        'melodic-minor': { name: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11] },
        
        // Modes
        'dorian': { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
        'phrygian': { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
        'lydian': { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
        'mixolydian': { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
        'locrian': { name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },
        
        // Pentatonic keys
        'major-pentatonic': { name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
        'minor-pentatonic': { name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
        'blues': { name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
        
        // Symmetric keys
        'chromatic': { name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
        'whole-tone': { name: 'Whole Tone', intervals: [0, 2, 4, 6, 8, 10] },
        'diminished': { name: 'Diminished (Octatonic)', intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
        
        // Exotic keys
        'hungarian-minor': { name: 'Hungarian Minor', intervals: [0, 2, 3, 6, 7, 8, 11] },
        'hungarian-major': { name: 'Hungarian Major', intervals: [0, 3, 4, 6, 7, 9, 10] },
        'persian': { name: 'Persian', intervals: [0, 1, 4, 5, 6, 8, 11] },
        'byzantine': { name: 'Byzantine', intervals: [0, 1, 4, 5, 7, 8, 11] },
        'arabic': { name: 'Arabic', intervals: [0, 1, 4, 5, 7, 8, 10] },
        'egyptian': { name: 'Egyptian', intervals: [0, 2, 5, 7, 10] },
        'japanese': { name: 'Japanese (In)', intervals: [0, 1, 5, 7, 8] },
        'chinese': { name: 'Chinese (Pentatonic)', intervals: [0, 2, 4, 7, 9] },
        
        // Jazz keys
        'bebop-major': { name: 'Bebop Major', intervals: [0, 2, 4, 5, 7, 8, 9, 11] },
        'bebop-dominant': { name: 'Bebop Dominant', intervals: [0, 2, 4, 5, 7, 9, 10, 11] },
        'bebop-minor': { name: 'Bebop Minor', intervals: [0, 2, 3, 5, 7, 8, 9, 10] },
        'lydian-dominant': { name: 'Lydian Dominant', intervals: [0, 2, 4, 6, 7, 9, 10] },
        'altered': { name: 'Altered', intervals: [0, 1, 3, 4, 6, 8, 10] },
        'locrian-natural2': { name: 'Locrian Natural 2', intervals: [0, 2, 3, 5, 6, 8, 10] },
        
        // Neapolitan keys
        'neapolitan-major': { name: 'Neapolitan Major', intervals: [0, 1, 3, 5, 7, 9, 11] },
        'neapolitan-minor': { name: 'Neapolitan Minor', intervals: [0, 1, 3, 5, 7, 8, 11] },
        
        // Synthetic keys
        'enigmatic': { name: 'Enigmatic', intervals: [0, 1, 4, 6, 8, 10, 11] },
        'double-harmonic': { name: 'Double Harmonic', intervals: [0, 1, 4, 5, 7, 8, 11] },
        'overtone': { name: 'Overtone', intervals: [0, 2, 4, 6, 7, 9, 10] },
        'leading-whole-tone': { name: 'Leading Whole Tone', intervals: [0, 2, 4, 6, 8, 10, 11] },
        'augmented': { name: 'Augmented', intervals: [0, 3, 4, 7, 8, 11] },
        'prometheus': { name: 'Prometheus', intervals: [0, 2, 4, 6, 9, 10] },
        'tritone': { name: 'Tritone', intervals: [0, 1, 4, 6, 7, 10] }
    };

    // Validation helper functions
    function validateChordType(chordType) {
        if (!chordType || typeof chordType !== 'string') {
            console.warn('🎵 [PITCH] Invalid chord type:', chordType);
            return false;
        }
        
        // Handle common chord type abbreviations
        const chordTypeMapping = {
            '7': 'dom7',           // Dominant 7th
            'm7': 'min7',          // Minor 7th
            'maj7': 'maj7',        // Major 7th
            'dim7': 'dim7',        // Diminished 7th
            'm': 'min',            // Minor
            'maj': 'maj',          // Major
            'dim': 'dim',          // Diminished
            'aug': 'aug',          // Augmented
            'sus4': 'sus4',        // Suspended 4th
            'sus2': 'sus2',        // Suspended 2nd
            'sus2/4': 'sus2sus4',  // Suspended 2nd/4th
            'sus2sus4': 'sus2sus4', // Suspended 2nd/4th (alternative)
            'ø7': 'half-dim7',     // Half-diminished 7th
            'm7b5': 'min7b5',      // Minor 7th flat 5
            '7b5': 'dom7b5',       // Dominant 7th flat 5
            '7#5': 'dom7#5',       // Dominant 7th sharp 5
            '7b9': 'dom7b9',       // Dominant 7th flat 9
            '7#9': 'dom7#9',       // Dominant 7th sharp 9
            '7#11': 'dom7#11',     // Dominant 7th sharp 11
            '9#11': 'dom9#11',     // Dominant 9th sharp 11
            '7b13': 'dom7b13',     // Dominant 7th flat 13
            'alt': 'alt'           // Altered dominant
        };
        
        // Check if the chord type is a valid abbreviation
        const mappedChordType = chordTypeMapping[chordType];
        if (mappedChordType && chordTypes[mappedChordType]) {
            return true;
        }
        
        // Check if the chord type exists directly
        if (chordTypes[chordType]) {
            return true;
        }
        
        console.warn('🎵 [PITCH] Unknown chord type:', chordType);
        return false;
    }

    function validateKeyType(keyType) {
        if (!keyType || typeof keyType !== 'string') {
            console.warn('🎵 [PITCH] Invalid key type:', keyType);
            return false;
        }
        
        if (!keys[keyType]) {
            console.warn('🎵 [PITCH] Unknown key type:', keyType);
            return false;
        }
        
        return true;
    }

    function validatePitchClass(pitchClass) {
        if (typeof pitchClass !== 'number' || pitchClass < 0 || pitchClass > 11) {
            console.warn('🎵 [PITCH] Invalid pitch class:', pitchClass);
            return false;
        }
        return true;
    }

    function validatePitch(pitch) {
        if (typeof pitch !== 'number' || pitch < 0 || pitch > 127) {
            console.warn('🎵 [PITCH] Invalid pitch:', pitch);
            return false;
        }
        return true;
    }

    /**
     * Convert note name to chromatic index (0-11)
     * @param {string} note - Note name (e.g., 'C', 'C#', 'Db', 'F#')
     * @returns {number} Pitch class (0-11) or -1 if invalid
     */
    function noteToPitchClass(note) {
        // Input validation
        if (!note || typeof note !== 'string') {
            console.warn('🎵 [PITCH] Invalid note input:', note);
            return -1;
        }
        
        const baseNote = note.split('/')[0];
        const noteToPitchClassMap = {
            'C': 0, 'C#': 1, 'Db': 1,
            'D': 2, 'D#': 3, 'Eb': 3,
            'E': 4,
            'F': 5, 'F#': 6, 'Gb': 6,
            'G': 7, 'G#': 8, 'Ab': 8,
            'A': 9, 'A#': 10, 'Bb': 10,
            'B': 11
        };
        
        const pitchClass = noteToPitchClassMap[baseNote];
        if (pitchClass === undefined) {
            console.warn('🎵 [PITCH] Unknown note name:', note);
            return -1;
        }
        
        return pitchClass;
    }

    /**
     * Get the default pitch at the grid origin (0,0)
     */
    function getOriginPitch() {
        return 36; // C2
    }

    /**
     * Calculate pitch information at given grid coordinates with configurable origin
     * @param {number} x - X coordinate on the grid
     * @param {number} y - Y coordinate on the grid
     * @param {number} originPitch - Origin pitch (default: 36 for C2)
     * @returns {Object|null} Pitch information or null if invalid
     */
    function getPitchAt(x, y, originPitch) {
        // Input validation
        if (typeof x !== 'number' || typeof y !== 'number') {
            console.warn('🎵 [PITCH] Invalid grid coordinates:', { x, y });
            return null;
        }
        
        if (typeof originPitch !== 'number' || originPitch < 0 || originPitch > 127) {
            console.warn('🎵 [PITCH] Invalid origin pitch:', originPitch);
            originPitch = 36; // Default to C2
        }
        
        const horizontalSemitones = x * 4; // Major 3rd = 4 semitones
        const verticalSemitones = y * 3;   // Minor 3rd = 3 semitones
        const totalSemitones = horizontalSemitones + verticalSemitones;
        const pitch = totalSemitones + originPitch;
        
        // Validate resulting pitch is in MIDI range
        if (pitch < 0 || pitch > 127) {
            console.warn('🎵 [PITCH] Calculated pitch out of MIDI range:', pitch, 'at coordinates:', { x, y });
            return null;
        }
        
        const octave = Math.floor(pitch / 12) - 1; // Standard MIDI octave calculation
        const pitchClass = pitch % 12;
        
        return {
            note: musicalNotes[pitchClass],
            octave,
            totalSemitones,
            pitch: pitch
        };
    }

    /**
     * Convert note name and octave to MIDI pitch
     * @param {string} note - Note name (e.g., 'C', 'C#', 'Db')
     * @param {number} octave - Octave number (default: 3)
     * @returns {number|null} MIDI pitch (0-127) or null if invalid
     */
    function getPitchFromNote(note, octave = 3) {
        // Input validation
        if (!note || typeof note !== 'string') {
            console.warn('🎵 [PITCH] Invalid note input:', note);
            return null;
        }
        
        if (typeof octave !== 'number' || octave < -1 || octave > 9) {
            console.warn('🎵 [PITCH] Invalid octave:', octave);
            return null;
        }
        
        const pitchClass = noteToPitchClass(note);
        if (pitchClass === -1) {
            console.warn('🎵 [PITCH] Could not convert note to pitch class:', note);
            return null;
        }
        
        const pitch = pitchClass + (octave + 1) * 12;
        
        // Validate resulting pitch is in MIDI range
        if (pitch < 0 || pitch > 127) {
            console.warn('🎵 [PITCH] Pitch out of MIDI range:', pitch, 'for note:', note, 'octave:', octave);
            return null;
        }
        
        return pitch;
    }

    /**
     * Convert MIDI pitch to note name and octave
     * @param {number} pitch - MIDI pitch (0-127)
     * @param {boolean} useFlats - Whether to use flat names (default: false)
     * @returns {Object|null} { note, octave, pitch } or null if invalid
     */
    function getNoteFromPitch(pitch, useFlats = false) {
        // Input validation
        if (typeof pitch !== 'number' || pitch < 0 || pitch > 127) {
            console.warn('🎵 [PITCH] Invalid pitch value:', pitch);
            return null;
        }
        
        if (typeof useFlats !== 'boolean') {
            console.warn('🎵 [PITCH] Invalid useFlats parameter:', useFlats);
            useFlats = false;
        }
        
        const pitchClass = pitch % 12;
        const octave = Math.floor(pitch / 12) - 1;
        const note = useFlats ? musicalNotesFlats[pitchClass] : musicalNotes[pitchClass];
        
        return { note, octave, pitch };
    }

    /**
     * Convert numeric pitch to note and octave (simplified version)
     * @param {number} pitch - Numeric pitch value (e.g., 60 for C4)
     * @returns {Object} { note, octave } - Note name and octave number
     */
    function pitchToNoteAndOctave(pitch) {
        const octave = Math.floor(pitch / 12) - 1;
        const pitchClass = pitch % 12;
        const note = musicalNotes[pitchClass];
        return { note, octave };
    }

    /**
     * Get comprehensive information about a pitch (for display only)
     */
    function getPitchInfo(pitch) {
        if (pitch < 0 || pitch > 127) {
            return null;
        }

        const pitchClass = pitch % 12;
        const octave = Math.floor(pitch / 12) - 1;
        
        // Get sharp and flat names directly from arrays
        const sharp = musicalNotes[pitchClass];
        const flat = musicalNotesFlats[pitchClass];
        const hasEnharmonics = sharp !== flat;
        
        return {
            pitch,
            pitchClass,
            octave,
            sharp,
            flat,
            hasEnharmonics,
            sharpWithOctave: `${sharp}${octave}`,
            flatWithOctave: `${flat}${octave}`
        };
    }

    // Calculate the correct semitone to coordinate mapping
    function calculateSemitoneMapping() {
        const mapping = {};
        // Use x=0-2, y=0-3 to get exactly 12 mappings
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 4; y++) {
                const semitones = x * 4 + y * 3;
                const semitoneInOctave = semitones % 12;
                if (!mapping[semitoneInOctave]) {
                    mapping[semitoneInOctave] = { x, y, octaveOffset: semitones >= 12 ? 1 : 0 };
                }
            }
        }
        return mapping;
    }
    
    // Global lookup table for semitone to coordinate mapping
    // This is calculated based on the grid formula: totalSemitones = x*4 + y*3
    const SEMITONE_TO_COORD = calculateSemitoneMapping();

    /**
     * Get all clone coordinates for a given pitch using O(1) lookup table approach
     * Input: absolute pitch, origin pitch, grid dimensions
     * Output: array of {x, y, cloneIndex} objects
     */
    function getAllCloneCoordsForPitch(pitch, originPitch, gridWidth, gridHeight) {
        const pitchOffset = pitch - originPitch;
        const semitoneInOctave = pitchOffset % 12;
        const octaveOffset = Math.floor(pitchOffset / 12);
        
        // Look up the base coordinate for this semitone
        const baseCoord = SEMITONE_TO_COORD[semitoneInOctave];
        if (!baseCoord) {
            console.warn(`No coordinate mapping found for semitone ${semitoneInOctave}`);
            return [];
        }
        
        // Calculate clone 0 position (lowest octave)
        //For every octave, we go up x+3
        const clone0X = baseCoord.x + ((Math.floor(pitchOffset / 12) - baseCoord.octaveOffset) * 3);
        const clone0Y = baseCoord.y;

        const clones = [];
        let cloneIndex = 0;
        
        // Generate all clones using the pattern: (x-3, y+4) for each clone
        while (true) {
            const x = clone0X - (3 * cloneIndex);
            const y = clone0Y + (4 * cloneIndex);
            
            // Check if this clone is within grid bounds
            if (x < 0 || y >= gridHeight) {
                break;
            }
            
            clones.push({ x, y, cloneIndex });
            cloneIndex++;
        }
        
        return clones;
    }

    /**
     * Convert grid coordinates to pitch and clone index with configurable origin
     */
    function getPitchAndCloneFromCoord(x, y, originPitch) {
        const pitchInfo = getPitchAt(x, y, originPitch);
        const cloneIndex = Math.floor(y / 4);
        return { pitch: pitchInfo.pitch, cloneIndex };
    }

    /**
     * Convert pitch and clone index to grid coordinates with configurable origin (O(1) solution)
     */
    function getCoordFromPitchAndClone(pitch, cloneIndex, originPitch) {
        const pitchOffset = pitch - originPitch;
        return { x: Math.floor(pitchOffset / 4) - (3 * cloneIndex), y: (pitchOffset % 4) + (4 * cloneIndex) };
    }

    /**
     * Select chord clones using Manhattan distance optimization
     * Input: array of absolute pitches (e.g., [48, 52, 55, 59] for CM7)
     * Output: array of {pitch, coord} objects with optimal grid placement
     */
    function selectChordClonesManhattan(pitches, originPitch, gridWidth, gridHeight, preferredCloneIndices = null) {
        const selectedClones = [];
        
        for (let i = 0; i < pitches.length; i++) {
            const pitch = pitches[i];
            const allClones = getAllCloneCoordsForPitch(pitch, originPitch, gridWidth, gridHeight);
            
            if (allClones.length === 0) {
                console.warn(`No clones found for pitch ${pitch}`);
                continue;
            }
            
            let bestClone = allClones[0]; // Default to first clone
            
            // If preferred clone indices are provided, use the specified clone index
            if (preferredCloneIndices && preferredCloneIndices[i] !== undefined) {
                const preferredIndex = preferredCloneIndices[i];
                const preferredClone = allClones.find(clone => clone.cloneIndex === preferredIndex);
                if (preferredClone) {
                    bestClone = preferredClone;
                } else {
                    console.warn(`Preferred clone index ${preferredIndex} not found for pitch ${pitch}, using default`);
                }
            } else if (i > 0 && selectedClones.length > 0) {
                // For subsequent notes, find clone with shortest Manhattan distance to previous
                const prevCoord = selectedClones[i-1].coord;
                let minDistance = Infinity;
                
                for (const clone of allClones) {
                    const distance = Math.abs(clone.x - prevCoord.x) + Math.abs(clone.y - prevCoord.y);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestClone = clone;
                    }
                }
            }
            
            selectedClones.push({
                pitch: pitch,
                coord: bestClone
            });
        }
        
        return selectedClones;
    }

    /**
     * Select chord clones with specified clone indices for each pitch
     * Input: array of absolute pitches and array of clone indices (e.g., [48, 52, 55, 59], [0, 1, 0, 1])
     * Output: array of {pitch, coord} objects with specified grid placement
     */
    function selectChordClonesWithIndices(pitches, cloneIndices, originPitch, gridWidth, gridHeight) {
        if (pitches.length !== cloneIndices.length) {
            throw new Error('Pitches and clone indices arrays must have the same length');
        }
        
        const selectedClones = [];
        
        for (let i = 0; i < pitches.length; i++) {
            const pitch = pitches[i];
            const targetCloneIndex = cloneIndices[i];
            const allClones = getAllCloneCoordsForPitch(pitch, originPitch, gridWidth, gridHeight);
            
            if (allClones.length === 0) {
                console.warn(`No clones found for pitch ${pitch}`);
                continue;
            }
            
            // Find the clone with the specified index
            const targetClone = allClones.find(clone => clone.cloneIndex === targetCloneIndex);
            
            if (!targetClone) {
                console.warn(`Clone index ${targetCloneIndex} not found for pitch ${pitch}, using first available`);
                selectedClones.push({
                    pitch: pitch,
                    coord: allClones[0]
                });
            } else {
                selectedClones.push({
                    pitch: pitch,
                    coord: targetClone
                });
            }
        }
        
        return selectedClones;
    }

    /**
     * Calculate tonic coordinates for chord buttons
     * Input: tonic note, key type, grid dimensions, origin pitch
     * Output: { octave3: {x, y}, octave4: {x, y}, octave5: {x, y} }
     */
    function calculateTonicCoordinates(tonicNote, keyType, gridWidth, gridHeight, originPitch) {
        // Get all coordinates for the tonic note
        const tonicPitch = getPitchFromNote(tonicNote, 3); // Start with octave 3
        
        // Use the extracted method to get the leftmost, middle Y coordinate
        const gridFormat = { width: gridWidth, height: gridHeight, originPitch };
        const octave3Coord = getLeftMiddleGridCoordFromPitch(tonicPitch, gridFormat);
        
        // Calculate the three octave positions
        const octave4Coord = { x: octave3Coord.x + 3, y: octave3Coord.y };
        const octave5Coord = { x: octave3Coord.x + 6, y: octave3Coord.y };
        
        return {
            octave3: octave3Coord,
            octave4: octave4Coord,
            octave5: octave5Coord
        };
    }

    /**
     * Calculate chromatic position based on placement rules with musical grid alignment
     * Input: base coordinate, chromatic offset, grid dimensions
     * Output: calculated coordinate with bounds checking
     */
    function calculateChromaticPosition(baseCoord, chromaticOffset, gridWidth, gridHeight) {
        // Chromatic placement rules relative to tonic (root):
        // root: x, y
        // Root+1: x+1, y-1
        // Root+2: x+2, y-2
        // Root+3: x, y-1
        // Root+4: x+1, y
        // Root+5: x+2, y-1
        // Root+6: x+3, y-2
        // Root+7: x+1, y+1 (updated)
        // Root+8: x+2, y
        // Root+9: x+3, y-1
        // Root+10: x+4, y-2
        // Root+11: x+2, y+1
        
        const placementRules = [
            { x: 0, y: 0 },   // root (0)
            { x: 1, y: -1 },  // Root+1 (1)
            { x: 2, y: -2 },  // Root+2 (2)
            { x: 0, y: 1 },   // Root+3 (3) - D#
            { x: 1, y: 0 },   // Root+4 (4)
            { x: 2, y: -1 },  // Root+5 (5)
            { x: 3, y: -2 },  // Root+6 (6)
            { x: 1, y: 1 },   // Root+7 (7) - updated
            { x: 2, y: 0 },   // Root+8 (8)
            { x: 3, y: -1 },  // Root+9 (9)
            { x: 4, y: -2 },  // Root+10 (10)
            { x: 2, y: 1 }   // Root+11 (11)
        ];
        
        const rule = placementRules[chromaticOffset];
        const calculatedCoord = {
            x: baseCoord.x + rule.x,
            y: baseCoord.y + rule.y
        };
        
        // Check if the calculated coordinate is within grid bounds
        if (calculatedCoord.x < 0 || calculatedCoord.y < 0 || 
            calculatedCoord.x >= gridWidth || calculatedCoord.y >= gridHeight) {
            
            // If invalid, find the next valid clone by using the next octave
            // This is a simple fallback - we could make this more sophisticated
            const adjustedCoord = {
                x: calculatedCoord.x,
                y: calculatedCoord.y + 4 // Move up by 4 to get into valid range
            };
            
            // Ensure it's still within bounds
            if (adjustedCoord.y >= gridHeight) {
                // If still invalid, use the base coordinate as fallback
                return baseCoord;
            }
            
            return adjustedCoord;
        }
        
        return calculatedCoord;
    }

    /**
     * Calculate all chord button positions using chromatic placement rules
     * Input: tonic coordinate, key notes, chord types, grid dimensions, origin pitch
     * Output: positions object with octave3, octave4, octave5 arrays
     */
    function calculateAllChordButtonPositions(tonicCoord, keyNotes, chordTypes, gridWidth, gridHeight, originPitch) {
        const positions = {
            octave3: [],
            octave4: [],
            octave5: []
        };
        
        // Start with tonic position for each octave using X+3 progression (12 semitones = 3 grid units)
        const tonicOctave3 = tonicCoord;
        const tonicOctave4 = { x: tonicCoord.x + 3, y: tonicCoord.y };
        const tonicOctave5 = { x: tonicCoord.x + 6, y: tonicCoord.y };
        
        // Get the tonic note index (first note of the key)
        const tonicNoteIndex = noteToPitchClass(keyNotes[0]);
        if (tonicNoteIndex === -1) {
            throw new Error(`Tonic note not found in musical notes: ${keyNotes[0]}`);
        }
        
        // Convert key notes to indices for consistent comparison
        const keyNoteIndices = keyNotes.map(note => noteToPitchClass(note));
        
        // For each octave, calculate positions for all 12 chromatic notes
        for (let octave = 3; octave <= 5; octave++) {
            let baseCoord;
            if (octave === 3) {
                baseCoord = tonicOctave3;
            } else if (octave === 4) {
                baseCoord = tonicOctave4;
            } else {
                baseCoord = tonicOctave5;
            }
            
            // Calculate positions for key degrees (0-9) relative to the tonic
            for (let buttonIndex = 0; buttonIndex < 10; buttonIndex++) {
                // Map buttonIndex to key degree (0 = 1st degree, 1 = 2nd degree, etc.)
                const keyDegree = buttonIndex + 1;
                const keyNoteIndex = (keyDegree - 1) % keyNotes.length;
                const note = keyNotes[keyNoteIndex];
                const pitchClass = noteToPitchClass(note);
                
                // Calculate chromatic offset from tonic to this key note
                const chromaticOffset = (pitchClass - tonicNoteIndex + 12) % 12;
                
                // Calculate the position using the chromatic placement rules
                const coord = calculateChromaticPosition(baseCoord, chromaticOffset, gridWidth, gridHeight);
                
                // Get chord type for this key degree
                const chordType = chordTypes[buttonIndex] || 'maj7';
                
                // Add to the appropriate octave array
                if (octave === 3) {
                    positions.octave3.push({ note, chordType, coord });
                } else if (octave === 4) {
                    positions.octave4.push({ note, chordType, coord });
                } else {
                    positions.octave5.push({ note, chordType, coord });
                }
            }
        }
        
        return positions;
    }

    // Get diatonic triad types for a given key
    /**
     * Get diatonic triad types for a given key type
     * @param {string} keyType - The key type (e.g., 'major', 'natural-minor')
     * @returns {Array} Array of chord types for each scale degree
     */
    function getDiatonicTriads(keyType) {
        // Input validation
        if (!validateKeyType(keyType)) {
            console.warn('🎵 [PITCH] Falling back to major key pattern for invalid key type:', keyType);
            keyType = 'major';
        }
        
        const keyPatterns = {
            'major': ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj'],
            'natural-minor': ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min'],
            'harmonic-minor': ['min', 'dim', 'aug', 'min', 'maj', 'maj', 'dim', 'min', 'dim', 'aug', 'min', 'maj', 'maj', 'dim', 'min'],
            'melodic-minor': ['min', 'min', 'aug', 'maj', 'maj', 'dim', 'dim', 'min', 'min', 'aug', 'maj', 'maj', 'dim', 'dim', 'min'],
            'dorian': ['min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min'],
            'phrygian': ['min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min'],
            'lydian': ['maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj'],
            'mixolydian': ['maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
            'locrian': ['dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']
        };
        
        return keyPatterns[keyType] || keyPatterns['major'];
    }

    /**
     * Get diatonic tetrad types for a given key type
     * @param {string} keyType - The key type (e.g., 'major', 'natural-minor')
     * @returns {Array} Array of chord types for each scale degree
     */
    function getDiatonicTetrads(keyType) {
        // Input validation
        if (!validateKeyType(keyType)) {
            console.warn('🎵 [PITCH] Falling back to major key pattern for invalid key type:', keyType);
            keyType = 'major';
        }
        
        const keyPatterns = {
            'major': ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'half-dim7', 'maj7'],
            'natural-minor': ['min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7'],
            'harmonic-minor': ['minmaj7', 'half-dim7', 'maj7#5', 'min7', 'dom7', 'maj7', 'dim7', 'minmaj7', 'half-dim7', 'maj7#5', 'min7', 'dom7', 'maj7', 'dim7', 'minmaj7'],
            'melodic-minor': ['minmaj7', 'min7', 'aug', 'maj7', 'dom7', 'half-dim7', 'half-dim7', 'minmaj7', 'min7', 'aug', 'maj7', 'dom7', 'half-dim7', 'half-dim7', 'minmaj7'],
            'dorian': ['min7', 'min7', 'maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7'],
            'phrygian': ['min7', 'maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7'],
            'lydian': ['maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7'],
            'mixolydian': ['dom7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7'],
            'locrian': ['half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'maj7', 'min7', 'half-dim7']
        };
        
        return keyPatterns[keyType] || keyPatterns['major'];
    }

    // Convert chord type to short name for button display
    function getShortChordName(chordType) {
        const shortNames = {
            'maj': '',
            'min': 'm',
            'dim': 'o',
            'aug': '+',
            'min7': 'm7',
            'dom7': '7',
            'maj7': 'M7',
            'half-dim7': 'ø7',
            'dim7': 'o7',
            'minmaj7': 'mM7',
            'maj7#5': 'M7#5',
            'min7b5': 'm7b5',
            'dom9': '9',
            'maj9': 'M9',
            'min9': 'm9',
            'dom13': '13',
            'maj13': 'M13',
            'min13': 'm13',
            'maj11': 'M11',
            'min11': 'm11',
            'dom11': '11',
            'dom7#9': '7#9',
            'dom7b9': '7b9',
            'dom7#5': '7#5',
            'dom7b5': '7b5',
            'dom7#11': '7#11',
            'dom9#11': '9#11',
            'dom7b13': '7b13',
            'alt': 'alt',
            'sus4': 'sus4',
            'sus2': 'sus2',
            'sus2sus4': 'sus2/4',
            '7sus4': '7sus4',
            '7sus2': '7sus2',
            'add9': 'add9',
            'madd9': 'madd9',
            'add11': 'add11',
            'add13': 'add13',
            '6': '6',
            'm6': 'm6',
            '5': '5'
        };
        const result = shortNames[chordType] !== undefined ? shortNames[chordType] : chordType;
        return result;
    }

    // Normalize note name (convert flats to sharps for consistency)
    function normalizeNoteName(noteName) {
        // Convert flats to sharps for consistency with musicalNotes array
        const flatToSharp = {
            'Db': 'C#',
            'D♭': 'C#',
            'Eb': 'D#',
            'E♭': 'D#',
            'Gb': 'F#',
            'G♭': 'F#',
            'Ab': 'G#',
            'A♭': 'G#',
            'Bb': 'A#',
            'B♭': 'A#'
        };
        
        return flatToSharp[noteName] || noteName;
    }

    // Get the key signature for a given root pitch class and key type
    function getKeySignature(rootPitchClass, keyType) {
        // Convert root pitch class to note name for key signature lookup
        const rootNote = pitchClassToNote(rootPitchClass, false);
        
        // Define key signatures for major keys using # and b symbols
        const majorKeySignatures = {
            'C': { accidentals: [] },
            'G': { accidentals: [{ note: 'F', type: '#' }] },
            'D': { accidentals: [{ note: 'F', type: '#' }, { note: 'C', type: '#' }] },
            'A': { accidentals: [{ note: 'F', type: '#' }, { note: 'C', type: '#' }, { note: 'G', type: '#' }] },
            'E': { accidentals: [{ note: 'F', type: '#' }, { note: 'C', type: '#' }, { note: 'G', type: '#' }, { note: 'D', type: '#' }] },
            'B': { accidentals: [{ note: 'F', type: '#' }, { note: 'C', type: '#' }, { note: 'G', type: '#' }, { note: 'D', type: '#' }, { note: 'A', type: '#' }] },
            'F#': { accidentals: [{ note: 'F', type: '#' }, { note: 'C', type: '#' }, { note: 'G', type: '#' }, { note: 'D', type: '#' }, { note: 'A', type: '#' }, { note: 'E', type: '#' }] },
            'F': { accidentals: [{ note: 'B', type: 'b' }] },
            'Bb': { accidentals: [{ note: 'B', type: 'b' }, { note: 'E', type: 'b' }] },
            'Eb': { accidentals: [{ note: 'B', type: 'b' }, { note: 'E', type: 'b' }, { note: 'A', type: 'b' }] },
            'Ab': { accidentals: [{ note: 'B', type: 'b' }, { note: 'E', type: 'b' }, { note: 'A', type: 'b' }, { note: 'D', type: 'b' }] },
            'Db': { accidentals: [{ note: 'B', type: 'b' }, { note: 'E', type: 'b' }, { note: 'A', type: 'b' }, { note: 'D', type: 'b' }, { note: 'G', type: 'b' }] },
            'Gb': { accidentals: [{ note: 'B', type: 'b' }, { note: 'E', type: 'b' }, { note: 'A', type: 'b' }, { note: 'D', type: 'b' }, { note: 'G', type: 'b' }, { note: 'C', type: 'b' }] },
            'Cb': { accidentals: [{ note: 'B', type: 'b' }, { note: 'E', type: 'b' }, { note: 'A', type: 'b' }, { note: 'D', type: 'b' }, { note: 'G', type: 'b' }, { note: 'C', type: 'b' }, { note: 'F', type: 'b' }] }
        };
        
        // Handle enharmonic equivalents for major keys
        const enharmonicEquivalents = {
            'D#': 'Eb',  // D# major = Eb major
            'G#': 'Ab',  // G# major = Ab major
            'A#': 'Bb',  // A# major = Bb major
            'C#': 'Db',  // C# major = Db major
            'F#': 'Gb'   // F# major = Gb major
        };
        
        // For minor keys, use the relative major key signature
        const minorRelativeMajors = {
            'a': 'C', 'e': 'G', 'b': 'D', 'f#': 'A', 'c#': 'E', 'g#': 'B', 'd#': 'F#',
            'd': 'F', 'g': 'Bb', 'c': 'Eb', 'f': 'Ab', 'bb': 'Db', 'eb': 'Gb', 'ab': 'Cb'
        };
        
        // For modes, determine the key signature based on the mode
        const modeKeySignatures = {
            'dorian': (rootNote) => {
                // Dorian is a minor mode, so it uses the relative major key signature
                const relativeMajor = minorRelativeMajors[rootNote.toLowerCase()];
                return majorKeySignatures[relativeMajor] || { accidentals: [] };
            },
            'phrygian': (rootNote) => {
                // Phrygian is a minor mode, so it uses the relative major key signature
                const relativeMajor = minorRelativeMajors[rootNote.toLowerCase()];
                return majorKeySignatures[relativeMajor] || { accidentals: [] };
            },
            'lydian': (rootNote) => {
                // Lydian is a major mode, so it uses the major key signature
                return majorKeySignatures[rootNote] || { accidentals: [] };
            },
            'mixolydian': (rootNote) => {
                // Mixolydian is a major mode, so it uses the major key signature
                return majorKeySignatures[rootNote] || { accidentals: [] };
            },
            'locrian': (rootNote) => {
                // Locrian is a minor mode, so it uses the relative major key signature
                const relativeMajor = minorRelativeMajors[rootNote.toLowerCase()];
                return majorKeySignatures[relativeMajor] || { accidentals: [] };
            }
        };
        
        // Handle different key types
        if (keyType === 'major') {
            // Check for enharmonic equivalents first
            const equivalentNote = enharmonicEquivalents[rootNote];
            const actualRootNote = equivalentNote || rootNote;
            return majorKeySignatures[actualRootNote] || { accidentals: [] };
        } else if (['natural-minor', 'harmonic-minor', 'melodic-minor'].includes(keyType)) {
            // Minor keys use the relative major key signature
            const relativeMajor = minorRelativeMajors[rootNote.toLowerCase()];
            return majorKeySignatures[relativeMajor] || { accidentals: [] };
        } else if (['dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'].includes(keyType)) {
            // Use the mode-specific key signature function
            return modeKeySignatures[keyType](rootNote);
        }
        
        // Default to no accidentals
        return { accidentals: [] };
    }

    // Determine if a key should use flats based on music theory conventions
    function shouldUseFlats(rootPitchClass, keyType) {
        // Get the actual key signature for this key
        const keySignature = getKeySignature(rootPitchClass, keyType);
        
        // Use flats if the key signature contains flats
        return keySignature.accidentals.some(acc => acc.type === 'b');
    }



    // Convert pitch class to note name
    function pitchClassToNote(pitchClass, useFlats = false) {
        if (pitchClass < 0 || pitchClass >= 12) return null;
        
        if (useFlats) {
            return musicalNotesFlats[pitchClass];
        } else {
            return musicalNotes[pitchClass];
        }
    }

    // Get interval name for key degree display
    function getIntervalName(interval) {
        const intervalNames = {
            0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 
            6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7'
        };
        return intervalNames[interval] || interval.toString();
    }



    // Helper method to compare arrays
    function arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }



    // Detect chord from array of notes (with optional actual pitches for diminished chord priority)
    function detectChord(notes, chordTypes, actualPitches = null) {
        if (notes.length < 2) return null;
        
        // Convert notes to semitone intervals using the new index-based system
        const semitones = notes.map(note => noteToPitchClass(note)).filter(index => index !== -1).sort((a, b) => a - b);
        
        const allMatches = [];
        
        // Try each note as the root
        for (let i = 0; i < semitones.length; i++) {
            const potentialRoot = semitones[i];
            
            // For extended chords, we need to try different octave arrangements
            // Try the basic intervals first (within one octave)
            let potentialIntervals = semitones.map(s => {
                let interval = s - potentialRoot;
                if (interval < 0) interval += 12;
                return interval;
            });
            
            let uniquePotentialIntervals = [...new Set(potentialIntervals)].sort((a, b) => a - b);
                        
            // Check against known chord patterns
            for (const [chordType, chordData] of Object.entries(chordTypes)) {
                const chordIntervals = [...chordData.intervals].sort((a, b) => a - b);
                                
                // Check if intervals match exactly
                if (arraysEqual(uniquePotentialIntervals, chordIntervals)) {
                    // Special validation for power chords - must have exactly 2 unique pitch classes
                    if (chordType === '5' && uniquePotentialIntervals.length !== 2) {
                        continue; // Skip power chord detection if more than 2 unique pitch classes
                    }
                    
                    const rootNote = pitchClassToNote(potentialRoot, false); // Use sharps for internal processing
                    allMatches.push({
                        rootNote: rootNote,
                        chordType: chordType,
                        chordName: chordData.name,
                        fullName: `${rootNote}${chordData.name}`,
                        commonness: chordData.commonness || 1
                    });
                }
            }
            
            // If no match found with basic intervals, try extended intervals for 4+ note chords
            if (semitones.length >= 4) {
                // For extended chords, we need to try all possible octave arrangements
                // Generate all possible combinations of intervals with octave adjustments
                const generateExtendedIntervals = () => {
                    const baseIntervals = semitones.map(s => {
                        let interval = s - potentialRoot;
                        if (interval < 0) interval += 12;
                        return interval;
                    });
                    
                    // For 4-note chords, try converting 2nds to 9ths
                    if (semitones.length === 4) {
                        const combinations = [];
                        
                        // Original intervals
                        combinations.push([...baseIntervals]);
                        
                        // Try converting each 2nd to a 9th
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 2) {
                                const newIntervals = [...baseIntervals];
                                newIntervals[i] = 14; // Convert 2nd to 9th
                                combinations.push(newIntervals);
                            }
                        }
                        
                        return combinations;
                    }
                    
                    // For 5-note chords, try converting 2nds to 9ths
                    if (semitones.length === 5) {
                        const combinations = [];
                        
                        // Original intervals
                        combinations.push([...baseIntervals]);
                        
                        // Try converting each 2nd to a 9th
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 2) {
                                const newIntervals = [...baseIntervals];
                                newIntervals[i] = 14; // Convert 2nd to 9th
                                combinations.push(newIntervals);
                            }
                        }
                        
                        return combinations;
                    }
                    
                    // For 6+ note chords, try more combinations
                    if (semitones.length >= 6) {
                        const combinations = [];
                        
                        // Original intervals
                        combinations.push([...baseIntervals]);
                        
                        // Try converting 2nds to 9ths
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 2) {
                                const newIntervals = [...baseIntervals];
                                newIntervals[i] = 14; // Convert 2nd to 9th
                                combinations.push(newIntervals);
                            }
                        }
                        
                        // Try converting 3rds to 10ths
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 4) {
                                const newIntervals = [...baseIntervals];
                                newIntervals[i] = 16; // Convert 3rd to 10th
                                combinations.push(newIntervals);
                            }
                        }
                        
                        // Try converting 4ths to 11ths
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 5) {
                                const newIntervals = [...baseIntervals];
                                newIntervals[i] = 17; // Convert 4th to 11th
                                combinations.push(newIntervals);
                            }
                        }
                        
                        // Try converting 6ths to 13ths
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 9) {
                                const newIntervals = [...baseIntervals];
                                newIntervals[i] = 21; // Convert 6th to 13th
                                combinations.push(newIntervals);
                            }
                        }
                        
                        // For extended chords, try combinations of multiple conversions
                        // Try converting both 2nds to 9ths AND 3rds to 10ths
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 2) {
                                for (let j = 0; j < baseIntervals.length; j++) {
                                    if (baseIntervals[j] === 4) {
                                        const newIntervals = [...baseIntervals];
                                        newIntervals[i] = 14; // Convert 2nd to 9th
                                        newIntervals[j] = 16; // Convert 3rd to 10th
                                        combinations.push(newIntervals);
                                    }
                                }
                            }
                        }
                        
                        // Try converting both 2nds to 9ths AND 4ths to 11ths
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 2) {
                                for (let j = 0; j < baseIntervals.length; j++) {
                                    if (baseIntervals[j] === 5) {
                                        const newIntervals = [...baseIntervals];
                                        newIntervals[i] = 14; // Convert 2nd to 9th
                                        newIntervals[j] = 17; // Convert 4th to 11th
                                        combinations.push(newIntervals);
                                    }
                                }
                            }
                        }
                        
                        // Try converting both 2nds to 9ths AND 6ths to 13ths
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 2) {
                                for (let j = 0; j < baseIntervals.length; j++) {
                                    if (baseIntervals[j] === 9) {
                                        const newIntervals = [...baseIntervals];
                                        newIntervals[i] = 14; // Convert 2nd to 9th
                                        newIntervals[j] = 21; // Convert 6th to 13th
                                        combinations.push(newIntervals);
                                    }
                                }
                            }
                        }
                        
                        // Try converting both 3rds to 10ths AND 4ths to 11ths
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 4) {
                                for (let j = 0; j < baseIntervals.length; j++) {
                                    if (baseIntervals[j] === 5) {
                                        const newIntervals = [...baseIntervals];
                                        newIntervals[i] = 16; // Convert 3rd to 10th
                                        newIntervals[j] = 17; // Convert 4th to 11th
                                        combinations.push(newIntervals);
                                    }
                                }
                            }
                        }
                        
                        // Try converting both 4ths to 11ths AND 6ths to 13ths
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 5) {
                                for (let j = 0; j < baseIntervals.length; j++) {
                                    if (baseIntervals[j] === 9) {
                                        const newIntervals = [...baseIntervals];
                                        newIntervals[i] = 17; // Convert 4th to 11th
                                        newIntervals[j] = 21; // Convert 6th to 13th
                                        combinations.push(newIntervals);
                                    }
                                }
                            }
                        }
                        
                        // Try converting all three: 2nds to 9ths, 3rds to 10ths, and 4ths to 11ths
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 2) {
                                for (let j = 0; j < baseIntervals.length; j++) {
                                    if (baseIntervals[j] === 4) {
                                        for (let k = 0; k < baseIntervals.length; k++) {
                                            if (baseIntervals[k] === 5) {
                                                const newIntervals = [...baseIntervals];
                                                newIntervals[i] = 14; // Convert 2nd to 9th
                                                newIntervals[j] = 16; // Convert 3rd to 10th
                                                newIntervals[k] = 17; // Convert 4th to 11th
                                                combinations.push(newIntervals);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Try converting all four: 2nds to 9ths, 3rds to 10ths, 4ths to 11ths, and 6ths to 13ths
                        for (let i = 0; i < baseIntervals.length; i++) {
                            if (baseIntervals[i] === 2) {
                                for (let j = 0; j < baseIntervals.length; j++) {
                                    if (baseIntervals[j] === 4) {
                                        for (let k = 0; k < baseIntervals.length; k++) {
                                            if (baseIntervals[k] === 5) {
                                                for (let l = 0; l < baseIntervals.length; l++) {
                                                    if (baseIntervals[l] === 9) {
                                                        const newIntervals = [...baseIntervals];
                                                        newIntervals[i] = 14; // Convert 2nd to 9th
                                                        newIntervals[j] = 16; // Convert 3rd to 10th
                                                        newIntervals[k] = 17; // Convert 4th to 11th
                                                        newIntervals[l] = 21; // Convert 6th to 13th
                                                        combinations.push(newIntervals);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        return combinations;
                    }
                    
                    return [baseIntervals];
                };
                
                const intervalCombinations = generateExtendedIntervals();
                
                // Try each combination
                for (const intervals of intervalCombinations) {
                    const uniqueIntervals = [...new Set(intervals)].sort((a, b) => a - b);
                    
                    // Check against known chord patterns
                    for (const [chordType, chordData] of Object.entries(chordTypes)) {
                        const chordIntervals = [...chordData.intervals].sort((a, b) => a - b);
                        
                        // Check if intervals match exactly
                        if (arraysEqual(uniqueIntervals, chordIntervals)) {
                            const rootNote = musicalNotes[potentialRoot];
                            allMatches.push({
                                rootNote: rootNote,
                                chordType: chordType,
                                chordName: chordData.name,
                                fullName: `${rootNote}${chordData.name}`,
                                commonness: chordData.commonness || 1
                            });
                        }
                    }
                }
            }
        }
        
        // Handle symmetric chords (diminished chords) by prioritizing lowest pitch as root
        const symmetricMatches = [];
        
        // Get the lowest pitch note for all chord types
        let lowestPitchNote;
        if (actualPitches && actualPitches.length > 0) {
            // Use actual pitches to find the lowest absolute pitch
            const lowestPitch = Math.min(...actualPitches);
            const lowestPitchInfo = getNoteFromPitch(lowestPitch, false);
            lowestPitchNote = lowestPitchInfo.note;
    
        } else {
            // Fallback to using semitone indices (this is not ideal for lowest pitch preference)
            const lowestPitchIndex = Math.min(...semitones);
            lowestPitchNote = pitchClassToNote(lowestPitchIndex, false);
            console.log(`Lowest pitch is ${lowestPitchNote} (index: ${lowestPitchIndex}) - WARNING: Using pitch class, not actual pitch`);
        }
        
        for (const match of allMatches) {
            // For diminished chords (both dim and dim7), prioritize lowest pitch as root
            if (match.chordType === 'dim' || match.chordType === 'dim7') {
                // For dim7, add all four possible root interpretations but prioritize lowest
                if (match.chordType === 'dim7') {
                    const dim7Intervals = [0, 3, 6, 9];
                    
                    // Start with the lowest pitch as the primary interpretation
                    const primaryRootIndex = noteToPitchClass(lowestPitchNote);
                    const primaryRoot = pitchClassToNote(primaryRootIndex, false);
                    
                    // Add the primary (lowest pitch) interpretation first
                    symmetricMatches.push({
                        rootNote: primaryRoot,
                        chordType: 'dim7',
                        chordName: 'dim7',
                        fullName: `${primaryRoot}dim7`,
                        commonness: match.commonness + 1 // Give it higher priority
                    });
                    
                    // Add other enharmonic interpretations
                    for (let i = 0; i < 4; i++) {
                        const enharmonicRootIndex = (primaryRootIndex + (i * 3)) % 12;
                        const enharmonicRoot = pitchClassToNote(enharmonicRootIndex, false);
                        
                        // Skip if it's the same as the primary root
                        if (enharmonicRootIndex === primaryRootIndex) continue;
                        
                        // Check if this interpretation already exists
                        const exists = symmetricMatches.some(m => 
                            m.rootNote === enharmonicRoot && m.chordType === 'dim7'
                        );
                        
                        if (!exists) {
                            symmetricMatches.push({
                                rootNote: enharmonicRoot,
                                chordType: 'dim7',
                                chordName: 'dim7',
                                fullName: `${enharmonicRoot}dim7`,
                                commonness: match.commonness
                            });
                        }
                    }
                } else {
                    // For regular dim chords, prioritize lowest pitch
                    symmetricMatches.push({
                        rootNote: lowestPitchNote,
                        chordType: 'dim',
                        chordName: 'dim',
                        fullName: `${lowestPitchNote}dim`,
                        commonness: match.commonness + 1 // Give it higher priority
                    });
                }
            } else {
                // For all other chord types, check if the lowest pitch could be the root
                const lowestPitchIndex = noteToPitchClass(lowestPitchNote);
                const matchRootIndex = noteToPitchClass(match.rootNote);
                
                // If the lowest pitch is the root of this interpretation, give it priority
                if (lowestPitchIndex === matchRootIndex) {
                    symmetricMatches.push({
                        ...match,
                        commonness: match.commonness + 2 // Give it higher priority than normal
                    });
                } else {
                    symmetricMatches.push(match);
                }
            }
        }
        
        // Collect all possible interpretations
        let finalMatches = [...symmetricMatches];
        
        // For 6+ note chords, always try extended interval interpretations for the lowest pitch as root
        if (notes.length >= 6 && actualPitches && actualPitches.length > 0) {
            console.log(`6+ note chord detected, trying extended interval interpretations`);
            const lowestPitch = Math.min(...actualPitches);
            const lowestPitchInfo = getNoteFromPitch(lowestPitch, false);
            const lowestPitchNote = lowestPitchInfo.note;
            const lowestPitchRootIndex = noteToPitchClass(lowestPitchNote);
            
            // Generate extended intervals for the lowest pitch as root
            // Use actual pitches to preserve octave information
            const baseIntervals = actualPitches.map(pitch => {
                const lowestPitch = Math.min(...actualPitches);
                return pitch - lowestPitch;
            }).sort((a, b) => a - b);
            
            // Try extended interval combinations
            const generateExtendedIntervals = () => {
                const combinations = [];
                combinations.push([...baseIntervals]);
                
                console.log('Base intervals for F root:', baseIntervals);
                
                // Try converting 18 (perfect 11th) to 17 (major 10th) for maj11
                for (let i = 0; i < baseIntervals.length; i++) {
                    if (baseIntervals[i] === 18) {
                        const newIntervals = [...baseIntervals];
                        newIntervals[i] = 17; // Convert perfect 11th to major 10th
                        combinations.push(newIntervals);
                        console.log('Created extended combination (18->17):', newIntervals);
                    }
                }
                
                console.log('Total extended combinations:', combinations.length);
                return combinations;
            };
            
            const extendedCombinations = generateExtendedIntervals();
            
            // Check each combination against chord patterns
            for (const intervals of extendedCombinations) {
                const uniqueIntervals = [...new Set(intervals)].sort((a, b) => a - b);
                
                for (const [chordType, chordData] of Object.entries(chordTypes)) {
                    const chordIntervals = [...chordData.intervals].sort((a, b) => a - b);
                    
                    if (arraysEqual(uniqueIntervals, chordIntervals)) {
                        const extendedMatch = {
                            rootNote: lowestPitchNote,
                            chordType: chordType,
                            chordName: chordData.name,
                            fullName: `${lowestPitchNote}${chordData.name}`,
                            commonness: chordData.commonness || 1
                        };
                        
                        // Add to final matches if not already present
                        const exists = finalMatches.some(m => 
                            m.rootNote === extendedMatch.rootNote && m.chordType === extendedMatch.chordType
                        );
                        
                        if (!exists) {
                            finalMatches.push(extendedMatch);
                        }
                    }
                }
            }
        }
        
        // Check if the lowest pitch is NOT the chord root (indicating a potential slash chord)
        if (actualPitches && actualPitches.length > 0) {
            const lowestPitch = Math.min(...actualPitches);
            const lowestPitchInfo = getNoteFromPitch(lowestPitch, false);
            const lowestPitchNote = lowestPitchInfo.note;
            
            // Try slash chord interpretations
    
            const slashChordMatches = detectSlashChords(notes, chordTypes, actualPitches);
            if (slashChordMatches && slashChordMatches.length > 0) {
                finalMatches = [...finalMatches, ...slashChordMatches];
            }
        }
        
        // Sort final matches by commonness (highest first)
        if (finalMatches.length > 0) {
            finalMatches.sort((a, b) => b.commonness - a.commonness);
            return finalMatches;
        }
        
        // If no standard chord detected, try slash chord interpretations
        const slashChordMatches = detectSlashChords(notes, chordTypes, actualPitches);
        if (slashChordMatches && slashChordMatches.length > 0) {
            return slashChordMatches;
        }
        
        return null;
    }

    /**
     * Detect slash chord interpretations when no standard chord is found
     * @param {Array} notes - Array of note names
     * @param {Object} chordTypes - Available chord types
     * @param {Array} actualPitches - Optional array of actual pitch values
     * @returns {Array|null} - Array of slash chord interpretations or null
     */
    function detectSlashChords(notes, chordTypes, actualPitches = null) {
        if (notes.length < 3) return null; // Need at least 3 notes for meaningful slash chord
        if (!actualPitches || actualPitches.length === 0) return null; // Need actual pitches to determine bass
        
        // Find the lowest pitch and its corresponding note
        const lowestPitch = Math.min(...actualPitches);
        const lowestPitchIndex = actualPitches.indexOf(lowestPitch);
        const bassNote = notes[lowestPitchIndex];
        
        // Get the other notes (excluding the bass note)
        const otherNotes = notes.filter((_, index) => index !== lowestPitchIndex);
        const otherPitches = actualPitches.filter((_, index) => index !== lowestPitchIndex);
        
        // Try to detect a chord from the other notes (excluding bass)
        const chordMatches = detectChord(otherNotes, chordTypes, otherPitches);
        
        if (chordMatches && chordMatches.length > 0) {
            // Found a valid chord for the upper notes
            const primaryChord = chordMatches[0];
            
            // Reconstruct the full chord tones (including extensions)
            const rootPitchClass = noteToPitchClass(primaryChord.rootNote);
            const chordTypeObj = chordTypes[primaryChord.chordType];
            if (!chordTypeObj) return null;
            const chordIntervals = chordTypeObj.intervals;
            // Build all chord tones (pitch classes) for the root
            const chordTones = chordIntervals.map(interval => (rootPitchClass + interval) % 12);
            // Add the bass note as a chord tone if not already present
            const bassPitchClass = noteToPitchClass(bassNote);
            if (!chordTones.includes(bassPitchClass)) {
                chordTones.push(bassPitchClass);
            }
            // Check if every note in the set is a chord tone
            const allNotePitchClasses = notes.map(noteToPitchClass);
            const allAreChordTones = allNotePitchClasses.every(pc => chordTones.includes(pc));
            if (!allAreChordTones) return null;
            
                            // Create slash chord interpretation with only the lowest pitch as bass
                return [{
                    rootNote: primaryChord.rootNote,
                    chordType: primaryChord.chordType,
                    chordName: primaryChord.chordName,
                    bassNote: bassNote,
                    fullName: `${primaryChord.rootNote}${primaryChord.chordName}/${bassNote}`,
                    isSlashChord: true,
                    commonness: primaryChord.commonness - 3 // Much lower priority than standard chords
                }];
        }
        
        return null;
    }

    // Get all coordinates that correspond to a specific note
    function getCoordinatesForNote(note, getPitchAt, originPitch, gridWidth, gridHeight) {
        const coordinates = [];
        
        // Guard against undefined or null notes
        if (!note || note === undefined || note === null) {
            return coordinates;
        }
        
        // Use optimized pitch system to find all instances
        // Search through octaves 2-5 (typical grid range)
        for (let octave = 2; octave <= 5; octave++) {
            const pitch = getPitchFromNote(note, octave);
            const allClones = getAllCloneCoordsForPitch(pitch, originPitch, gridWidth, gridHeight);
            
            allClones.forEach(({ x, y, cloneIndex }) => {
                // Verify the coordinate is within bounds
                if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
                    // Get the actual pitch and octave at this coordinate
                    const actualPitch = getPitchAt(x, y, originPitch);
                    
                    coordinates.push({ 
                        x, 
                        y, 
                        octave: actualPitch.octave, // Use actual octave, not search octave
                        cloneIndex: cloneIndex 
                    });
                }
            });
        }
        
        return coordinates;
    }

    // Get all notes and their coordinates
    function getAllNoteCoordinates(getCoordinatesForNote, indexToNote) {
        const noteMap = {};
        
        // Use all 12 chromatic notes
        for (let i = 0; i < 12; i++) {
            const note = pitchClassToNote(i, false); // Use sharps for internal processing
            noteMap[note] = getCoordinatesForNote(note);
        }
        
        return noteMap;
    }

    // Get all unique pitches that appear on the grid (optimized)
    function getAllGridPitches(getPitchAt, getNoteFromPitch, gridWidth, gridHeight) {
        let minPitch = Infinity;
        let maxPitch = -Infinity;
        
        // Find the lowest and highest pitches on the grid
        for (let displayY = 0; displayY < gridHeight; displayY++) {
            const actualY = gridHeight - 1 - displayY; // Flip Y coordinate for display
            for (let x = 0; x < gridWidth; x++) {
                const pitch = getPitchAt(x, actualY, originPitch);
                minPitch = Math.min(minPitch, pitch.pitch);
                maxPitch = Math.max(maxPitch, pitch.pitch);
            }
        }
        
        // Generate all pitches from lowest to highest using optimized pitch system
        const pitches = [];
        for (let pitch = minPitch; pitch <= maxPitch; pitch++) {
            const noteInfo = getNoteFromPitch(pitch, false); // Use sharps for internal processing
            pitches.push(`${noteInfo.note}${noteInfo.octave}`);
        }
        
        return pitches;
    }

    // Helper method to find coordinates for a note in a specific octave (optimized)
    function getCoordinatesForNoteInOctave(note, targetOctave, originPitch, gridWidth, gridHeight) {
        // Use optimized pitch system for O(1) coordinate lookup
        const pitch = getPitchFromNote(note, targetOctave);
        const allClones = getAllCloneCoordsForPitch(pitch, originPitch, gridWidth, gridHeight);
        
        // Filter to only include coordinates within grid bounds
        return allClones
            .filter(({ x, y }) => x >= 0 && x < gridWidth && y >= 0 && y < gridHeight)
            .map(({ x, y }) => ({ x, y }));
    }

    // Check if a key is a musical typing key
    function isMusicalKey(key) {
        const musicalKeys = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';', '\'', ']', '\\', ':', '"', '}', '|', 'enter', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')'];
        return musicalKeys.includes(key.toLowerCase());
    }


    // Get the note from a musical key, using optimized pitch system
    function getNoteFromMusicalKey(key, getDiatonicChordFromNumber, getNoteFromPitch) {
        // Map shifted number keys to their unshifted equivalents
        const shiftedNumberMap = {
            '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', 
            '^': '6', '&': '7', '*': '8', '(': '9', ')': '0'
        };
        
        // If it's a shifted number key, convert it to the unshifted version
        if (shiftedNumberMap[key]) {
            key = shiftedNumberMap[key];
        }
        
        // Check if it's a number key for diatonic chords
        const numberKey = parseInt(key);
        if (numberKey >= 0 && numberKey <= 9) {
            return getDiatonicChordFromNumber(numberKey);
        }
        
        const keyMap = {
            'a': 0, 'w': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5, 't': 6, 'g': 7, 
            'y': 8, 'h': 9, 'u': 10, 'j': 11, 'k': 12, 'o': 13, 'l': 14, 
            'p': 15, ';': 16, '\'': 17, ']': 18,
            // Shifted versions map to the same notes
            ':': 16, '"': 17, '}': 18,
            // Octave up versions
            '\\': 20, '|': 20, 'enter': 19
        };
        
        const semitoneOffset = keyMap[key.toLowerCase()];
        if (semitoneOffset === undefined) return null;
        
        // Use optimized pitch system: calculate pitch directly from C3 (48)
        const basePitch = 48; // C3
        const pitch = basePitch + semitoneOffset;
        const noteInfo = getNoteFromPitch(pitch, false); // Use sharps for consistency
        

        
        return { note: noteInfo.note, octave: noteInfo.octave };
    }

    // Stack chord notes on the grid with optimal voicing
    function stackChordNotes(notes, isSlashChord, bassNote, getCoordinatesForNote, getPitchAt, originPitch, gridWidth, gridHeight) {
        const selectedCoords = [];
        
        // Get all possible coordinates for each note
        const noteCoords = {};
        notes.forEach(note => {
            noteCoords[note] = getCoordinatesForNote(note);
        });
        
        if (isSlashChord && bassNote) {
            // For slash chords, handle bass note separately
            const bassCoords = noteCoords[bassNote];
            if (bassCoords.length > 0) {
                // Find the bass note in octave 2 (below the root)
                let bestBassCoord = null;
                let bassPitch = null;
                
                for (const coord of bassCoords) {
                    const pitch = getPitchAt(coord.x, coord.y, originPitch);
                    if (pitch.octave === 2) {
                        bestBassCoord = coord;
                        bassPitch = pitch;
                        break;
                    }
                }
                
                // If octave 2 not found, use the lowest available
                if (!bestBassCoord) {
                    bestBassCoord = bassCoords[0];
                    bassPitch = getPitchAt(bestBassCoord.x, bestBassCoord.y, originPitch);
                    
                    for (const coord of bassCoords) {
                        const pitch = getPitchAt(coord.x, coord.y, originPitch);
                        if (pitch.pitch < bassPitch.pitch) {
                            bassPitch = pitch;
                            bestBassCoord = coord;
                        }
                    }
                }
                
                selectedCoords.push({ note: bassNote, coord: bestBassCoord, pitch: bassPitch });
            }
            
            // Remove bass note from the main chord notes for stacking
            const chordNotes = notes.filter(note => note !== bassNote);
            
            // Start with the root note (first note after removing bass)
            const rootNoteName = chordNotes[0];
            const rootCoords = noteCoords[rootNoteName];
            if (rootCoords.length > 0) {
                // Find the 3rd octave instance of the root note
                let bestRootCoord = null;
                let targetPitch = null;
                
                for (const coord of rootCoords) {
                    const pitch = getPitchAt(coord.x, coord.y, originPitch);
                    if (pitch.octave === 3) {
                        bestRootCoord = coord;
                        targetPitch = pitch;
                        break;
                    }
                }
                
                // If 3rd octave not found, use the lowest available
                if (!bestRootCoord) {
                    bestRootCoord = rootCoords[0];
                    targetPitch = getPitchAt(bestRootCoord.x, bestRootCoord.y, originPitch);
                    
                    for (const coord of rootCoords) {
                        const pitch = getPitchAt(coord.x, coord.y, originPitch);
                        if (pitch.pitch < targetPitch.pitch) {
                            targetPitch = pitch;
                            bestRootCoord = coord;
                        }
                    }
                }
                
                selectedCoords.push({ note: rootNoteName, coord: bestRootCoord, pitch: targetPitch });
            }
            
            // Stack remaining chord notes above the root
            for (let i = 1; i < chordNotes.length; i++) {
                const note = chordNotes[i];
                const coords = noteCoords[note];
                
                if (coords.length > 0) {
                                    // Find the coordinate with the lowest pitch that's still higher than the previous note
                const prevPitch = selectedCoords[selectedCoords.length - 1].pitch;
                let bestCoord = null;
                let bestPitch = null;
                let bestScore = Infinity;
                
                for (const coord of coords) {
                    const pitch = getPitchAt(coord.x, coord.y, originPitch);
                        
                        // Must be higher in pitch than the previous note
                        if (pitch.pitch > prevPitch.pitch) {
                            // Score based on pitch proximity and physical distance
                            const pitchDistance = pitch.pitch - prevPitch.pitch;
                            const physicalDistance = Math.abs(coord.x - selectedCoords[selectedCoords.length - 1].coord.x) + 
                                                   Math.abs(coord.y - selectedCoords[selectedCoords.length - 1].coord.y);
                            
                            const score = pitchDistance * 2 + physicalDistance;
                            
                            if (score < bestScore) {
                                bestScore = score;
                                bestCoord = coord;
                                bestPitch = pitch;
                            }
                        }
                    }
                    
                    // If no higher pitch found, use the lowest available
                    if (!bestCoord) {
                        let lowestPitch = getPitchAt(coords[0].x, coords[0].y, originPitch);
                        bestCoord = coords[0];
                        
                        for (const coord of coords) {
                            const pitch = getPitchAt(coord.x, coord.y, originPitch);
                            if (pitch.pitch < lowestPitch.pitch) {
                                lowestPitch = pitch;
                                bestCoord = coord;
                            }
                        }
                        bestPitch = lowestPitch;
                    }
                    
                    selectedCoords.push({ note, coord: bestCoord, pitch: bestPitch });
                }
            }
        } else {
            // Regular chord stacking (non-slash chords)
            // Start with the root note - find the 3rd octave instance
            const rootNoteName = notes[0];
            const rootCoords = noteCoords[rootNoteName];
            if (rootCoords.length > 0) {
                // Find the 3rd octave instance of the root note
                let bestRootCoord = null;
                let targetPitch = null;
                
                for (const coord of rootCoords) {
                    const pitch = getPitchAt(coord.x, coord.y, originPitch);
                    if (pitch.octave === 3) {
                        bestRootCoord = coord;
                        targetPitch = pitch;
                        break;
                    }
                }
                
                // If 3rd octave not found, use the lowest available
                if (!bestRootCoord) {
                    bestRootCoord = rootCoords[0];
                    targetPitch = getPitchAt(bestRootCoord.x, bestRootCoord.y, originPitch);
                    
                    for (const coord of rootCoords) {
                        const pitch = getPitchAt(coord.x, coord.y, originPitch);
                        if (pitch.pitch < targetPitch.pitch) {
                            targetPitch = pitch;
                            bestRootCoord = coord;
                        }
                    }
                }
                
                selectedCoords.push({ note: rootNoteName, coord: bestRootCoord, pitch: targetPitch });
            }
            
            // For each remaining note, find the best coordinate that's higher in pitch than the previous
            for (let i = 1; i < notes.length; i++) {
                const note = notes[i];
                const coords = noteCoords[note];
                
                if (coords.length > 0) {
                    // Find the coordinate with the lowest pitch that's still higher than the previous note
                    const prevPitch = selectedCoords[i-1].pitch;
                    let bestCoord = null;
                    let bestPitch = null;
                    let bestScore = Infinity;
                    
                    for (const coord of coords) {
                        const pitch = getPitchAt(coord.x, coord.y, originPitch);
                        
                        // Must be higher in pitch than the previous note
                        if (pitch.pitch > prevPitch.pitch) {
                            // Score based on pitch proximity and physical distance
                            const pitchDistance = pitch.pitch - prevPitch.pitch;
                            const physicalDistance = Math.abs(coord.x - selectedCoords[i-1].coord.x) + 
                                                   Math.abs(coord.y - selectedCoords[i-1].coord.y);
                            
                            const score = pitchDistance * 2 + physicalDistance;
                            
                            if (score < bestScore) {
                                bestScore = score;
                                bestCoord = coord;
                                bestPitch = pitch;
                            }
                        }
                    }
                    
                    // If no higher pitch found, use the lowest available
                    if (!bestCoord) {
                        let lowestPitch = getPitchAt(coords[0].x, coords[0].y, originPitch);
                        bestCoord = coords[0];
                        
                        for (const coord of coords) {
                            const pitch = getPitchAt(coord.x, coord.y, originPitch);
                            if (pitch.pitch < lowestPitch.pitch) {
                                lowestPitch = pitch;
                                bestCoord = coord;
                            }
                        }
                        bestPitch = lowestPitch;
                    }
                    
                    selectedCoords.push({ note, coord: bestCoord, pitch: bestPitch });
                }
            }
        }
        
        return selectedCoords;
    }

    // ===== PITCH-CLASS-FIRST REFACTORED FUNCTIONS =====

    /**
     * Check if a pitch class belongs to a key using pure interval math
     * Input: pitchClass (0-11), rootPitchClass (0-11), keyType, keys
     * Output: boolean
     */
    function isPitchClassInKey(pitchClass, rootPitchClass, keyType, keys) {
        if (!keyType || !keys[keyType]) {
            return false;
        }
        
        // Get the key intervals
        const intervals = keys[keyType].intervals;
        
        // Calculate the interval from root (ensure positive result)
        const intervalFromRoot = ((pitchClass - rootPitchClass) % 12 + 12) % 12;
        
        // Check if this interval is in the key
        return intervals.includes(intervalFromRoot);
    }

    /**
     * Generate key pitch classes from root pitch class and key type
     * Input: rootPitchClass (0-11), keyType, keys
     * Output: array of pitch classes (0-11)
     */
    function generateKeyPitchClasses(rootPitchClass, keyType, keys) {
        const keyData = keys[keyType];
        if (!keyData) return [];
        
        return keyData.intervals.map(interval => {
            return (rootPitchClass + interval) % 12;
        });
    }

    /**
     * Generate chord pitch classes from root pitch class and chord type
     * Input: rootPitchClass (0-11), chordType, chordTypes
     * Output: array of pitch classes (0-11)
     */
    function generateChordPitchClasses(rootPitchClass, chordType, chordTypes) {
        const chordData = chordTypes[chordType];
        if (!chordData) return [];
        
        return chordData.intervals.map(interval => {
            return (rootPitchClass + interval) % 12;
        });
    }

    /**
     * Get key degree for a pitch class relative to a key
     * Input: pitchClass (0-11), rootPitchClass (0-11), keyType, intervals
     * Output: { degree, intervalName } or null
     */
    function getKeyDegreeFromPitchClass(pitchClass, rootPitchClass, keyType, intervals) {
        const interval = ((pitchClass - rootPitchClass) % 12 + 12) % 12;
        const degreeIndex = intervals.indexOf(interval);
        
        if (degreeIndex === -1) return null;
        
        // Convert to key degree notation
        const degree = degreeIndex + 1;
        const intervalName = getIntervalName(interval);
        
        return { degree, intervalName };
    }

    /**
     * Calculate chromatic offset between two pitch classes
     * Input: pitchClass1 (0-11), pitchClass2 (0-11)
     * Output: chromatic offset (0-11)
     */
    function getChromaticOffset(pitchClass1, pitchClass2) {
        return ((pitchClass1 - pitchClass2) % 12 + 12) % 12;
    }

    /**
     * Convert pitch classes to note names with preferred accidentals
     * Input: pitchClasses (array of 0-11), useFlats (boolean)
     * Output: array of note names
     */
    function pitchClassesToNotes(pitchClasses, useFlats = false) {
        return pitchClasses.map(pitchClass => pitchClassToNote(pitchClass, useFlats));
    }

    /**
     * Convert note names to pitch classes
     * Input: notes (array of note names)
     * Output: array of pitch classes (0-11)
     */
    function notesToPitchClasses(notes) {
        return notes.map(note => noteToPitchClass(note)).filter(index => index !== -1);
    }

    /**
     * Calculate all chord button positions using pitch classes
     * Input: tonicPitchClass (0-11), keyPitchClasses (array of 0-11), chordTypes, gridWidth, gridHeight, originPitch
     * Output: positions object with octave3, octave4, octave5 arrays
     */
    function calculateAllChordButtonPositionsFromPitchClasses(tonicPitchClass, keyPitchClasses, chordTypes, gridWidth, gridHeight, originPitch) {
        const positions = {
            octave3: [],
            octave4: [],
            octave5: []
        };
        
        // Get tonic note name for coordinate calculation
        const tonicNote = pitchClassToNote(tonicPitchClass, false);
        const tonicCoord = calculateTonicCoordinates(tonicNote, 'major', gridWidth, gridHeight, originPitch);
        
        // Start with tonic position for each octave using X+3 progression (12 semitones = 3 grid units)
        const tonicOctave3 = tonicCoord.octave3;
        const tonicOctave4 = tonicCoord.octave4;
        const tonicOctave5 = tonicCoord.octave5;
        
        // For each octave, calculate positions for key degrees (0-9)
        for (let octave = 3; octave <= 5; octave++) {
            let baseCoord;
            if (octave === 3) {
                baseCoord = tonicOctave3;
            } else if (octave === 4) {
                baseCoord = tonicOctave4;
            } else {
                baseCoord = tonicOctave5;
            }
            
            // Calculate positions for key degrees (0-9) relative to the tonic
            for (let buttonIndex = 0; buttonIndex < 10; buttonIndex++) {
                // Map buttonIndex to key degree (0 = 1st degree, 1 = 2nd degree, etc.)
                const keyDegree = buttonIndex + 1;
                const keyPitchClassIndex = (keyDegree - 1) % keyPitchClasses.length;
                const keyPitchClass = keyPitchClasses[keyPitchClassIndex];
                
                // Calculate chromatic offset from tonic to this key pitch class
                const chromaticOffset = getChromaticOffset(keyPitchClass, tonicPitchClass);
                
                // Calculate the position using the chromatic placement rules
                const coord = calculateChromaticPosition(baseCoord, chromaticOffset, gridWidth, gridHeight);
                
                // Get chord type for this key degree
                const chordType = getDiatonicTetrads('major')[buttonIndex] || 'maj7';
                
                // Convert pitch class to note name for display
                const note = pitchClassToNote(keyPitchClass, false);
                
                // Add to the appropriate octave array
                if (octave === 3) {
                    positions.octave3.push({ note, chordType, coord });
                } else if (octave === 4) {
                    positions.octave4.push({ note, chordType, coord });
                } else {
                    positions.octave5.push({ note, chordType, coord });
                }
            }
        }
        
        return positions;
    }

    // ===== PITCH-CLASS-FIRST FUNCTIONS (NO BACKWARD COMPATIBILITY) =====

    // Check if a pitch belongs to a key using pure interval math
    function isPitchInKey(pitch, rootPitchClass, keyType, keys) {
        const pitchClass = pitch % 12;
        return isPitchClassInKey(pitchClass, rootPitchClass, keyType, keys);
    }

    // Generate key notes from root pitch class and key type
    function generateKeyNotes(rootPitchClass, keyType, keys) {
        const keyPitchClasses = generateKeyPitchClasses(rootPitchClass, keyType, keys);
        const useFlats = shouldUseFlats(rootPitchClass, keyType);
        return pitchClassesToNotes(keyPitchClasses, useFlats);
    }

    // Generate chord notes from root pitch class and chord type
    function generateChordNotes(rootPitchClass, chordType, bassNote, chordTypes) {
        const chordPitchClasses = generateChordPitchClasses(rootPitchClass, chordType, chordTypes);
        const useFlats = shouldUseFlats(rootPitchClass, 'major'); // Use major key for chord accidentals
        let notes = pitchClassesToNotes(chordPitchClasses, useFlats);
        
        // For slash chords, add the bass note if it's not already in the chord
        if (bassNote && !notes.includes(bassNote)) {
            notes.unshift(bassNote); // Add bass note at the beginning
        }
        
        return notes;
    }

    // Get key degree for a note relative to a key
    function getKeyDegree(note, rootPitchClass, keyType, intervals) {
        const pitchClass = noteToPitchClass(note);
        
        if (pitchClass === -1) return null;
        
        return getKeyDegreeFromPitchClass(pitchClass, rootPitchClass, keyType, intervals);
    }

    /**
     * Generate ascending scale pattern using pure pitch calculations
     * @param {number} rootPitchClass - Root pitch class (0-11)
     * @param {string} keyType - Key type (e.g., 'major', 'natural-minor')
     * @param {Object} keys - Keys data structure
     * @param {number} startOctave - Starting octave (default: 2)
     * @param {number} numOctaves - Number of octaves to generate (default: 3)
     * @returns {Array} Array of MIDI pitches for the ascending scale
     */
    function generateAscendingScalePattern(rootPitchClass, keyType, keys, startOctave = 2, numOctaves = 3) {
        // Input validation
        if (!validatePitchClass(rootPitchClass)) {
            console.warn('🎵 [PITCH] Invalid root pitch class:', rootPitchClass);
            return [];
        }
        
        if (!validateKeyType(keyType)) {
            console.warn('🎵 [PITCH] Invalid key type:', keyType);
            return [];
        }
        
        if (!keys || typeof keys !== 'object') {
            console.warn('🎵 [PITCH] Invalid keys object:', keys);
            return [];
        }
        
        if (typeof startOctave !== 'number' || startOctave < -1 || startOctave > 9) {
            console.warn('🎵 [PITCH] Invalid start octave:', startOctave);
            startOctave = 2;
        }
        
        if (typeof numOctaves !== 'number' || numOctaves < 1 || numOctaves > 8) {
            console.warn('🎵 [PITCH] Invalid number of octaves:', numOctaves);
            numOctaves = 3;
        }
        
        const keyData = keys[keyType];
        if (!keyData || !keyData.intervals) {
            console.warn('🎵 [PITCH] Invalid key data for key type:', keyType);
            return [];
        }
        
        const pattern = [];
        let currentOctave = startOctave;
        let lastPitchClass = rootPitchClass;
        
        // Generate the scale pattern by iterating through intervals
        for (let repeat = 0; repeat < numOctaves; repeat++) {
            keyData.intervals.forEach(interval => {
                const pitchClass = (rootPitchClass + interval) % 12;
                
                // If this pitch class is less than the last one, we need to go up an octave
                if (pitchClass < lastPitchClass) {
                    currentOctave++;
                }
                
                const pitch = (currentOctave * 12) + pitchClass;
                
                // Validate the calculated pitch
                if (validatePitch(pitch)) {
                    pattern.push(pitch);
                } else {
                    console.warn('🎵 [PITCH] Generated invalid pitch:', pitch, 'for interval:', interval);
                }
                
                lastPitchClass = pitchClass;
            });
        }
        
        // Add final tonic note in the proper octave based on input params
        const finalOctave = startOctave + numOctaves;
        const finalPitch = (finalOctave * 12) + rootPitchClass;
        
        if (validatePitch(finalPitch)) {
            pattern.push(finalPitch);
        } else {
            console.warn('🎵 [PITCH] Generated invalid final pitch:', finalPitch);
        }
        
        return pattern;
    }

    /**
     * Get Roman numeral notation for a chord in a given key
     * @param {number} rootPitchClass - The root pitch class of the chord (0-11)
     * @param {string} chordType - The chord type (e.g., 'maj', 'min', 'dom7', etc.)
     * @param {Object} key - The key object with rootPitchClass and name properties
     * @returns {string} - Roman numeral notation (e.g., 'I', 'ii7', 'V7', etc.)
     */
    function getRomanNumeralForChordInKey(rootPitchClass, chordType, key) {
        if (!validatePitchClass(rootPitchClass)) {
            console.warn('🎵 [PITCH] Invalid rootPitchClass:', rootPitchClass);
            return '';
        }
        // Handle common chord type abbreviations
        const chordTypeMapping = {
            '7': 'dom7',           // Dominant 7th
            'm7': 'min7',          // Minor 7th
            'maj7': 'maj7',        // Major 7th
            'dim7': 'dim7',        // Diminished 7th
            'm': 'min',            // Minor
            'maj': 'maj',          // Major
            '': 'maj',             // Empty string = Major
            'dim': 'dim',          // Diminished
            'aug': 'aug',          // Augmented
            'sus4': 'sus4',        // Suspended 4th
            'sus2': 'sus2',        // Suspended 2nd
            'sus2/4': 'sus2sus4',  // Suspended 2nd/4th
            'sus2sus4': 'sus2sus4', // Suspended 2nd/4th (alternative)
            'ø7': 'half-dim7',     // Half-diminished 7th
            'm7b5': 'min7b5',      // Minor 7th flat 5
            '7b5': 'dom7b5',       // Dominant 7th flat 5
            '7#5': 'dom7#5',       // Dominant 7th sharp 5
            '7b9': 'dom7b9',       // Dominant 7th flat 9
            '7#9': 'dom7#9',       // Dominant 7th sharp 9
            '7#11': 'dom7#11',     // Dominant 7th sharp 11
            '7b13': 'dom7b13',     // Dominant 7th flat 13
            'alt': 'alt'           // Altered dominant
        };
        
        // Map the chord type to the internal representation
        const mappedChordType = chordTypeMapping[chordType] || chordType;
        
        if (!validateChordType(mappedChordType)) {
            console.warn('🎵 [PITCH] Invalid chordType:', chordType);
            return '';
        }
        if (!key || typeof key !== 'object' || key.rootPitchClass === undefined || !key.name) {
            console.warn('🎵 [PITCH] Invalid key object:', key);
            return '';
        }

        // Get the key degree (scale degree) of the chord root
        let keyDegreeResult = getKeyDegreeFromPitchClass(rootPitchClass, key.rootPitchClass, key.name, keys[key.name]?.intervals);
        let keyDegree = keyDegreeResult ? keyDegreeResult.degree : -1;
        let accidental = '';
        
        if (keyDegree === -1) {
            // Chord root is not in the key - find the closest scale degree and add accidental
            const keyIntervals = keys[key.name]?.intervals;
            if (!keyIntervals) {
                console.warn('🎵 [PITCH] Invalid key intervals for:', key.name);
                return '';
            }
            
            // Find the closest scale degree by checking each scale degree
            let minDistance = Infinity;
            let closestDegree = 1;
            
            for (let degree = 1; degree <= 7; degree++) {
                const scalePitchClass = (key.rootPitchClass + keyIntervals[degree - 1]) % 12;
                const distance = Math.min(
                    (rootPitchClass - scalePitchClass + 12) % 12,
                    (scalePitchClass - rootPitchClass + 12) % 12
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestDegree = degree;
                }
            }
            
            // Determine if we need a sharp or flat
            const scalePitchClass = (key.rootPitchClass + keyIntervals[closestDegree - 1]) % 12;
            const semitoneDiff = (rootPitchClass - scalePitchClass + 12) % 12;
            
            if (semitoneDiff === 1) {
                accidental = '#';
            } else if (semitoneDiff === 11) {
                accidental = '#';
            } else if (semitoneDiff === 10) {
                accidental = 'b';
            } else if (semitoneDiff === 2) {
                accidental = 'b';
            }
            
            keyDegree = closestDegree;
        }

        // Roman numeral mapping (1-based scale degrees)
        const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
        let romanNumeral = accidental + romanNumerals[keyDegree];

        // Determine case (uppercase for major/dominant, lowercase for minor/diminished)
        // and add chord type suffix
        let suffix = '';
        
        switch (mappedChordType) {
            case 'maj':
            case 'maj7':
            case 'maj9':
            case 'maj13':
                // Major chords - keep uppercase
                break;
            case 'min':
            case 'min7':
            case 'min9':
            case 'min13':
                // Minor chords - make lowercase
                romanNumeral = romanNumeral.toLowerCase();
                break;
            case 'dom7':
            case 'dom9':
            case 'dom13':
                // Dominant 7th chords - keep uppercase, add 7
                suffix = '7';
                break;
            case 'half-dim7':
            case 'min7b5':
                // Half-diminished chords - make lowercase, add ø7
                romanNumeral = romanNumeral.toLowerCase();
                suffix = 'ø7';
                break;
            case 'dim':
            case 'dim7':
                // Diminished chords - make lowercase, add ° or °7
                romanNumeral = romanNumeral.toLowerCase();
                suffix = chordType === 'dim' ? '°' : '°7';
                break;
            case 'aug':
                // Augmented chords - keep uppercase, add +
                suffix = '+';
                break;
            case 'sus4':
                // Suspended chords - keep uppercase, add sus4
                suffix = 'sus4';
                break;
            case 'sus2':
                // Suspended chords - keep uppercase, add sus2
                suffix = 'sus2';
                break;
            default:
                // For other chord types, add the chord type as suffix
                suffix = chordType;
                break;
        }

        return romanNumeral + suffix;
    }

    /**
     * Generate absolute pitches for a chord from a root note and chord type
     * Input: rootNote (string), chordType (string), chordTypes (object), rootOctave (number, default 3)
     * Output: array of absolute pitch numbers
     */
    function generateChordPitches(rootNote, chordType, chordTypes, rootOctave = 3) {
        const chordData = chordTypes[chordType];
        if (!chordData) return [];
        
        // Convert root note to pitch class
        const rootPitchClass = noteToPitchClass(rootNote);
        if (rootPitchClass === -1) return [];
        
        // Calculate root absolute pitch
        const rootPitch = (rootOctave + 1) * 12 + rootPitchClass;
        
        // Apply intervals to get absolute pitches
        return chordData.intervals.map(interval => {
            return rootPitch + interval;
        });
    }

    /**
     * Get the leftmost, middle Y coordinate for a given pitch
     * Input: pitch (number), gridFormat (object with width, height, originPitch)
     * Output: coordinate object {x, y} that is the leftmost and closest to middle Y
     */
    function getLeftMiddleGridCoordFromPitch(pitch, gridFormat) {
        const { width, height, originPitch } = gridFormat;
        
        // Get all coordinates for the pitch
        const allCoords = getAllCloneCoordsForPitch(pitch, originPitch, width, height);
        
        if (allCoords.length === 0) {
            throw new Error(`No coordinates found for pitch ${pitch}`);
        }
        
        // Find the coordinate with lowest X and closest to middle Y
        const middleY = (height - 1) / 2;
        let bestCoord = null;
        let minX = Infinity;
        let minDistanceToMiddleY = Infinity;
        
        for (const coord of allCoords) {
            if (coord.x < minX) {
                minX = coord.x;
                minDistanceToMiddleY = Math.abs(coord.y - middleY);
                bestCoord = coord;
            } else if (coord.x === minX) {
                const distanceToMiddleY = Math.abs(coord.y - middleY);
                if (distanceToMiddleY < minDistanceToMiddleY) {
                    minDistanceToMiddleY = distanceToMiddleY;
                    bestCoord = coord;
                }
            }
        }
        
        return bestCoord;
    }

    /**
     * Generate absolute pitch from note name and octave
     * Input: note (string), octave (number, default 3)
     * Output: absolute pitch number
     */
    function generateNotePitch(note, octave = 3) {
        const pitchClass = noteToPitchClass(note);
        if (pitchClass === -1) {
            throw new Error(`Invalid note: ${note}`);
        }
        
        return (octave + 1) * 12 + pitchClass;
    }

    /**
     * Get Roman numeral notation for a single note (root) in a given key
     * @param {string} note - The note name (e.g., 'C', 'D#', 'Bb')
     * @param {Object} key - The key object with rootNote and name properties
     * @returns {string} - Roman numeral notation (e.g., 'I', 'ii', 'V', etc.)
     */
    function getRomanNumeralForNoteInKey(note, key) {
        if (!note || !key || !key.rootNote || !key.name) {
            return '';
        }
        
        const notePitchClass = noteToPitchClass(note);
        if (notePitchClass === -1) {
            return '';
        }
        
        const keyRootPitchClass = noteToPitchClass(key.rootNote);
        if (keyRootPitchClass === -1) {
            return '';
        }
        
        // Get the key degree (scale degree) of the note
        let keyDegreeResult = getKeyDegreeFromPitchClass(notePitchClass, keyRootPitchClass, key.name, keys[key.name]?.intervals);
        let keyDegree = keyDegreeResult ? keyDegreeResult.degree : -1;
        let accidental = '';
        
        if (keyDegree === -1) {
            // Note is not in the key - find the closest scale degree and add accidental
            const keyIntervals = keys[key.name]?.intervals;
            if (!keyIntervals) {
                return '';
            }
            
            // Find the closest scale degree by checking each scale degree
            let minDistance = Infinity;
            let closestDegree = 1;
            
            for (let degree = 1; degree <= 7; degree++) {
                const scalePitchClass = (keyRootPitchClass + keyIntervals[degree - 1]) % 12;
                const distance = Math.min(
                    (notePitchClass - scalePitchClass + 12) % 12,
                    (scalePitchClass - notePitchClass + 12) % 12
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestDegree = degree;
                }
            }
            
            // Determine if we need a sharp or flat
            const scalePitchClass = (keyRootPitchClass + keyIntervals[closestDegree - 1]) % 12;
            const semitoneDiff = (notePitchClass - scalePitchClass + 12) % 12;
            
            if (semitoneDiff === 1) {
                accidental = '#';
            } else if (semitoneDiff === 11) {
                accidental = '#';
            } else if (semitoneDiff === 10) {
                accidental = 'b';
            } else if (semitoneDiff === 2) {
                accidental = 'b';
            }
            
            keyDegree = closestDegree;
        }

        // Roman numeral mapping (1-based scale degrees)
        const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
        let romanNumeral = accidental + romanNumerals[keyDegree];
        
        // Determine case based on key type and scale degree
        // For major keys: I, IV, V are uppercase; ii, iii, vi, vii are lowercase
        // For minor keys: i, iv, v are lowercase; III, VI, VII are uppercase
        if (key.name === 'major') {
            // Major key: 1, 4, 5 are major (uppercase), 2, 3, 6, 7 are minor (lowercase)
            if (keyDegree === 2 || keyDegree === 3 || keyDegree === 6 || keyDegree === 7) {
                romanNumeral = romanNumeral.toLowerCase();
            }
        } else if (key.name === 'natural-minor') {
            // Natural minor: 1, 4, 5 are minor (lowercase), 3, 6, 7 are major (uppercase)
            if (keyDegree === 1 || keyDegree === 4 || keyDegree === 5) {
                romanNumeral = romanNumeral.toLowerCase();
            }
        } else if (key.name === 'harmonic-minor') {
            // Harmonic minor: 1, 4 are minor (lowercase), 3, 5, 6, 7 are major (uppercase)
            if (keyDegree === 1 || keyDegree === 4) {
                romanNumeral = romanNumeral.toLowerCase();
            }
        } else if (key.name === 'melodic-minor') {
            // Melodic minor: 1 is minor (lowercase), 3, 4, 5, 6, 7 are major (uppercase)
            if (keyDegree === 1) {
                romanNumeral = romanNumeral.toLowerCase();
            }
        } else {
            // For other modes, use the diatonic pattern
            const diatonicTriads = getDiatonicTriads(key.name);
            const chordType = diatonicTriads[keyDegree - 1];
            if (chordType === 'min' || chordType === 'dim') {
                romanNumeral = romanNumeral.toLowerCase();
            }
        }
        
        return romanNumeral;
    }

// Export the public API

// Export the public API
export {
    musicalNotes,
    musicalNotesFlats,
    chordTypes,
    keys,
    // Core pitch conversion functions
    noteToPitchClass,
    pitchClassToNote,
    getOriginPitch,
    getPitchAt,
    getPitchFromNote,
    getNoteFromPitch,
    pitchToNoteAndOctave,
    getPitchInfo,
    // Grid coordinate functions
    getAllCloneCoordsForPitch,
    getPitchAndCloneFromCoord,
    getCoordFromPitchAndClone,
    selectChordClonesManhattan,
    selectChordClonesWithIndices,
    calculateTonicCoordinates,
    calculateChromaticPosition,
    calculateAllChordButtonPositions,
    // Chord functions
    getDiatonicTriads,
    getDiatonicTetrads,
    getShortChordName,
    generateChordNotes,
    detectChord,
    // Key functions
    normalizeNoteName,
    getKeySignature,
    shouldUseFlats,
    getIntervalName,
    isPitchInKey,
    generateKeyNotes,
    getKeyDegree,
    // Utility functions
    arraysEqual,
    stackChordNotes,
    getCoordinatesForNote,
    getAllNoteCoordinates,
    getAllGridPitches,
    getCoordinatesForNoteInOctave,
    isMusicalKey,
    getNoteFromMusicalKey,
    // Pitch-class-first functions
    isPitchClassInKey,
    generateKeyPitchClasses,
    generateChordPitchClasses,
    getKeyDegreeFromPitchClass,
    getChromaticOffset,
    pitchClassesToNotes,
    notesToPitchClasses,
    calculateAllChordButtonPositionsFromPitchClasses,
    generateAscendingScalePattern,
    // Roman numeral functions
    getRomanNumeralForChordInKey,
    // Validation helper functions
    validateChordType,
    validateKeyType,
    validatePitchClass,
    validatePitch,
    generateChordPitches,
    getLeftMiddleGridCoordFromPitch,
    generateNotePitch,
    getRomanNumeralForNoteInKey
};
