// Musical Grid System
import * as PitchUtils from './pitch-utils.js';
import { AudioManager } from './audio-manager.js';
import { Sequencer } from './sequencer.js';
import { PitchDetection } from './pitch-detection.js';
import { NoteDetection } from './note-detection.js';
import { NoteDetectionUI } from './note-detection-ui.js';

class MusicalGrid {
    constructor() {
        this.gridSize = 8; // Default grid size
        this.grid = this.createGrid(this.gridSize, this.gridSize);
        // Use PitchUtils for all pitch-related functions instead of duplicating logic
        this.noteToPitchClass = PitchUtils.noteToPitchClass;
        this.pitchClassToNote = PitchUtils.pitchClassToNote;
        this.activeNotes = new Set();
        
        // Initialize chord display mode (default to chord)
        this.chordDisplayMode = 'chord'; // Track which notes are currently active
        this.keyNotes = new Set(); // Track key notes separately
        this.chordNotes = new Set(); // Track chord notes separately
        this.actualClickedNotes = new Map(); // Track actual clicked coordinates: note -> {x, y}
        this.currentKey = null; // Current key data for degree calculation
        this.keyDegreeRootCoords = new Map(); // Track root coordinates for each key degree: degree -> {x, y}
        this.showAllChords = false; // Track which chord container to show
        
        // Use PitchUtils for chord and key definitions
        this.chordTypes = PitchUtils.chordTypes;
        this.keys = PitchUtils.keys;
        
        // Initialize AudioManager
        this.audioManager = new AudioManager();
        
        // Initialize Sequencer
        this.sequencer = new Sequencer(this.audioManager);
        this.sequencer.setCallbacks(
            () => this.updatePlayPauseButton(), // UI update callback
            (sequenceItem, index) => this.handleSequenceItemChange(sequenceItem, index), // Sequence item change callback
            (message, type = 'error') => this.showNotification(message, type) // Error callback
        );
        
        // Initialize Pitch Detection
        this.pitchDetection = new PitchDetection();
        this.pitchDetection.setCallbacks(
            (message, type) => this.updatePitchStatus(message, type), // Status update callback
            (chord) => this.handleChordDetected(chord), // Chord detected callback
            (frequency) => this.trackPitchVariance(frequency) // Pitch variance tracking callback
        );
        
        // Initialize noise gate display on startup
        setTimeout(() => {
            if (this.pitchDetection) {
                // Initialize noise gate display
                this.updateNoiseGateDisplay();
            }
        }, 2000); // Wait 2 seconds after initialization
        
        // Pass the getPitchAt function to the sequencer
        this.sequencer.getPitchAt = (x, y) => this.getPitchAt(x, y);
        
        // Tone.js audio system
        this.piano = null;
        this.midiAccess = null;
        this.midiOutputs = [];
        this.currentNotes = [];
        this.isPlayingScale = false;
        this.scalePlaybackIndex = 0;
        this.scalePlaybackTimer = null;
        this.hasUserInteracted = false; // Track if user has interacted
        this.forceAudioInit = false; // Track if we need to force audio initialization
        this.audioReady = false; // Track if audio is ready for playback
        this.cloneMode = 1; // Track clone display mode: 0=hide, 1=show clones, 2=show all octaves
        
        // Audio and playback
        this.audioContext = null;
        this.midiOutput = null;
        this.scalePlaybackInterval = null;
        this.currentScaleNoteIndex = 0;
        
        // Sequencer
        
        // Grid label mode
        this.gridLabelMode = 'absolute'; // 'relative', 'absolute', or 'none'
        
        // Play mode toggle
        this.playMode = 'tap-chords'; // 'draw-chords', 'tap-chords', or 'tap-notes'
        
        // In-memory settings (no localStorage)
        this.chordSpellingsMode = 'most-common';
        
        // Initialize tuner display mode
        this.tunerDisplayMode = 'normal';
        
        // Initialize tuner collapse state
        this.tunerCollapsed = true;
        
        // Initialize tuner tracking
        this.activeTuner = null; // Track which tuner is currently active
        
        // Current song name (in-memory)
        this.currentSongName = null;
        
        // Drag state tracking
        this.isDragging = false;
        this.currentlyHoveredNote = null;
        this.currentlyHoveredOctave = null;
        
        // Minimum sustain tracking
        this.minimumSustainScheduled = false;
        
        // Initialize Note Detection (independent from tuner)
        this.noteDetection = new NoteDetection();
        // NoteDetectionUI will be initialized after DOM is set up
        
        this.init();
    }
    

    
    // Pitch variance tracking callback
    trackPitchVariance(frequency) {

        // Call the actual trackPitchVariance method
        this._trackPitchVariance(frequency);
    }
    
    handleChordDetected(chord) {
        // This method will be called when a chord is detected by the pitch detection module

    }

    getPlayModeDisplayName(mode) {
        const displayNames = {
            'draw-chords': 'Draw Chords',
            'tap-chords': 'Tap Chords', 
            'tap-notes': 'Tap Notes'
        };
        return displayNames[mode] || mode;
    }

    // Create a 2D array grid with absolute pitch values
    createGrid(width, height) {
        const grid = [];
        for (let y = 0; y < height; y++) {
            grid[y] = [];
            for (let x = 0; x < width; x++) {
                // Calculate the absolute pitch for this cell
                const pitch = PitchUtils.getPitchAt(x, y, PitchUtils.getOriginPitch());
                grid[y][x] = {
                    pitch: pitch.pitch, // Store absolute pitch value (0-127)
                    active: false,      // Whether this cell is active/selected
                    note: pitch.note,   // Note name for display
                    octave: pitch.octave // Octave for display
                };
            }
        }
        return grid;
    }

    // Get key degree for a note relative to current key
    getKeyDegree(note) {
        if (!this.currentKey) return null;
        
        const rootPitchClass = this.noteToPitchClass(this.currentKey.rootNote);
        return PitchUtils.getKeyDegree(note, rootPitchClass, this.currentKey.name, this.currentKey.intervals);
    }

    // Get interval name for key degree display
    getIntervalName(interval) {
        return PitchUtils.getIntervalName(interval);
    }
    
    // Generate key name from root note and key type
    getKeyName(rootNote, keyType) {
        // Handle undefined values gracefully
        const safeRootNote = rootNote || 'Unknown';
        const safeKeyType = keyType || 'Key';
        return `${safeRootNote} ${safeKeyType}`;
    }

    // Get Roman numeral for a sequence item relative to the most recent key change
    getRomanNumeralForSequenceItem(chordItem, sequence, itemIndex) {
        if (!chordItem || chordItem.type !== 'chord' || !sequence || itemIndex < 0) {
            return null;
        }
        
        // Find the most recent key change before this chord
        let mostRecentKey = null;
        for (let i = itemIndex - 1; i >= 0; i--) {
            const item = sequence[i];
            if (item.type === 'key') {
                mostRecentKey = item;
                break;
            }
        }
        
        // If no key change found, return null
        if (!mostRecentKey) {
            return null;
        }
        
        // Calculate Roman numeral for this chord relative to the most recent key
        let chordRootNote = chordItem.rootNote;
        
        // If rootNote is not available, try to extract it from chordName
        if (!chordRootNote && chordItem.chordName) {
            // Extract root note from chord name (e.g., "A#dim7" -> "A#")
            const chordNameMatch = chordItem.chordName.match(/^([A-G][#b]?)/);
            if (chordNameMatch) {
                chordRootNote = chordNameMatch[1];
            }
        }
        
        const chordRootPitchClass = this.noteToPitchClass(chordRootNote);
        if (chordRootPitchClass === -1) {
            return null;
        }
        
        const keyRootPitchClass = this.noteToPitchClass(mostRecentKey.rootNote);
        if (keyRootPitchClass === -1) {
            return null;
        }
        
        // Extract chord type if not available
        let chordType = chordItem.chordType;
        if (!chordType && chordItem.chordName) {
            // Extract chord type from chord name (e.g., "A#dim7" -> "dim7")
            const chordTypeMatch = chordItem.chordName.match(/^[A-G][#b]?(.+)$/);
            if (chordTypeMatch) {
                chordType = chordTypeMatch[1];
            }
        }
        
        return PitchUtils.getRomanNumeralForChordInKey(chordRootPitchClass, chordType, {
            rootPitchClass: keyRootPitchClass,
            name: mostRecentKey.keyType
        });
    }

    // Get display name for a sequence item
    getSequenceItemName(item, sequence = null, itemIndex = -1) {
        
        if (item.type === 'chord') {
            // Get Roman numeral if we have sequence context
            const romanNumeral = sequence && itemIndex >= 0 ? 
                this.getRomanNumeralForSequenceItem(item, sequence, itemIndex) : null;
            
            // Check if this is a slash chord by looking for "/" in the chord name
            const isSlashChord = item.chordName && item.chordName.includes('/');
            
            // Format display name based on chord display mode
            switch (this.chordDisplayMode) {
                case 'rn':
                    if (isSlashChord) {
                        // For slash chords, show the full name with Roman numeral if available
                        return romanNumeral ? `${item.chordName} (${romanNumeral})` : item.chordName;
                    }
                    return romanNumeral || item.chordName;
                case 'chord-rn':
                    return romanNumeral ? `${item.chordName}&nbsp;<span style="color: #64748b;">(${romanNumeral})</span>` : item.chordName;
                case 'chord':
                default:
                    return item.chordName;
            }
        } else if (item.type === 'key') {
            const keyName = this.getKeyName(item.rootNote, item.keyType);
    
            return keyName;
        } else if (item.type === 'rest') {
            return 'Rest';
        }
        return 'Unknown';
    }

    // Get the appropriate label for a note based on current label mode
    getNoteLabel(note) {
        // Ensure gridLabelMode is initialized
        if (!this.gridLabelMode) {
            this.gridLabelMode = 'relative';
        }
        
        // Quick return for none mode
        if (this.gridLabelMode === 'none') {
            return '';
        }
        
        // Quick return for absolute mode
        if (this.gridLabelMode === 'absolute') {
            // Convert note to preferred accidentals for display using new system
            let displayNote = note;
            if (this.currentKey && this.currentKey.useFlats) {
                // Convert sharp to flat if needed
                const sharpToFlat = {
                    'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb'
                };
                displayNote = sharpToFlat[note] || note;
            }
            return displayNote;
        }
        
        // Roman numeral mode - show Roman numeral for the note in current key
        if (this.gridLabelMode === 'roman' && this.currentKey) {
            const romanNumeral = PitchUtils.getRomanNumeralForNoteInKey(note, this.currentKey);
            if (romanNumeral) {
                return romanNumeral;
            }
            // Return empty string for notes not in key (no Roman numeral)
            return '';
        }
        
        // Relative mode (default) - show key degree
        if (this.gridLabelMode === 'relative' && this.currentKey) {
            const keyDegree = this.getKeyDegree(note);
            if (keyDegree) {
                return keyDegree.intervalName;
            } else {
                // For accidentals (notes not in key), show sharp or flat version based on key preference
                const notePitchClass = this.noteToPitchClass(note);
                const rootPitchClass = this.noteToPitchClass(this.currentKey.rootNote);
                if (notePitchClass !== -1 && rootPitchClass !== -1) {
                    // Calculate the actual chromatic distance from root (0-11)
                    const chromaticDistance = ((notePitchClass - rootPitchClass) % 12 + 12) % 12;
                    
                    // Maps for sharp and flat labeling
                    const sharpMap = {
                        0: '1', 1: '#1', 2: '2', 3: '#2', 4: '3', 5: '4',
                        6: '#4', 7: '5', 8: '#5', 9: '6', 10: '#6', 11: '7'
                    };
                    
                    const flatMap = {
                        0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
                        6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7'
                    };
                    
                    // Use the key's preferred accidental type
                    const labelMap = this.currentKey.useFlats ? flatMap : sharpMap;
                    
                    return labelMap[chromaticDistance];
                }
            }
            // Return empty string for notes not in key
            return '';
        }
        
        // Fallback to note name only for absolute mode
        if (this.gridLabelMode === 'absolute') {
            return note;
        }
        
        // Return empty string for all other cases
        return '';
    }

    // Change grid size
    changeGridSize(newSize) {
        if (newSize < 8 || newSize > 12) {
            this.showNotification('Grid size must be between 8 and 12', 'error');
            return;
        }
        
        // Store current key and chord info before clearing
        const currentKeyRoot = this.currentKey?.rootNote || 'C';
        const currentKeyType = this.currentKey?.name || 'major';
        const currentChordRoot = document.getElementById('rootNoteSelect')?.value || 'C';
        const currentChordType = document.getElementById('chordTypeSelect')?.value || 'maj7';
        
        this.gridSize = newSize;
        this.grid = this.createGrid(this.gridSize, this.gridSize);
        this.activeNotes.clear(); // Clear active notes when changing grid size
        this.keyNotes.clear();
        this.chordNotes.clear();
        this.currentKey = null;
        
        // Recreate the grid visualization
        this.createGridVisualization();
        
        // Repopulate the key
        this.createKey(currentKeyRoot, currentKeyType);
        
        // Repopulate the chord
        this.createChord(currentChordRoot, currentChordType);
        
        // Update chord containers if they exist
        if (this.showAllChords) {
            this.generateChordButtons();
        } else {
            this.generateDiatonicChords();
        }
        
        // Update display areas
        this.updateDisplayAreas();
        
        // // this.showNotification(`Grid size changed to ${newSize}x${newSize}`, 'success');
    }

    // Get note at specific coordinates from grid data
    getNoteAt(x, y) {
        if (this.isValidCoordinate(x, y)) {
            return this.grid[y][x].note;
        }
        return null;
    }

    // ===== NEW PITCH + CLONE INDEX SYSTEM =====
    
    // Origin pitch (C2 at coordinate 0,0)

    
    // Highlight a specific pitch+clone on the grid
    highlightPitchAndClone(pitch, cloneIndex) {
        const coord = PitchUtils.getCoordFromPitchAndClone(pitch, cloneIndex, PitchUtils.getOriginPitch());
        if (coord) {
            const noteInfo = PitchUtils.getNoteFromPitch(pitch, this.currentKey?.useFlats || false);
            this.highlightGridCell(noteInfo.note, noteInfo.octave);
        }
    }
    
    // Unhighlight a specific pitch+clone on the grid
    unhighlightPitchAndClone(pitch, cloneIndex) {
        const coord = PitchUtils.getCoordFromPitchAndClone(pitch, cloneIndex, PitchUtils.getOriginPitch());
        if (coord) {
            const noteInfo = PitchUtils.getNoteFromPitch(pitch, this.currentKey?.useFlats || false);
            this.unhighlightGridCell(noteInfo.note, noteInfo.octave);
        }
    }
    
    // Play a specific pitch+clone
    playPitchAndClone(pitch, cloneIndex) {
        const noteInfo = PitchUtils.getNoteFromPitch(pitch, this.currentKey?.useFlats || false);
        this.playNote(noteInfo.note, noteInfo.octave, 2.0);
    }
    
    // Release a specific pitch+clone
    releasePitchAndClone(pitch, cloneIndex) {
        const noteInfo = PitchUtils.getNoteFromPitch(pitch, this.currentKey?.useFlats || false);
        this.releaseNote(noteInfo.note, noteInfo.octave);
    }
    
    // Highlight all clones of a pitch (cloneIndex = -1)
    highlightAllClonesOfPitch(pitch) {
        const dims = this.getGridDimensions();
        const allClones = PitchUtils.getAllCloneCoordsForPitch(pitch, PitchUtils.getOriginPitch(), dims.width, dims.height);
        allClones.forEach(({ cloneIndex }) => {
            this.highlightPitchAndClone(pitch, cloneIndex);
        });
    }
    
    // Unhighlight all clones of a pitch (cloneIndex = -1)
    unhighlightAllClonesOfPitch(pitch) {
        const dims = this.getGridDimensions();
        const allClones = PitchUtils.getAllCloneCoordsForPitch(pitch, PitchUtils.getOriginPitch(), dims.width, dims.height);
        allClones.forEach(({ cloneIndex }) => {
            this.unhighlightPitchAndClone(pitch, cloneIndex);
        });
    }
    
    // Play all clones of a pitch (cloneIndex = -1)
    playAllClonesOfPitch(pitch) {
        const dims = this.getGridDimensions();
        const allClones = PitchUtils.getAllCloneCoordsForPitch(pitch, PitchUtils.getOriginPitch(), dims.width, dims.height);
        allClones.forEach(({ cloneIndex }) => {
            this.playPitchAndClone(pitch, cloneIndex);
        });
    }
    
    // Release all clones of a pitch (cloneIndex = -1)
    releaseAllClonesOfPitch(pitch) {
        const dims = this.getGridDimensions();
        const allClones = PitchUtils.getAllCloneCoordsForPitch(pitch, PitchUtils.getOriginPitch(), dims.width, dims.height);
        allClones.forEach(({ cloneIndex }) => {
            this.releasePitchAndClone(pitch, cloneIndex);
        });
    }
    
    // ===== END NEW SYSTEM =====
    
    // Check if a pitch belongs to the current key using pure interval math
    isPitchInKey(pitch, rootNote, keyType) {
        const rootPitchClass = this.noteToPitchClass(rootNote);
        return PitchUtils.isPitchInKey(pitch, rootPitchClass, keyType, this.keys);
    }
    
    // Test the new pitch + clone index system
    testPitchSystem() {
        // Test coordinate to pitch+clone conversion
        const coord = { x: 0, y: 3 };
        const pitchAndClone = PitchUtils.getPitchAndCloneFromCoord(coord.x, coord.y, PitchUtils.getOriginPitch());
        
        // Test pitch+clone back to coordinate
        const backToCoord = PitchUtils.getCoordFromPitchAndClone(pitchAndClone.pitch, pitchAndClone.cloneIndex, PitchUtils.getOriginPitch());
        
        // Test note name to pitch
        const pitch = PitchUtils.getPitchFromNote('Eb', 3);
        
        // Test pitch to note name
        const noteInfo = PitchUtils.getNoteFromPitch(pitch, true); // Use flats
        
        // Test all clones for a pitch
        const dims = this.getGridDimensions();
        const allClones = PitchUtils.getAllCloneCoordsForPitch(pitch, PitchUtils.getOriginPitch(), dims.width, dims.height);
        
        // Test the new comprehensive pitch info method
        const testPitches = [39, 45, 60, 72]; // Eb3, A3, C4, C5
        testPitches.forEach(pitch => {
            const info = PitchUtils.getPitchInfo(pitch);
        });
    }

    // Get the actual pitch (including octave) at a coordinate
    getPitchAt(x, y) {
        // Get pitch from the grid cell data
        if (this.isValidCoordinate(x, y)) {
            const cell = this.grid[y][x];
            return {
                pitch: cell.pitch,
                note: cell.note,
                octave: cell.octave,
                totalSemitones: cell.pitch - PitchUtils.getOriginPitch()
            };
        }
        return null;
    }

    // Get all coordinates that correspond to a specific note
    getCoordinatesForNote(note) {
        const dims = this.getGridDimensions();
        return PitchUtils.getCoordinatesForNote(
            note, 
            this.getPitchAt.bind(this), 
            PitchUtils.getOriginPitch(), 
            dims.width, 
            dims.height
        );
    }

    // Get all notes and their coordinates
    getAllNoteCoordinates() {
                return PitchUtils.getAllNoteCoordinates(
            this.getCoordinatesForNote.bind(this),
            PitchUtils.pitchClassToNote
        );
    }

    // Get all unique pitches that appear on the grid (optimized)
    getAllGridPitches() {
        const dims = this.getGridDimensions();
        return PitchUtils.getAllGridPitches(
            this.getPitchAt.bind(this), 
            PitchUtils.getNoteFromPitch, 
            dims.width, 
            dims.height
        );
    }

    // Toggle a specific note on/off (chord builder only)
    toggleNote(note, clickedX = null, clickedY = null, octave = null) {
        const startTime = performance.now();
        const playOctave = octave !== null ? octave : 3;
        const noteWithOctave = `${note}${playOctave}`;
        
        if (this.chordNotes.has(noteWithOctave)) {
            // Remove note from chord set
            this.chordNotes.delete(noteWithOctave);
            this.activeNotes.delete(noteWithOctave);
            this.actualClickedNotes.delete(noteWithOctave);
        } else {
            // Add note to chord set
            this.chordNotes.add(noteWithOctave);
            this.activeNotes.add(noteWithOctave);
            
            // Store the actual clicked coordinates if provided
            if (clickedX !== null && clickedY !== null) {
                this.actualClickedNotes.set(noteWithOctave, {x: clickedX, y: clickedY});
            }
            
            // Play the note when added with the specified octave
            const playStartTime = performance.now();
            this.playNote(note, playOctave, 0.5);
            const playEndTime = performance.now();
            

            
            // If this is the first user interaction, play the default chord immediately
            if (!this.hasUserInteracted && this.chordNotes.size > 0) {
                this.playActiveNotes();
            }
        }
        
        // Update grid visualization and chord detection
        this.createGridVisualization();
        this.detectAndDisplayChord();
        
        const endTime = performance.now();

    }

    // Track currently playing notes for sustain
    currentlyPlayingNotes = new Set();
    
        // Sustain pedal state (Shift key)
    sustainPedalActive = false;
    
    // Chord modifier key states
    zKeyActive = false;
    xKeyActive = false;
    cKeyActive = false;
    vKeyActive = false;
    bKeyActive = false;
    
    // Separate piano instances for melody and chords
    melodyPiano = null;
    chordPiano = null;

    tapNote(note, octave = null, shouldSustain = false, clickTime = null) {
        const playOctave = octave !== null ? octave : 3;
        const noteName = `${note}${playOctave}`;
        
        // Ensure audio is ready
        this.ensureAudioReady();
        
        if (!this.melodyPiano || !this.audioReady) {
            return;
        }
        
        try {
            const audioStartTime = performance.now();
            
            // Always start the note - the sustain behavior is controlled by the mouseup handler
            this.melodyPiano.triggerAttack(noteName, Tone.now());
            this.currentlyPlayingNotes.add(noteName);
            
            const audioEndTime = performance.now();
            const audioLatency = audioEndTime - audioStartTime;
            

            

        } catch (error) {
            console.error('🎵 [TAP] Error starting note:', {
                note: noteName,
                error: error
            });
        }
    }

    // Release a specific note
    releaseNote(note, octave = null, releaseTime = 0.1) {
        const playOctave = octave !== null ? octave : 3;
        const noteName = `${note}${playOctave}`;
        
        // If sustain pedal is active, don't release the note yet
        if (this.sustainPedalActive) {

            return;
        }
        
        if (this.currentlyPlayingNotes.has(noteName)) {
            try {
                // SCHEDULED RELEASE: Use releaseTime to schedule the release in the future
                // This allows us to implement minimum piano sustain (e.g., 500ms) for quick taps
                // while still maintaining control over when notes release during dragging
                this.melodyPiano.triggerRelease(noteName, Tone.now() + releaseTime);
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

                
                // Remove visual highlight for this note
                const noteMatch = noteName.match(/^([A-G]#?b?)(\d+)$/);
                if (noteMatch) {
                    const note = noteMatch[1];
                    const octave = parseInt(noteMatch[2]);
                    this.unhighlightGridCell(note, octave);
                }
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

    // Highlight grid cell for musical typing visual feedback
    highlightGridCell(note, octave) {
        const coords = this.getCoordinatesForNoteInOctave(note, octave);

        
        // Handle array of coordinates
        const coordArray = Array.isArray(coords) ? coords : [coords];
        
        coordArray.forEach((coord) => {
            if (coord && this.isValidCoordinate(coord.x, coord.y)) {
                // Find the cell by its position in the grid
                const dims = this.getGridDimensions();
                const displayY = dims.height - 1 - coord.y; // Convert to display coordinates
                const cellIndex = displayY * dims.width + coord.x;
                const cells = document.querySelectorAll('#grid-container > div');
                
                if (cells[cellIndex]) {
                    cells[cellIndex].classList.add('clicked');
                }
            }
        });
    }

    // Remove highlight from grid cell
    unhighlightGridCell(note, octave) {
        const coords = this.getCoordinatesForNoteInOctave(note, octave);
        
        // Handle array of coordinates
        const coordArray = Array.isArray(coords) ? coords : [coords];
        
        coordArray.forEach((coord, index) => {
            if (coord && this.isValidCoordinate(coord.x, coord.y)) {
                // Find the cell by its position in the grid
                const dims = this.getGridDimensions();
                const displayY = dims.height - 1 - coord.y; // Convert to display coordinates
                const cellIndex = displayY * dims.width + coord.x;
                const cells = document.querySelectorAll('#grid-container > div');
                
                if (cells[cellIndex]) {
                    cells[cellIndex].classList.remove('clicked');
                }
            }
        });
    }

    // Test method to manually highlight a cell for debugging
    testHighlight() {
        const cells = document.querySelectorAll('#grid-container > div');
        
        if (cells.length > 0) {
            // Test highlighting the first cell
            cells[0].classList.add('clicked');
            
            // Remove after 2 seconds
            setTimeout(() => {
                cells[0].classList.remove('clicked');
            }, 2000);
        }
    }

    // Remove clicked styling from all grid cells
    removeAllClickedStyling() {
        const cells = document.querySelectorAll('#grid-container > div');
        cells.forEach(cell => {
            cell.classList.remove('clicked');
        });
    }

    // Setup global mouseup handler for sustain behavior
    setupSustainHandlers() {
        // Add global mouseup handler to release notes if mouse moves outside grid
        document.addEventListener('mouseup', (event) => {
            // Only handle global mouseup if we're in tap-notes mode and have playing notes
            // AND the mouseup didn't happen on a grid cell (which has its own handler)
            // AND the sustain pedal is not active
            if (this.playMode === 'tap-notes' && 
                this.currentlyPlayingNotes.size > 0 && 
                !event.target.closest('#grid-container') &&
                !this.sustainPedalActive) {
        
                this.releaseAllNotes();
            }
        });
    }

    // Check if a key is a musical typing key
    isMusicalKey(key) {
        return PitchUtils.isMusicalKey(key);
    }

    // Get the note from a musical key, using optimized pitch system
    getNoteFromMusicalKey(key) {
        return PitchUtils.getNoteFromMusicalKey(key, this.getDiatonicChordFromNumber.bind(this), PitchUtils.getNoteFromPitch);
    }

    // Get diatonic chord from number key (0-9) - using optimized pitch system
    getDiatonicChordFromNumber(number) {

        if (!this.currentKey) {

            return null;
        }
        

        
        // Convert number to key degree (0 = 10th degree, 1-9 = 1st-9th degree)
        let keyDegree;
        if (number === 0) {
            keyDegree = 10; // 0 represents the 10th key degree
        } else {
            keyDegree = number; // 1-9 represent 1st-9th key degrees
        }
        
        if (keyDegree < 1 || keyDegree > 10) {

            return null;
        }
        
        // Get the root note for this key degree - use modulo like chord buttons
        const keyNotes = Array.from(this.keyNotes);
        const buttonIndex = keyDegree - 1; // Convert to 0-based index
        const rootNote = keyNotes[buttonIndex % keyNotes.length]; // Use modulo for note selection
        

        
        // Get the chord type using the same logic as chord buttons
        const keyType = this.currentKey.name;
        const diatonicTriads = PitchUtils.getDiatonicTriads(keyType);
        const diatonicTetrads = PitchUtils.getDiatonicTetrads(keyType);
        
        // Use the exact same logic as generateDiatonicChords
        const triadType = diatonicTriads[buttonIndex]; // Use buttonIndex directly like chord buttons
        const tetradType = diatonicTetrads[buttonIndex]; // Use buttonIndex directly like chord buttons
        
        // Determine chord type using the same logic as chord buttons
        let chordType;

        
        if (tetradType && ['maj7', 'min7', 'dom7', 'half-dim7', 'minmaj7', 'maj7#5', 'dim7'].includes(tetradType)) {
            // Use tetrad
            let rowIndex;
            switch (tetradType) {
                case 'maj7': rowIndex = 4; break;
                case 'min7': rowIndex = 5; break;
                case 'dom7': rowIndex = 6; break;
                case 'half-dim7': rowIndex = 7; break;
                case 'minmaj7': rowIndex = 9; break;
                case 'maj7#5': rowIndex = 10; break;
                case 'dim7': rowIndex = 8; break;
                default: rowIndex = 4;
            }
            chordType = ['maj', 'min', 'dim', 'aug', 'maj7', 'min7', 'dom7', 'half-dim7', 'dim7', 'minmaj7', 'maj7#5'][rowIndex];
        } else {
            // Use triad
            let rowIndex;
            switch (triadType) {
                case 'maj': rowIndex = 0; break;
                case 'min': rowIndex = 1; break;
                case 'dim': rowIndex = 2; break;
                case 'aug': rowIndex = 3; break;
                default: rowIndex = 0;
            }
            chordType = triadType;
        }
        
        // Calculate octave using the same logic as chord buttons
        const octave = 3 + Math.floor(buttonIndex / keyNotes.length);
        
        // Use optimized pitch system for grid placement
        const rootPitch = PitchUtils.getPitchFromNote(rootNote, octave);
        const tonicPitch = PitchUtils.getPitchFromNote(keyNotes[0], 3); // Tonic in octave 3
        const chromaticOffset = (rootPitch - tonicPitch + 12) % 12;
        
        // The chord positions are stored by buttonIndex (0-9), not by chromatic offset
        const calculatedPos = this.getCalculatedChordPosition(buttonIndex, octave);
        

        
        return {
            type: 'chord',
            rootNote: rootNote,
            chordType: chordType,
            keyDegree: keyDegree,
            octave: octave,
            calculatedPos: calculatedPos
        };
    }

    // Play chord audio for musical typing (optimized)
    playChordAudio(rootNote, chordType) {
        // Ensure audio is ready
        this.ensureAudioReady();
        
        // Use the actual chord notes with octaves from the grid
        const chordNotesWithOctaves = Array.from(this.chordNotes);
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

    // Detect chord from active notes - returns multiple interpretations sorted by commonness
    detectChord(notes, actualPitches = null) {
        return PitchUtils.detectChord(notes, this.chordTypes, actualPitches);
    }
    
    // Helper method to compare arrays
    arraysEqual(a, b) {
        return PitchUtils.arraysEqual(a, b);
    }
    
    // Update chord display only (without changing dropdowns)
    updateChordDisplayOnly() {
        const chordNotesArray = Array.from(this.chordNotes);
        // Extract pitch classes (remove octaves) for chord detection
        const pitchClasses = chordNotesArray.map(note => note.replace(/\d+$/, ''));
        
        // Get actual pitches for diminished chord priority
        const actualPitches = [];
        chordNotesArray.forEach(note => {
            const coords = this.actualClickedNotes.get(note);
            if (coords) {
                const pitch = this.getPitchAt(coords.x, coords.y);
                if (pitch && pitch.pitch !== undefined) {
                    actualPitches.push(pitch.pitch);
                }
            }
        });
        
        const detectedChords = this.detectChord(pitchClasses, actualPitches);
        
        // Update chord display
        const chordDisplay = document.getElementById('chordDisplay');
        if (chordDisplay) {
            if (detectedChords && detectedChords.length > 0) {
                const primaryChord = detectedChords[0];
                
                // Show multiple interpretations if they exist (especially for symmetric chords)
                if (detectedChords.length > 1) {
                    // Deduplicate chord interpretations to avoid redundancy
                    const uniqueChords = [];
                    const seen = new Set();
                    
                    for (const chord of detectedChords) {
                        const chordKey = `${chord.rootNote} ${chord.chordType}`;
                        if (!seen.has(chordKey)) {
                            seen.add(chordKey);
                            uniqueChords.push(chord);
                        }
                    }
                    
                    if (uniqueChords.length > 1) {
                        const interpretations = uniqueChords.map(chord => chord.fullName).join(' / ');
                        chordDisplay.textContent = `Detected: ${interpretations}`;
                    } else {
                        chordDisplay.textContent = `Detected: ${uniqueChords[0].fullName}`;
                    }
                } else {
                    chordDisplay.textContent = `Detected: ${primaryChord.fullName}`;
                }
                chordDisplay.style.color = '#48bb78';
            } else {
                if (chordNotesArray.length > 0) {
                    // For unknown chords, show the notes with "..." if too many
                    const maxNotes = 4; // Show up to 4 notes before adding "..."
                    let displayText;
                    if (chordNotesArray.length <= maxNotes) {
                        displayText = `Chord Notes: ${chordNotesArray.join(', ')}`;
                    } else {
                        displayText = `Chord Notes: ${chordNotesArray.slice(0, maxNotes).join(', ')}...`;
                    }
                    chordDisplay.textContent = displayText;
                    chordDisplay.style.color = '#f6ad55';
                } else {
                    chordDisplay.textContent = 'No chord notes selected';
                    chordDisplay.style.color = '#a0aec0';
                }
            }
        }
    }

    // Detect and display chord in the UI
    detectAndDisplayChord() {
        const chordNotesArray = Array.from(this.chordNotes);
        // Extract pitch classes (remove octaves) for chord detection
        const pitchClasses = chordNotesArray.map(note => note.replace(/\d+$/, ''));
        

        
        // Get actual pitches for diminished chord priority
        const actualPitches = [];
        chordNotesArray.forEach(note => {
            const coords = this.actualClickedNotes.get(note);
            if (coords) {
                const pitch = this.getPitchAt(coords.x, coords.y);
                if (pitch && pitch.pitch !== undefined) {
                    actualPitches.push(pitch.pitch);
                }
            }
        });
        
        const detectedChords = this.detectChord(pitchClasses, actualPitches);
        
        // Update chord display
        const chordDisplay = document.getElementById('chordDisplay');
        if (chordDisplay) {
            if (detectedChords && detectedChords.length > 0) {
                const primaryChord = detectedChords[0];
                
                // Show multiple interpretations if they exist (especially for symmetric chords)
                if (detectedChords.length > 1) {
                    // Deduplicate chord interpretations to avoid redundancy
                    const uniqueChords = [];
                    const seen = new Set();
                    
                    for (const chord of detectedChords) {
                        const chordKey = `${chord.rootNote} ${chord.chordType}`;
                        if (!seen.has(chordKey)) {
                            seen.add(chordKey);
                            uniqueChords.push(chord);
                        }
                    }
                    
                    if (uniqueChords.length > 1) {
                        const interpretations = uniqueChords.map(chord => chord.fullName).join(' / ');
                        chordDisplay.textContent = `Detected: ${interpretations}`;
                    } else {
                        chordDisplay.textContent = `Detected: ${uniqueChords[0].fullName}`;
                    }
                } else {
                    chordDisplay.textContent = `Detected: ${primaryChord.fullName}`;
                }
                chordDisplay.style.color = '#48bb78';
                
                // Update chord builder dropdowns to match detected chord
                const rootNoteSelect = document.getElementById('rootNoteSelect');
                const chordTypeSelect = document.getElementById('chordTypeSelect');
                
                if (rootNoteSelect && chordTypeSelect) {
                    // Find the root note in the dropdown (handle enharmonics)
                    const rootNoteOption = Array.from(rootNoteSelect.options).find(option => {
                        const optionValue = option.value;
                        // Check for exact match first
                        if (optionValue === primaryChord.rootNote) {
                            return true;
                        }
                        // Check if it's an enharmonic match (e.g., "D#/Eb" for "D#" or "Eb")
                        if (optionValue.includes('/')) {
                            const [first, second] = optionValue.split('/');
                            return first === primaryChord.rootNote || second === primaryChord.rootNote;
                        }
                        return false;
                    });
                    
                    if (rootNoteOption) {
                        rootNoteSelect.value = rootNoteOption.value;
                    }
                    
                                    chordTypeSelect.value = primaryChord.chordType;
            }
        } else {
            if (chordNotesArray.length > 0) {
                // For unknown chords, show the notes with "..." if too many
                const maxNotes = 4; // Show up to 4 notes before adding "..."
                let displayText;
                if (chordNotesArray.length <= maxNotes) {
                    displayText = `Chord Notes: ${chordNotesArray.join(', ')}`;
                } else {
                    displayText = `Chord Notes: ${chordNotesArray.slice(0, maxNotes).join(', ')}...`;
                }
                chordDisplay.textContent = displayText;
                chordDisplay.style.color = '#f6ad55';
            } else {
                chordDisplay.textContent = 'No chord notes selected';
                chordDisplay.style.color = '#a0aec0';
            }
        }
        }
        
        // Update the display areas to reflect the new chord detection
        this.updateDisplayAreas();
    }

    // Update the visual state of note buttons (chord notes only)


    // Create a musical pattern (chord, key, etc.)
    createMusicalPattern(patternType = 'chord') {
        this.fillGrid(false);
        this.activeNotes.clear(); // Clear active notes when creating patterns
        
        let patternNotes = [];
        switch (patternType) {
            case 'c-major-chord':
                // C major chord: C, E, G
                patternNotes = ['C', 'E', 'G'];
                break;
            case 'c-minor-chord':
                // C minor chord: C, Eb, G
                patternNotes = ['C', 'Eb', 'G'];
                break;
            case 'c-major-key':
                // C major key: C, D, E, F, G, A, B
                patternNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
                break;
            case 'chromatic-key':
                // All 12 notes
                patternNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                break;
        }
        
        // Add all pattern notes to active notes and grid
        patternNotes.forEach(note => {
            this.activeNotes.add(note);
            const coords = this.getCoordinatesForNote(note);
            coords.forEach(coord => {
                this.setGridValue(coord.x, coord.y, true);
            });
        });
        
        this.createGridVisualization();
        // // this.showNotification(`Created ${patternType} pattern!`, 'success');
    }

    // Create a chord based on root note and chord type
    createChord(rootNote, chordType, keyDegree = 0, rootCloneIndex = null) {
        
        // Clear only chord notes, keep key notes
        this.chordNotes.clear();
        this.actualClickedNotes.clear();
        
        // Get the base note (first part before slash for enharmonics)
        const baseNote = rootNote.split('/')[0];
        const baseNoteIndex = this.noteToPitchClass(baseNote);
        
        if (baseNoteIndex === -1) {
            this.showNotification(`Invalid root note: ${rootNote}`, 'error');
            return;
        }
        
        const chordTypeData = this.chordTypes[chordType];
        if (!chordTypeData) {
            this.showNotification(`Invalid chord type: ${chordType}`, 'error');
            return;
        }
        
        // STEP 1: Calculate the proper pitches from intervals
        const chordPitches = chordTypeData.intervals.map(interval => {
            const noteIndex = (baseNoteIndex + interval) % 12;
            const note = this.pitchClassToNote(noteIndex, false); // Use sharps for internal processing
            return {
                note: note,
                noteIndex: noteIndex,
                interval: interval
            };
        });
        

        
        // STEP 2: Select the proper clone coordinates in the grid using Manhattan distance
        let selectedCoords = [];
        
        // COMPARISON: Try the new Manhattan distance approach
        const chordPitchesArray = chordPitches.map(pitchInfo => {
            // Convert note to absolute pitch in octave 3
            const noteIndex = pitchInfo.noteIndex;
            return noteIndex + (3 + 1) * 12; // Octave 3 = +48
        });
        

        
        let manhattanClones;
        
        if (rootCloneIndex !== null) {
    
            // Create preferred clone indices array: specify root, let others be automatic
            const preferredCloneIndices = [rootCloneIndex];
            manhattanClones = PitchUtils.selectChordClonesManhattan(
                chordPitchesArray, 
                PitchUtils.getOriginPitch(), 
                8, 8,
                preferredCloneIndices
            );
        } else {
    
            manhattanClones = PitchUtils.selectChordClonesManhattan(
                chordPitchesArray, 
                PitchUtils.getOriginPitch(), 
                8, 8
            );
        }
        
        // Use the Manhattan selection result directly
        selectedCoords = manhattanClones.map(clone => ({
            note: PitchUtils.getNoteFromPitch(clone.pitch).note,
            coord: clone.coord,
            pitch: this.getPitchAt(clone.coord.x, clone.coord.y)
        }));
        
        // Add all selected notes to chord notes set and store their coordinates
        selectedCoords.forEach(({ note, coord, pitch }) => {
            const noteWithOctave = `${note}${pitch.octave}`;
            this.chordNotes.add(noteWithOctave);
            this.activeNotes.add(noteWithOctave);
            this.actualClickedNotes.set(noteWithOctave, coord);
        });
        
        // Preserve key visualization by setting grid values for key notes
        this.keyNotes.forEach(note => {
            const coords = this.getCoordinatesForNote(note);
            if (coords && coords.length > 0) {
                // Set the first coordinate for each key note
                this.setGridValue(coords[0].x, coords[0].y, 1);
            }
        });
        

        
        this.createGridVisualization();
        this.updateChordDisplayOnly();
        this.updateDisplayAreas();
        // // this.showNotification(`Created ${rootNote} ${chordTypeData.name} chord!`, 'success');
    }

    // Get grid dimensions
    getGridDimensions() {
        return {
            width: this.grid[0].length,
            height: this.grid.length
        };
    }

    // Set cell active state at specific coordinates
    setGridValue(x, y, active) {
        if (this.isValidCoordinate(x, y)) {
            this.grid[y][x].active = active;
            return true;
        }
        return false;
    }

    // Get cell active state at specific coordinates
    getGridValue(x, y) {
        if (this.isValidCoordinate(x, y)) {
            return this.grid[y][x].active;
        }
        return null;
    }

    // Check if coordinates are valid
    isValidCoordinate(x, y) {
        const dims = this.getGridDimensions();
        return x >= 0 && x < dims.width && y >= 0 && y < dims.height;
    }

    // Fill the entire grid with active state
    fillGrid(active) {
        const dims = this.getGridDimensions();
        for (let y = 0; y < dims.height; y++) {
            for (let x = 0; x < dims.width; x++) {
                this.grid[y][x].active = active;
            }
        }
    }

    // Create a visual representation of the grid on the page
    createGridVisualization(containerId = 'grid-container') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return;
        }
        
        // Clear the container
        container.innerHTML = '';
        
        // Ensure key notes are properly set in the grid
        this.keyNotes.forEach(note => {
            const coords = this.getCoordinatesForNote(note);
            if (coords && coords.length > 0) {
                // Set the first coordinate for each key note to ensure they're displayed
                this.setGridValue(coords[0].x, coords[0].y, 1);
            }
        });
        
        const dims = this.getGridDimensions();
        const cellSize = Math.min(500 / dims.width, 500 / dims.height) - 1;
        
        // Set grid template
        container.style.cssText = `
            display: grid;
            grid-template-columns: repeat(${dims.width}, ${cellSize}px);
            grid-template-rows: repeat(${dims.height}, ${cellSize}px);
            gap: 1px;
            background: #333;
            padding: 10px;
            border-radius: 8px;
            width: ${dims.width * cellSize + (dims.width - 1) + 20}px;
            height: ${dims.height * cellSize + (dims.height - 1) + 20}px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            transform: rotate(-45deg);
            transform-origin: center;
            justify-content: center;
            align-content: center;
            position: absolute;
            top: 50%;
            left: 50%;
            z-index: 2;
            pointer-events: auto;
            translate: -50% -50%;
        `;

        // Render from bottom to top (y=49 to y=0) so origin is at bottom left
        for (let displayY = 0; displayY < dims.height; displayY++) {
            const actualY = dims.height - 1 - displayY; // Flip Y coordinate for display
            for (let x = 0; x < dims.width; x++) {
                const cell = document.createElement('div');
                // Use the actualY coordinate (0 at bottom in note system) for note calculation
                const note = this.getNoteAt(x, actualY);
                const pitch = this.getPitchAt(x, actualY);
                
                        // Check if this note belongs to the current key (pure interval math)
        let isKeyNote = false;
        if (this.currentKey) {
            isKeyNote = this.isPitchInKey(pitch.pitch, this.currentKey.rootNote, this.currentKey.name);

                }
                
                // Check if this specific note (with octave) is in the chord (optimized pitch system)
                const noteWithOctave = `${note}${pitch.octave}`;
                const isChordNote = Array.from(this.chordNotes).some(chordNote => {
                    // Parse the chord note to get its pitch
                    const chordNoteName = chordNote.replace(/\d+/, ''); // Remove octave
                    const chordNoteOctave = parseInt(chordNote.match(/\d+$/)?.[0] || '3');
                    const chordPitch = PitchUtils.getPitchFromNote(chordNoteName, chordNoteOctave);
                    return chordPitch === pitch.pitch;
                });
                

                

                
                // Determine cell styling
                let backgroundColor = '#e5e7eb'; // Default light gray
                let cellContent = '';
                let isCircle = false;
                
                        if (isKeyNote) {
            // Key note: light blue-gray background with label
                    backgroundColor = '#c7d4e8'; // Light blue-gray
                    const label = this.getNoteLabel(note);
                    if (label && label !== 'undefined') {
                        // Convert label to preferred accidentals for display using new system
                        let displayLabel = label;
                        if (this.currentKey && this.currentKey.useFlats) {
                            // Convert sharp to flat if needed
                            const sharpToFlat = {
                                'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb'
                            };
                            displayLabel = sharpToFlat[label] || label;
                        }
                        cellContent = `<span style="color: white; font-size: ${Math.max(8, cellSize * 0.6)}px; font-weight: bold; transform: rotate(45deg); display: inline-block; pointer-events: none;">${displayLabel}</span>`;
                    }
                }
                
                // Determine if this cell should show a label
                const shouldShowLabel = isKeyNote || isChordNote || 
                    (this.cloneMode === 2 && Array.from(this.chordNotes).some(chordNote => {
                        const chordNoteName = chordNote.replace(/\d+/, ''); // Remove octave
                        const currentNoteName = note; // Current cell's note name
                        return chordNoteName === currentNoteName;
                    }));
                
                if (shouldShowLabel) {
                    const labelText = this.getNoteLabel(note);
                    if (labelText && labelText !== 'undefined') {
                        cellContent = `<span style="color: white; font-size: ${Math.max(8, cellSize * 0.6)}px; font-weight: bold; transform: rotate(45deg); display: inline-block; pointer-events: none;">${labelText}</span>`;
                    }
                }
                
                cell.style.cssText = `
                    width: ${cellSize}px;
                    height: ${cellSize}px;
                    background: ${backgroundColor};
                    border-radius: 1px;
                    transition: all 0.2s ease;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-family: 'Inter', sans-serif;
                    pointer-events: none;
                `;
                

                

                
                // Debug logging for clone mode 2 - OUTSIDE the isChordNote condition
                if (this.cloneMode === 2) {
                    const chordNotesArray = Array.from(this.chordNotes);
                    const hasMatchingNote = chordNotesArray.some(chordNote => {
                        const chordNoteName = chordNote.replace(/\d+/, ''); // Remove octave
                        const currentNoteName = note; // Current cell's note name
                        return chordNoteName === currentNoteName;
                    });
                    
                    // Log EVERY cell being processed in mode 2 - ALL 144 cells
                    

                }
                
                // Check if this specific note was actually clicked
                // Compare pitch class and coordinates directly
                const currentPitchClass = this.noteToPitchClass(note);
                let actualCoord = null;
                let isActualClicked = false;
                
                if (currentPitchClass !== -1) {
                    // Find the actual clicked note with the same pitch class at the same coordinates
                    for (const [clickedNoteWithOctave, coord] of this.actualClickedNotes.entries()) {
                        const clickedNoteName = clickedNoteWithOctave.replace(/\d+/, '');
                        const clickedPitchClass = this.noteToPitchClass(clickedNoteName);
                        
                        if (clickedPitchClass === currentPitchClass && coord.x === x && coord.y === actualY) {
                            actualCoord = coord;
                            isActualClicked = true;
                            break;
                        }
                    }
                }
                

                
                // Show overlays based on clone mode: 0=hide, 1=show clones, 2=show all octaves
                const shouldShow = isActualClicked || 
                                 (this.cloneMode === 1 && isChordNote) || 
                                 (this.cloneMode === 2 && Array.from(this.chordNotes).some(chordNote => {
                                     const chordNoteName = chordNote.replace(/\d+/, ''); // Remove octave
                                     const currentNoteName = note; // Current cell's note name
                                     return chordNoteName === currentNoteName;
                                 }));
                
                if (shouldShow) {
                    // Create circle overlay
                    const overlay = document.createElement('div');
                    
                    // Green for actual clicked notes, lighter green for clones
                    let circleColor;
                    if (isActualClicked) {
                                        // Use chromatic index to check if note is in key
                const gridNoteIndex = this.noteToPitchClass(note);
                const isInKey = gridNoteIndex !== -1 && Array.from(this.keyNotes).some(keyNote => this.noteToPitchClass(keyNote) === gridNoteIndex);
                circleColor = isInKey ? '#059669' : '#10b981';
                                          } else {
                          // Use chromatic index to check if note is in key
                          const gridNoteIndex = this.noteToPitchClass(note);
                          const isInKey = gridNoteIndex !== -1 && Array.from(this.keyNotes).some(keyNote => this.noteToPitchClass(keyNote) === gridNoteIndex);
                          circleColor = isInKey ? '#6ee7b7' : '#a7f3d0';
                      }
                    

                    
                    overlay.style.cssText = `
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: ${cellSize}px;
                        height: ${cellSize}px;
                        background: ${circleColor};
                        border-radius: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 1;
                        pointer-events: none;
                    `;
                    if (isActualClicked) {
                        overlay.classList.add('real-chord-tone');
                    }
                    if (cellContent) {
                        overlay.innerHTML = cellContent;
                    }
                    cell.appendChild(overlay);
                } else if (cellContent) {
                    // If overlay is not shown but we have content, show it directly in the cell
                    cell.innerHTML = cellContent;
                }
                
                // Convert note to preferred accidentals for display
                const displayNote = this.currentKey ?
                    PitchUtils.pitchClassToNote(this.noteToPitchClass(note), PitchUtils.shouldUseFlats(this.noteToPitchClass(this.currentKey.rootNote), this.currentKey.name)) :
                    note;
                
                // Get clone information
                const cloneIndex = Math.floor(actualY / 4);
                const isClone = cloneIndex > 0;
                const cloneText = isClone ? `, Clone ${cloneIndex}` : '';
                
                cell.title = `Position: (${x}, ${actualY}), Note: ${displayNote}${pitch.octave} (Pitch: ${pitch.pitch})${cloneText}${isKeyNote ? ', Key' : ''}${isChordNote ? ', Chord' : ''}`;
                
                // Add circular tap target overlay AFTER all content is set
                const tapTarget = document.createElement('div');
                const tapTargetSize = cellSize; // 100% of cell size
                tapTarget.style.cssText = `
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: ${tapTargetSize}px;
                    height: ${tapTargetSize}px;
                    border-radius: 50%;
                    background: transparent;
                    border: none;
                    outline: none;
                    transform: translate(-50%, -50%);
                    z-index: 10;
                    pointer-events: auto;
                    opacity: 0;
                `;
                cell.appendChild(tapTarget);
                
                // Add mouse event handlers to the circular tap target
                tapTarget.addEventListener('mousedown', (event) => {
    
                    
                    if (this.playMode === 'tap-notes') {
                        // Start drag mode
                        this.isDragging = true;
                        
                        // Prevent default and stop propagation to ensure this handler takes precedence
                        event.preventDefault();
                        event.stopPropagation();
                        
                        const clickTime = performance.now();
                        
                        // Get the actual pitch at the clicked coordinate to determine the octave
                        const clickedPitch = this.getPitchAt(x, actualY);
                        
                        // PRIORITY: Start the note IMMEDIATELY for audio responsiveness
                        // Only sustain if sustain pedal is active, otherwise let mouseup handle the minimum sustain

                        this.tapNote(note, clickedPitch.octave, this.sustainPedalActive, clickTime);
                        
                        // Visual feedback for button press animation
                        requestAnimationFrame(() => {
                            this.removeAllClickedStyling();
                            cell.classList.add('clicked');
                        });
                    } else if (this.playMode === 'tap-chords') {
                        // For tap-chords mode, create and play chord immediately on mousedown
                        const clickTime = performance.now();
                        const clickedPitch = this.getPitchAt(x, actualY);
                        
                        // Check for modifier keys
                        if (event.altKey) {
                            // Option + click in tap-chords mode: create dominant 7th chord
                            // Clear existing chord notes first
                            this.chordNotes.clear();
                            this.actualClickedNotes.clear();
                            // Create chord with specific root at the clicked position
                            this.createChordWithSpecificRoot(note, 'dom7', {x: x, y: actualY});
                            this.playActiveNotes();
                            
                            // Log latency for chord creation and playback
                            const chordEndTime = performance.now();

                        } else if (event.metaKey) {
                            // Command + click in tap-chords mode: create diminished 7th chord
                            console.log('Command key active - creating dim7 chord');
                            // Clear existing chord notes first
                            this.chordNotes.clear();
                            this.actualClickedNotes.clear();
                            // Create chord with specific root at the clicked position
                            this.createChordWithSpecificRoot(note, 'dim7', {x: x, y: actualY});
                            this.playActiveNotes();
                            
                            // Log latency for chord creation and playback
                            const chordEndTime = performance.now();

                        } else if (event.ctrlKey) {
                            // Control + click in tap-chords mode: create add8 chord
                            console.log('Control key active - creating add8 chord');
                            // Clear existing chord notes first
                            this.chordNotes.clear();
                            this.actualClickedNotes.clear();
                            // Create chord with specific root at the clicked position
                            this.createChordWithSpecificRoot(note, 'add8', {x: x, y: actualY});
                            this.playActiveNotes();
                            
                            // Log latency for chord creation and playback
                            const chordEndTime = performance.now();

                        } else if (this.zKeyActive) {
                            // Z key + click in tap-chords mode: create minor 7th chord
                            console.log('Z key active - creating min7 chord');
                            this.chordNotes.clear();
                            this.actualClickedNotes.clear();
                            this.createChordWithSpecificRoot(note, 'min7', {x: x, y: actualY});
                            this.playActiveNotes();

                        } else if (this.xKeyActive) {
                            // X key + click in tap-chords mode: create major 7th chord
                            console.log('X key active - creating maj7 chord');
                            this.chordNotes.clear();
                            this.actualClickedNotes.clear();
                            this.createChordWithSpecificRoot(note, 'maj7', {x: x, y: actualY});
                            this.playActiveNotes();

                        } else if (this.cKeyActive) {
                            // C key + click in tap-chords mode: create half-diminished 7th chord
                            console.log('C key active - creating half-dim7 chord');
                            this.chordNotes.clear();
                            this.actualClickedNotes.clear();
                            this.createChordWithSpecificRoot(note, 'half-dim7', {x: x, y: actualY});
                            this.playActiveNotes();

                        } else if (this.vKeyActive) {
                            // V key + click in tap-chords mode: create major 9th chord
                            console.log('V key active - creating maj9 chord');
                            this.chordNotes.clear();
                            this.actualClickedNotes.clear();
                            this.createChordWithSpecificRoot(note, 'maj9', {x: x, y: actualY});
                            this.playActiveNotes();

                        } else if (this.bKeyActive) {
                            // B key + click in tap-chords mode: create major 6th chord
                            console.log('B key active - creating 6 chord');
                            this.chordNotes.clear();
                            this.actualClickedNotes.clear();
                            this.createChordWithSpecificRoot(note, '6', {x: x, y: actualY});
                            this.playActiveNotes();

                        } else {
                            // Normal click in tap-chords mode: create tetrad from the clicked note as root
                            this.createTetradFromRoot(note, x, actualY, clickedPitch.octave);
                        }
                        
                        // Visual feedback for button press animation
                        requestAnimationFrame(() => {
                            this.removeAllClickedStyling();
                            cell.classList.add('clicked');
                        });
                    }
                });
                
                // Add mouseenter handler for drag functionality
                tapTarget.addEventListener('mouseenter', (event) => {
                    // Only handle mouseenter when dragging
                    if (!this.isDragging || this.playMode !== 'tap-notes') {
                        return;
                    }
                    
                    const clickedPitch = this.getPitchAt(x, actualY);
                    
                    // Stop the previously hovered note if different
                    if (this.currentlyHoveredNote && 
                        (this.currentlyHoveredNote !== note || this.currentlyHoveredOctave !== clickedPitch.octave)) {
                        this.releaseNote(this.currentlyHoveredNote, this.currentlyHoveredOctave);
                    }
                    
                    // PRIORITY: Start the new note IMMEDIATELY for audio responsiveness
                    // Sustain while dragging (mouse button is held down)
                    this.tapNote(note, clickedPitch.octave, true);
                    
                    // Update currently hovered note
                    this.currentlyHoveredNote = note;
                    this.currentlyHoveredOctave = clickedPitch.octave;
                    
                    // Visual feedback for button press animation
                    requestAnimationFrame(() => {
                        this.removeAllClickedStyling();
                        cell.classList.add('clicked');
                    });
                    

                });
                
                // Add mouseleave handler for drag functionality
                tapTarget.addEventListener('mouseleave', (event) => {
                    // Only handle mouseleave when dragging
                    if (!this.isDragging || this.playMode !== 'tap-notes') {
                        return;
                    }
                    
                    const clickedPitch = this.getPitchAt(x, actualY);
                    
                    // Simple model: MouseLeave + dragging = Stop note (unless Shift)
                    // Release with smooth envelope (100ms)
                    this.releaseNote(note, clickedPitch.octave, 0.1);
                    
                    this.currentlyHoveredNote = null;
                    this.currentlyHoveredOctave = null;
                    
                    // Remove visual feedback from this cell
                    cell.classList.remove('clicked');
                });
                
                // Add mouseup handler to release notes when mouse button is released
                tapTarget.addEventListener('mouseup', (event) => {
    
                    
                    // Only handle mouseup for tap-notes mode
                    if (this.playMode !== 'tap-notes') {
                        return;
                    }
                    
                    // Stop drag mode
                    this.isDragging = false;
                    
                    // Simple model: MouseUp = Stop note (unless sustain pedal is active)

                    if (!this.sustainPedalActive) {
                        const clickedPitch = this.getPitchAt(x, actualY);
                        
                        // MINIMUM PIANO SUSTAIN: Schedule release in 500ms to emulate real piano behavior
                        // This ensures quick taps have a minimum sustain duration instead of abrupt cutoff
                        // The note will play for at least 500ms before releasing, giving it a natural piano feel
                        this.releaseNote(note, clickedPitch.octave, 0.5);
                    }
                    
                    // Clear hover state
                    this.currentlyHoveredNote = null;
                    this.currentlyHoveredOctave = null;
                    
                    // Remove clicked styling from all cells
                    this.removeAllClickedStyling();
                });

                // Use mouseleave instead of mouseup for more reliable note release
                // Add click handler for other modes (draw-chords, tap-chords)
                tapTarget.addEventListener('click', (event) => {
    
                    
                    // Skip click handling for tap-notes mode (handled by mousedown/mouseleave)
                    if (this.playMode === 'tap-notes') {
                        return;
                    }
                    
                    // Capture click time for latency measurement
                    const clickTime = performance.now();
                    
                    // Visual feedback for button press animation
                    requestAnimationFrame(() => {
                        this.removeAllClickedStyling();
                        cell.classList.add('clicked');
                    });
                    
                    const clickedPitch = this.getPitchAt(x, actualY);
                    
                    // Check play mode and perform appropriate action
                    if (this.playMode === 'tap-notes') {
                        // Tap-notes mode: just play the note without toggling (for backward compatibility)
                        // This should only happen if mousedown/mouseleave didn't work
                        // For click (not drag), sustain if sustain pedal is active, otherwise short note
                        this.tapNote(note, clickedPitch.octave, this.sustainPedalActive, clickTime);
                    } else if (this.playMode === 'tap-chords') {
                        // Note: All tap-chords are now handled in mousedown for immediate response
                        // This click handler is kept for potential future use but doesn't handle chords
                    } else {
                        // Draw-chords mode: always toggle individual note (no modifiers)
                        this.toggleNote(note, x, actualY, clickedPitch.octave);
                        
                        // Log latency for note toggle
                        const toggleEndTime = performance.now();

                    }
                });
                
                container.appendChild(cell);
            }
        }
    }

    // Get grid statistics
    getGridStats() {
        const dims = this.getGridDimensions();
        let totalCells = dims.width * dims.height;
        let filledCells = 0;
        let emptyCells = 0;

        for (let y = 0; y < dims.height; y++) {
            for (let x = 0; x < dims.width; x++) {
                if (this.grid[y][x].active) {
                    filledCells++;
                } else {
                    emptyCells++;
                }
            }
        }

        return {
            total: totalCells,
            filled: filledCells,
            empty: emptyCells,
            fillPercentage: (filledCells / totalCells * 100).toFixed(2)
        };
    }

    init() {
        // Clear the current song name on page load to start fresh each session
        this.currentSongName = null;

        
        this.setupMusicalInterface();
        this.bindMusicalEvents();
        
        // Set default selections BEFORE creating grid visualization
        this.setDefaultSelections();
        
        // Now create grid visualization with proper key context
        this.createGridVisualization();
        
        // Initialize chord containers based on showAllChords state
        this.switchChordContainer();
        
        // Update display areas to show the default key after everything is set up
        this.updateDisplayAreas();
        
        // Initialize pitch variance display
        this.updatePitchVarianceDisplay();
        
        // Show audio initialization overlay
        this.showAudioOverlay();
        
        // Show keyboard navigation hint after a short delay
        setTimeout(() => {
            this.showNotification('💡 Tip: Use arrow keys to navigate through your sequencer!', 'info');
        }, 3000);
        
        // Add page unload handler to ensure microphone is properly stopped
        window.addEventListener('beforeunload', () => {

            if (this.pitchDetection && this.pitchDetection.destroy) {
                this.pitchDetection.destroy();
            }
            if (this.noteDetection && this.noteDetection.destroy) {
                this.noteDetection.destroy();
            }
        });
    }

    // Show audio initialization overlay
    showAudioOverlay() {
        const overlay = document.getElementById('audio-overlay');
        if (overlay) {
            // Prevent multiple event listener additions
            if (this._audioOverlayInitialized) {
                console.log('Audio overlay already initialized, skipping');
                overlay.style.display = 'flex';
                return;
            }
            
            console.log('Showing audio overlay');
            overlay.style.display = 'flex';
            this._audioOverlayInitialized = true;
            
            // Simple click handler for the entire overlay
            const handleClick = async (event) => {
                // Check if the click is on a button that has its own handler
                if (event.target.tagName === 'BUTTON' || event.target.closest('button')) {

                    return; // Let the button's own handler deal with it
                }
                
                const startTime = performance.now();

                event.preventDefault();
                event.stopPropagation();
                
                // Initialize audio immediately
                const initStartTime = performance.now();
                await this.initAudio();

                
                this.hasUserInteracted = true;
                this.forceAudioInit = true;
                
                // Hide overlay
                overlay.style.display = 'none';
                
                // Remove all event listeners
                overlay.removeEventListener('click', handleClick);
                document.removeEventListener('click', handleClick);
                document.removeEventListener('keydown', handleClick);
                document.removeEventListener('touchstart', handleClick);
                

                
                // Show success message
                // // this.showNotification('Audio initialized! You can now play notes and chords.', 'success');
            };
            
            // Add click listener to the overlay itself
            overlay.addEventListener('click', handleClick);
            
            // Also add to document for any click anywhere
            document.addEventListener('click', handleClick);
            document.addEventListener('keydown', handleClick);
            document.addEventListener('touchstart', handleClick);
        } else {
            console.error('Audio overlay not found');
        }
    }

    // Set default selections
    setDefaultSelections() {
        // Set default key: C Major (Ionian)
        this.createKey('C', 'major');
        
        // Set default chord: C Major 7th (using highest available clone for root)
        this.createChord('C', 'maj7', 0, 1);
        
        // Update DOM elements if they exist
        const keyRootSelect = document.getElementById('keyRootSelect');
        const keyTypeSelect = document.getElementById('keyTypeSelect');
        
        if (keyRootSelect && keyTypeSelect) {
            keyRootSelect.value = 'C';
            keyTypeSelect.value = 'major';
        }
        
        const rootNoteSelect = document.getElementById('rootNoteSelect');
        const chordTypeSelect = document.getElementById('chordTypeSelect');
        
        if (rootNoteSelect && chordTypeSelect) {
            rootNoteSelect.value = 'C';
            chordTypeSelect.value = 'maj7';
        }
        
        // Note: Auto-play is disabled on page load due to browser autoplay policies
        // The chord will play on first user interaction (clicking any button)
        
        // Set initial play mode button text
        const playModeToggle = document.getElementById('playModeToggle');
        if (playModeToggle) {
            playModeToggle.textContent = this.getPlayModeDisplayName(this.playMode);
        }
    }

    setupMusicalInterface() {
        // Add musical controls to the page
        const main = document.querySelector('.main');
        if (main) {
            const musicalSection = document.createElement('section');
            musicalSection.className = 'musical-section';
            musicalSection.innerHTML = `
                <div class="musical-content">
                    <div class="chord-buttons">
                            <div class="chord-header">
                                <h3>Chords</h3>
                                <button class="btn btn-secondary btn-toggle" id="toggleChords">−</button>
                            </div>
                            <div class="chord-content" id="chordContent">
                                <div class="chord-container" id="allChordsContainer">
                                    <div class="triad-buttons" id="triadButtons">
                                        <!-- Triad buttons will be generated dynamically -->
                                    </div>
                                    <div class="tetrad-buttons" id="tetradButtons">
                                        <!-- Tetrad buttons will be generated dynamically -->
                                    </div>
                                    <div class="dominant-buttons" id="dominantButtons">
                                        <!-- Dominant 7th buttons will be generated dynamically -->
                                    </div>
                                </div>
                                <div class="chord-container" id="secondContainer" style="display: none;">
                                    <h5>Second Container</h5>
                                    <!-- Second container content will go here -->
                                </div>
                            </div>
                        </div>
                        
                        <div class="sequencer">
                            <h3>Sequencer</h3>
                            
                            <!-- Transport Controls -->
                            <div class="sequencer-controls">
                                <button class="btn btn-secondary" id="playPrev">⏮ Prev</button>
                                <button class="btn btn-secondary" id="playPause">⏯ Play / Pause</button>
                                <button class="btn btn-secondary" id="playNext">⏭ Next</button>
                                <div class="speed-control">
                                                    <label for="sequencerInterval">Speed</label>
                <input type="range" id="sequencerInterval" min="0.75" max="4.0" step="0.1" value="1.0" class="speed-slider">
                                </div>
                            </div>
                            
                            <!-- Sequence Display -->
                            <div class="sequence-display" id="sequenceDisplay">
                                <div class="sequence-info">No chords in sequence</div>
                            </div>
                            
                            <!-- Add/Save Controls -->
                            <div class="sequence-controls">
                                                <button class="btn btn-secondary" id="addToSequence">Add Chord</button>
                                                <button class="btn btn-secondary" id="addKeyToSequence">Add Key</button>
                <button class="btn btn-secondary" id="addRestToSequence">Add Rest</button>
                                <button class="btn btn-secondary" id="clearSequence">✖ Clear</button>
                                <button class="btn btn-secondary" id="saveSequence">💾 Save</button>
                                <button class="btn btn-secondary" id="loadSavedSequence">📂 Open</button>
                            </div>
                            
                            <!-- Sequence Input -->
                            <div class="sequence-loader">
                                <input type="text" id="sequenceInput" placeholder="Paste sequence: (C major) Cmaj7 Dmin Gmaj7 Amin" class="sequence-input">
                                <button class="btn btn-secondary" id="loadSequence">Load Sequence</button>
                            </div>
                        </div>
                        
                        <!-- Tuner Section -->
                        <div class="pitch-detection-section">
                            <div class="pitch-detection-header">
                                <h3>Tuner</h3>
                                <div class="pitch-detection-header-buttons">
                                    <button class="btn btn-secondary info-pitch-detect" id="pitchDetectBtn">🎤 Turn on Mic</button>
                                    <button class="btn btn-secondary btn-toggle" id="toggleTuner">+</button>
                                </div>
                            </div>
                            <div class="pitch-detection-content" id="pitchDetectionContent">
                                <div class="pitch-detection-controls">
                                    <div class="pitch-status" id="pitchStatus">Ready to detect</div>
                                </div>
                                <div class="pitch-variance-display" id="pitchVarianceDisplay"></div>
                            </div>
                        </div>
                        

                        </div>
                        
                        <div class="musical-info">
                        </div>
                    </div>
                    
                    <div class="grid-controls">
                        <h3>Settings</h3>
                        <div class="settings-row">
                            <div class="settings-control">
                                <label for="gridSizeSelect">Grid Size:</label>
                                <select id="gridSizeSelect" class="chord-select">
                                    ${Array.from({length: 5}, (_, i) => i + 8).map(size => 
                                        `<option value="${size}" ${size === this.gridSize ? 'selected' : ''}>${size}x${size}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div class="settings-control">
                                <label for="chordDisplaySelect">Chord Display:</label>
                                <select id="chordDisplaySelect" class="chord-select">
                                    <option value="chord" ${this.chordDisplayMode === 'chord' ? 'selected' : ''}>Am</option>
                                    <option value="rn" ${this.chordDisplayMode === 'rn' ? 'selected' : ''}>vi</option>
                                    <option value="chord-rn" ${this.chordDisplayMode === 'chord-rn' ? 'selected' : ''}>Am (vi)</option>
                                </select>
                            </div>
                            <div class="settings-control">
                                <label for="chordSpellingsSelect">Chord Spellings:</label>
                                <select id="chordSpellingsSelect" class="chord-select">
                                    <option value="most-common" ${this.chordSpellingsMode === 'most-common' ? 'selected' : ''}>Most Common</option>
                                    <option value="show-all" ${this.chordSpellingsMode === 'show-all' ? 'selected' : ''}>Show All</option>
                                </select>
                            </div>
                            <div class="settings-control">
                                <label for="tunerDisplaySelect">Tuner:</label>
                                <select id="tunerDisplaySelect" class="chord-select">
                                    <option value="normal" ${this.tunerDisplayMode === 'normal' ? 'selected' : ''}>Simple</option>
                                    <option value="detailed" ${this.tunerDisplayMode === 'detailed' ? 'selected' : ''}>Detailed</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            main.appendChild(musicalSection);
            
            // Generate chord buttons dynamically
            this.generateChordButtons();
            
            // Initialize button text after buttons are created
            this.updateAddButtonsText();
            
            // Initialize Note Detection UI after DOM is set up
            this.noteDetectionUI = new NoteDetectionUI(this.noteDetection, this);
            
            // Initialize tuner display
            this.updateTunerDisplay();
            
            // Note: bindMusicalEvents() is called in init(), so we don't need to call it here
        }
    }



            // Generate diatonic chord buttons based on current key
    switchChordContainer() {
        const allChordsContainer = document.getElementById('allChordsContainer');
        const secondContainer = document.getElementById('secondContainer');
        const toggleChordsBtn = document.getElementById('toggleChords');
        
        if (this.showAllChords) {
            if (allChordsContainer) allChordsContainer.style.display = 'block';
            if (secondContainer) secondContainer.style.display = 'none';
            if (toggleChordsBtn) toggleChordsBtn.textContent = '−';
            this.generateChordButtons();
        } else {
            if (allChordsContainer) allChordsContainer.style.display = 'none';
            if (secondContainer) secondContainer.style.display = 'block';
            if (toggleChordsBtn) toggleChordsBtn.textContent = '+';
            this.generateDiatonicChords();
        }
    }

    generateDiatonicChords() {

        
        const secondContainer = document.getElementById('secondContainer');
        if (!secondContainer) {

            return;
        }
        
        // Clear existing content
        secondContainer.innerHTML = '';
        
        // Get current key info
        let rootIndex, rootNote, keyType, useFlats;
        
        if (this.currentKey) {
            rootIndex = this.currentKey.rootIndex;
            rootNote = this.currentKey.rootNote;
            keyType = this.currentKey.name;
            useFlats = this.currentKey.useFlats;
            
            if (rootIndex === undefined && rootNote) {
                rootIndex = this.noteToPitchClass(rootNote);
            }
        } else {
            const keyRootSelect = document.getElementById('keyRootSelect');
            const keyTypeSelect = document.getElementById('keyTypeSelect');
            
            if (!keyRootSelect || !keyTypeSelect) return;
            
            const rawRootNote = keyRootSelect.value.split('/')[0];
            keyType = keyTypeSelect.value;
            rootIndex = this.noteToPitchClass(rawRootNote);
            useFlats = PitchUtils.shouldUseFlats(this.noteToPitchClass(rawRootNote), keyType);
            rootNote = this.pitchClassToNote(rootIndex, useFlats);
        }
        
        // Get key data
        const keyData = this.keys[keyType];
        if (!keyData) return;
        
        // Calculate key notes
        const keyNotes = keyData.intervals.map(interval => {
            const noteIndex = (rootIndex + interval) % 12;
            return this.pitchClassToNote(noteIndex, useFlats);
        });
        
        // Get diatonic chord types
        const diatonicTriads = PitchUtils.getDiatonicTriads(keyType);
        const diatonicTetrads = PitchUtils.getDiatonicTetrads(keyType);
        
        // Calculate deterministic chord positions for this key (same as full mode)
        this.calculateAndStoreChordPositions(rootNote, keyType, keyNotes, diatonicTetrads);
        
        // Create container for the single row
        const diatonicContainer = document.createElement('div');
        diatonicContainer.style.display = 'grid';
        diatonicContainer.style.gridTemplateColumns = 'repeat(15, 1fr)';
        diatonicContainer.style.gridTemplateRows = 'repeat(1, 1fr)';
        diatonicContainer.style.gap = '2px';
        diatonicContainer.style.width = '100%';
        diatonicContainer.style.maxWidth = '1200px';
        diatonicContainer.style.margin = '0 auto';
        
        // Create 15 buttons (7 + 7 + 1 diatonic chords)
        for (let i = 0; i < 15; i++) {
            const note = keyNotes[i % keyNotes.length];
            const octave = 3 + Math.floor(i / keyNotes.length);
            const triadType = diatonicTriads[i];
            const tetradType = diatonicTetrads[i];
            
            // Determine chord type and row index
            let chordType, rowIndex;
            if (tetradType && ['maj7', 'min7', 'dom7', 'half-dim7', 'minmaj7', 'maj7#5', 'dim7'].includes(tetradType)) {
                // Use tetrad
                switch (tetradType) {
                    case 'maj7': rowIndex = 4; break;
                    case 'min7': rowIndex = 5; break;
                    case 'dom7': rowIndex = 6; break;
                    case 'half-dim7': rowIndex = 7; break;
                    case 'minmaj7': rowIndex = 9; break;
                    case 'maj7#5': rowIndex = 10; break;
                    case 'dim7': rowIndex = 8; break;
                    default: rowIndex = 4;
                }
                chordType = ['maj', 'min', 'dim', 'aug', 'maj7', 'min7', 'dom7', 'half-dim7', 'dim7', 'minmaj7', 'maj7#5'][rowIndex];
            } else {
                // Use triad
                switch (triadType) {
                    case 'maj': rowIndex = 0; break;
                    case 'min': rowIndex = 1; break;
                    case 'dim': rowIndex = 2; break;
                    case 'aug': rowIndex = 3; break;
                    default: rowIndex = 0;
                }
                chordType = triadType;
            }
            
            const chordBtn = document.createElement('button');
            chordBtn.className = 'btn btn-chord';
            chordBtn.style.width = '100%';
            chordBtn.style.height = '40px';
            chordBtn.style.fontSize = '12px';
            chordBtn.style.padding = '4px';
            chordBtn.style.minWidth = '0';
            chordBtn.style.gridRow = '1';
            chordBtn.style.gridColumn = (i + 1);
            chordBtn.style.backgroundColor = '#48bb78';
            chordBtn.style.color = 'white';
            chordBtn.style.fontWeight = 'bold';
            
                            const shortName = PitchUtils.getShortChordName(chordType);
                const displayNote = PitchUtils.pitchClassToNote(this.noteToPitchClass(note), PitchUtils.shouldUseFlats(this.noteToPitchClass(rootNote), keyType));
                chordBtn.textContent = shortName === '' ? displayNote : `${displayNote}${shortName}`;
            
            chordBtn.addEventListener('click', () => {
                
                this.chordNotes.clear();
                this.actualClickedNotes.clear();
                
                // Use the new pitch-based Manhattan system (same as full mode)
                const buttonIndex = i % keyNotes.length; // Map to 0-6 for 7 key notes
                const calculatedPos = this.getCalculatedChordPosition(buttonIndex, octave);
                if (calculatedPos) {
                    this.createChordWithSpecificRoot(note, chordType, calculatedPos.coord);
                } else {
                    this.createChord(note, chordType);
                }
                
                this.playActiveNotes();
            });
            
                    diatonicContainer.appendChild(chordBtn);
    }
    
    if (secondContainer) {
        secondContainer.appendChild(diatonicContainer);
    }
    }

    generateChordButtons() {
        
        const triadButtonsContainer = document.getElementById('triadButtons');
        const tetradButtonsContainer = document.getElementById('tetradButtons');
        const dominantButtonsContainer = document.getElementById('dominantButtons');
        
        if (!triadButtonsContainer || !tetradButtonsContainer || !dominantButtonsContainer) {
            return;
        }
        
        // Clear existing buttons
        triadButtonsContainer.innerHTML = '';
        tetradButtonsContainer.innerHTML = '';
        dominantButtonsContainer.innerHTML = '';
        
        // Get current key info - use this.currentKey if available, otherwise use DOM selectors
        let rootIndex, rootNote, keyType, useFlats;
        
        if (this.currentKey) {
            // Use the current key from sequencer
            rootIndex = this.currentKey.rootIndex;
            rootNote = this.currentKey.rootNote;
            keyType = this.currentKey.name;
            useFlats = this.currentKey.useFlats;
            
            // Fallback: calculate rootIndex if it's missing
            if (rootIndex === undefined && rootNote) {
                rootIndex = this.noteToPitchClass(rootNote);
            }
        } else {
            // Fall back to DOM selectors
            const keyRootSelect = document.getElementById('keyRootSelect');
            const keyTypeSelect = document.getElementById('keyTypeSelect');
            
            if (!keyRootSelect || !keyTypeSelect) {
                // Use default values for testing
                rootNote = 'C';
                keyType = 'major';
                rootIndex = this.noteToPitchClass(rootNote);
                useFlats = PitchUtils.shouldUseFlats(rootIndex, keyType);
                return;
            }
            
            // Get the raw value and work with indices
            const rawRootNote = keyRootSelect.value ? keyRootSelect.value.split('/')[0] : 'C';
            keyType = keyTypeSelect.value || 'major';
            rootIndex = this.noteToPitchClass(rawRootNote);
            useFlats = PitchUtils.shouldUseFlats(this.noteToPitchClass(rawRootNote), keyType);
            rootNote = this.pitchClassToNote(rootIndex, useFlats);
        }
        
        // Get key data
        const keyData = this.keys[keyType];
        if (!keyData) return;
        
        // Calculate key notes using indices
        const keyNotes = keyData.intervals.map(interval => {
            const noteIndex = (rootIndex + interval) % 12;
            return this.pitchClassToNote(noteIndex, useFlats);
        });
        
        // Add accidentals to the key notes for chord buttons
        const allNotesForButtons = [...keyNotes, ...['C#', 'D#', 'F#', 'G#', 'A#']];
        
        // Compute diatonic chord types based on the actual key
        const diatonicTriads = PitchUtils.getDiatonicTriads(keyType);
        const diatonicTetrads = PitchUtils.getDiatonicTetrads(keyType);
        
        // Calculate deterministic chord positions for this key
        this.calculateAndStoreChordPositions(rootNote, keyType, keyNotes, diatonicTetrads);
        
        // Create chord type grid: 11 rows × 25 columns (2 octaves + 1)
        const chordTypes = ['maj', 'min', 'dim', 'aug', 'maj7', 'min7', 'dom7', 'half-dim7', 'dim7', 'minmaj7', 'maj7#5'];
        const chordTypeNames = ['Major', 'Minor', 'Dim', 'Aug', 'M7', 'm7', '7', 'ø7', 'o7', 'mM7', 'M7#5'];
        
        // Create grid container with CSS Grid
        if (triadButtonsContainer) {
            triadButtonsContainer.style.display = 'grid';
            triadButtonsContainer.style.gridTemplateColumns = 'repeat(25, 1fr)';
            triadButtonsContainer.style.gridTemplateRows = 'repeat(11, 1fr)';
            triadButtonsContainer.style.gap = '2px';
            triadButtonsContainer.style.width = '100%';
            triadButtonsContainer.style.maxWidth = '1200px';
            triadButtonsContainer.style.margin = '0 auto';
        }
        
        // Generate all chromatic notes for 2 octaves + 1, starting from the current key's root note
        const allNotes = [];
        
        // Generate notes starting from the root note and following chromatically
        for (let octave = 3; octave <= 5; octave++) {
            for (let i = 0; i < 12; i++) {
                const noteIndex = (rootIndex + i) % 12;
                const note = this.pitchClassToNote(noteIndex, useFlats);
                allNotes.push({ note, octave });
            }
        }
        // Add one more note (the root note again in octave 5)
        allNotes.push({ note: rootNote, octave: 5 });
        
        // Create buttons for each cell in the grid
        for (let row = 0; row < 11; row++) {
            for (let col = 0; col < 25; col++) {
                const chordType = chordTypes[row];
                const { note, octave } = allNotes[col];
                const chordBtn = document.createElement('button');
                chordBtn.className = 'btn btn-chord';
                chordBtn.style.width = '100%';
                chordBtn.style.height = '40px';
                chordBtn.style.fontSize = '12px';
                chordBtn.style.padding = '4px';
                chordBtn.style.minWidth = '0';
                chordBtn.style.gridRow = row + 1;
                chordBtn.style.gridColumn = col + 1;
                
                // Check if this chord is diatonic in the current key
                const noteIndex = keyNotes.indexOf(note);
                let isDiatonic = false;
                
                if (noteIndex !== -1) {
                    // Note is in the key, check if the chord type matches the diatonic pattern
                    if (row === 0 && chordType === 'maj') {
                        // Major triad - check if this key degree should be major
                        isDiatonic = diatonicTriads[noteIndex] === 'maj';
                    } else if (row === 1 && chordType === 'min') {
                        // Minor triad - check if this key degree should be minor
                        isDiatonic = diatonicTriads[noteIndex] === 'min';
                    } else if (row === 2 && chordType === 'dim') {
                        // Diminished triad - check if this key degree should be diminished
                        isDiatonic = diatonicTriads[noteIndex] === 'dim';
                    } else if (row === 3 && chordType === 'aug') {
                        // Augmented triad - check if this key degree should be augmented
                        isDiatonic = diatonicTriads[noteIndex] === 'aug';
                    } else if (row === 4 && chordType === 'maj7') {
                        // Major 7th - check if this key degree should be major 7th
                        isDiatonic = diatonicTetrads[noteIndex] === 'maj7';
                    } else if (row === 5 && chordType === 'min7') {
                        // Minor 7th - check if this key degree should be minor 7th
                        isDiatonic = diatonicTetrads[noteIndex] === 'min7';
                    } else if (row === 6 && chordType === 'dom7') {
                        // Dominant 7th - check if this key degree should be dominant 7th
                        isDiatonic = diatonicTetrads[noteIndex] === 'dom7';
                    } else if (row === 7 && chordType === 'half-dim7') {
                        // Half-diminished 7th
                        isDiatonic = diatonicTetrads[noteIndex] === 'half-dim7';
                    } else if (row === 8 && chordType === 'dim7') {
                        // Diminished 7th
                        isDiatonic = diatonicTetrads[noteIndex] === 'dim7';
                    } else if (row === 9 && chordType === 'minmaj7') {
                        // Minor-major 7th
                        isDiatonic = diatonicTetrads[noteIndex] === 'minmaj7';
                    } else if (row === 10 && chordType === 'maj7#5') {
                        // Major 7th sharp 5 - check if this key degree should be maj7#5
                        isDiatonic = diatonicTetrads[noteIndex] === 'maj7#5';
                    }
                }
                
                if (isDiatonic) {
                    // Diatonic notes get green styling
                    chordBtn.style.backgroundColor = '#48bb78';
                    chordBtn.style.color = 'white';
                    chordBtn.style.fontWeight = 'bold';
                } else {
                    // Non-diatonic notes get dimmed styling
                    chordBtn.style.opacity = '0.5';
                    chordBtn.style.filter = 'graykey(0.7)';
                }
                
                const shortName = PitchUtils.getShortChordName(chordType);
                // Convert note to preferred accidentals for display
                const displayNote = PitchUtils.pitchClassToNote(this.noteToPitchClass(note), PitchUtils.shouldUseFlats(this.noteToPitchClass(rootNote), keyType));
                chordBtn.textContent = shortName === '' ? displayNote : `${displayNote}${shortName}`;
                
                chordBtn.addEventListener('click', () => {

                    
                    // Clear existing chord notes first
                    this.chordNotes.clear();
                    this.actualClickedNotes.clear();
                    
                    // For full chord grid, use direct coordinate calculation
                    // Calculate the proper position using chromatic placement rules
                    const noteIndex = this.noteToPitchClass(note);
                    const tonicIndex = this.noteToPitchClass(keyNotes[0]);
                    const chromaticOffset = (noteIndex - tonicIndex + 12) % 12;
                    
                    // Use the pitch-utils chromatic placement rules directly
                    const dims = this.getGridDimensions();
                    const originPitch = PitchUtils.getOriginPitch();
                    
                    try {
                        // Get the tonic coordinates for this octave
                        const tonicCoords = PitchUtils.calculateTonicCoordinates(keyNotes[0], keyType, dims.width, dims.height, originPitch);
                        let baseCoord;
                        if (octave === 3) baseCoord = tonicCoords.octave3;
                        else if (octave === 4) baseCoord = tonicCoords.octave4;
                        else baseCoord = tonicCoords.octave5;
                        
                        // Calculate the position using chromatic placement rules
                        const calculatedCoord = PitchUtils.calculateChromaticPosition(baseCoord, chromaticOffset, dims.width, dims.height);
                        
                        this.createChordWithSpecificRoot(note, chordType, calculatedCoord);
                    } catch (error) {
                        // Fallback to simple chord creation

                        this.createChord(note, chordType);
                    }
                    
                    //console.log('🎵 [DEBUG] Chord created, active notes:', Array.from(this.activeNotes));
                    
                    // Play the chord immediately
                    this.playActiveNotes();
                });
                
                if (triadButtonsContainer) {
                    triadButtonsContainer.appendChild(chordBtn);
                }
            }
        }
        
        // Hide the old containers since we're using a unified grid
        if (tetradButtonsContainer) {
            tetradButtonsContainer.style.display = 'none';
        }
        if (dominantButtonsContainer) {
            dominantButtonsContainer.style.display = 'none';
        }
    }



    // Create tetrad from root note based on current key
    createTetradFromRoot(rootNote, clickedX, clickedY, octave) {
        if (!this.currentKey) {
            // If no key is set, use dim7 for accidentals
            const isAccidental = rootNote.includes('#') || rootNote.includes('b');
            if (isAccidental) {
                this.createChordWithSpecificRoot(rootNote, 'dim7', {x: clickedX, y: clickedY});
                // Note: playActiveNotes() is already called by createChordWithSpecificRoot
                return;
            }
            // Default to major 7th for non-accidentals
            this.createChordWithSpecificRoot(rootNote, 'maj7', {x: clickedX, y: clickedY});
            // Note: playActiveNotes() is already called by createChordWithSpecificRoot
            return;
        }

        // Get current key info
        const keyRoot = this.currentKey.rootNote;
        const keyType = this.currentKey.name;
        
        // Get key notes using the new index-based system
        const keyData = this.keys[keyType];
        if (!keyData) return;
        
        const baseNoteIndex = this.noteToPitchClass(keyRoot);
        const keyNotes = keyData.intervals.map(interval => {
            const noteIndex = (baseNoteIndex + interval) % 12;
            return this.pitchClassToNote(noteIndex, PitchUtils.shouldUseFlats(this.noteToPitchClass(keyRoot), keyType));
        });
        
        // Find the key degree of the root note using the new system
        const rootIndex = keyNotes.findIndex(note => this.noteToPitchClass(note) === this.noteToPitchClass(rootNote));
        if (rootIndex === -1) {
            // Note is not in the key (accidental), use dim7
            this.createChordWithSpecificRoot(rootNote, 'dim7', {x: clickedX, y: clickedY});
            // Note: playActiveNotes() is already called by createChordWithSpecificRoot
            return;
        }
        
        // Get the diatonic tetrad for this key degree
        const diatonicTetrads = PitchUtils.getDiatonicTetrads(keyType);
        const chordType = diatonicTetrads[rootIndex];
        
        // Create the tetrad
        this.createChordWithSpecificRoot(rootNote, chordType, {x: clickedX, y: clickedY});
        // Note: playActiveNotes() is already called by createChordWithSpecificRoot
    }

    // Create a chord with the root note an octave above
    createChordOctaveAbove(rootNote, chordType, keyDegree = 0) {
        // Clear only chord notes, keep key notes
        this.chordNotes.clear();
        this.actualClickedNotes.clear();
        
        // Get the base note (first part before slash for enharmonics)
        const baseNote = rootNote.split('/')[0];
        const baseNoteIndex = this.noteToPitchClass(baseNote);
        
        if (baseNoteIndex === -1) {
            this.showNotification(`Invalid root note: ${rootNote}`, 'error');
            return;
        }
        
        const chordTypeData = this.chordTypes[chordType];
        if (!chordTypeData) {
            this.showNotification(`Invalid chord type: ${chordType}`, 'error');
            return;
        }
        
        // Calculate all notes in the chord
        const chordNotes = chordTypeData.intervals.map(interval => {
            const noteIndex = (baseNoteIndex + interval) % 12;
            return this.pitchClassToNote(noteIndex, false); // Use sharps for internal processing
        });
        
        // Find the best coordinates for each note using pitch stacking
        const selectedCoords = [];
        
        // Get all possible coordinates for each note
        const noteCoords = {};
        chordNotes.forEach(note => {
            noteCoords[note] = this.getCoordinatesForNote(note);
        });
        
        // Start with the root note - find the 4th octave instance (octave above)
        const rootNoteName = chordNotes[0];
        const rootCoords = noteCoords[rootNoteName];
        if (rootCoords.length > 0) {
            // Find the 4th octave instance of the root note
            let bestRootCoord = null;
            let targetPitch = null;
            
            // Filter coordinates based on Y-direction rule if this isn't the first chord
            let validRootCoords = rootCoords;
            if (keyDegree > 0) {
                const prevDegree = keyDegree - 1;
                const prevCoord = this.keyDegreeRootCoords.get(prevDegree);
                if (prevCoord) {
                    const isEvenDegree = keyDegree % 2 === 0;
                    validRootCoords = rootCoords.filter(coord => {
                        const yDiff = coord.y - prevCoord.y;
                        if (isEvenDegree) {
                            // Even degree: Y should be greater than previous
                            return yDiff > 0;
                        } else {
                            // Odd degree: Y should be less than previous
                            return yDiff < 0;
                        }
                    });
                    
                    // If no coordinates follow the rule, use all available coordinates
                    if (validRootCoords.length === 0) {
                        validRootCoords = rootCoords;
                    }
                }
            }
            
            for (const coord of validRootCoords) {
                const pitch = this.getPitchAt(coord.x, coord.y);
                if (pitch.octave === 4) {
                    bestRootCoord = coord;
                    targetPitch = pitch;
                    break;
                }
            }
            
            // If 4th octave not found, use the lowest available
            if (!bestRootCoord) {
                bestRootCoord = validRootCoords[0];
                targetPitch = this.getPitchAt(bestRootCoord.x, bestRootCoord.y);
                
                for (const coord of validRootCoords) {
                    const pitch = this.getPitchAt(coord.x, coord.y);
                    if (pitch.pitch < targetPitch.pitch) {
                        targetPitch = pitch;
                        bestRootCoord = coord;
                    }
                }
            }
            
            // Store the selected root coordinate for this key degree
            this.keyDegreeRootCoords.set(keyDegree, bestRootCoord);
            
            selectedCoords.push({ note: rootNoteName, coord: bestRootCoord, pitch: targetPitch });
        }
        
        // For each remaining note, find the best coordinate that's higher in pitch than the previous
        for (let i = 1; i < chordNotes.length; i++) {
            const note = chordNotes[i];
            const coords = noteCoords[note];
            
            if (coords.length > 0) {
                // Find the coordinate with the lowest pitch that's still higher than the previous note
                const prevPitch = selectedCoords[i-1].pitch;
                let bestCoord = null;
                let bestPitch = null;
                let bestScore = Infinity;
                
                for (const coord of coords) {
                    const pitch = this.getPitchAt(coord.x, coord.y);
                    
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
                    let lowestPitch = this.getPitchAt(coords[0].x, coords[0].y);
                    bestCoord = coords[0];
                    
                    for (const coord of coords) {
                        const pitch = this.getPitchAt(coord.x, coord.y);
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
        
        // Add all selected notes to chord notes set and store their coordinates
        selectedCoords.forEach(({ note, coord, pitch }) => {
            const noteWithOctave = `${note}${pitch.octave}`;
            this.chordNotes.add(noteWithOctave);
            this.activeNotes.add(noteWithOctave);
            this.actualClickedNotes.set(noteWithOctave, coord);
        });
        
        // Preserve key visualization by setting grid values for key notes
        this.keyNotes.forEach(note => {
            const coords = this.getCoordinatesForNote(note);
            if (coords && coords.length > 0) {
                // Set the first coordinate for each key note
                this.setGridValue(coords[0].x, coords[0].y, 1);
            }
        });
        
        this.createGridVisualization();
        this.updateChordDisplayOnly();
        this.updateDisplayAreas();
        // this.showNotification(`Created ${rootNote} ${chordTypeData.name} chord (octave above)!`, 'success');
    }

    // Create a chord with the root note two octaves above
    createChordTwoOctavesAbove(rootNote, chordType, keyDegree = 0) {
        // Clear only chord notes, keep key notes
        this.chordNotes.clear();
        this.actualClickedNotes.clear();
        
        // Get the base note (first part before slash for enharmonics)
        const baseNote = rootNote.split('/')[0];
        const baseNoteIndex = this.noteToPitchClass(baseNote);
        
        if (baseNoteIndex === -1) {
            this.showNotification(`Invalid root note: ${rootNote}`, 'error');
            return;
        }
        
        const chordTypeData = this.chordTypes[chordType];
        if (!chordTypeData) {
            this.showNotification(`Invalid chord type: ${chordType}`, 'error');
            return;
        }
        
        // Calculate all notes in the chord
        const chordNotes = chordTypeData.intervals.map(interval => {
            const noteIndex = (baseNoteIndex + interval) % 12;
            return this.pitchClassToNote(noteIndex, false); // Use sharps for internal processing
        });
        
        // Find the best coordinates for each note using pitch stacking
        const selectedCoords = [];
        
        // Get all possible coordinates for each note
        const noteCoords = {};
        chordNotes.forEach(note => {
            noteCoords[note] = this.getCoordinatesForNote(note);
        });
        
        // Start with the root note - find the 5th octave instance (two octaves above)
        const rootNoteName = chordNotes[0];
        const rootCoords = noteCoords[rootNoteName];
        if (rootCoords.length > 0) {
            // Find the 5th octave instance of the root note
            let bestRootCoord = null;
            let targetPitch = null;
            
            // Filter coordinates based on Y-direction rule if this isn't the first chord
            let validRootCoords = rootCoords;
            if (keyDegree > 0) {
                const prevDegree = keyDegree - 1;
                const prevCoord = this.keyDegreeRootCoords.get(prevDegree);
                if (prevCoord) {
                    const isEvenDegree = keyDegree % 2 === 0;
                    validRootCoords = rootCoords.filter(coord => {
                        const yDiff = coord.y - prevCoord.y;
                        if (isEvenDegree) {
                            // Even degree: Y should be greater than previous
                            return yDiff > 0;
                        } else {
                            // Odd degree: Y should be less than previous
                            return yDiff < 0;
                        }
                    });
                    
                    // If no coordinates follow the rule, use all available coordinates
                    if (validRootCoords.length === 0) {
                        validRootCoords = rootCoords;
                    }
                }
            }
            
            for (const coord of validRootCoords) {
                const pitch = this.getPitchAt(coord.x, coord.y);
                if (pitch.octave === 5) {
                    bestRootCoord = coord;
                    targetPitch = pitch;
                    break;
                }
            }
            
            // If 5th octave not found, use the highest available
            if (!bestRootCoord) {
                bestRootCoord = validRootCoords[0];
                targetPitch = this.getPitchAt(bestRootCoord.x, bestRootCoord.y);
                
                for (const coord of validRootCoords) {
                    const pitch = this.getPitchAt(coord.x, coord.y);
                    if (pitch.pitch > targetPitch.pitch) {
                        targetPitch = pitch;
                        bestRootCoord = coord;
                    }
                }
            }
            
            // Store the selected root coordinate for this key degree
            this.keyDegreeRootCoords.set(keyDegree, bestRootCoord);
            
            selectedCoords.push({ note: rootNoteName, coord: bestRootCoord, pitch: targetPitch });
        }
        
        // For each remaining note, find the best coordinate that's higher in pitch than the previous
        for (let i = 1; i < chordNotes.length; i++) {
            const note = chordNotes[i];
            const coords = noteCoords[note];
            
            if (coords.length > 0) {
                // Find the coordinate with the lowest pitch that's still higher than the previous note
                const prevPitch = selectedCoords[i-1].pitch;
                let bestCoord = null;
                let bestPitch = null;
                let bestScore = Infinity;
                
                for (const coord of coords) {
                    const pitch = this.getPitchAt(coord.x, coord.y);
                    
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
                
                // If no higher pitch found, use the highest available
                if (!bestCoord) {
                    let highestPitch = this.getPitchAt(coords[0].x, coords[0].y);
                    bestCoord = coords[0];
                    
                    for (const coord of coords) {
                        const pitch = this.getPitchAt(coord.x, coord.y);
                        if (pitch.pitch > highestPitch.pitch) {
                            highestPitch = pitch;
                            bestCoord = coord;
                        }
                    }
                    bestPitch = highestPitch;
                }
                
                selectedCoords.push({ note, coord: bestCoord, pitch: bestPitch });
            }
        }
        
        // Add all selected notes to chord notes set and store their coordinates
        selectedCoords.forEach(({ note, coord, pitch }) => {
            const noteWithOctave = `${note}${pitch.octave}`;
            this.chordNotes.add(noteWithOctave);
            this.activeNotes.add(noteWithOctave);
            this.actualClickedNotes.set(noteWithOctave, coord);
        });
        
        // Preserve key visualization by setting grid values for key notes
        this.keyNotes.forEach(note => {
            const coords = this.getCoordinatesForNote(note);
            if (coords && coords.length > 0) {
                // Set the first coordinate for each key note
                this.setGridValue(coords[0].x, coords[0].y, 1);
            }
        });
        
        this.createGridVisualization();
        this.updateChordDisplayOnly();
        this.updateDisplayAreas();
        // this.showNotification(`Created ${rootNote} ${chordTypeData.name} chord (two octaves above)!`, 'success');
    }

    bindMusicalEvents() {
        // Grid size selector
        const gridSizeSelect = document.getElementById('gridSizeSelect');
        if (gridSizeSelect) {
            gridSizeSelect.addEventListener('change', () => {
                const newSize = parseInt(gridSizeSelect.value);
                this.changeGridSize(newSize);
            });
        }

        // Chord display mode selector
        const chordDisplaySelect = document.getElementById('chordDisplaySelect');
        if (chordDisplaySelect) {
            chordDisplaySelect.addEventListener('change', () => {
                this.chordDisplayMode = chordDisplaySelect.value;
                this.updateSequenceDisplay();
                this.updateDisplayAreas();
            });
        }

        // Play mode toggle button
        const playModeToggle = document.getElementById('playModeToggle');
        if (playModeToggle) {
            playModeToggle.addEventListener('click', () => {
                // Cycle through three modes: tap-notes -> tap-chords -> draw-chords -> tap-notes
                const modes = ['tap-notes', 'tap-chords', 'draw-chords'];
                const currentIndex = modes.indexOf(this.playMode);
                const nextIndex = (currentIndex + 1) % modes.length;
                this.playMode = modes[nextIndex];
                
                // Update button text
                playModeToggle.textContent = this.getPlayModeDisplayName(this.playMode);
                
                // Show notification
                // this.showNotification(`Play mode changed to: ${this.playMode}`, 'info');
            });
        }

        // Grid label mode toggle button
        const gridLabelsToggle = document.getElementById('gridLabelsToggle');
        if (gridLabelsToggle) {
            gridLabelsToggle.addEventListener('click', () => {
                // Cycle through the four modes: relative -> absolute -> roman -> none -> relative
                const modes = ['relative', 'absolute', 'roman', 'none'];
                const currentIndex = modes.indexOf(this.gridLabelMode);
                const nextIndex = (currentIndex + 1) % modes.length;
                const nextMode = modes[nextIndex];
                
                // Update grid label mode
                this.gridLabelMode = nextMode;
                this.createGridVisualization(); // Redraw grid with new labels
                
                // Show notification with appropriate text
                let labelText;
                switch(nextMode) {
                    case 'relative':
                        labelText = 'Relative Numbers';
                        break;
                    case 'absolute':
                        labelText = 'Absolute Notes';
                        break;
                    case 'roman':
                        labelText = 'Roman Numerals';
                        break;
                    case 'none':
                        labelText = 'No Labels';
                        break;
                    default:
                        labelText = nextMode;
                }
                // // // this.showNotification(`Grid labels changed to: ${labelText}`, 'info');
            });
        }

        // Chord buttons are now created dynamically in generateChordButtons()

        // Chord dropdown change handlers
        const rootNoteSelect = document.getElementById('rootNoteSelect');
        const chordTypeSelect = document.getElementById('chordTypeSelect');
        
        if (rootNoteSelect) {
            rootNoteSelect.addEventListener('change', () => {
                const rootNote = rootNoteSelect.value;
                const chordType = chordTypeSelect.value;
                this.createChord(rootNote, chordType);
            });
        }
        
        if (chordTypeSelect) {
            chordTypeSelect.addEventListener('change', () => {
                const rootNote = rootNoteSelect.value;
                const chordType = chordTypeSelect.value;
                this.createChord(rootNote, chordType);
            });
        }

        // Key dropdown change handlers
        const keyRootSelect = document.getElementById('keyRootSelect');
        const keyTypeSelect = document.getElementById('keyTypeSelect');
        
        if (keyRootSelect) {
            keyRootSelect.addEventListener('change', () => {
                const rootNote = keyRootSelect.value;
                const keyType = keyTypeSelect.value;
                this.createKey(rootNote, keyType);
                this.generateChordButtons(); // Regenerate chord buttons for new key
            });
        }
        
        if (keyTypeSelect) {
            keyTypeSelect.addEventListener('change', () => {
                const rootNote = keyRootSelect.value;
                const keyType = keyTypeSelect.value;
                this.createKey(rootNote, keyType);
                this.generateChordButtons(); // Regenerate chord buttons for new key
            });
        }

        // Key play button
        const playKeyBtn = document.getElementById('playKey');
        if (playKeyBtn) {
                    playKeyBtn.addEventListener('click', () => {
            this.playScaleSequentially();
        });
        }

        // Other buttons
        const clearMusicalBtn = document.getElementById('clearMusical');

        if (clearMusicalBtn) {
            clearMusicalBtn.addEventListener('click', () => {
                // Clear only chord notes, preserve key
                this.chordNotes.clear();
                
                // Clear actual clicked notes tracking
                this.actualClickedNotes.clear();
                
                // Clear grid values but preserve key visualization
                this.fillGrid(0);
                
                // Re-apply key notes to the grid
                if (this.currentKey) {
                    this.keyNotes.forEach(note => {
                        const coords = this.getCoordinatesForNote(note);
                        if (coords) {
                            this.setGridValue(coords.x, coords.y, 1); // Key notes
                        }
                    });
                }
                
                // Update active notes to only include key notes
                this.activeNotes = new Set(this.keyNotes);
                
                this.createGridVisualization();
                this.detectAndDisplayChord();
                // // // this.showNotification('Chord cleared! Key preserved.', 'info');
            });
        }

        // Play chord button
        const playChordBtn = document.getElementById('playChord');
        if (playChordBtn) {
            playChordBtn.addEventListener('click', () => {
                if (this.activeNotes.size === 0) {
                    // // // this.showNotification('No notes selected to play!', 'info');
                    return;
                }
                this.playActiveNotes();
            });
        }

        // Info play chord button (redundant)
        const playChordInfoBtn = document.getElementById('playChordInfo');
        if (playChordInfoBtn) {
            playChordInfoBtn.addEventListener('click', () => {
                if (this.activeNotes.size === 0) {
                    // // // this.showNotification('No notes selected to play!', 'info');
                    return;
                }
                this.playActiveNotes();
            });
        }

        // Info play key button
        const playKeyInfoBtn = document.getElementById('playKeyInfo');
        if (playKeyInfoBtn) {
            playKeyInfoBtn.addEventListener('click', () => {
                // Use the existing key playback system
                            this.playScaleSequentially();
        });
        }

        // Toggle clones button (three-way toggle)
        const toggleClonesBtn = document.getElementById('toggleClones');
        if (toggleClonesBtn) {
            toggleClonesBtn.addEventListener('click', () => {
                // Cycle through three states: 0=hide, 1=show clones, 2=show all octaves
                this.cloneMode = (this.cloneMode + 1) % 3;
        
                
                // Button always says "Clones" but behavior changes
                toggleClonesBtn.textContent = 'Clones';
                
                // Update button appearance based on mode
                if (this.cloneMode === 0) {
                    toggleClonesBtn.classList.add('hidden');
                } else {
                    toggleClonesBtn.classList.remove('hidden');
                }
                
                // Recreate grid visualization to reflect the change
                this.createGridVisualization();
                
                // Show appropriate notification
                let notificationMessage;
                if (this.cloneMode === 0) {
                    notificationMessage = 'Clone notes are now hidden';
                } else if (this.cloneMode === 1) {
                    notificationMessage = 'Clone notes are now visible';
                } else {
                    notificationMessage = 'All octaves of selected notes are now visible';

                }
                
                this.showNotification(notificationMessage, 'info');
            });
        }

        // Sequencer buttons

        const addToSequenceBtn = document.getElementById('addToSequence');

        
        if (addToSequenceBtn) {

            addToSequenceBtn.addEventListener('click', () => {

                this.addCurrentChordToSequence();
            });
        } else {
            console.error(`🎵 [SETUP] addToSequence button not found!`);
        }



        const addKeyToSequenceBtn = document.getElementById('addKeyToSequence');
        if (addKeyToSequenceBtn) {
            addKeyToSequenceBtn.addEventListener('click', () => {
                this.addCurrentKeyToSequence();
            });
        }

        const addRestToSequenceBtn = document.getElementById('addRestToSequence');
        if (addRestToSequenceBtn) {
            addRestToSequenceBtn.addEventListener('click', () => {
                this.addRestToSequence();
            });
        }

        const playNextBtn = document.getElementById('playNext');
        if (playNextBtn) {
            playNextBtn.addEventListener('click', () => {
                this.playNextChord();
            });
        }

        const playPrevBtn = document.getElementById('playPrev');
        if (playPrevBtn) {
            playPrevBtn.addEventListener('click', () => {
                this.playPrevChord();
            });
        }

        const playPauseBtn = document.getElementById('playPause');
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', (event) => {

                // Toggle between play and pause
                const sequencerState = this.sequencer.getState();
                if (sequencerState.isPlaying) {

                    this.stopPlaying();
                } else {

                    this.startPlaying();
                }
            });
        }

        const clearSequenceBtn = document.getElementById('clearSequence');
        if (clearSequenceBtn) {
            clearSequenceBtn.addEventListener('click', () => {
                this.clearSequence();
            });
        }

        // Load sequence button
        const loadSequenceBtn = document.getElementById('loadSequence');
        if (loadSequenceBtn) {
            loadSequenceBtn.addEventListener('click', () => {
                const sequenceInput = document.getElementById('sequenceInput');
                if (sequenceInput) {
                    this.parseAndLoadSequence(sequenceInput.value);
                }
            });
        }

        // Save sequence button
        const saveSequenceBtn = document.getElementById('saveSequence');
        if (saveSequenceBtn) {
            saveSequenceBtn.addEventListener('click', () => {
                this.saveSequence();
            });
        }

        // Load saved sequence button
        const loadSavedSequenceBtn = document.getElementById('loadSavedSequence');
        if (loadSavedSequenceBtn) {
            loadSavedSequenceBtn.addEventListener('click', () => {
                this.loadSavedSequence();
            });
        }

        // Add event delegation for sequence delete buttons and sequence item clicks
        const sequenceDisplay = document.getElementById('sequenceDisplay');
        if (sequenceDisplay) {
            sequenceDisplay.addEventListener('click', (event) => {

                
                if (event.target.classList.contains('sequence-delete-btn')) {

                    const index = parseInt(event.target.getAttribute('data-index'));

                    this.deleteSequenceItem(index);
                } else if (event.target.closest('.sequence-item')) {
                    // Click on sequence item (but not the delete button)

                    const sequenceItem = event.target.closest('.sequence-item');
                    const index = parseInt(sequenceItem.getAttribute('data-index'));

                    this.playSequenceItem(index);

                } else {

                }
            });
        }

        // Initialize clone button state
        const initToggleClonesBtn = document.getElementById('toggleClones');
        if (initToggleClonesBtn) {
            // Set initial state based on cloneMode (default is 1 = show clones)
            if (this.cloneMode === 0) {
                initToggleClonesBtn.classList.add('hidden');
            } else {
                initToggleClonesBtn.classList.remove('hidden');
            }
        }

        // Initialize MIDI
        this.initMIDI();

        // Add chord section toggle functionality
        const toggleChordsBtn = document.getElementById('toggleChords');
        const chordContent = document.getElementById('chordContent');
        
        if (toggleChordsBtn && chordContent) {
            // Collapsibility removed - button kept for future use
            
            toggleChordsBtn.addEventListener('click', () => {
                this.showAllChords = !this.showAllChords;
                this.switchChordContainer();
            });
        }

        // Add tuner section toggle functionality
        const toggleTunerBtn = document.getElementById('toggleTuner');
        const pitchDetectionContent = document.getElementById('pitchDetectionContent');
        
        if (toggleTunerBtn && pitchDetectionContent) {
            toggleTunerBtn.addEventListener('click', () => {
                this.tunerCollapsed = !this.tunerCollapsed;
                this.updateTunerDisplay();
            });
        }

        // Add key selector modal functionality
        const infoKeyBtn = document.getElementById('info-key');
        const keyModal = document.getElementById('key-modal');
        const closeKeyModal = document.getElementById('close-key-modal');
        const cancelKeySelection = document.getElementById('cancel-key-selection');
        const applyKeySelection = document.getElementById('apply-key-selection');
        const modalKeyRootSelect = document.getElementById('modal-keyRootSelect');
        const modalKeyTypeSelect = document.getElementById('modal-keyTypeSelect');
        
        if (infoKeyBtn && keyModal) {
            // Open modal when key button is clicked
            infoKeyBtn.addEventListener('click', () => {
                // Set current values in modal using this.currentKey
                const currentKeyRoot = this.currentKey?.rootNote || 'C';
                const currentKeyType = this.currentKey?.name || 'major';
                
                modalKeyRootSelect.value = currentKeyRoot;
                modalKeyTypeSelect.value = currentKeyType;
                
                keyModal.style.display = 'flex';
            });
            
            // Close modal functions
            const closeModal = () => {
                keyModal.style.display = 'none';
            };
            
            if (closeKeyModal) {
                closeKeyModal.addEventListener('click', closeModal);
            }
            
            if (cancelKeySelection) {
                cancelKeySelection.addEventListener('click', closeModal);
            }
            
            // Apply key selection
            if (applyKeySelection) {
                applyKeySelection.addEventListener('click', () => {
                    const rootNote = modalKeyRootSelect.value;
                    const keyType = modalKeyTypeSelect.value;
                    
                    // Create the new key
                    this.createKey(rootNote, keyType);
                    
                    // Update chord containers
                    if (this.showAllChords) {
                        this.generateChordButtons();
                    } else {
                        this.generateDiatonicChords();
                    }
                    
                    closeModal();
                });
            }
            
            // Close modal when clicking outside
            keyModal.addEventListener('click', (event) => {
                if (event.target === keyModal) {
                    closeModal();
                }
            });
        }

        // Add chord selector modal functionality
        const infoChordBtn = document.getElementById('info-chord');
        const chordModal = document.getElementById('chord-modal');
        const closeChordModal = document.getElementById('close-chord-modal');
        const cancelChordSelection = document.getElementById('cancel-chord-selection');
        const applyChordSelection = document.getElementById('apply-chord-selection');
        const modalChordRootSelect = document.getElementById('modal-chordRootSelect');
        const modalChordTypeSelect = document.getElementById('modal-chordTypeSelect');
        
        if (infoChordBtn && chordModal) {
            // Open modal when chord button is clicked
            infoChordBtn.addEventListener('click', () => {
                // Set current values in modal
                const currentChordRoot = document.getElementById('rootNoteSelect')?.value || 'C';
                const currentChordType = document.getElementById('chordTypeSelect')?.value || 'maj7';
                
                modalChordRootSelect.value = currentChordRoot;
                modalChordTypeSelect.value = currentChordType;
                
                chordModal.style.display = 'flex';
            });
            
            // Close modal functions
            const closeModal = () => {
                chordModal.style.display = 'none';
            };
            
            if (closeChordModal) {
                closeChordModal.addEventListener('click', closeModal);
            }
            
            if (cancelChordSelection) {
                cancelChordSelection.addEventListener('click', closeModal);
            }
            
            // Apply chord selection
            if (applyChordSelection) {
                applyChordSelection.addEventListener('click', () => {
                    const rootNote = modalChordRootSelect.value;
                    const chordType = modalChordTypeSelect.value;
                    
                    // Update the main chord selectors
                    const chordRootSelect = document.getElementById('rootNoteSelect');
                    const chordTypeSelect = document.getElementById('chordTypeSelect');
                    
                    if (chordRootSelect) chordRootSelect.value = rootNote;
                    if (chordTypeSelect) chordTypeSelect.value = chordType;
                    
                    // Create the new chord
                    this.createChord(rootNote, chordType);
                    
                    closeModal();
                });
            }
            
            // Close modal when clicking outside
            chordModal.addEventListener('click', (event) => {
                if (event.target === chordModal) {
                    closeModal();
                }
            });
        }

        // Add keyboard navigation for sequencer
        document.addEventListener('keydown', (event) => {
            // Check if we're in an input field - if so, don't interfere with typing
            // This prevents music keyboard from intercepting keystrokes when typing in forms
            const activeElement = document.activeElement;
            const isInputField = activeElement && (
                activeElement.tagName === 'INPUT' || 
                activeElement.tagName === 'TEXTAREA' || 
                activeElement.contentEditable === 'true'
            );
            
            if (isInputField) {
                return; // Don't interfere with typing in input fields
            }
            
            // Only handle arrow keys when not typing in input fields or using the speed slider
            const isSpeedSlider = activeElement && activeElement.id === 'sequencerInterval';
            
            if (isSpeedSlider) {
                return; // Don't interfere with speed slider
            }

            switch (event.key) {
                case ' ':
                    event.preventDefault();

                    const sequencerState = this.sequencer.getState();
                    if (sequencerState.isPlaying) {
                        this.stopPlaying();
                    } else {
                        this.startPlaying();
                    }
                    break;
                case 'ArrowRight':
                    event.preventDefault();

                    this.playNextChord();
                    break;
                case 'ArrowLeft':
                    event.preventDefault();

                    this.playPrevChord();
                    break;
                case 'ArrowUp':
                    event.preventDefault();

                    this.adjustSpeed(0.1);
                    break;
                case 'ArrowDown':
                    event.preventDefault();

                    this.adjustSpeed(-0.1);
                    break;
                case 'Shift':
                    // Sustain pedal functionality (works in both tap-notes and tap-chords modes)

                    if ((this.playMode === 'tap-notes' || this.playMode === 'tap-chords') && !this.sustainPedalActive) {
                        event.preventDefault();
                        this.sustainPedalActive = true;

                    } else {

                    }
                    break;


                default:
                    // Chord modifier keys (Z, X, C, V, B) - set modifier state
                    if (['z', 'x', 'c', 'v', 'b'].includes(event.key.toLowerCase())) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        // Prevent key repeat events
                        if (event.repeat) {
                            return;
                        }
                        
                        // Set the appropriate modifier key state
                        switch (event.key.toLowerCase()) {
                            case 'z':
                                this.zKeyActive = true;
                                console.log('Z key pressed - zKeyActive:', this.zKeyActive);
                                break;
                            case 'x':
                                this.xKeyActive = true;
                                console.log('X key pressed - xKeyActive:', this.xKeyActive);
                                break;
                            case 'c':
                                this.cKeyActive = true;
                                console.log('C key pressed - cKeyActive:', this.cKeyActive);
                                break;
                            case 'v':
                                this.vKeyActive = true;
                                console.log('V key pressed - vKeyActive:', this.vKeyActive);
                                break;
                            case 'b':
                                this.bKeyActive = true;
                                console.log('B key pressed - bKeyActive:', this.bKeyActive);
                                break;
                        }
                        
                    } else if (this.playMode === 'tap-notes' && this.isMusicalKey(event.key)) {
                        event.preventDefault();
                        // Prevent key repeat events
                        if (event.repeat) {
                            return;
                        }
                        const noteData = this.getNoteFromMusicalKey(event.key);
                        if (noteData) {
                            if (noteData.type === 'chord') {
                                // Handle chord creation with exact same grid placement as chord buttons

                                
                                // Use the exact same grid placement logic as chord buttons
                                if (noteData.calculatedPos) {
                            
                                    this.createChordWithSpecificRoot(noteData.rootNote, noteData.chordType, noteData.calculatedPos.coord);
                                } else {
                            
                                    this.createChord(noteData.rootNote, noteData.chordType, noteData.keyDegree);
                                }
                                
                                // Play the chord audio
                                this.playChordAudio(noteData.rootNote, noteData.chordType);
                                

                            } else {
                                // Handle single note

                                this.tapNote(noteData.note, noteData.octave);
                                this.highlightGridCell(noteData.note, noteData.octave);

                            }
                        } else {

                        }
                    }
                    break;
            }
        });



        // Note: C key is handled in the main keyboard handler for both music and modifier functionality

        // Add keyboard up event for sustain pedal release
        document.addEventListener('keyup', (event) => {
            if (event.key === 'Shift') {
                if (this.playMode === 'tap-notes' || this.playMode === 'tap-chords') {
                    event.preventDefault();
                    this.releaseSustainPedal();
                }
            } else if (['z', 'x', 'c', 'v', 'b'].includes(event.key.toLowerCase())) {
                // Release chord modifier keys
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                switch (event.key.toLowerCase()) {
                    case 'z':
                        this.zKeyActive = false;
                        console.log('Z key released - zKeyActive:', this.zKeyActive);
                        break;
                    case 'x':
                        this.xKeyActive = false;
                        console.log('X key released - xKeyActive:', this.xKeyActive);
                        break;
                    case 'c':
                        this.cKeyActive = false;
                        console.log('C key released - cKeyActive:', this.cKeyActive);
                        break;
                    case 'v':
                        this.vKeyActive = false;
                        console.log('V key released - vKeyActive:', this.vKeyActive);
                        break;
                    case 'b':
                        this.bKeyActive = false;
                        console.log('B key released - bKeyActive:', this.bKeyActive);
                        break;
                }
            }
            
            // Handle musical typing note release
            if (this.playMode === 'tap-notes' && this.isMusicalKey(event.key)) {
                event.preventDefault();
                const noteData = this.getNoteFromMusicalKey(event.key);
                if (noteData && noteData.type !== 'chord') {
                    // Only release individual notes, not chords
                    this.releaseNote(noteData.note, noteData.octave);
                    this.unhighlightGridCell(noteData.note, noteData.octave);
                }
            }
        });

        // Sequencer speed slider (inverse of interval)
        const sequencerIntervalSlider = document.getElementById('sequencerInterval');
        
        if (sequencerIntervalSlider) {
            // Update interval when slider changes
            sequencerIntervalSlider.addEventListener('input', (event) => {
                // Prevent this event from bubbling up to the keyboard listener
                event.stopPropagation();
                
                const speedValue = parseFloat(event.target.value);
                
                // Update the sequencer's interval directly using the conversion method
                this.sequencer.sequencerInterval = this.speedToInterval(speedValue);
                

            });
            
            // Also prevent keydown events on the slider from bubbling up
            sequencerIntervalSlider.addEventListener('keydown', (event) => {
                event.stopPropagation();
            });
        }

        // Setup sustain handlers for tap-notes mode
        this.setupSustainHandlers();

        // Chord spellings selector
        const chordSpellingsSelect = document.getElementById('chordSpellingsSelect');
        if (chordSpellingsSelect) {
            chordSpellingsSelect.addEventListener('change', () => {
                this.chordSpellingsMode = chordSpellingsSelect.value;
                this.updateDisplayAreas();
            });
        }

        // Tuner display selector
        const tunerDisplaySelect = document.getElementById('tunerDisplaySelect');
        if (tunerDisplaySelect) {
            tunerDisplaySelect.addEventListener('change', () => {
                this.tunerDisplayMode = tunerDisplaySelect.value;
                this.updatePitchVarianceDisplay();
            });
        }

        // Pitch detection button
        const pitchDetectBtn = document.getElementById('pitchDetectBtn');
        if (pitchDetectBtn) {
            pitchDetectBtn.addEventListener('click', (event) => {
                        // Handle pitch detection button click
                
                if (this.pitchDetection?.pitchDetectionActive) {

                    this.stopPitchDetection();
                } else {
                    // Start pitch detection
                    this.startPitchDetection();
                }
            });
        }
        
        // Add global mouseup handler for drag functionality
        document.addEventListener('mouseup', (event) => {
            if (this.isDragging && this.playMode === 'tap-notes') {

                
                // Stop the currently hovered note
                if (this.currentlyHoveredNote) {
                    this.releaseNote(this.currentlyHoveredNote, this.currentlyHoveredOctave);
                    this.currentlyHoveredNote = null;
                    this.currentlyHoveredOctave = null;
                }
                
                // Stop drag mode
                this.isDragging = false;
                
                // Remove clicked styling from all cells
                this.removeAllClickedStyling();
            }
        });

    }

    showNotification(message, type = 'info') {
        
        // Check if auth UI is visible and avoid showing notifications if it is
        const authContainer = document.getElementById('auth-container');
        if (authContainer && authContainer.children.length > 0) {
            return;
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;
        


        // Add styles - positioned at bottom-right to avoid auth panels
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#4299e1'};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 500;
            transform: translateY(100%);
            transition: transform 0.3s ease;
            max-width: 280px;
            font-size: 14px;
            opacity: 0.95;
        `;

        // Add to page

        document.body.appendChild(notification);


        // Animate in
        setTimeout(() => {

            notification.style.transform = 'translateY(0)';
        }, 100);

        // Close button functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notification.style.transform = 'translateY(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        });

        // Auto remove after 4 seconds (shorter duration)
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.style.transform = 'translateY(100%)';
                setTimeout(() => {
                    if (document.body.contains(notification)) {
                        document.body.removeChild(notification);
                    }
                }, 300);
            }
        }, 4000);
    }



    // Initialize Tone.js piano
    async initAudio() {
        const startTime = performance.now();
        
        // Start audio context first
        if (Tone.context.state !== 'running') {
            try {
                await Tone.start();
            } catch (error) {
                console.error('🎵 [AUDIO] Failed to start audio context:', error);
                return;
            }
        }
        
        if (!this.piano) {
            // Create fallback oscillators immediately for reliable audio
            this.createFallbackOscillator();
            this.audioReady = true;
            
            // Try to load piano samples in the background
            try {
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
                        console.log('🎵 [AUDIO] Piano samples loaded successfully');
                    },
                    onerror: (error) => {
                        console.error('🎵 [AUDIO] Error loading chord piano samples:', error);
                        // Keep using fallback oscillator
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
                        console.log('🎵 [AUDIO] Melody piano samples loaded successfully');
                    },
                    onerror: (error) => {
                        console.error('🎵 [AUDIO] Error loading melody piano samples:', error);
                        // Keep using fallback oscillator
                    }
                }).toDestination();
                
                // Set higher volumes for better audibility
                this.piano.volume.value = 0; // Full volume for chords
                this.melodyPiano.volume.value = 6; // Higher volume for melody
            } catch (error) {
                console.error('🎵 [AUDIO] Failed to create piano samplers:', error);
                // Fallback oscillator is already created
            }
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
            volume: 0 // Full volume
        }).toDestination();
        
        // Create melody piano as well
        this.melodyPiano = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: "triangle"
            },
            envelope: {
                attack: 0.01,
                decay: 0.1,
                sustain: 0.4,
                release: 1.2
            },
            volume: 6 // Higher volume for melody
        }).toDestination();
        
        console.log('Using improved fallback synthesizer');
        this.audioReady = true;
    }

            // Convert pitch to frequency (for fallback oscillator)
        pitchToFrequency(pitch) {
            return PitchUtils.pitchToFrequency(pitch);
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

            return null;
        }
    }

    // Play chord notes only
    async playActiveNotes() {

        // Check if there are chord notes to play
        if (this.chordNotes.size === 0) {
            return;
        }
        
        // Ensure audio is initialized and ready
        this.ensureAudioReady();
        if (!this.piano || !this.audioReady) {
            await this.initAudio();
        }
        
        this.currentNotes = [];
        const playStartTime = performance.now();
        
        // Play each chord note at its exact highlighted position
        this.chordNotes.forEach((noteWithOctave, index) => {
            const noteStartTime = performance.now();
            const actualCoord = this.actualClickedNotes.get(noteWithOctave);
            if (actualCoord) {
                // Get the exact pitch at the highlighted coordinate
                const pitch = this.getPitchAt(actualCoord.x, actualCoord.y);
                // Extract just the pitch class (without octave) for playNote
                const pitchClass = noteWithOctave.replace(/\d+$/, '');
                
                // Use tapNote if sustain pedal is active, otherwise use playNote
                if (this.sustainPedalActive) {

                    this.tapNote(pitchClass, pitch.octave, true);
                } else {
                    const noteData = this.playNote(pitchClass, pitch.octave, 2.4);
                    if (noteData) {
                        this.currentNotes.push(noteData);
                    }
                }
                
            } else {
                // Fallback to default octave if no coordinate found
                const pitchClass = noteWithOctave.replace(/\d+$/, '');
                
                // Use tapNote if sustain pedal is active, otherwise use playNote
                if (this.sustainPedalActive) {

                    this.tapNote(pitchClass, 3, true);
                } else {
                    const noteData = this.playNote(pitchClass, 3, 2.4);
                    if (noteData) {
                        this.currentNotes.push(noteData);
                    }
                }
            }
        });
        
        // Send MIDI data if available
        this.sendMIDINotes();
    }

    // Handle sequence item changes (called by sequencer)
    handleSequenceItemChange(sequenceItem, index) {

        
        // Update button text based on new position
        this.updateAddButtonsText();
        
        // Clear current notes and set the sequence notes
        this.chordNotes.clear();
        this.actualClickedNotes.clear();
        
        // Handle different sequence item types
        if (sequenceItem.type === 'key') {
            this.handleKeySequenceItem(sequenceItem);
        } else if (sequenceItem.type === 'chord') {
            this.handleChordSequenceItem(sequenceItem);
        }
        
        // Update display
        this.updateDisplayAreas();
        this.createGridVisualization();
        this.updateSequenceDisplay();
    }

    // Handle key sequence items
    handleKeySequenceItem(sequenceItem) {
        // Clear key notes
        this.keyNotes.clear();
        
        // Set current key data from sequence item
        if (sequenceItem.rootNote && sequenceItem.keyType && this.keys[sequenceItem.keyType]) {
            // Determine flat/sharp preference for this key
            const useFlats = PitchUtils.shouldUseFlats(this.noteToPitchClass(sequenceItem.rootNote), sequenceItem.keyType);
            
                    this.currentKey = {
            rootNote: sequenceItem.rootNote,
            name: sequenceItem.keyType,
            intervals: this.keys[sequenceItem.keyType].intervals,
            useFlats: useFlats
        };
            
            // Generate key notes using PitchUtils
            const rootPitchClass = this.noteToPitchClass(sequenceItem.rootNote);
            const keyNotes = PitchUtils.generateKeyNotes(rootPitchClass, sequenceItem.keyType, PitchUtils.keys);
            keyNotes.forEach(note => {
                this.keyNotes.add(note);
            });
            
            // Update chord buttons for the new key
            this.generateChordButtons();
        }
        
        // Clear the grid for keys
        this.fillGrid(0);
    }

    // Handle chord sequence items
    handleChordSequenceItem(sequenceItem) {

        
        // Clear previous chord notes
        this.chordNotes.clear();
        this.actualClickedNotes.clear();
        
        // Prioritize exactCoordinates if available, then pitches, then fall back to rootNote/chordType

        
        if (sequenceItem.exactCoordinates && sequenceItem.exactCoordinates.length > 0) {
            sequenceItem.exactCoordinates.forEach((coord, index) => {
                const pitch = this.getPitchAt(coord.x, coord.y);
                if (pitch && pitch.note && pitch.octave !== undefined) {
                    const noteWithOctave = `${pitch.note}${pitch.octave}`;
                    this.chordNotes.add(noteWithOctave);
                    this.actualClickedNotes.set(noteWithOctave, coord);
                    
                    // Set grid value for visualization
                    this.setGridValue(coord.x, coord.y, 1);
                }
            });
        } else if (sequenceItem.pitches && sequenceItem.pitches.length > 0) {
            // Use stored pitch numbers to find coordinates and add to chord notes

            sequenceItem.pitches.forEach(pitchNumber => {
                // Convert pitch number to note and octave for display
                const octave = Math.floor(pitchNumber / 12) - 1;
                const pitchClass = pitchNumber % 12;
                const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                const note = noteNames[pitchClass];
                const noteWithOctave = `${note}${octave}`;
                
                // Find coordinates for this specific pitch
                const coords = this.getCoordinatesForNoteInOctave(note, octave);
                if (coords && coords.length > 0) {
                    // Find the coordinate that actually has the correct pitch
                    let correctCoord = null;
                    for (const coord of coords) {
                        const pitchAtCoord = this.getPitchAt(coord.x, coord.y);
                        if (pitchAtCoord && pitchAtCoord.pitch === pitchNumber) {
                            correctCoord = coord;
                            break;
                        }
                    }
                    
                    // If we found the correct coordinate, use it; otherwise fall back to first
                    const coord = correctCoord || coords[0];
                    this.chordNotes.add(noteWithOctave);
                    this.actualClickedNotes.set(noteWithOctave, coord);
                    
                    // Set grid value for visualization
                    this.setGridValue(coord.x, coord.y, 1);
                }
            });
        } else if (sequenceItem.rootNote && sequenceItem.chordType) {
            // Handle AI-loaded chords that only have rootNote and chordType

            
            // STEP 1: Parse the chord (already done - we have rootNote and chordType)
            
            // STEP 2: Generate root pitch
            const rootPitch = PitchUtils.generateNotePitch(sequenceItem.rootNote, 3);

            
            // STEP 3: Get root coordinate using left-middle logic
            const gridFormat = {
                width: 8,
                height: 8,
                originPitch: PitchUtils.getOriginPitch()
            };
            const rootCoord = PitchUtils.getLeftMiddleGridCoordFromPitch(rootPitch, gridFormat);

            
            // STEP 4: Create chord with specific root using Manhattan selection

            this.createChordWithSpecificRoot(sequenceItem.rootNote, sequenceItem.chordType, rootCoord);
            

        }
    }

    // Stop all playing notes
    stopPlaying() {
        this.sequencer.stopPlaying();
    }

    startPlaying() {
        // Ensure audio is ready before starting
        this.ensureAudioReady();
        
        // The sequencer already has the sequence data, no need to set it again
        
        // Start playing
        const result = this.sequencer.startPlaying();
        
        if (!result.success) {
            this.showNotification(result.error, 'error');
        }
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
    sendMIDINotes() {
        if (!this.midiOutputs.length) return;
        
        const output = this.midiOutputs[0]; // Use first available output
        const channel = 0;
        const velocity = 100;
        
        this.chordNotes.forEach(note => {
            const actualCoord = this.actualClickedNotes.get(note);
            if (actualCoord) {
                // Get the exact pitch at the highlighted coordinate
                const pitch = this.getPitchAt(actualCoord.x, actualCoord.y);
                output.send([0x90 + channel, pitch.pitch, velocity]); // Note on
            } else {
                // Fallback to default octave if no coordinate found
                const noteIndex = this.noteToPitchClass(note);
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
        
        this.chordNotes.forEach(note => {
            const actualCoord = this.actualClickedNotes.get(note);
            if (actualCoord) {
                // Get the exact pitch at the highlighted coordinate
                const pitch = this.getPitchAt(actualCoord.x, actualCoord.y);
                output.send([0x80 + channel, pitch.pitch, 0]); // Note off
            } else {
                // Fallback to default octave if no coordinate found
                const noteIndex = this.noteToPitchClass(note);
                if (noteIndex !== -1) {
                    const midiNote = 48 + noteIndex;
                    output.send([0x80 + channel, midiNote, 0]); // Note off
                }
            }
        });
    }

    // Create a key based on root note and key type
    createKey(rootNote, keyType) {
        // Store current chord notes to preserve them
        const preservedChordNotes = new Set(this.chordNotes);
        
        this.fillGrid(0);
        this.activeNotes.clear();
        this.keyNotes.clear();
        this.chordNotes.clear();
        
        // Get the base note (first part before slash for enharmonics)
        const baseNote = rootNote.split('/')[0];
        const baseNoteIndex = this.noteToPitchClass(baseNote);
        
        if (baseNoteIndex === -1) {
            this.showNotification(`Invalid root note: ${rootNote}`, 'error');
            return;
        }
        
        const keyData = this.keys[keyType];
        if (!keyData) {
            this.showNotification(`Invalid key type: ${keyType}`, 'error');
            return;
        }
        
        // Store current key for degree calculation
        // Work with chromatic indices internally
        const rootIndex = baseNoteIndex;
        const useFlats = PitchUtils.shouldUseFlats(this.noteToPitchClass(baseNote), keyType);
        const displayRootNote = this.pitchClassToNote(rootIndex, useFlats);
        

        
        this.currentKey = {
            rootIndex: rootIndex,
            rootNote: displayRootNote,
            name: keyType,
            intervals: keyData.intervals,
            useFlats: useFlats
        };
        
        // Note: We no longer need to generate key notes for detection
        // Key detection now uses pure interval math via isPitchInKey()
        // Keep keyNotes for backward compatibility with other features
        const keyNotes = keyData.intervals.map(interval => {
            const noteIndex = (rootIndex + interval) % 12;
            return this.pitchClassToNote(noteIndex, useFlats);
        });
        
        // Add all key notes to key notes set (for other features)
        keyNotes.forEach(note => {
            this.keyNotes.add(note);
            this.activeNotes.add(note);
        });
        
        // Restore chord notes
        preservedChordNotes.forEach(note => {
            this.chordNotes.add(note);
            this.activeNotes.add(note);
        });
        
        this.createGridVisualization();
        this.generateChordButtons(); // Update chord buttons for new key
        this.detectAndDisplayChord();
        
        // Notify NoteDetectionUI of key change
        if (this.noteDetectionUI && this.noteDetectionUI.onKeyChanged) {
            this.noteDetectionUI.onKeyChanged();
        }
        
        // this.showNotification(`Created ${rootNote} ${keyData.name} key!`, 'success');
    }

                // Play scale sequentially
    playScaleSequentially() {

        
        if (this.isPlayingScale) {

            this.stopScalePlayback();
            return;
        }
        
        // Note: We don't need to check activeNotes.size because we're playing the scale
        // based on the current key selection, not the selected notes on the grid
        

        
        // Audio will be initialized when needed
        
        this.isPlayingScale = true;
        this.scalePlaybackIndex = 0;
        
        // Get the root note and key type from current key context
        let rootNote, keyType;
        
        if (this.currentKey && this.currentKey.rootNote && this.currentKey.name) {
            // Use current key context
            rootNote = this.currentKey.rootNote;
            keyType = this.currentKey.name;

        } else {
            // Fallback to DOM selectors if no current key context
            const rootNoteSelect = document.getElementById('keyRootSelect');
            const keyTypeSelect = document.getElementById('keyTypeSelect');
            rootNote = rootNoteSelect ? rootNoteSelect.value.split('/')[0] : 'C';
            keyType = keyTypeSelect ? keyTypeSelect.value : 'major';

        }
        
        // Create the ascending scale pattern using pure pitch calculations (start one octave higher)
        const rootPitchClass = this.noteToPitchClass(rootNote);
        this.scalePlaybackPattern = PitchUtils.generateAscendingScalePattern(rootPitchClass, keyType, this.keys, 3);

        
        // Start sequential playback
        this.playNextScaleNoteWithOctaves();
        
        // Update play button
        this.updateScalePlayButton();
    }



    // Sort notes to follow key order from low to high octave
    sortNotesByKey(notes) {
        // Get the root note from the key selector
        const rootNoteSelect = document.getElementById('keyRootSelect');
        const rootNote = rootNoteSelect ? rootNoteSelect.value.split('/')[0] : 'C';
        
        // Create a key pattern from low octave to high octave
        const keyRootIndex = this.noteToPitchClass(rootNote);
        if (keyRootIndex === -1) return notes.sort();
        
        // Get the current key type
        const keyTypeSelect = document.getElementById('keyTypeSelect');
        const keyType = keyTypeSelect ? keyTypeSelect.value : 'major';
        const keyData = this.keys[keyType];
        
        if (!keyData) return notes.sort();
        
        // Create the full key pattern (two octaves plus final tonic)
        const keyPattern = [];
        const lowOctave = 2; // Start from octave 2
        const highOctave = 3; // End at octave 3
        
        // Add two full octaves
        for (let octave = lowOctave; octave <= highOctave; octave++) {
            keyData.intervals.forEach(interval => {
                const noteIndex = (keyRootIndex + interval) % 12;
                const note = this.pitchClassToNote(noteIndex, false); // Use sharps for internal processing
                keyPattern.push({ note, octave });
            });
        }
        
        // Add final tonic note in octave 4
        const finalTonic = this.pitchClassToNote(keyRootIndex, false); // Use sharps for internal processing
        keyPattern.push({ note: finalTonic, octave: 4 });
        
        // Filter to only include notes that are currently active
        const activeNotesSet = new Set(notes);
        const filteredPattern = keyPattern.filter(({ note }) => activeNotesSet.has(note));
        
        // Return just the note names in the correct order
        return filteredPattern.map(({ note }) => note);
    }

            // Play next note in scale sequence with proper octaves
    playNextScaleNoteWithOctaves() {
        if (!this.isPlayingScale || this.scalePlaybackIndex >= this.scalePlaybackPattern.length) {
            this.stopScalePlayback();
            return;
        }
        
        // Unhighlight the previous note if there was one
        if (this.scalePlaybackIndex > 0) {
            const prevPitch = this.scalePlaybackPattern[this.scalePlaybackIndex - 1];
            const prevNoteInfo = PitchUtils.pitchToNoteAndOctave(prevPitch);
            this.unhighlightGridCell(prevNoteInfo.note, prevNoteInfo.octave);
        }
        
        const pitch = this.scalePlaybackPattern[this.scalePlaybackIndex];
        const noteInfo = PitchUtils.pitchToNoteAndOctave(pitch);
        
        // Highlight the current note
        this.highlightGridCell(noteInfo.note, noteInfo.octave);
        
        const noteData = this.playNote(noteInfo.note, noteInfo.octave, 0.8);
        
        if (noteData) {
            this.currentNotes.push(noteData);
        }
        
        // Send MIDI note with correct octave
        this.sendMIDINoteWithOctave(noteInfo.note, noteInfo.octave);
        
        // Schedule next note using sequencer interval (twice as fast)
        const interval = this.sequencer.sequencerInterval / 2;
        this.scalePlaybackTimer = setTimeout(() => {
            this.scalePlaybackIndex++;
            this.playNextScaleNoteWithOctaves();
        }, interval);
    }

    // Stop scale playback
    stopScalePlayback() {
        this.isPlayingScale = false;
        
        if (this.scalePlaybackTimer) {
            clearTimeout(this.scalePlaybackTimer);
            this.scalePlaybackTimer = null;
        }
        
        // Unhighlight the last note if there was one
        if (this.scalePlaybackIndex > 0 && this.scalePlaybackIndex <= this.scalePlaybackPattern.length) {
            const lastPitch = this.scalePlaybackPattern[this.scalePlaybackIndex - 1];
            const lastNoteInfo = PitchUtils.pitchToNoteAndOctave(lastPitch);
            this.unhighlightGridCell(lastNoteInfo.note, lastNoteInfo.octave);
        }
        
        // Stop all notes using Tone.js
        if (this.piano) {
            this.piano.releaseAll();
        }
        
        this.currentNotes = [];
        
        // Stop MIDI notes
        this.stopMIDINotes();
        
        // Update play button
        this.updateScalePlayButton();
    }

    // Send single MIDI note with octave
    sendMIDINoteWithOctave(note, octave) {
        if (!this.midiOutputs.length) return;
        
        const output = this.midiOutputs[0];
        const channel = 0;
        const velocity = 100;
        
        const noteIndex = this.noteToPitchClass(note);
        if (noteIndex !== -1) {
            const midiNote = (octave * 12) + noteIndex;
            output.send([0x90 + channel, midiNote, velocity]); // Note on
            
            // Send note off after sequencer interval (twice as fast)
            const interval = this.sequencer.sequencerInterval / 2;
            setTimeout(() => {
                output.send([0x80 + channel, midiNote, 0]); // Note off
            }, interval);
        }
    }

    // Send single MIDI note (legacy method for chord playback)
    sendMIDINote(note) {
        this.sendMIDINoteWithOctave(note, 3); // Default to octave 3
    }

    // Update scale play button state
    updateScalePlayButton() {
        const scalePlayBtn = document.getElementById('playKey');
        const scalePlayInfoBtn = document.getElementById('playKeyInfo');
        
        if (scalePlayBtn) {
            if (this.isPlayingScale) {
                scalePlayBtn.textContent = '⏹ Stop Scale';
                scalePlayBtn.classList.add('playing');
            } else {
                scalePlayBtn.textContent = '▶ Play Scale';
                scalePlayBtn.classList.remove('playing');
            }
        }
        
        if (scalePlayInfoBtn) {
            if (this.isPlayingScale) {
                scalePlayInfoBtn.textContent = '⏹ Stop Scale';
                scalePlayInfoBtn.classList.add('playing');
            } else {
                scalePlayInfoBtn.textContent = '▶ Play Scale';
                scalePlayInfoBtn.classList.remove('playing');
            }
        }
    }

    // Update play button state
    updatePlayButton() {
        const playBtn = document.getElementById('playChord');
        const playInfoBtn = document.getElementById('playChordInfo');
        
        if (playBtn) {
            playBtn.textContent = '▶ Play Chord';
        }
        
        if (playInfoBtn) {
            playInfoBtn.textContent = '▶ Play Chord';
        }
    }

    // Update display areas with current key and chord information
    updateDisplayAreas() {
        // Update key display
        const keyDisplay = document.getElementById('info-key');
        if (keyDisplay && this.currentKey) {
            // Use currentKey data (works for both manual key creation and sequencer playback)
            const rootNote = this.currentKey.rootNote;
            const keyType = this.currentKey.name;
            
            if (keyType && this.keys[keyType]) {
                const keyData = this.keys[keyType];
                // Root note is already converted to preferred accidentals
            keyDisplay.textContent = `Key: ${rootNote} ${keyData.name}`;
            } else {
                keyDisplay.textContent = `Key: ${rootNote}`;
            }
        } else if (keyDisplay) {
            keyDisplay.textContent = 'Key: None';
        }
        
        // Update chord display area
        const chordDisplayArea = document.getElementById('info-chord');
        if (chordDisplayArea) {
            const chordNotesArray = Array.from(this.chordNotes);
            // Extract pitch classes (remove octaves) for chord detection
            const pitchClasses = chordNotesArray.map(note => note.replace(/\d+$/, ''));
            
            // Get actual pitches for diminished chord priority
            const actualPitches = [];
            chordNotesArray.forEach(note => {
                const coords = this.actualClickedNotes.get(note);
                if (coords) {
                    const pitch = this.getPitchAt(coords.x, coords.y);
                    if (pitch && pitch.pitch !== undefined) {
                        actualPitches.push(pitch.pitch);
                    }
                }
            });
            
            const detectedChords = this.detectChord(pitchClasses, actualPitches);
            
            if (detectedChords && detectedChords.length > 0) {
                const primaryChord = detectedChords[0];
                
                // Show multiple interpretations if they exist (especially for symmetric chords)
                if (detectedChords.length > 1) {
                    // Deduplicate chord interpretations to avoid redundancy
                    const uniqueChords = [];
                    const seen = new Set();
                    
                    for (const chord of detectedChords) {
                        const chordKey = `${chord.rootNote} ${chord.chordType}`;
                        if (!seen.has(chordKey)) {
                            seen.add(chordKey);
                            uniqueChords.push(chord);
                        }
                    }
                    
                    if (this.chordSpellingsMode === 'show-all' && uniqueChords.length > 1) {
                        // Show primary chord and alternates in gray (as before)
                        const primaryChord = uniqueChords[0];
                        const alternateChords = uniqueChords.slice(1);
                        
                        // Format primary chord
                        const primaryDisplayName = this.currentKey ? 
                            primaryChord.fullName.replace(primaryChord.rootNote, PitchUtils.pitchClassToNote(this.noteToPitchClass(primaryChord.rootNote), PitchUtils.shouldUseFlats(this.noteToPitchClass(this.currentKey.rootNote), this.currentKey.name))) :
                            primaryChord.fullName;
                        
                        let primaryRomanNumeral = '';
                        if (this.currentKey) {
                            const rootPitchClass = this.noteToPitchClass(primaryChord.rootNote);
                            primaryRomanNumeral = PitchUtils.getRomanNumeralForChordInKey(rootPitchClass, primaryChord.chordType, {
                                rootPitchClass: this.noteToPitchClass(this.currentKey.rootNote),
                                name: this.currentKey.name
                            });
                        }
                        
                        let primaryFinalName;
                        switch (this.chordDisplayMode) {
                            case 'rn':
                                primaryFinalName = primaryRomanNumeral || primaryDisplayName;
                                break;
                            case 'chord-rn':
                                primaryFinalName = primaryRomanNumeral ? `${primaryDisplayName}&nbsp;<span style="color: #64748b;">(${primaryRomanNumeral})</span>` : primaryDisplayName;
                                break;
                            case 'chord':
                            default:
                                primaryFinalName = primaryDisplayName;
                                break;
                        }
                        
                        // Format alternate chords
                        const alternateNames = alternateChords.map(chord => {
                            const displayChordName = this.currentKey ? 
                                chord.fullName.replace(chord.rootNote, PitchUtils.pitchClassToNote(this.noteToPitchClass(chord.rootNote), PitchUtils.shouldUseFlats(this.noteToPitchClass(this.currentKey.rootNote), this.currentKey.name))) :
                                chord.fullName;
                            
                            let romanNumeral = '';
                            if (this.currentKey) {
                                const rootPitchClass = this.noteToPitchClass(chord.rootNote);
                                romanNumeral = PitchUtils.getRomanNumeralForChordInKey(rootPitchClass, chord.chordType, {
                                    rootPitchClass: this.noteToPitchClass(this.currentKey.rootNote),
                                    name: this.currentKey.name
                                });
                            }
                            
                            switch (this.chordDisplayMode) {
                                case 'rn':
                                    return romanNumeral || displayChordName;
                                case 'chord-rn':
                                    return romanNumeral ? `${displayChordName}&nbsp;<span style="color: #64748b;">(${romanNumeral})</span>` : displayChordName;
                                case 'chord':
                                default:
                                    return displayChordName;
                            }
                        });
                        
                        // Create HTML with primary chord in white and alternates in darker gray
                        chordDisplayArea.innerHTML = `Chord:&nbsp;<span style="color: #f8fafc;">${primaryFinalName}</span><span style="color: #64748b;">,&nbsp;${alternateNames.join(',&nbsp;')}</span>`;
                    } else {
                        const displayChordName = this.currentKey ? 
                            uniqueChords[0].fullName.replace(uniqueChords[0].rootNote, PitchUtils.pitchClassToNote(this.noteToPitchClass(uniqueChords[0].rootNote), PitchUtils.shouldUseFlats(this.noteToPitchClass(this.currentKey.rootNote), this.currentKey.name))) :
                            uniqueChords[0].fullName;
                        
                        // Add Roman numeral if we have a current key
                        let romanNumeral = '';
                        if (this.currentKey) {
                            const rootPitchClass = this.noteToPitchClass(uniqueChords[0].rootNote);
                            romanNumeral = PitchUtils.getRomanNumeralForChordInKey(rootPitchClass, uniqueChords[0].chordType, {
                                rootPitchClass: this.noteToPitchClass(this.currentKey.rootNote),
                                name: this.currentKey.name
                            });
                        }
                        
                        // Format display based on chord display mode
                        let finalDisplayName;
                        switch (this.chordDisplayMode) {
                            case 'rn':
                                finalDisplayName = romanNumeral || displayChordName;
                                break;
                            case 'chord-rn':
                                finalDisplayName = romanNumeral ? `${displayChordName}&nbsp;<span style="color: #64748b;">(${romanNumeral})</span>` : displayChordName;
                                break;
                            case 'chord':
                            default:
                                finalDisplayName = displayChordName;
                                break;
                        }
                        
                        chordDisplayArea.innerHTML = `Chord:&nbsp;${finalDisplayName}`;
                    }
                } else {
                    const displayChordName = this.currentKey ? 
                        primaryChord.fullName.replace(primaryChord.rootNote, PitchUtils.pitchClassToNote(this.noteToPitchClass(primaryChord.rootNote), PitchUtils.shouldUseFlats(this.noteToPitchClass(this.currentKey.rootNote), this.currentKey.name))) :
                        primaryChord.fullName;
                    
                    // Add Roman numeral if we have a current key
                    let romanNumeral = '';
                    if (this.currentKey) {
                        const rootPitchClass = this.noteToPitchClass(primaryChord.rootNote);
                        romanNumeral = PitchUtils.getRomanNumeralForChordInKey(rootPitchClass, primaryChord.chordType, {
                            rootPitchClass: this.noteToPitchClass(this.currentKey.rootNote),
                            name: this.currentKey.name
                        });
                    }
                    
                    // Format display based on chord display mode
                    let finalDisplayName;
                    switch (this.chordDisplayMode) {
                        case 'rn':
                            finalDisplayName = romanNumeral || displayChordName;
                            break;
                                                    case 'chord-rn':
                                finalDisplayName = romanNumeral ? `${displayChordName}&nbsp;<span style="color: #64748b;">(${romanNumeral})</span>` : displayChordName;
                            break;
                        case 'chord':
                        default:
                            finalDisplayName = displayChordName;
                            break;
                    }
                    
                    chordDisplayArea.innerHTML = `Chord:&nbsp;${finalDisplayName}`;
                }
                chordDisplayArea.style.background = 'linear-gradient(135deg, rgba(5, 150, 105, 0.2) 0%, rgba(4, 120, 87, 0.1) 100%)'; // Green gradient for detected chord
                chordDisplayArea.style.border = '1px solid rgba(5, 150, 105, 0.4)';
                chordDisplayArea.style.color = '#f8fafc';
            } else if (chordNotesArray.length > 0) {
                // Convert chord notes to preferred accidentals for display
                const displayChordNotes = this.currentKey ? 
                    chordNotesArray.map(note => {
                        const noteName = note.replace(/\d+/, ''); // Remove octave
                        const displayNote = PitchUtils.pitchClassToNote(this.noteToPitchClass(noteName), PitchUtils.shouldUseFlats(this.noteToPitchClass(this.currentKey.rootNote), this.currentKey.name));
                        return note.replace(noteName, displayNote); // Replace note name but keep octave
                    }) :
                    chordNotesArray;
                chordDisplayArea.textContent = `Chord: ${displayChordNotes.join(', ')}`;
                chordDisplayArea.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.1) 100%)'; // Amber gradient for undetected
                chordDisplayArea.style.border = '1px solid rgba(245, 158, 11, 0.4)';
                chordDisplayArea.style.color = '#f8fafc';
            } else {
                chordDisplayArea.textContent = 'Chord: None';
                chordDisplayArea.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)'; // Blue gradient for none
                chordDisplayArea.style.border = '1px solid rgba(59, 130, 246, 0.2)';
                chordDisplayArea.style.color = '#cbd5e1';
            }
        }
    }

    // Sequencer methods
    addCurrentChordToSequence() {
        const chordNotesArray = Array.from(this.chordNotes);
        if (chordNotesArray.length === 0) {
            this.showNotification('No chord currently selected', 'error');
            return;
        }
        
        // Extract pitch classes (remove octaves) for chord detection
        const pitchClasses = chordNotesArray.map(note => note.replace(/\d+$/, ''));
        
        // Get actual pitches for diminished chord priority
        const actualPitches = [];
        chordNotesArray.forEach(note => {
            const coords = this.actualClickedNotes.get(note);
            if (coords) {
                const pitch = this.getPitchAt(coords.x, coords.y);
                if (pitch && pitch.pitch !== undefined) {
                    actualPitches.push(pitch.pitch);
                }
            }
        });
        
        const detectedChords = this.detectChord(pitchClasses, actualPitches);
        let chordName;
        if (detectedChords && detectedChords.length > 0) {
            // Convert the detected chord name to use preferred accidentals
            const detectedChord = detectedChords[0];
            if (this.currentKey) {
                const useFlats = PitchUtils.shouldUseFlats(this.noteToPitchClass(this.currentKey.rootNote), this.currentKey.name);
                const rootNote = PitchUtils.pitchClassToNote(this.noteToPitchClass(detectedChord.rootNote), PitchUtils.shouldUseFlats(this.noteToPitchClass(this.currentKey.rootNote), this.currentKey.name));
                
                // For slash chords, preserve the full slash chord name
                if (detectedChord.isSlashChord) {
                    chordName = detectedChord.fullName;
                } else {
                    chordName = `${rootNote}${detectedChord.chordName}`;
                }
            } else {
                chordName = detectedChord.fullName;
            }
        } else {
            // For unknown chords, show the notes with "..." if too many
            const maxNotes = 4; // Show up to 4 notes before adding "..."
            if (chordNotesArray.length <= maxNotes) {
                // Convert notes to preferred accidentals for display
                const displayNotes = chordNotesArray.map(note => {
                    const noteName = note.replace(/\d+$/, '');
                    const octave = note.replace(/[A-G#b]+/, '');
                    if (this.currentKey) {
                        const displayNote = PitchUtils.pitchClassToNote(this.noteToPitchClass(noteName), PitchUtils.shouldUseFlats(this.noteToPitchClass(this.currentKey.rootNote), this.currentKey.name));
                        return displayNote + octave;
                    }
                    return note;
                });
                chordName = displayNotes.join(', ');
            } else {
                const displayNotes = chordNotesArray.slice(0, maxNotes).map(note => {
                    const noteName = note.replace(/\d+$/, '');
                    const octave = note.replace(/[A-G#b]+/, '');
                    if (this.currentKey) {
                        const displayNote = PitchUtils.pitchClassToNote(this.noteToPitchClass(noteName), PitchUtils.shouldUseFlats(this.noteToPitchClass(this.currentKey.rootNote), this.currentKey.name));
                        return displayNote + octave;
                    }
                    return note;
                });
                chordName = displayNotes.join(', ') + '...';
            }
        }
        
        // Store the exact pitches and coordinates that were clicked
        const pitches = [];
        const exactCoordinates = [];
        
        chordNotesArray.forEach(note => {
            // Get the exact coordinates for this note
            const coords = this.actualClickedNotes.get(note);
            if (coords) {
                const pitch = this.getPitchAt(coords.x, coords.y);
                if (pitch && pitch.pitch !== undefined) {
                    // Store the numeric pitch value
                    pitches.push(pitch.pitch);
                    exactCoordinates.push({ x: coords.x, y: coords.y });
                }
            }
        });
        
        const sequenceItem = {
            type: 'chord',
            chordName: chordName,
            pitches: pitches, // Numeric pitch values only
            exactCoordinates: exactCoordinates,
            timestamp: Date.now()
        };
        
        // Store additional chord information for all detected chords
        if (detectedChords && detectedChords.length > 0) {
            const detectedChord = detectedChords[0];
            sequenceItem.rootNote = detectedChord.rootNote;
            sequenceItem.chordType = detectedChord.chordType;
            
            if (detectedChord.isSlashChord) {
                sequenceItem.isSlashChord = true;
                sequenceItem.bassNote = detectedChord.bassNote;
            }
        }
        
        // Check if we should insert or append
        const currentIndex = this.sequencer.currentSequenceIndex;
        
        if (this.sequencer.getInsertMode() && currentIndex >= 0 && currentIndex < this.sequencer.getSequenceLength()) {
            // Insert at current position
            const newIndex = this.sequencer.insertItem(sequenceItem, currentIndex);
            // Move to the inserted item
            this.sequencer.setCurrentIndex(newIndex);
        } else {
            // Append to end
            const newIndex = this.sequencer.addItem(sequenceItem);
            // Move to the newly added item
            this.sequencer.setCurrentIndex(newIndex);
        }
        
        this.updateSequenceDisplay();
        // this.showNotification(`Added ${chordName} to sequence`, 'success');
    }
    
    addCurrentKeyToSequence() {
        console.log('=== ADDING KEY TO SEQUENCE ===');
        
        // Try to get key info from current context first
        let rootNote, keyType;
        
        if (this.currentKey && this.currentKey.rootNote && this.currentKey.name) {
            // Use current key context
            rootNote = this.currentKey.rootNote;
            keyType = this.currentKey.name;
            console.log('Using current key context:', { rootNote, keyType });
        } else {
            // Fall back to key indicator (key selectors)
            const keyRootSelect = document.getElementById('keyRootSelect');
            const keyTypeSelect = document.getElementById('keyTypeSelect');
            
            if (!keyRootSelect || !keyTypeSelect) {
                this.showNotification('No key indicator found', 'error');
                return;
            }
            
            rootNote = keyRootSelect.value.split('/')[0]; // Get base note from enharmonic
            keyType = keyTypeSelect.value;
            console.log('Using key indicator:', { rootNote, keyType });
        }
        
        if (!rootNote || !keyType) {
            this.showNotification('No key currently selected', 'error');
            return;
        }
        
        const sequenceItem = {
            type: 'key',
            rootNote: rootNote,
            keyType: keyType
        };
        
        console.log('Created sequence item:', sequenceItem);
        
        // Check if we should insert or append
        const currentIndex = this.sequencer.currentSequenceIndex;
        
        if (this.sequencer.getInsertMode() && currentIndex >= 0 && currentIndex < this.sequencer.getSequenceLength()) {
            // Insert at current position
            const newIndex = this.sequencer.insertItem(sequenceItem, currentIndex);
            // Move to the inserted item
            this.sequencer.setCurrentIndex(newIndex);
        } else {
            // Append to end
            const newIndex = this.sequencer.addItem(sequenceItem);
            // Move to the newly added item
            this.sequencer.setCurrentIndex(newIndex);
        }
        
        this.updateSequenceDisplay();
        // this.showNotification(`Added ${keyName} to sequence`, 'success');
        console.log('=== END ADDING KEY TO SEQUENCE ===');
    }

    addRestToSequence() {
        console.log('=== ADDING REST TO SEQUENCE ===');
        
        const sequenceItem = {
            type: 'rest',
            timestamp: Date.now()
        };
        
        console.log('Created rest sequence item:', sequenceItem);
        
        // Check if we should insert or append
        const currentIndex = this.sequencer.currentSequenceIndex;
        
        if (this.sequencer.getInsertMode() && currentIndex >= 0 && currentIndex < this.sequencer.getSequenceLength()) {
            // Insert at current position
            const newIndex = this.sequencer.insertItem(sequenceItem, currentIndex);
            // Move to the inserted item
            this.sequencer.setCurrentIndex(newIndex);
        } else {
            // Append to end
            const newIndex = this.sequencer.addItem(sequenceItem);
            // Move to the newly added item
            this.sequencer.setCurrentIndex(newIndex);
        }
        
        this.updateSequenceDisplay();
        this.showNotification('Added rest to sequence', 'success');
        console.log('=== END ADDING REST TO SEQUENCE ===');
    }

    saveSequence() {

        
        // Check if there's a stored song name to use as default
        const defaultName = this.currentSongName || '';
        
        // Create a non-blocking modal dialog instead of using prompt()
        this.showSaveSequenceModal(defaultName);
    }
    
    showSaveSequenceModal(defaultName = '') {
        // Create modal elements
        const modal = document.createElement('div');
        modal.className = 'modal';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        
        const modalHeader = document.createElement('div');
        modalHeader.className = 'modal-header';
        
        const title = document.createElement('h3');
        title.textContent = 'Save Sequence';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.innerHTML = '&times;';
        
        const modalBody = document.createElement('div');
        modalBody.className = 'modal-body';
        
        const label = document.createElement('label');
        label.textContent = 'Enter a name for this sequence:';
        label.style.cssText = `
            display: block;
            color: #cbd5e1;
            margin-bottom: 12px;
            font-size: 14px;
            font-weight: 500;
        `;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultName;
        input.style.cssText = `
            width: 100%;
            padding: 12px 16px;
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 8px;
            margin-bottom: 24px;
            box-sizing: border-box;
            background: linear-gradient(135deg, #334155 0%, #1e293b 100%);
            color: #f8fafc;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
        `;
        
        const modalActions = document.createElement('div');
        modalActions.className = 'modal-actions';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'btn btn-secondary';
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.className = 'btn btn-primary';
        
        // Add event listeners
        const handleSave = async () => {
            const sequenceName = input.value.trim();
            if (!sequenceName) {
                alert('Please enter a sequence name');
                return;
            }
            

            
            // Use sequencer to save the sequence
            const result = await this.sequencer.saveSequence(sequenceName, this.currentKey);
            
            if (result.success) {
    
                this.showNotification(result.message, 'success');
                
                // Check audio context state after save

                
                // Ensure audio is still ready after save
                this.ensureAudioReady();
                
                // Force resume audio context if it got suspended during save

                if (Tone.context.state === 'suspended') {

                    Tone.context.resume().then(() => {

                        // Also ensure the audio manager is ready
                        if (this.audioManager) {
                            this.audioManager.ensureAudioReady();
                        }
                    }).catch(error => {
                        console.error('🎵 [SAVE] Failed to resume audio context:', error);
                    });
                } else {

                }
                
            } else {

                this.showNotification(result.message, 'error');
            }
            
            // Close modal
            document.body.removeChild(modal);
        };
        
        const handleCancel = () => {

            document.body.removeChild(modal);
        };
        
        const handleClose = () => {
            handleCancel();
        };
        
        const handleKeyPress = (e) => {
            if (e.key === 'Enter') {
                handleSave();
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        };
        
        // Add hover effects for input
        input.addEventListener('focus', () => {
            input.style.borderColor = '#3b82f6';
            input.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
        });
        
        input.addEventListener('blur', () => {
            input.style.borderColor = 'rgba(59, 130, 246, 0.3)';
            input.style.boxShadow = 'none';
        });
        
        cancelBtn.addEventListener('click', handleCancel);
        saveBtn.addEventListener('click', handleSave);
        closeBtn.addEventListener('click', handleClose);
        input.addEventListener('keypress', handleKeyPress);
        
        // Focus input and select text
        input.focus();
        input.select();
        
        // Assemble modal
        modalHeader.appendChild(title);
        modalHeader.appendChild(closeBtn);
        modalBody.appendChild(label);
        modalBody.appendChild(input);
        modalActions.appendChild(cancelBtn);
        modalActions.appendChild(saveBtn);
        modalBody.appendChild(modalActions);
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(modalBody);
        modal.appendChild(modalContent);
        
        // Add to page
        document.body.appendChild(modal);
    }

    ensureAudioReady() {
        // Ensure AudioManager is initialized
        if (this.audioManager && !this.audioManager.audioReady) {
            this.audioManager.initAudio();
        }
        
        // Check and resume Tone.js audio context if suspended
        if (Tone.context.state === 'suspended') {
            Tone.context.resume();
        }
        
        // If we have pianos loaded, mark audio as ready
        if (this.piano && this.melodyPiano && !this.audioReady) {
            this.audioReady = true;
        }
        
        // Ensure audio context is ready and resumed
        if (!this.audioContext) {
            this.initAudio();
        } else if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        // Don't re-initialize if we already have working pianos
        if (this.piano && this.melodyPiano && this.audioReady) {
            return;
        }
        
        // Reinitialize MIDI if needed
        if (!this.midiOutput) {
            this.initMIDI();
        }
    }

    async loadSavedSequence() {
        try {
            // Get sequences from cloud only
            const savedSequences = await this.sequencer.getSavedSequences();
            const sequenceNames = Object.keys(savedSequences);

            if (sequenceNames.length === 0) {
                this.showNotification('No saved sequences found. You must be logged in to save and load sequences.', 'info');
                return;
            }

            // Show the sequence selection modal
            this.showSequenceSelectionModal(savedSequences);
        } catch (error) {
            console.error('Error loading saved sequences:', error);
            this.showNotification('Failed to load saved sequences. Please check your connection and try again.', 'error');
        }
    }

    showSequenceSelectionModal(savedSequences) {
        const sequenceModal = document.getElementById('sequence-modal');
        const sequenceList = document.getElementById('sequence-list');
        const closeSequenceModal = document.getElementById('close-sequence-modal');
        const cancelSequenceSelection = document.getElementById('cancel-sequence-selection');

        if (!sequenceModal || !sequenceList) {
            console.error('Sequence modal elements not found');
            return;
        }

        // Clear existing content
        sequenceList.innerHTML = '';

        // Create sequence buttons
        Object.entries(savedSequences).forEach(([name, seq]) => {
            const date = new Date(seq.timestamp).toLocaleDateString();
            const time = new Date(seq.timestamp).toLocaleTimeString();
            
            const sequenceBtn = document.createElement('button');
            sequenceBtn.className = 'sequence-item-btn';
            sequenceBtn.innerHTML = `
                <div class="sequence-item-info">
                    <div class="sequence-item-name">
                        ${name}
                        <span class="cloud-indicator">☁️</span>
                    </div>
                    <div class="sequence-item-details">${seq.itemCount} items • ${date} ${time}</div>
                </div>
                <button class="btn-delete" data-sequence-name="${name}">Delete</button>
            `;

            // Add click handler for loading
            sequenceBtn.addEventListener('click', async (e) => {
                // Don't trigger if clicking the delete button
                if (e.target.classList.contains('btn-delete')) {
                    return;
                }
                await this.loadSelectedSequence(name, savedSequences[name]);
                this.closeSequenceModal();
            });

            // Add delete button handler
            const deleteBtn = sequenceBtn.querySelector('.btn-delete');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent triggering the load
                
                // Delete from cloud using the sequencer method
                const updatedSequences = await this.deleteSavedSequence(name);
                if (updatedSequences) {
                    // User confirmed deletion, now animate the item away
                    sequenceBtn.classList.add('deleting');
                    
                    // Wait for animation to complete, then refresh the modal
                    setTimeout(() => {
                        this.showSequenceSelectionModal(updatedSequences);
                    }, 300); // Match the animation duration
                }
            });

            sequenceList.appendChild(sequenceBtn);
        });

        // Show the modal
        sequenceModal.style.display = 'flex';

        // Close modal functions
        const closeModal = () => {
            this.closeSequenceModal();
        };

        if (closeSequenceModal) {
            closeSequenceModal.addEventListener('click', closeModal);
        }

        if (cancelSequenceSelection) {
            cancelSequenceSelection.addEventListener('click', closeModal);
        }

        // Close modal when clicking outside
        sequenceModal.addEventListener('click', (event) => {
            if (event.target === sequenceModal) {
                closeModal();
            }
        });
    }

    closeSequenceModal() {
        const sequenceModal = document.getElementById('sequence-modal');
        if (sequenceModal) {
            sequenceModal.style.display = 'none';
        }
    }

    async deleteSavedSequence(sequenceName) {
        if (confirm(`Are you sure you want to delete "${sequenceName}"?`)) {
            try {
                const result = await this.sequencer.deleteSavedSequence(sequenceName);
                if (result.success) {
                    this.showNotification(result.message, 'success');
                    return result.savedSequences;
                } else {
                    this.showNotification(result.message, 'error');
                    return null;
                }
            } catch (error) {
                console.error('Error deleting sequence:', error);
                this.showNotification('Failed to delete sequence. Please try again.', 'error');
                return null;
            }
        }
        return null; // Return null if user cancels
    }

    async loadSelectedSequence(selectedName, sequenceData) {
        // Stop any current playback to prevent audio conflicts
        this.stopPlaying();
        this.stopScalePlayback();

        try {
            // Use sequencer to load the sequence
            const result = await this.sequencer.loadSequence(selectedName);
            
            if (result.success) {
                // Update the current song name for future saves
                this.currentSongName = selectedName;
                
                // Update display and button text
                this.updateSequenceDisplay();
                this.updateAddButtonsText();
                
                // Ensure audio is ready
                this.ensureAudioReady();
                
                this.showNotification(result.message, 'success');
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Error loading sequence:', error);
            this.showNotification('Failed to load sequence. Please try again.', 'error');
        }
    }
    
    playNextChord() {
        this.sequencer.playNext();
    }
    
    playPrevChord() {
        this.sequencer.playPrev();
    }
    
    playSequenceItem(index) {
        this.sequencer.playSequenceItem(index);
    }
    
    deleteSequenceItem(index) {
        this.sequencer.deleteSequenceItem(index);
        this.updateSequenceDisplay();
        this.updateAddButtonsText();
    }
    

    
    clearSequence() {
        // Clear sequence in the sequencer (single source of truth)
        this.sequencer.clearSequence();
        
        // Clear the stored song name
        this.currentSongName = null;
        this.updateSequenceDisplay();
        // Update button text after clearing
        this.updateAddButtonsText();
        // // // this.showNotification('Sequence cleared', 'info');
    }
    

    
    parseAndLoadSequence(sequenceText) {
        console.log('parseAndLoadSequence called with:', sequenceText);
        
        // Stop any current playback to prevent audio conflicts
        this.stopPlaying();
        this.stopScalePlayback();
        
        // Use sequencer to handle all parsing and loading
        const result = this.sequencer.parseAndLoadSequence(sequenceText, this.currentKey);
        
        if (result.success) {
            // Update display and button text
            this.updateSequenceDisplay();
            this.updateAddButtonsText();
            
            // Ensure audio is ready
            this.ensureAudioReady();
            
            if (result.errorCount > 0) {
                this.showNotification(`Loaded ${result.successCount} items, ${result.errorCount} errors`, 'warning');
            } else {
                this.showNotification(`Successfully loaded ${result.successCount} items`, 'success');
            }
        } else {
            this.showNotification(result.message, 'error');
        }
    }
    
    // Note: Parsing methods have been moved to Sequencer class
    

            // Use this.sequencer.parseChordText(), this.sequencer.parseKeyText(), etc.
    
    generateChordNotes(rootNote, chordType, bassNote = null) {
        const rootPitchClass = this.noteToPitchClass(rootNote);
        return PitchUtils.generateChordNotes(rootPitchClass, chordType, bassNote, this.chordTypes);
    }

    // Convert note strings to pitch numbers
    convertNotesToPitchNumbers(noteStrings) {
        return noteStrings.map(noteString => {
            // Parse note string like "C3" into note and octave
            const match = noteString.match(/^([A-G][#♯b♭]?)(\d+)$/);
            if (match) {
                const note = match[1];
                const octave = parseInt(match[2]);
                const pitchClass = this.noteToPitchClass(note);
                return (octave + 1) * 12 + pitchClass; // Convert to pitch number
            }
            return null;
        }).filter(pitch => pitch !== null);
    }
    
    // Helper method to find coordinates for a note in a specific octave (optimized)
    getCoordinatesForNoteInOctave(note, targetOctave = 3) {
        const dims = this.getGridDimensions();
        return PitchUtils.getCoordinatesForNoteInOctave(
            note, 
            targetOctave, 
            PitchUtils.getOriginPitch(), 
            dims.width, 
            dims.height
        );
    }
    
    // Helper method to stack chord notes like the createChord method
    stackChordNotes(notes, isSlashChord = false, bassNote = null) {
        const dims = this.getGridDimensions();
        return PitchUtils.stackChordNotes(
            notes, 
            isSlashChord, 
            bassNote, 
            this.getCoordinatesForNote.bind(this), 
            this.getPitchAt.bind(this), 
            PitchUtils.getOriginPitch(), 
            dims.width, 
            dims.height
        );
    }
    

    

    

    

    
    generateKeyNotes(rootNote, keyType) {
        const rootPitchClass = this.noteToPitchClass(rootNote);
        return PitchUtils.generateKeyNotes(rootPitchClass, keyType, this.keys);
    }

    // Generate default pitches for a chord using the same logic as diatonic chord buttons
    generateDefaultChordPitches(rootNote, chordType) {
        // Get the base note index for internal processing
        const baseNoteIndex = this.noteToPitchClass(rootNote);
        
        if (baseNoteIndex === -1) {
            console.error(`Invalid root note: ${rootNote}`);
            return [];
        }
        
        const chordTypeData = this.chordTypes[chordType];
        if (!chordTypeData) {
            console.error(`Invalid chord type: ${chordType}`);
            return [];
        }
        
        // Calculate the proper pitches from intervals (same as createChordWithSpecificRoot)
        const chordPitches = chordTypeData.intervals.map(interval => {
            const noteIndex = (baseNoteIndex + interval) % 12;
            const note = this.pitchClassToNote(noteIndex, false); // Use sharps for internal processing
            return {
                note: note,
                noteIndex: noteIndex,
                interval: interval
            };
        });
        
        // Use octave 3 as the default root octave (same as diatonic buttons)
        const rootPitch = 60 + baseNoteIndex; // Middle C (60) + semitones from C
        
        // Calculate all chord pitches in absolute terms
        const chordPitchesArray = chordPitches.map(pitchInfo => {
            // For the root, use the calculated root pitch
            if (pitchInfo.interval === 0) {
                return rootPitch;
            }
            // For other notes, calculate relative to the root pitch
            return rootPitch + pitchInfo.interval;
        });
        
        return chordPitchesArray;
    }

    // Generate default grid coordinates for a chord using the same logic as diatonic chord buttons
        generateDefaultChordCoordinates(rootNote, chordType) {
        // Get the base note index for internal processing
        const baseNoteIndex = this.noteToPitchClass(rootNote);

        if (baseNoteIndex === -1) {
            console.error(`Invalid root note: ${rootNote}`);
            return [];
        }

        const chordTypeData = this.chordTypes[chordType];
        if (!chordTypeData) {
            console.error(`Invalid chord type: ${chordType}`);
            return [];
        }

        // Get current key context (same as chromatic chord buttons)
        let rootIndex, keyRootNote, keyType, useFlats;
        
        if (this.currentKey) {
            rootIndex = this.currentKey.rootIndex;
            keyRootNote = this.currentKey.rootNote;
            keyType = this.currentKey.name;
            useFlats = this.currentKey.useFlats;
            
            if (rootIndex === undefined && keyRootNote) {
                rootIndex = this.noteToPitchClass(keyRootNote);
            }
        } else {
            const keyRootSelect = document.getElementById('keyRootSelect');
            const keyTypeSelect = document.getElementById('keyTypeSelect');
            
            if (!keyRootSelect || !keyTypeSelect) {
                console.error('No key context available');
                return [];
            }
            
            const rawRootNote = keyRootSelect.value.split('/')[0];
            keyType = keyTypeSelect.value;
            rootIndex = this.noteToPitchClass(rawRootNote);
            useFlats = PitchUtils.shouldUseFlats(this.noteToPitchClass(rawRootNote), keyType);
            keyRootNote = this.pitchClassToNote(rootIndex, useFlats);
        }
        
        // Get key data and calculate key notes (same as chromatic chord buttons)
        const keyData = this.keys[keyType];
        if (!keyData) {
            console.error(`Invalid key type: ${keyType}`);
            return [];
        }
        
        const keyNotes = keyData.intervals.map(interval => {
            const noteIndex = (rootIndex + interval) % 12;
            return this.pitchClassToNote(noteIndex, useFlats);
        });
        
        // Use octave 3 as the default (same as chromatic chord buttons)
        const octave = 3;
        
        // Use the same root placement logic as the chord grid buttons
        // Calculate the chromatic offset from the tonic (0-11 semitones)
        const noteIndex = this.noteToPitchClass(rootNote);
        const tonicIndex = this.noteToPitchClass(keyNotes[0]);
        const chromaticOffset = (noteIndex - tonicIndex + 12) % 12;
        
        // Use the pitch-utils chromatic placement rules directly
        const dims = this.getGridDimensions();
        const originPitch = PitchUtils.getOriginPitch();
        
        try {
            // Get the tonic coordinates for this octave
            const tonicCoords = PitchUtils.calculateTonicCoordinates(keyNotes[0], keyType, dims.width, dims.height, originPitch);
            let baseCoord;
            if (octave === 3) baseCoord = tonicCoords.octave3;
            else if (octave === 4) baseCoord = tonicCoords.octave4;
            else baseCoord = tonicCoords.octave5;
            
            // Calculate the position using the same logic as the chord grid button click handler
            const calculatedCoord = PitchUtils.calculateChromaticPosition(baseCoord, chromaticOffset, dims.width, dims.height);
            
            // Use the same logic as createChordWithSpecificRoot but with the calculated position
            const chordPitches = chordTypeData.intervals.map(interval => {
                const noteIndex = (baseNoteIndex + interval) % 12;
                const note = this.pitchClassToNote(noteIndex, false); // Use sharps for internal processing
                return {
                    note: note,
                    noteIndex: noteIndex,
                    interval: interval
                };
            });
            
            // Get the root pitch from the calculated coordinate
            const rootPitchInfo = this.getPitchAt(calculatedCoord.x, calculatedCoord.y);
            const rootPitch = rootPitchInfo.pitch;
            
            // Calculate all chord pitches in absolute terms
            const chordPitchesArray = chordPitches.map(pitchInfo => {
                // For the root, use the pitch from the calculated coordinate
                if (pitchInfo.interval === 0) {
                    return rootPitch;
                }
                // For other notes, calculate relative to the root pitch
                return rootPitch + pitchInfo.interval;
            });
            
            // Use Manhattan selection with the calculated root coordinate as preferred
            const rootClones = PitchUtils.getAllCloneCoordsForPitch(rootPitch, PitchUtils.getOriginPitch(), 8, 8);
            const calculatedRootCloneIndex = rootClones.findIndex(clone => 
                clone.x === calculatedCoord.x && clone.y === calculatedCoord.y
            );
            
            const preferredCloneIndices = calculatedRootCloneIndex >= 0 ? [calculatedRootCloneIndex] : null;
            const manhattanClones = PitchUtils.selectChordClonesManhattan(
                chordPitchesArray, 
                PitchUtils.getOriginPitch(), 
                8, 8,
                preferredCloneIndices
            );
            
            return manhattanClones.map(clone => ({
                x: clone.coord.x,
                y: clone.coord.y,
                pitch: clone.pitch
            }));
            
        } catch (error) {
            console.error('Error calculating chromatic position:', error.message);
            return [];
        }
    }
    
    updateSequenceDisplay() {
        const sequence = this.sequencer.getSequence();
        const currentIndex = this.sequencer.currentSequenceIndex;
        

        
        const sequenceDisplay = document.getElementById('sequenceDisplay');
        if (!sequenceDisplay) {

            return;
        }
        
        // Update button text based on current position
        this.updateAddButtonsText();
        
        if (sequence.length === 0) {

            sequenceDisplay.innerHTML = '<div class="sequence-info">No items in sequence</div>';
            return;
        }
        
        const sequenceList = sequence.map((item, index) => {
            const isCurrent = index === currentIndex;
            const itemType = item.type === 'chord' ? 'chord' : item.type === 'key' ? 'key' : 'rest';
            const className = isCurrent ? `sequence-item current ${itemType}-current` : `sequence-item ${itemType}`;
            const itemName = this.getSequenceItemName(item, sequence, index);
            
            // Set icon and class based on item type
            let itemTypeIcon, iconClass;
            if (item.type === 'chord') {
                itemTypeIcon = '♬';
                iconClass = 'sequence-icon';
            } else if (item.type === 'key') {
                itemTypeIcon = '𝄞';
                iconClass = 'sequence-icon g-clef';
            } else if (item.type === 'rest') {
                itemTypeIcon = '–'; // Em dash for rest
                iconClass = 'sequence-icon rest-icon';
            }
            
            console.log(`🎵 [DISPLAY] Item ${index}: type=${item.type}, name=${itemName}, isCurrent=${isCurrent}, className=${className}`);
            
            return `<div class="${className}" data-index="${index}" style="cursor: pointer;">
                <span class="sequence-number">${index + 1}.</span>
                <span class="${iconClass}">${itemTypeIcon}</span>
                <span class="sequence-name">${itemName}</span>
                <button class="sequence-delete-btn" data-index="${index}" title="Delete this item">×</button>
            </div>`;
        }).join('');
        
        const chordCount = sequence.filter(item => item.type === 'chord').length;
        const keyCount = sequence.filter(item => item.type === 'key').length;
        const restCount = sequence.filter(item => item.type === 'rest').length;
        const totalItems = sequence.length;
        
        // Check if we have a song name from memory
        const songName = this.currentSongName;
        console.log('🎵 [DISPLAY] Found song name in memory:', songName);
        
        // Helper function to pluralize correctly
        const pluralize = (count, singular, plural) => count === 1 ? singular : plural;
        
        let infoText;
        if (songName && songName !== 'Song') {
            infoText = `${songName} Sequence (${totalItems} ${pluralize(totalItems, 'item', 'items')}`;
            const parts = [];
            if (chordCount > 0) parts.push(`${chordCount} ${pluralize(chordCount, 'chord', 'chords')}`);
            if (keyCount > 0) parts.push(`${keyCount} ${pluralize(keyCount, 'key', 'keys')}`);
            if (restCount > 0) parts.push(`${restCount} ${pluralize(restCount, 'rest', 'rests')}`);
            if (parts.length > 0) {
                infoText += `: ${parts.join(', ')}`;
            }
            infoText += ')';
        } else {
            infoText = `Sequence (${totalItems} ${pluralize(totalItems, 'item', 'items')}`;
            const parts = [];
            if (chordCount > 0) parts.push(`${chordCount} ${pluralize(chordCount, 'chord', 'chords')}`);
            if (restCount > 0) parts.push(`${restCount} ${pluralize(restCount, 'rest', 'rests')}`);
            if (keyCount > 0) parts.push(`${keyCount} ${pluralize(keyCount, 'key change', 'key changes')}`);
            if (parts.length > 0) {
                infoText += `: ${parts.join(', ')}`;
            }
            infoText += ')';
        }
        
        console.log('🎵 [DISPLAY] Setting innerHTML with:', infoText);
        console.log('🎵 [DISPLAY] sequenceList length:', sequenceList.length);
        
        sequenceDisplay.innerHTML = `
            <div class="sequence-info">${infoText}</div>
            <div class="sequence-list">${sequenceList}</div>
        `;
        
        console.log('🎵 [DISPLAY] updateSequenceDisplay complete');
    }

    updateAddButtonsText() {
        const sequence = this.sequencer.getSequence();
        const currentIndex = this.sequencer.currentSequenceIndex;
        
        // Determine if we should show "Insert" or "Add" based on current position
        const shouldShowInsert = currentIndex >= 0 && 
                                currentIndex < sequence.length - 1;
        
        console.log('🎵 [BUTTONS] updateAddButtonsText called');
        console.log('🎵 [BUTTONS] currentIndex:', currentIndex);
        console.log('🎵 [BUTTONS] sequence.length:', sequence.length);
        console.log('🎵 [BUTTONS] shouldShowInsert:', shouldShowInsert);
        
        // Keep button text consistent - no visual changes for insert mode
        const addChordBtn = document.getElementById('addToSequence');
        if (addChordBtn) {
            // Always show "Add Chord" regardless of insert mode
            addChordBtn.textContent = 'Add Chord';
            console.log('🎵 [BUTTONS] Chord button text: Add Chord');
        } else {
            console.log('🎵 [BUTTONS] addToSequence button not found');
        }
        
        // Keep button text consistent - no visual changes for insert mode
        const addKeyBtn = document.getElementById('addKeyToSequence');
        if (addKeyBtn) {
            // Always show "Add Key" regardless of insert mode
            addKeyBtn.textContent = 'Add Key';
            console.log('🎵 [BUTTONS] Key button text: Add Key');
        } else {
            console.log('🎵 [BUTTONS] addKeyToSequence button not found');
        }

        // Keep button text consistent - no visual changes for insert mode
        const addRestBtn = document.getElementById('addRestToSequence');
        if (addRestBtn) {
            // Always show "Add Rest" regardless of insert mode
            addRestBtn.textContent = 'Add Rest';
            console.log('🎵 [BUTTONS] Rest button text: Add Rest');
        } else {
            console.log('🎵 [BUTTONS] addRestToSequence button not found');
        }
        
        // Update insert mode
        this.sequencer.setInsertMode(shouldShowInsert);
        console.log('🎵 [BUTTONS] insertMode set to:', shouldShowInsert);
        
        // Update play/pause button text
        this.updatePlayPauseButton();
    }

    updatePlayPauseButton() {
        const playPauseBtn = document.getElementById('playPause');
        if (playPauseBtn) {
            const sequencerState = this.sequencer.getState();
            if (sequencerState.isPlaying) {
                playPauseBtn.textContent = '⏸ Pause';
                // Add playing class for American flag red styling
                playPauseBtn.classList.add('playing');
            } else {
                playPauseBtn.textContent = '⏯ Play / Pause';
                // Remove playing class to reset styling
                playPauseBtn.classList.remove('playing');
            }
        }
    }



    // Convert speed value to interval milliseconds
    speedToInterval(speedValue) {
        // Convert speed to interval: higher speed = shorter interval
        // Speed 0.75 (slowest) = 4.0s interval, Speed 4.0 (fastest) = 0.75s interval
        const intervalValue = 4.75 - speedValue; // Inverse relationship
        return intervalValue * 1000; // Convert to milliseconds
    }

    adjustSpeed(delta) {
        const sequencerIntervalSlider = document.getElementById('sequencerInterval');
        if (!sequencerIntervalSlider) {
            console.log('🎵 [SPEED] Speed slider not found');
            return;
        }

        // Get current speed value
        const currentSpeed = parseFloat(sequencerIntervalSlider.value);
        
        // Calculate new speed with bounds checking (updated for new range)
        const newSpeed = Math.max(0.75, Math.min(4.0, currentSpeed + delta));
        
        // Update slider value
        sequencerIntervalSlider.value = newSpeed;
        
        // Convert speed to interval and update sequencer directly
        const intervalMs = this.speedToInterval(newSpeed);
        this.sequencer.sequencerInterval = intervalMs;
        
        console.log(`🎵 [SPEED] Speed adjusted: ${currentSpeed.toFixed(1)} → ${newSpeed.toFixed(1)} (interval: ${intervalMs}ms)`);
    }

    // Utility method to find leftmost chord button's root and place it at lowest X, middle Y in octave 3
    findLeftmostChordRootAndPlace() {
        // Use the same logic as generateChordButtons() to determine the leftmost chord button
        let rootNote, keyType;
        
        if (this.currentKey) {
            rootNote = this.currentKey.rootNote;
            keyType = this.currentKey.name;
        } else {
            // Fall back to DOM selectors
            const keyRootSelect = document.getElementById('keyRootSelect');
            const keyTypeSelect = document.getElementById('keyTypeSelect');
            
            if (!keyRootSelect || !keyTypeSelect) {
                console.log('No key selectors found, defaulting to C Major');
                rootNote = 'C';
                keyType = 'Major';
            } else {
                rootNote = keyRootSelect.value.split('/')[0];
                keyType = keyTypeSelect.value;
            }
        }
        
        console.log(`Current key: ${rootNote} ${keyType}`);
        
        // Get key data
        const keyData = this.keys[keyType];
        if (!keyData) {
            console.log(`No key data found for ${keyType}`);
            return null;
        }
        
        // Calculate key notes (same as generateChordButtons)
        const baseNoteIndex = this.noteToPitchClass(rootNote);
        const keyNotes = keyData.intervals.map(interval => {
            const noteIndex = (baseNoteIndex + interval) % 12;
            return this.pitchClassToNote(noteIndex, PitchUtils.shouldUseFlats(this.noteToPitchClass(rootNote), keyType));
        });
        
        // Get diatonic chord types (same as generateChordButtons)
        const diatonicTriads = PitchUtils.getDiatonicTriads(keyType);
        const diatonicTetrads = PitchUtils.getDiatonicTetrads(keyType);
        
        // The leftmost button (index 0) is always the tonic note in octave 3
        const leftmostNote = keyNotes[0]; // First key note (tonic)
        const leftmostTriadType = diatonicTriads[0]; // First triad type
        const leftmostTetradType = diatonicTetrads[0]; // First tetrad type
        
        console.log(`Leftmost chord button info:`);
        console.log(`- Note: ${leftmostNote}3`);
        console.log(`- Triad type: ${leftmostTriadType}`);
        console.log(`- Tetrad type: ${leftmostTetradType}`);
        
        // Use the new pitch-utils method to calculate tonic coordinates
        const dims = this.getGridDimensions();
        const originPitch = PitchUtils.getOriginPitch();
        
        try {
            const tonicCoords = PitchUtils.calculateTonicCoordinates(leftmostNote, keyType, dims.width, dims.height, originPitch);
            
            const octave3Coord = tonicCoords.octave3;
            const octave4Coord = tonicCoords.octave4;
            const octave5Coord = tonicCoords.octave5;
            
            console.log(`Octave positions for ${leftmostNote} (tonic):`);
            console.log(`- Octave 3: (${octave3Coord.x}, ${octave3Coord.y})`);
            console.log(`- Octave 4: (${octave4Coord.x}, ${octave4Coord.y})`);
            console.log(`- Octave 5: (${octave5Coord.x}, ${octave5Coord.y})`);
            
        } catch (error) {
            console.log(`Error calculating tonic coordinates: ${error.message}`);
            return null;
        }
        
        // Now calculate all chord button positions using the new pitch-utils method
        const allChordPositions = PitchUtils.calculateAllChordButtonPositions(octave3Coord, keyNotes, diatonicTetrads, dims.width, dims.height, originPitch);
        
        console.log('All chord button positions:', allChordPositions);
        
        // Visualize the calculated positions on the grid
        this.visualizeCalculatedPositions(allChordPositions);
        
        // Store the calculated positions for use by chord buttons
        this.calculatedChordPositions = allChordPositions;
        
        // Create the tetrad chord (more complete than triad) with the octave 3 root position
        console.log(`Creating ${leftmostNote}${leftmostTetradType} chord at octave 3 position`);
        this.createChordWithSpecificRoot(leftmostNote, leftmostTetradType, octave3Coord);
        
        return {
            note: leftmostNote,
            chordType: leftmostTetradType,
            octave3: octave3Coord,
            octave4: octave4Coord,
            octave5: octave5Coord,
            allPositions: allChordPositions
        };
    }
    
    // Calculate all chord button positions using chromatic placement rules

    
    // Find the nearest coordinate for a note that follows the zig-zag rule (legacy method - kept for compatibility)
    findNearestNoteWithZigZagRule(currentCoord, targetNote, degree) {
        // Get all available coordinates for the target note
        const availableCoords = this.getCoordinatesForNote(targetNote);
        
        if (availableCoords.length === 0) {
            return null;
        }
        
        // Debug logging for Db to E transition (degree 6 to 7)
        if (currentCoord && targetNote === 'E' && degree === 7) {
            console.log('🎵 [DEBUG] Available coordinates for E:', availableCoords);
            console.log('🎵 [DEBUG] Current coordinate (Db):', currentCoord);
        }
        
        // Determine the zig-zag rule for this degree
        let shouldIncreaseX, shouldIncreaseY;
        
        if (degree === 1) { // 1→2: increase X, decrease Y
            shouldIncreaseX = true;
            shouldIncreaseY = false;
        } else if (degree === 2) { // 2→3: decrease X, increase Y
            shouldIncreaseX = false;
            shouldIncreaseY = true;
        } else if (degree === 3) { // 3→4: increase X, decrease Y
            shouldIncreaseX = true;
            shouldIncreaseY = false;
        } else if (degree === 4) { // 4→5: decrease X, increase Y
            shouldIncreaseX = false;
            shouldIncreaseY = true;
        } else if (degree === 5) { // 5→6: increase X, decrease Y
            shouldIncreaseX = true;
            shouldIncreaseY = false;
        } else if (degree === 6) { // 6→7: decrease X, increase Y
            shouldIncreaseX = false;
            shouldIncreaseY = true;
        }
        
        // Filter coordinates that follow the zig-zag rule
        const validCoords = availableCoords.filter(coord => {
            // For odd degrees (1-indexed), allow X to be equal (<= or >=)
            // For even degrees, use strict inequality (< or >)
            let followsXRule;
            if (degree % 2 === 1) { // Odd degree (1, 3, 5, 7)
                followsXRule = shouldIncreaseX ? coord.x >= currentCoord.x : coord.x <= currentCoord.x;
            } else { // Even degree (2, 4, 6)
                followsXRule = shouldIncreaseX ? coord.x > currentCoord.x : coord.x < currentCoord.x;
            }
            
            const followsYRule = shouldIncreaseY ? coord.y > currentCoord.y : coord.y < currentCoord.y;
            

            
            return followsXRule && followsYRule;
        });
        
        if (validCoords.length === 0) {
            // Fallback: return the closest coordinate regardless of rule
            const fallbackCoord = this.findClosestCoordinate(currentCoord, availableCoords);
            

            
            return fallbackCoord;
        }
        
        // Find the nearest coordinate among valid ones
        const selectedCoord = this.findClosestCoordinate(currentCoord, validCoords);
        

        
        return selectedCoord;
    }
    
    // Find the closest coordinate to a reference point
    findClosestCoordinate(referenceCoord, coords) {
        let closest = coords[0];
        let minDistance = Infinity;
        
        for (const coord of coords) {
            const distance = Math.sqrt((coord.x - referenceCoord.x) ** 2 + (coord.y - referenceCoord.y) ** 2);
            if (distance < minDistance) {
                minDistance = distance;
                closest = coord;
            }
        }
        
        return closest;
    }
    
    // Visualize the calculated chord button positions on the grid
    visualizeCalculatedPositions(allPositions) {
        // Clear the grid first
        this.fillGrid(false);
        
        // Set key notes (background)
        this.keyNotes.forEach(note => {
            const coords = this.getCoordinatesForNote(note);
            if (coords && coords.length > 0) {
                this.setGridValue(coords[0].x, coords[0].y, true);
            }
        });
        
        // Visualize all calculated positions as active
        allPositions.octave3.forEach((item, index) => {
            this.setGridValue(item.coord.x, item.coord.y, true);
            console.log(`Octave 3 - ${item.note}${item.chordType}: (${item.coord.x}, ${item.coord.y})`);
        });
        
        allPositions.octave4.forEach((item, index) => {
            this.setGridValue(item.coord.x, item.coord.y, true);
            console.log(`Octave 4 - ${item.note}${item.chordType}: (${item.coord.x}, ${item.coord.y})`);
        });
        
        allPositions.octave5.forEach((item, index) => {
            this.setGridValue(item.coord.x, item.coord.y, true);
            console.log(`Octave 5 - ${item.note}${item.chordType}: (${item.coord.x}, ${item.coord.y})`);
        });
        
        // Update the grid visualization
        this.createGridVisualization();
        
        // Debug summary for clone mode 2
        if (this.cloneMode === 2) {
            const chordNotesArray = Array.from(this.chordNotes);
    
            
            // Show what octaves are available in the grid
            const allGridPitches = this.getAllGridPitches();
    
            
            // Show what octaves exist for each chord note
            chordNotesArray.forEach(chordNote => {
                const baseNote = chordNote.replace(/\d+/, '');
                const availableOctaves = allGridPitches
                    .filter(pitch => pitch.startsWith(baseNote))
                    .map(pitch => pitch.replace(baseNote, ''));
                console.log('🎵 [DEBUG] Clone mode 2 - Available octaves for', baseNote + ':', availableOctaves);
            });
        }
        

    }
    
    // Get the calculated position for a specific chord button
    getCalculatedChordPosition(buttonIndex, octave) {
        if (!this.calculatedChordPositions) {
    
            return null;
        }
        

        
        const positions = this.calculatedChordPositions[`octave${octave}`];
        if (!positions || !positions[buttonIndex]) {
            console.log('🎵 [DEBUG] No position found for:', {
                buttonIndex: buttonIndex,
                octave: octave,
                availableOctaves: Object.keys(this.calculatedChordPositions),
                availablePositions: positions ? Object.keys(positions) : 'none'
            });
            return null;
        }
        
        const position = positions[buttonIndex];
        console.log('🎵 [DEBUG] Found calculated position:', {
            buttonIndex: buttonIndex,
            octave: octave,
            position: position,
            actualPitch: this.getPitchAt(position.coord.x, position.coord.y)
        });
        return position;
    }
    
    // Calculate chord positions for a key (pure function, no side effects)
    calculateChordPositionsForKey(rootNote, keyType, keyNotes, chordTypes) {
        // Use the new pitch-utils method to calculate tonic coordinates
        const dims = this.getGridDimensions();
        const originPitch = PitchUtils.getOriginPitch();
        
        try {
            const tonicCoords = PitchUtils.calculateTonicCoordinates(keyNotes[0], keyType, dims.width, dims.height, originPitch);
            const bestCoord = tonicCoords.octave3; // Use octave 3 as the base
            

            
            // Calculate all chord positions using the new pitch-utils method
            const allChordPositions = PitchUtils.calculateAllChordButtonPositions(bestCoord, keyNotes, chordTypes, dims.width, dims.height, originPitch);
            
            return allChordPositions;
            
        } catch (error) {
            console.log('🎵 [DEBUG] Error calculating chord positions:', error.message);
            return null;
        }
    }

    // Calculate and store deterministic chord positions for the current key
    calculateAndStoreChordPositions(rootNote, keyType, keyNotes, chordTypes) {
        const allChordPositions = this.calculateChordPositionsForKey(rootNote, keyType, keyNotes, chordTypes);
        if (allChordPositions) {
            // Store the calculated positions
            this.calculatedChordPositions = allChordPositions;
        }
    }
    
    // Helper method to create a chord with a specific root coordinate
    createChordWithSpecificRoot(rootNote, chordType, rootCoord) {


        
        // Clear only chord notes, keep key notes
        this.chordNotes.clear();
        this.actualClickedNotes.clear();
        this.activeNotes.clear(); // Also clear active notes to ensure clean state
        
        // Get the base note index for internal processing
        const baseNoteIndex = this.noteToPitchClass(rootNote);
        
        if (baseNoteIndex === -1) {
            this.showNotification(`Invalid root note: ${rootNote}`, 'error');
            return;
        }
        
        const chordTypeData = this.chordTypes[chordType];
        if (!chordTypeData) {
            this.showNotification(`Invalid chord type: ${chordType}`, 'error');
            return;
        }
        
        // STEP 1: Get the root pitch from the specified coordinate
        const rootPitchInfo = this.getPitchAt(rootCoord.x, rootCoord.y);
        const rootPitch = rootPitchInfo.pitch;
        // STEP 2: Generate absolute pitches using our new method
        const chordPitchesArray = PitchUtils.generateChordPitches(
            rootNote, 
            chordType, 
            PitchUtils.chordTypes,
            rootPitchInfo.octave // Use the actual octave from the coordinate
        );
        
        // STEP 4: Use Manhattan selection starting from the clicked root position
        const dims = this.getGridDimensions();
        const rootClones = PitchUtils.getAllCloneCoordsForPitch(rootPitch, PitchUtils.getOriginPitch(), dims.width, dims.height);
        const clickedRootCloneIndex = rootClones.findIndex(clone => 
            clone.x === rootCoord.x && clone.y === rootCoord.y
        );
        

        
        // Use Manhattan selection with the clicked root clone index as preferred
        const preferredCloneIndices = clickedRootCloneIndex >= 0 ? [clickedRootCloneIndex] : null;
        const manhattanClones = PitchUtils.selectChordClonesManhattan(
            chordPitchesArray, 
            PitchUtils.getOriginPitch(), 
            dims.width, dims.height,
            preferredCloneIndices
        );
        
        console.log('🎵 [CHORD] Manhattan selection result:', manhattanClones.map(clone => ({
            pitch: clone.pitch,
            coord: clone.coord,
            note: PitchUtils.getNoteFromPitch(clone.pitch).note,
            octave: PitchUtils.getNoteFromPitch(clone.pitch).octave
        })));
        
        // STEP 5: Convert Manhattan result to our format
        const selectedCoords = manhattanClones.map((clone, index) => {
            const pitchInfo = PitchUtils.getNoteFromPitch(clone.pitch);
            const pitch = this.getPitchAt(clone.coord.x, clone.coord.y);
            
            return {
                noteOffset: index, // Just use the index since we don't have noteIndex anymore
                noteName: pitchInfo.note,
                coord: clone.coord,
                pitch: pitch
            };
        });
        
        // Add all selected notes to the chord set and store their coordinates
        selectedCoords.forEach(({ noteOffset, noteName, coord, pitch }) => {
            // Skip if pitch is null (invalid coordinate)
            if (!pitch) {
                return;
            }
            const noteWithOctave = `${noteName}${pitch.octave}`;
            this.chordNotes.add(noteWithOctave);
            this.activeNotes.add(noteWithOctave);
            this.actualClickedNotes.set(noteWithOctave, coord);
        });
        
        // Preserve key visualization by setting grid values for key notes
        this.keyNotes.forEach(note => {
            const coords = this.getCoordinatesForNote(note);
            if (coords && coords.length > 0) {
                // Set the first coordinate for each key note
                this.setGridValue(coords[0].x, coords[0].y, 1);

            }
        });
        

        
        // Update the grid visualization
        this.createGridVisualization();
        
        // Update chord display
        this.detectAndDisplayChord();
        this.updateDisplayAreas();
        
        // Play the chord audio
        this.playActiveNotes();
        
        // this.showNotification(`Created ${rootNote} ${chordTypeData.name} chord with centermost root!`, 'success');
    }

    // Method to handle playing sequence items with proper audio/notification logic
    playSequenceItemAudio(sequenceItem) {
        // Ensure audio is ready before any audio operations
        this.ensureAudioReady();
        
        if (sequenceItem.type === 'key') {
            // For keys, we don't play audio immediately, but we should show a notification
            const itemName = this.getSequenceItemName(sequenceItem);
            this.showNotification(`Key changed to ${itemName}`, 'info');
        } else {
            // For chords, play the audio
            this.playActiveNotes();
        }
    }

    // Pitch Detection Methods
    async startPitchDetection() {
        try {
            // Initialize the pitch detection module
            const success = await this.pitchDetection.initAudio();
            if (!success) {
                throw new Error('Failed to initialize audio');
            }
            
            // Start pitch detection using the refactored module
            this.pitchDetection.startDetection();
            

            
            // Update button text and status
            const pitchBtn = document.getElementById('pitchDetectBtn');
            const pitchStatus = document.getElementById('pitchStatus');
            if (pitchBtn) {
                pitchBtn.textContent = '🎤 Turn off Mic';
                pitchBtn.classList.add('active');
            }
            if (pitchStatus) {
                pitchStatus.textContent = '🎸 Guitar mode: E2-E6 range, 1s sustain required';
                pitchStatus.style.color = '#10b981';
            }
            
            console.log('🎵 [PITCH] Pitch detection started');
            
        } catch (error) {
            console.error('🎵 [PITCH] Error starting pitch detection:', error);
            this.showNotification('Microphone access denied or not available', 'error');
            
            // Update status on error
            const pitchStatus = document.getElementById('pitchStatus');
            if (pitchStatus) {
                pitchStatus.textContent = 'Microphone access denied';
                pitchStatus.style.color = '#ef4444';
            }
        }
    }
    
    stopPitchDetection() {
        // Stop pitch detection using the refactored module
        this.pitchDetection.stopDetection();
        
        // Destroy the pitch detection object to stop the media stream
        if (this.pitchDetection && this.pitchDetection.destroy) {
            this.pitchDetection.destroy();
        }
        
        // Reset tuners when mic is turned off
        this.clearPitchVariance();
        
        // Update button text and status
        const pitchBtn = document.getElementById('pitchDetectBtn');
        const pitchStatus = document.getElementById('pitchStatus');
        if (pitchBtn) {
            pitchBtn.textContent = '🎤 Turn on Mic';
            pitchBtn.classList.remove('active');
        }
        if (pitchStatus) {
            pitchStatus.textContent = 'Ready to detect';
            pitchStatus.style.color = '#64748b';
        }
        
        console.log('🎵 [PITCH] Pitch detection stopped, media stream destroyed, and tuners reset');
    }
    
    // OLD detectPitch() method - no longer used since refactor to pitch-detection.js module
    /*
    detectPitch() {
        if (!this.pitchDetection.analysers || !this.pitchDetection.pitchDetectionActive) return;
        

        
        // Get data from all analysers
        const allResults = [];
        
        for (let i = 0; i < this.pitchDetection.analysers.length; i++) {
            const analyser = this.pitchDetection.analysers[i];
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Float32Array(bufferLength);
            analyser.getFloatFrequencyData(dataArray);
            
            // Use both FFT and autocorrelation methods
            const fftResult = this.findFundamentalFrequencyFFT(dataArray, analyser.fftSize);
            const autocorrResult = this.findFundamentalFrequencyAutocorr(dataArray, analyser.fftSize);
            
            if (fftResult) allResults.push({ ...fftResult, method: 'fft', windowSize: analyser.fftSize });
            if (autocorrResult) allResults.push({ ...autocorrResult, method: 'autocorr', windowSize: analyser.fftSize });
        }
        
        // Combine and validate results
        let finalResult = this.combineAndValidateResults(allResults);
        
        // Apply bass-specific pitch correction (but preserve original frequency for variance tracking)
        let originalFrequency = finalResult ? finalResult.frequency : null;
        
        if (finalResult && finalResult.frequency < 300) {
            finalResult = this.applyBassPitchCorrection(finalResult);
        }
        
        // Track pitch variance for all strings using the ORIGINAL precise frequency
        if (originalFrequency) {
            this.trackPitchVariance(originalFrequency);
        }
        

        
        // Fallback to simple peak detection if advanced method fails
        if (!finalResult && allResults.length > 0) {

            const bestResult = allResults.reduce((best, current) => 
                current.confidence > best.confidence ? current : best
            );
            finalResult = bestResult;
            
            // Track variance for fallback result too
            if (finalResult) {
                this.trackPitchVariance(finalResult.frequency);
            }
        }
        
        // Ultimate fallback: just use the strongest peak from FFT
        if (!finalResult) {

            for (let i = 0; i < this.pitchDetection.analysers.length; i++) {
                const analyser = this.pitchDetection.analysers[i];
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Float32Array(bufferLength);
                analyser.getFloatFrequencyData(dataArray);
                
                // Convert to amplitudes
                const amplitudes = new Float32Array(dataArray.length);
                for (let j = 0; j < dataArray.length; j++) {
                    amplitudes[j] = Math.pow(10, dataArray[j] / 20);
                }
                
                // Find strongest peak
                let maxIndex = 0;
                let maxValue = -Infinity;
                for (let j = 0; j < amplitudes.length; j++) {
                    if (amplitudes[j] > maxValue) {
                        maxValue = amplitudes[j];
                        maxIndex = j;
                    }
                }
                
                const frequency = maxIndex * this.pitchDetection.audioContext.sampleRate / analyser.fftSize;
                if (frequency >= 77 && frequency <= 2000 && maxValue > 0.001) {
                    finalResult = {
                        frequency: frequency,
                        confidence: Math.min(maxValue * 100, 100),
                        method: 'fallback-fft',
                        windowSize: analyser.fftSize
                    };

                    // Track variance for ultimate fallback result too
                    this.trackPitchVariance(frequency);
                    break;
                }
            }
        }
        
        if (finalResult && finalResult.frequency > 77 && finalResult.frequency < 2000) {
                            // Convert frequency to pitch for guitar range check
                const pitch = Math.round(12 * Math.log2(finalResult.frequency / 440) + 69);
                

            
            // Check if pitch is within acoustic guitar range
            if (pitch < this.guitarMinPitch || pitch > this.guitarMaxPitch) {
                return;
            }
            // Apply temporal smoothing
            this.pitchHistory.push(finalResult);
            if (this.pitchHistory.length > this.maxHistoryLength) {
                this.pitchHistory.shift();
            }
            
            const smoothedResult = this.applyTemporalSmoothing();
            
            if (smoothedResult) {
                // Clean up old sustained pitches (this is still needed for the sustained pitch tracking)
                this.cleanupSustainedPitches();
                
                // Note: cleanupSustainedNotesStack() is now handled by separate interval
                
                // Convert frequency to pitch
                const pitch = Math.round(12 * Math.log2(smoothedResult.frequency / 440) + 69);
                
                // Check for sustained pitch
                const sustainedResult = this.checkSustainedPitch(pitch, smoothedResult.confidence);
                
                if (!sustainedResult.sustained) {
                    // Not sustained long enough yet
                    const noteInfo = PitchUtils.getNoteFromPitch(pitch, false);
                    const octave = Math.floor(pitch / 12) - 1;
                    const noteDisplay = noteInfo ? `${noteInfo.note}${octave}` : `Pitch ${pitch}`;
                    this.updatePitchStatus(`Building: ${noteDisplay} (${sustainedResult.count}/${this.sustainThreshold})`, 'info');
                    

                    return;
                }
                
                // Note is sustained - create initial noteInfo for stack
                const initialNoteInfo = PitchUtils.getNoteFromPitch(pitch, false);
                
                // Only add to stack if confidence is above threshold
                if (smoothedResult.confidence > this.confidenceThreshold) {
                    this.addSustainedNote(initialNoteInfo, pitch, smoothedResult.confidence);
                } else {
        
                }
                
                // Check if the result is above calibrated threshold
                if (this.backgroundNoiseProfile) {
                    // Get current amplitude data from the first analyser
                    const analyser = this.analysers[0];
                    const dataArray = new Float32Array(analyser.frequencyBinCount);
                    analyser.getFloatFrequencyData(dataArray);
                    
                    // Convert dB to linear amplitude
                    const amplitudes = dataArray.map(db => Math.pow(10, db / 20));
                    const maxAmplitude = Math.max(...amplitudes);
                    
                    if (maxAmplitude <= this.backgroundNoiseProfile.threshold) {
            
                        this.updatePitchStatus('Silent (below noise floor)', 'info');
                        this.highlightDetectedNote(null); // Clear any previous highlight
                        return;
                    }
                }
                
                // Use the sustained pitch result
                const sustainedPitch = sustainedResult.pitch;
                
                // Convert pitch to note name with frequency correction
                let noteInfo = PitchUtils.getNoteFromPitch(sustainedPitch, false);
                
                // Debug: Show what frequency is being detected

                
                // Find the closest note to the detected frequency
                const a4Freq = 440;
                const a4Midi = 69;
                const detectedMidi = 12 * Math.log2(smoothedResult.frequency / a4Freq) + a4Midi;
                const closestMidi = Math.round(detectedMidi);
                const closestNote = PitchUtils.getNoteFromPitch(closestMidi, false);
                

                
                // Use the closest note instead of the exact pitch
                noteInfo = closestNote;
                
                // If the frequency is very close to A4 (440Hz), force it to be A4
                if (Math.abs(smoothedResult.frequency - 440) < 10) { // Within 10Hz of A4
    
                    noteInfo = { note: 'A', octave: 4 };
                }
                
                if (noteInfo) {
                    // Only log when we detect a significant pitch
                    const octave = Math.floor(sustainedPitch / 12) - 1; // Convert pitch to octave

                    
                    // Update status with chord information and confidence
                    const pitchStatus = document.getElementById('pitchStatus');
                    if (pitchStatus) {
                        const chordStatus = this.getCurrentChordStatus();
                        const confidenceInfo = ` (${smoothedResult.confidence.toFixed(1)}% confidence)`;
                        pitchStatus.textContent = chordStatus + confidenceInfo;
                        pitchStatus.style.color = '#10b981';
                    }
                    
                    // Highlight the detected note on the grid
                    this.highlightDetectedNote(noteInfo.note);
                    
                    // Update chord display if in chord mode
                    if (this.playMode === 'draw-chords') {
                        this.toggleNote(noteInfo.note);
                    }
                }
            }
        } else {
            // Clear pitch history when no pitch detected
            this.pitchHistory = [];
            
            // Only update status occasionally to avoid spam
            const pitchStatus = document.getElementById('pitchStatus');
            if (pitchStatus && pitchStatus.textContent === 'Listening for pitch...') {
                // Add a small delay to avoid constant status updates
                if (!this.lastStatusUpdate || Date.now() - this.lastStatusUpdate > 2000) {
                    pitchStatus.textContent = 'No pitch detected - try playing louder';
                    pitchStatus.style.color = '#f59e0b';
                    this.lastStatusUpdate = Date.now();
                }
            }
        }
    }
    */
    
    findFundamentalFrequencyFFT(dataArray, fftSize) {
        const sampleRate = this.audioContext.sampleRate;
        
        // Convert dB values to linear amplitude
        const amplitudes = new Float32Array(dataArray.length);
        for (let i = 0; i < dataArray.length; i++) {
            amplitudes[i] = Math.pow(10, dataArray[i] / 20);
        }
        
        // Find peaks in the frequency spectrum
        const peaks = this.findPeaks(amplitudes);
        
        if (peaks.length === 0) return null;
        
        // Sort peaks by amplitude
        peaks.sort((a, b) => amplitudes[b] - amplitudes[a]);
        
        // Analyze the strongest peaks for harmonic relationships
        const fundamentalCandidates = [];
        
        for (let i = 0; i < Math.min(peaks.length, 8); i++) { // Increased from 5 to 8 for better bass detection
            const peakIndex = peaks[i];
            
            // Use parabolic interpolation for more precise frequency estimation
            let preciseFrequency = peakIndex * sampleRate / fftSize;
            
            if (peakIndex > 0 && peakIndex < amplitudes.length - 1) {
                // Parabolic interpolation around the peak
                const left = amplitudes[peakIndex - 1];
                const center = amplitudes[peakIndex];
                const right = amplitudes[peakIndex + 1];
                
                if (left > 0 && center > 0 && right > 0) {
                    // Convert to dB for better interpolation
                    const leftDb = 20 * Math.log10(left);
                    const centerDb = 20 * Math.log10(center);
                    const rightDb = 20 * Math.log10(right);
                    
                    // Calculate offset from bin center
                    const offset = 0.5 * (leftDb - rightDb) / (leftDb - 2 * centerDb + rightDb);
                    
                    // Apply offset to get precise frequency
                    preciseFrequency = (peakIndex + offset) * sampleRate / fftSize;
                }
            }
            
            const frequency = preciseFrequency;
            
            // Check if this could be a fundamental frequency
            const harmonicScore = this.calculateHarmonicScore(peaks, amplitudes, frequency);
            
            // Use consistent thresholds for all frequencies
            let harmonicThreshold = 0.05;
            let confidenceMultiplier = 1.0;
            
            // Removed bass note bias that was causing harmonics issues
            
            if (harmonicScore > harmonicThreshold) {
                const confidence = this.calculateConfidence(amplitudes[peakIndex], harmonicScore, frequency) * confidenceMultiplier;

                fundamentalCandidates.push({
                    frequency: frequency,
                    amplitude: amplitudes[peakIndex],
                    harmonicScore: harmonicScore,
                    confidence: confidence
                });
            }
        }
        
        // Removed problematic "bass note special handling" that was causing harmonics issues
        // The algorithm now trusts the primary peak detection and harmonic analysis
        
        // Return the candidate with highest confidence
        if (fundamentalCandidates.length > 0) {
            // Return the candidate with highest confidence
            fundamentalCandidates.sort((a, b) => b.confidence - a.confidence);
            return fundamentalCandidates[0];
        }
        
        return null;
    }
    
    findFundamentalFrequencyAutocorr(dataArray, fftSize) {
        const sampleRate = this.audioContext.sampleRate;
        
        // Convert dB values to linear amplitude
        const amplitudes = new Float32Array(dataArray.length);
        for (let i = 0; i < dataArray.length; i++) {
            amplitudes[i] = Math.pow(10, dataArray[i] / 20);
        }
        
        // Perform autocorrelation
        const autocorr = this.autocorrelate(amplitudes);
        
        // Find peaks in autocorrelation (these represent periodicities)
        const peaks = this.findAutocorrPeaks(autocorr);
        
        if (peaks.length === 0) return null;
        
        // Convert lag to frequency
        const candidates = [];
        
        for (const peak of peaks) {
            // Use interpolation for more precise frequency estimation
            let preciseFrequency = sampleRate / peak.lag;
            
            // For autocorrelation, we can also interpolate around the peak
            // This is more complex, but we can at least use the peak amplitude for better precision
            if (peak.amplitude > 0) {
                // Simple interpolation based on peak amplitude
                const binWidth = sampleRate / fftSize;
                const fractionalOffset = (peak.amplitude - Math.max(peak.leftAmplitude || 0, peak.rightAmplitude || 0)) / peak.amplitude * 0.1;
                preciseFrequency = sampleRate / (peak.lag + fractionalOffset);
            }
            
            const frequency = preciseFrequency;
            if (frequency >= 77 && frequency <= 2000) { // Back to original range
                let confidence = this.calculateAutocorrConfidence(peak.amplitude, peak.lag, fftSize, frequency);
                
                // Removed bass note confidence boosting that was causing harmonics issues

                candidates.push({
                    frequency: frequency,
                    amplitude: peak.amplitude,
                    lag: peak.lag,
                    confidence: confidence
                });
            }
        }
        
        // Removed bass note preference that was causing harmonics issues
        
        // Return the candidate with highest confidence
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.confidence - a.confidence);
            return candidates[0];
        }
        
        return null;
    }
    
    autocorrelate(signal) {
        const length = signal.length;
        const result = new Float32Array(length);
        
        for (let lag = 0; lag < length; lag++) {
            let sum = 0;
            for (let i = 0; i < length - lag; i++) {
                sum += signal[i] * signal[i + lag];
            }
            result[lag] = sum / (length - lag);
        }
        
        return result;
    }
    
    findAutocorrPeaks(autocorr) {
        const peaks = [];
        const minLag = Math.floor(this.audioContext.sampleRate / 2000); // Minimum lag for 2000Hz
        const maxLag = Math.floor(this.audioContext.sampleRate / 80);   // Maximum lag for 80Hz
        
        for (let i = minLag; i < maxLag; i++) {
            if (autocorr[i] > autocorr[i - 1] && autocorr[i] > autocorr[i + 1] && autocorr[i] > 0.01) { // Reduced threshold
                peaks.push({
                    lag: i,
                    amplitude: autocorr[i]
                });
            }
        }
        
        return peaks;
    }
    
    calculateAutocorrConfidence(amplitude, lag, fftSize, frequency = null) {
        // Normalize amplitude and consider lag resolution
        const normalizedAmplitude = Math.min(amplitude, 1);
        const lagResolution = fftSize / this.audioContext.sampleRate;
        const resolutionFactor = Math.min(lag / lagResolution, 1);
        
        let confidence = (normalizedAmplitude * 0.7 + resolutionFactor * 0.3);
        
        // Boost confidence for test tone (A4 = 440Hz)
        if (frequency && Math.abs(frequency - 440) < 20) { // Within 20Hz of A4
            const testToneBoost = Math.max(0, 1 - Math.abs(frequency - 440) / 20); // 0-1 boost factor
            confidence += testToneBoost * 0.3; // Add up to 30% boost for test tone
    
        }
        
        return Math.min(confidence * 100, 100);
    }
    
    findPeaks(amplitudes) {
        const peaks = [];
        const maxAmplitude = Math.max(...amplitudes);
        
        // Use background noise profile if available, otherwise use default threshold
        let threshold;
        if (this.backgroundNoiseProfile) {
            // Use calibrated noise threshold (2 standard deviations above noise floor)
            threshold = this.backgroundNoiseProfile.threshold;

        } else {
            // Default threshold: 5% of max amplitude
            threshold = maxAmplitude * 0.05;

        }
        

        
        for (let i = 1; i < amplitudes.length - 1; i++) {
            if (amplitudes[i] > threshold && 
                amplitudes[i] > amplitudes[i - 1] && 
                amplitudes[i] > amplitudes[i + 1]) {
                peaks.push(i);
            }
        }
        

        
        // Debug: Check if peaks are above calibrated threshold
        if (this.backgroundNoiseProfile && peaks.length > 0) {
            
            
            // Check if any peaks are actually above the calibrated threshold
            const peaksAboveThreshold = peaks.filter(peakIndex => amplitudes[peakIndex] > this.backgroundNoiseProfile.threshold);

            
            if (peaksAboveThreshold.length === 0) {

                return [];
            }
        }
        
        return peaks;
    }
    
    calculateHarmonicScore(peaks, amplitudes, fundamentalFreq) {
        const sampleRate = this.audioContext.sampleRate;
        const fftSize = this.analysers[0].fftSize;
        let harmonicMatches = 0;
        let totalHarmonics = 0;
        
        // Check for harmonics up to the 8th harmonic
        for (let harmonic = 2; harmonic <= 8; harmonic++) {
            const expectedFreq = fundamentalFreq * harmonic;
            const expectedBin = Math.round(expectedFreq * fftSize / sampleRate);
            
            if (expectedBin < amplitudes.length) {
                totalHarmonics++;
                
                // Look for a peak near the expected harmonic frequency
                const tolerance = Math.max(1, Math.round(expectedBin * 0.05)); // Increased tolerance to 5%
                
                for (const peakIndex of peaks) {
                    if (Math.abs(peakIndex - expectedBin) <= tolerance) {
                        harmonicMatches++;
                        break;
                    }
                }
            }
        }
        
        const score = totalHarmonics > 0 ? harmonicMatches / totalHarmonics : 0;

        return score;
    }
    
    calculateConfidence(amplitude, harmonicScore, frequency = null) {
        // Normalize amplitude to 0-1 range
        const normalizedAmplitude = Math.min(amplitude, 1);
        
        // Combine amplitude and harmonic score for overall confidence
        let confidence = (normalizedAmplitude * 0.6) + (harmonicScore * 0.4);
        
        // Boost confidence for test tone (A4 = 440Hz)
        if (frequency && Math.abs(frequency - 440) < 20) { // Within 20Hz of A4
            const testToneBoost = Math.max(0, 1 - Math.abs(frequency - 440) / 20); // 0-1 boost factor
            confidence += testToneBoost * 0.3; // Add up to 30% boost for test tone
    
        }
        
        return Math.min(confidence * 100, 100); // Return as percentage
    }
    
    combineAndValidateResults(allResults) {
        if (allResults.length === 0) return null;
        
        // Group results by frequency (within 1% tolerance)
        const frequencyGroups = [];
        
        for (const result of allResults) {
            let addedToGroup = false;
            
            for (const group of frequencyGroups) {
                const avgFreq = group.reduce((sum, r) => sum + r.frequency, 0) / group.length;
                const tolerance = avgFreq * 0.01; // 1% tolerance
                
                if (Math.abs(result.frequency - avgFreq) <= tolerance) {
                    group.push(result);
                    addedToGroup = true;
                    break;
                }
            }
            
            if (!addedToGroup) {
                frequencyGroups.push([result]);
            }
        }
        
        // Find the group with highest average confidence
        let bestGroup = null;
        let bestAvgConfidence = 0;
        
        for (const group of frequencyGroups) {
            const avgConfidence = group.reduce((sum, r) => sum + r.confidence, 0) / group.length;
            if (avgConfidence > bestAvgConfidence) {
                bestAvgConfidence = avgConfidence;
                bestGroup = group;
            }
        }
        
        if (bestGroup && bestGroup.length >= 1) { // Reduced requirement to 1 agreeing result
            // Calculate weighted average frequency
            const totalWeight = bestGroup.reduce((sum, r) => sum + r.confidence, 0);
            const weightedFreq = bestGroup.reduce((sum, r) => sum + r.frequency * r.confidence, 0) / totalWeight;
            
    
            
            return {
                frequency: weightedFreq,
                confidence: bestAvgConfidence,
                method: bestGroup[0].method,
                agreement: bestGroup.length
            };
        }
        

        return null;
    }
    
    applyTemporalSmoothing() {
        if (this.pitchHistory.length < 3) return this.pitchHistory[this.pitchHistory.length - 1];
        
        // Use median filtering for robust smoothing
        const frequencies = this.pitchHistory.map(p => p.frequency);
        const sortedFreqs = [...frequencies].sort((a, b) => a - b);
        const medianFreq = sortedFreqs[Math.floor(sortedFreqs.length / 2)];
        
        // Calculate confidence based on consistency
        const freqVariance = frequencies.reduce((sum, freq) => sum + Math.pow(freq - medianFreq, 2), 0) / frequencies.length;
        
        // More lenient variance calculation for bass notes
        let consistencyScore;
        if (medianFreq < 300) { // Extended bass range
            consistencyScore = Math.max(0, 1 - freqVariance / 20000); // More lenient for bass
        } else {
            consistencyScore = Math.max(0, 1 - freqVariance / 10000); // Standard for higher frequencies
        }
        
        // Find the result closest to median frequency
        let bestResult = this.pitchHistory[0];
        let minDiff = Math.abs(bestResult.frequency - medianFreq);
        
        for (const result of this.pitchHistory) {
            const diff = Math.abs(result.frequency - medianFreq);
            if (diff < minDiff) {
                minDiff = diff;
                bestResult = result;
            }
        }
        
        // Boost confidence for bass notes
        let finalConfidence = bestResult.confidence * consistencyScore;
        if (medianFreq < 300) {
            finalConfidence *= 1.2; // 20% boost for bass notes
        }
        
        return {
            ...bestResult,
            frequency: medianFreq,
            confidence: finalConfidence
        };
    }
    
    highlightDetectedNote(note) {
        // Remove previous highlight
        document.querySelectorAll('.pitch-detected').forEach(el => {
            el.classList.remove('pitch-detected');
        });
        
        // Find and highlight the detected note on the grid
        const gridCells = document.querySelectorAll('#grid-container .grid-cell');
        gridCells.forEach(cell => {
            if (cell.dataset.note === note) {
                cell.classList.add('pitch-detected');
            }
        });
    }
    




    updatePitchStatus(message, type = 'info') {
        const pitchStatus = document.getElementById('pitchStatus');
        if (pitchStatus) {
            pitchStatus.textContent = message;
            
            // Update color based on type
            pitchStatus.className = 'pitch-status';
            if (type === 'error') {
                pitchStatus.style.color = '#ef4444';
            } else if (type === 'success') {
                pitchStatus.style.color = '#10b981';
            } else if (type === 'warning') {
                pitchStatus.style.color = '#f59e0b';
            } else {
                pitchStatus.style.color = '#3b82f6';
            }
        }
    }
    
    // Noise gate control methods
    updateNoiseGateDisplay() {
        // This method is called to update the noise gate display
        // Since there's no specific UI for noise gate controls, this is a placeholder
        // that can be extended later if noise gate UI is added
        
        // If pitch detection is available, we can update any related displays
        if (this.pitchDetection) {
            // Update status if needed
            if (this.pitchDetection.onStatusUpdate) {
                this.pitchDetection.onStatusUpdate('Noise gate display updated', 'info');
            }
        }
    }

    checkSustainedPitch(pitch, confidence) {
        const now = Date.now();
        const currentTime = now / 1000; // Convert to seconds
        
        // Find if this pitch is close to any existing sustained pitch
        let matchedPitch = null;
        for (const [existingPitch, data] of this.pitchDetection.sustainedPitchHistory.entries()) {
            if (Math.abs(existingPitch - pitch) <= this.sustainTolerance) {
                matchedPitch = existingPitch;
                break;
            }
        }
        
        if (matchedPitch) {
            // Update existing sustained pitch
            const data = this.pitchDetection.sustainedPitchHistory.get(matchedPitch);
            
            const oldCount = data.count;
            data.count++;
            data.lastSeen = currentTime;
            
    
            
            // Check if sustained long enough
            if (data.count >= this.sustainThreshold) {
                const duration = currentTime - data.startTime;
    
                return {
                    pitch: matchedPitch,
                    duration: duration,
                    confidence: confidence,
                    sustained: true
                };
            }
        } else {
            // Start tracking new pitch
            this.pitchDetection.sustainedPitchHistory.set(pitch, {
                count: 1,
                startTime: currentTime,
                lastSeen: currentTime
            });

        }
        
        // Return current count for UI display
        if (matchedPitch) {
            const data = this.pitchDetection.sustainedPitchHistory.get(matchedPitch);
            return { 
                sustained: false, 
                count: data.count,
                pitch: matchedPitch
            };
        } else {
            return { 
                sustained: false, 
                count: 0,
                pitch: pitch
            };
        }
    }

    cleanupSustainedPitches() {
        const now = Date.now() / 1000;
        const timeout = 5.0; // Remove pitches not seen for 5 seconds (increased for testing)
        
        for (const [pitch, data] of this.pitchDetection.sustainedPitchHistory.entries()) {
            const timeSinceLastSeen = now - data.lastSeen;
            
            if (timeSinceLastSeen > timeout) {
    
                this.pitchDetection.sustainedPitchHistory.delete(pitch);
            }
        }
    }





    _trackPitchVariance(frequency) {
        // Find which tuner this frequency matches best
        let bestMatch = null;
        let bestCentsDiff = Infinity;
        
        for (const [stringName, tuner] of Object.entries(this.pitchDetection.stringTuners)) {
            const referenceFrequency = tuner.frequency;
            
            // E2/E3 Octave Correction: When E2 is detected as E3 harmonic, treat as E2 for tuner display
            let adjustedFrequency = frequency;
            if (stringName === 'E2' && Math.abs(frequency - 164.82) < 20) { // E3 is 164.82 Hz, ±20 Hz window
                adjustedFrequency = frequency / 2; // Halve the frequency to treat E3 as E2
            }
            
            // Calculate cents difference from this string using adjusted frequency
            const centsDiff = Math.abs(1200 * Math.log2(adjustedFrequency / referenceFrequency));
            
            // Track if within ±100 cents of this string
            if (centsDiff <= 100) {
                if (centsDiff < bestCentsDiff) {
                    bestCentsDiff = centsDiff;
                    bestMatch = stringName;
                }
            }
        }
        
        // If we found a match, update the active tuner and reset others
        if (bestMatch) {
            // If this is a different tuner than currently active, switch immediately
            if (this.activeTuner !== bestMatch) {
                this.activeTuner = bestMatch;
                this.resetAllTunersExcept(bestMatch);
            }
            
            // Update the matched tuner
            const tuner = this.pitchDetection.stringTuners[bestMatch];
            const referenceFrequency = tuner.frequency;
            
            // E2/E3 Octave Correction for the matched tuner
            let adjustedFrequency = frequency;
            if (bestMatch === 'E2' && Math.abs(frequency - 164.82) < 20) {
                adjustedFrequency = frequency / 2;
            }
            
            const centsDiff = 1200 * Math.log2(adjustedFrequency / referenceFrequency);
            const bucketIndex = Math.round(centsDiff + 100);
            
            if (bucketIndex >= 0 && bucketIndex < 200) {
                // Add to history (cumulative, not capped at 50)
                tuner.history.push(bucketIndex);
                
                // Keep only last 50 samples for mean calculation (rolling window)
                if (tuner.history.length > 50) {
                    tuner.history.shift();
                }
                
                // Rebuild histogram from history
                tuner.buckets.fill(0);
                
                // Use cumulative total (all detections ever)
                if (!tuner.cumulativeTotal) tuner.cumulativeTotal = 0;
                tuner.cumulativeTotal++;
                tuner.total = tuner.cumulativeTotal;
                
                for (const bucket of tuner.history) {
                    tuner.buckets[bucket]++;
                }
                
                // Identify the note being detected (use original frequency for display)
                const midiPitch = Math.round(12 * Math.log2(frequency / 440) + 69);
                const noteInfo = PitchUtils.getNoteFromPitch(midiPitch, false);
                const noteName = noteInfo ? `${noteInfo.note}${Math.floor(midiPitch/12)-1}` : 'Unknown';
                
                // Update the variance display in real-time
                this.updatePitchVarianceDisplay();
            }
        } else {
            // No match found, reset active tuner
            this.activeTuner = null;
            this.resetAllTuners();
        }
    }

    resetAllTunersExcept(exceptStringName) {
        // Reset all tuners except the specified one
        for (const [stringName, tuner] of Object.entries(this.pitchDetection.stringTuners)) {
            if (stringName !== exceptStringName) {
                tuner.buckets.fill(0);
                tuner.total = 0;
                tuner.cumulativeTotal = 0;
                tuner.history = [];
            }
        }
    }

    resetAllTuners() {
        // Reset all tuners to empty state
        for (const tuner of Object.values(this.pitchDetection.stringTuners)) {
            tuner.buckets.fill(0);
            tuner.total = 0;
            tuner.cumulativeTotal = 0;
            tuner.history = [];
        }
    }

    updateTunerDisplay() {
        const toggleTunerBtn = document.getElementById('toggleTuner');
        const pitchDetectionContent = document.getElementById('pitchDetectionContent');
        
        if (toggleTunerBtn) {
            toggleTunerBtn.textContent = this.tunerCollapsed ? '+' : '−';
        }
        
        if (pitchDetectionContent) {
            if (this.tunerCollapsed) {
                pitchDetectionContent.classList.add('collapsed');
                pitchDetectionContent.classList.remove('expanded');
            } else {
                pitchDetectionContent.classList.add('expanded');
                pitchDetectionContent.classList.remove('collapsed');
            }
        }
        
        // Update the variance display to show collapsed or expanded view
        this.updatePitchVarianceDisplay();
    }

    updatePitchVarianceDisplay() {
        const varianceElement = document.getElementById('pitchVarianceDisplay');
        if (!varianceElement) {
            return;
        }
        
        let allTunersHTML = '';
        
        // Determine which tuner to show in collapsed mode
        let activeTunerName = 'E2'; // Default to E2
        let maxTotal = 0;
        
        if (this.tunerCollapsed) {
            // Use the currently active tuner, or find the one with most detections as fallback
            if (this.activeTuner && this.pitchDetection.stringTuners[this.activeTuner].total > 0) {
                activeTunerName = this.activeTuner;
                maxTotal = this.pitchDetection.stringTuners[this.activeTuner].total;
            } else {
                // Fallback: find the tuner with the most detections
                for (const [stringName, tuner] of Object.entries(this.pitchDetection.stringTuners)) {
                    if (tuner.total > maxTotal) {
                        maxTotal = tuner.total;
                        activeTunerName = stringName;
                    }
                }
            }
        }
        
        // Create tuner for each string
        for (const [stringName, tuner] of Object.entries(this.pitchDetection.stringTuners)) {
            // In collapsed mode, only show the active tuner
            if (this.tunerCollapsed && stringName !== activeTunerName) {
                continue;
            }
            // Get note info for labels (same for both empty and populated cases)
            const midiPitch = Math.round(12 * Math.log2(tuner.frequency / 440) + 69);
            const noteInfo = PitchUtils.getNoteFromPitch(midiPitch, false);
            const noteName = noteInfo ? noteInfo.note : stringName;
            
            // Calculate semitone range for labels
            const lowerNote = PitchUtils.getNoteFromPitch(midiPitch - 1, false)?.note || '?';
            const upperNote = PitchUtils.getNoteFromPitch(midiPitch + 1, false)?.note || '?';
            
            if (tuner.total === 0) {
                // Generate empty histogram with axes and target pitch line
                const emptyHistogramHTML = this.generateEmptyHistogramHTML();
                
                // In collapsed mode, hide the letter if there's no active tuner
                const showLetter = !this.tunerCollapsed || maxTotal > 0;
                const letterDisplay = showLetter ? stringName : '';
                
                allTunersHTML += `
                    <div class="string-tuner">
                        <div class="variance-histogram" style="border: 1px solid #374151; position: relative;">
                            <div style="position: absolute; left: 80px; top: 50%; transform: translateY(-50%); font-size: 48px; font-weight: bold; color: #3b82f6; z-index: 10;">${letterDisplay}</div>
                            ${emptyHistogramHTML}
                        </div>
                    </div>
                `;
                continue;
            }
            
            // Calculate running mean of the distribution with outlier removal
            let totalWeightedCents = 0;
            let totalDetections = 0;
            
            // First pass: calculate initial mean
            for (let i = 0; i < tuner.buckets.length; i++) {
                const count = tuner.buckets[i];
                const cents = i - 100; // -100 to +100 cents
                totalWeightedCents += count * cents;
                totalDetections += count;
            }
            
            const initialMeanCents = totalDetections > 0 ? totalWeightedCents / totalDetections : 0;
            
            // Second pass: remove 20% of outliers with greatest deviation from mean
            const allDetections = [];
            for (let i = 0; i < tuner.buckets.length; i++) {
                const count = tuner.buckets[i];
                const cents = i - 100;
                for (let j = 0; j < count; j++) {
                    allDetections.push({ cents, bucketIndex: i });
                }
            }
            
            // Sort by absolute deviation from mean
            allDetections.sort((a, b) => Math.abs(b.cents - initialMeanCents) - Math.abs(a.cents - initialMeanCents));
            
            // Remove top 50% of outliers
            const outlierCount = Math.floor(allDetections.length * 0.5);
            const filteredDetections = allDetections.slice(outlierCount);
            
            // Rebuild histogram without outliers
            const filteredBuckets = new Array(200).fill(0);
            for (const detection of filteredDetections) {
                filteredBuckets[detection.bucketIndex]++;
            }
            
            // Calculate mean of remaining 50%
            const filteredMeanCents = filteredDetections.length > 0 
                ? filteredDetections.reduce((sum, d) => sum + d.cents, 0) / filteredDetections.length 
                : initialMeanCents;
            
            const meanCents = filteredMeanCents;
            const meanBucketIndex = Math.round(meanCents + 100);
            
            // Use filtered buckets for histogram display (50% of outliers removed)
            const displayBuckets = filteredBuckets;
            const maxCount = Math.max(...displayBuckets);
            
            const histogramHTML = displayBuckets.map((count, index) => {
                const cents = index - 100; // Convert bucket index back to cents
                const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                
                // Determine bar color and width
                let barColor = '#3b82f6'; // Default blue
                let barWidth = '2px';
                
                if (index === 100) { // Perfect pitch (0 cents) - full height reference bar
                    barColor = '#fbbf24'; // Yellow for perfect pitch reference
                    return `
                        <div class="variance-bar" 
                             style="height: 100%; background: ${barColor}; flex: 1; margin: 0;" 
                             title="${stringName} Reference (0 cents)">
                        </div>
                    `;
                } else if (index >= meanBucketIndex - 2 && index <= meanBucketIndex + 2) { // Running mean - 5 bars wide, centered
                    const isCenter = (index === meanBucketIndex);
                    const isOverlapping = (index === 100);
                    const isInMeanRange = (index >= meanBucketIndex - 2 && index <= meanBucketIndex + 2);
                    const meanOverlapsTarget = (meanBucketIndex >= 98 && meanBucketIndex <= 102); // Check if mean range overlaps with target
                    barColor = (isOverlapping || (isInMeanRange && meanOverlapsTarget)) ? '#10b981' : '#ef4444'; // Green if overlapping with target, red otherwise
                    return `
                        <div class="variance-bar" 
                             style="height: 100%; background: ${barColor}; flex: 1; margin: 0;" 
                             title="${isCenter ? `Mean: ${meanCents.toFixed(1)} cents` : 'Mean range'}">
                        </div>
                    `;
                }
                
                // In normal mode, show empty bars (0% height) instead of data bars
                const displayHeight = this.tunerDisplayMode === 'normal' ? 0 : height;
                
                return `
                    <div class="variance-bar" 
                         style="height: ${displayHeight}%; min-height: 2px; background: ${barColor}; flex: 1; margin: 0;" 
                         title="${cents.toFixed(1)} cents: ${count} detections">
                    </div>
                `;
            }).join('');
            
            // Check if mean overlaps with target for letter color
            const meanOverlapsTarget = (meanBucketIndex >= 98 && meanBucketIndex <= 102);
            const letterColor = meanOverlapsTarget ? '#10b981' : '#3b82f6'; // Green if overlapping, blue otherwise
            
            // In collapsed mode, always show the letter for active tuners
            const letterDisplay = stringName;
            
            allTunersHTML += `
                <div class="string-tuner">
                    <div class="variance-histogram" style="border: 1px solid #374151; position: relative;">
                        <div style="position: absolute; left: 80px; top: 50%; transform: translateY(-50%); font-size: 48px; font-weight: bold; color: ${letterColor}; z-index: 10;">${letterDisplay}</div>
                        ${histogramHTML}
                    </div>
                </div>
            `;
        }
        
        const displayHTML = `
            ${allTunersHTML}
        `;
        
        varianceElement.innerHTML = displayHTML;
        

    }

    generateEmptyHistogramHTML() {
        // Generate an empty histogram with 200 bars (all zero height) but showing the target pitch line
        const histogramHTML = Array(200).fill(0).map((count, index) => {
            const cents = index - 100; // Convert bucket index back to cents
            
            // Determine bar color and width
            let barColor = '#3b82f6'; // Default blue
            let barWidth = '2px';
            
            if (index === 100) { // Perfect pitch (0 cents) - full height reference bar
                barColor = '#fbbf24'; // Yellow for perfect pitch reference
                return `
                    <div class="variance-bar" 
                         style="height: 100%; background: ${barColor}; flex: 1; margin: 0;" 
                         title="Reference (0 cents)">
                    </div>
                `;
            }
            
            return `
                <div class="variance-bar" 
                     style="height: 0%; background: ${barColor}; flex: 1; margin: 0;" 
                     title="${cents} cents">
                </div>
            `;
        }).join('');
        
        return histogramHTML;
    }

    clearPitchVariance() {
        // Clear all string tuners
        for (const tuner of Object.values(this.pitchDetection.stringTuners)) {
            tuner.buckets.fill(0);
            tuner.total = 0;
            tuner.cumulativeTotal = 0;
            tuner.history = [];
        }
        
        // Reset active tuner tracking
        this.activeTuner = null;
        
        this.updatePitchVarianceDisplay();
    }
    

    




    applyBassPitchCorrection(result) {
        const frequency = result.frequency;
        const pitch = Math.round(12 * Math.log2(frequency / 440) + 69);
        
        // Define the expected frequencies for all notes on the lower three strings
        // E2 string (MIDI 40-51): E2 to E3
        // A2 string (MIDI 45-56): A2 to A3  
        // D3 string (MIDI 50-61): D3 to D4
        const bassNoteFrequencies = {
            // E2 string frets 0-11
            40: 82.41,   // E2 open
            41: 87.31,   // F2
            42: 92.50,   // F#2
            43: 98.00,   // G2
            44: 103.83,  // G#2
            45: 110.00,  // A2
            46: 116.54,  // A#2
            47: 123.47,  // B2
            48: 130.81,  // C3
            49: 138.59,  // C#3
            50: 146.83,  // D3
            51: 155.56,  // D#3
            52: 164.81,  // E3
            
            // A2 string frets 0-11
            45: 110.00,  // A2 open
            46: 116.54,  // A#2
            47: 123.47,  // B2
            48: 130.81,  // C3
            49: 138.59,  // C#3
            50: 146.83,  // D3
            51: 155.56,  // D#3
            52: 164.81,  // E3
            53: 174.61,  // F3
            54: 185.00,  // F#3
            55: 196.00,  // G3
            56: 207.65,  // G#3
            57: 220.00,  // A3
            
            // D3 string frets 0-11
            50: 146.83,  // D3 open
            51: 155.56,  // D#3
            52: 164.81,  // E3
            53: 174.61,  // F3
            54: 185.00,  // F#3
            55: 196.00,  // G3
            56: 207.65,  // G#3
            57: 220.00,  // A3
            58: 233.08,  // A#3
            59: 246.94,  // B3
            60: 261.63,  // C4
            61: 277.18,  // C#4
            62: 293.66   // D4
        };
        
        // Check if we're close to any bass note
        for (const [midiPitch, expectedFreq] of Object.entries(bassNoteFrequencies)) {
            const tolerance = expectedFreq * 0.06; // 6% tolerance for fretted notes
            if (Math.abs(frequency - expectedFreq) <= tolerance) {
                // Correct to the expected frequency
                const correctedResult = { ...result };
                correctedResult.frequency = expectedFreq;
                correctedResult.corrected = true;
                const noteName = PitchUtils.getNoteFromPitch(parseInt(midiPitch), false)?.note || 'Unknown';

                return correctedResult;
            }
        }
        
        return result;
    }







    // Method to find the central-most C4 coordinate (middle chord button)
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const musicalGrid = new MusicalGrid();
    window.musicalGrid = musicalGrid; // Make it globally accessible for the chatbot
    window.PitchUtils = PitchUtils; // Make PitchUtils globally accessible
});