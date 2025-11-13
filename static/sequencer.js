/**
 * Sequencer - Handles sequence timing and management
 * Responsible for:
 * - Sequence timing and intervals
 * - Sequence state management
 * - Coordinating between audio playback and UI updates
 * - Sequence validation and error handling
 * - Sequence parsing and data operations
 */

import * as PitchUtils from './pitch-utils.js';

export class Sequencer {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.sequence = [];
        this.currentSequenceIndex = -1;
        this.isPlaying = false;
        this.sequencerTimer = null;
        this.sequencerInterval = 1500; // Default 1.5 seconds
        this.currentKey = null; // Track current key to avoid duplicate notifications
        this.insertMode = false; // Track if we're in insert mode
        
        // Callbacks for UI updates
        this.onUIUpdate = null;
        this.onSequenceItemChange = null;
        this.onError = null;
    }

    // Set callbacks for UI coordination
    setCallbacks(onUIUpdate, onSequenceItemChange, onError) {
        this.onUIUpdate = onUIUpdate;
        this.onSequenceItemChange = onSequenceItemChange;
        this.onError = onError;
    }

    // Set the sequence to play
    setSequence(sequence) {

        this.sequence = sequence;
        this.currentSequenceIndex = -1;
        this.currentKey = null; // Reset current key when setting new sequence
        this.insertMode = false; // Reset insert mode when setting new sequence

    }

    // Create a new sequence with metadata
    createSequence(name, gridHeight, gridWidth, originPitch) {
        return {
            name: name,
            timestamp: Date.now(),
            itemCount: 0,
            gridHeight: gridHeight,
            gridWidth: gridWidth,
            originPitch: originPitch, // MIDI pitch number (e.g., 60 for middle C)
            items: []
        };
    }

    // Add a chord to the sequence
    addChordToSequence(sequence, chords) {
        const sequenceItem = {
            type: 'chord',
            chords: chords.map(chord => ({
                x: chord.x,
                y: chord.y,
                pitch: chord.pitch,
                duration: chord.duration || 2.0
            }))
        };
        
        sequence.items.push(sequenceItem);
        sequence.itemCount = sequence.items.length;
        
        return sequence;
    }

    // Add a key to the sequence
    addKeyToSequence(sequence, keyName, keyNotes) {
        const sequenceItem = {
            type: 'key',
            keyName: keyName,
            notes: keyNotes
        };
        
        sequence.items.push(sequenceItem);
        sequence.itemCount = sequence.items.length;
        
        return sequence;
    }

    // Add a rest to the sequence
    addRestToSequence(sequence) {
        const sequenceItem = {
            type: 'rest',
            timestamp: Date.now()
        };
        
        sequence.items.push(sequenceItem);
        sequence.itemCount = sequence.items.length;
        
        return sequence;
    }

    // Add an item to the current sequence
    addItem(item) {
        this.sequence.push(item);
        if (this.onUIUpdate) {
            this.onUIUpdate();
        }
        return this.sequence.length - 1; // Return the index of the added item
    }

    // Insert an item at a specific index
    insertItem(item, index) {
        this.sequence.splice(index + 1, 0, item);
        if (this.onUIUpdate) {
            this.onUIUpdate();
        }
        return index + 1; // Return the index of the inserted item
    }

    // Get the current sequence
    getSequence() {
        return this.sequence;
    }

    // Get the current sequence length
    getSequenceLength() {
        return this.sequence.length;
    }

    // Check if sequence is empty
    isEmpty() {
        return this.sequence.length === 0;
    }

    // Clear the sequence
    clearSequence() {
        this.sequence = [];
        this.currentSequenceIndex = -1;
        this.insertMode = false;
        if (this.onUIUpdate) {
            this.onUIUpdate();
        }
    }

    // Start sequencer playback
    startPlaying() {
        const items = this.sequence.items || this.sequence;
        if (items.length === 0) {
            if (this.onError) {
                this.onError('No items in sequence');
            }
            return { success: false, error: 'No items in sequence' };
        }

        this.isPlaying = true;
        
        // Call UI update callback
        if (this.onUIUpdate) {
            this.onUIUpdate();
        }

        // Play the current item immediately (don't advance to next)
        if (this.currentSequenceIndex < 0 || this.currentSequenceIndex >= items.length) {
            this.currentSequenceIndex = 0;
        }
        this.playCurrentSequenceItem();

        // Start the sequencer timer
        this.startSequencerTimer();

        return { success: true };
    }

    // Stop sequencer playback
    stopPlaying() {
        this.isPlaying = false;
        this.stopSequencerTimer();
        
        // Stop audio (without UI callback since we handle it separately)
        this.audioManager.stopPlaying();
        
        // Call UI update callback
        if (this.onUIUpdate) {
            this.onUIUpdate();
        }
    }

    // Start the sequencer timer
    startSequencerTimer() {
        if (this.sequencerTimer) {
            clearTimeout(this.sequencerTimer);
        }
        
        const stepThroughSequence = () => {
            const items = this.sequence.items || this.sequence;
            if (this.isPlaying && items.length > 0) {
                // Advance to next item and play it
                this.playNextSequenceItem();
                
                // Determine interval based on the CURRENT item that was just played
                let nextInterval = this.sequencerInterval;
                const currentItem = items[this.currentSequenceIndex];
                
                        // Use zero interval for key changes, normal interval for chords
        if (currentItem && currentItem.type === 'key') {
                    nextInterval = 0;
                }
                
                // Schedule next step
                this.sequencerTimer = setTimeout(stepThroughSequence, nextInterval);
            } else {
                this.stopSequencerTimer();
            }
        };
        
        // Schedule the first step after the interval (don't play immediately)
        this.sequencerTimer = setTimeout(stepThroughSequence, this.sequencerInterval);
    }

    // Stop the sequencer timer
    stopSequencerTimer() {
        if (this.sequencerTimer) {
            clearTimeout(this.sequencerTimer);
            this.sequencerTimer = null;
        }
    }

    // Play the next sequence item
    playNextSequenceItem() {
        const items = this.sequence.items || this.sequence;
        if (items.length === 0) {
            if (this.onError) {
                this.onError('No items in sequence');
            }
            return;
        }
        
        // If this is the first time playing (index is -1 or invalid), start with first item
        if (this.currentSequenceIndex < 0 || this.currentSequenceIndex >= items.length) {
            this.currentSequenceIndex = 0;
        } else {
            // Move to next item
            this.currentSequenceIndex++;
            
            if (this.currentSequenceIndex >= items.length) {
                this.currentSequenceIndex = 0; // Loop back to start
            }
        }
        
        this.playCurrentSequenceItem();
    }

    // Play the current sequence item
    playCurrentSequenceItem() {
        const items = this.sequence.items || this.sequence;
        const sequenceItem = items[this.currentSequenceIndex];
        
        // Call sequence item change callback
        if (this.onSequenceItemChange) {
            this.onSequenceItemChange(sequenceItem, this.currentSequenceIndex);
        }
        
        // Play the audio for this sequence item
        this.playSequenceItemAudio(sequenceItem);
    }

    // Handle audio playback for a sequence item
    playSequenceItemAudio(sequenceItem) {

        
                if (sequenceItem.type === 'key') {
            // Generate key name from rootNote and keyType (new format)
            const keyName = sequenceItem.rootNote && sequenceItem.keyType
                ? `${sequenceItem.rootNote} ${sequenceItem.keyType}`
                : sequenceItem.keyName || 'Unknown Key'; // Fallback to old format or default
            
            // Only show notification if the key has actually changed
            if (this.currentKey !== keyName) {
                this.currentKey = keyName; // Update current key
                if (this.onError) {
                    this.onError(`Key changed to ${keyName}`, 'info');
                }
            }
        } else if (sequenceItem.type === 'chord') {
            // For chords, play the audio using the audio manager
            let pitches = sequenceItem.pitches;
            
            // If no pitches array, generate them from chord information
            if (!pitches || pitches.length === 0) {
                if (sequenceItem.rootNote && sequenceItem.chordType) {
        
                    
                    // Convert root note to pitch class
                    const rootPitchClass = this.noteToPitchClass(sequenceItem.rootNote);
                    if (rootPitchClass === -1) {
                        console.warn('🎵 [SEQUENCER] Invalid root note:', sequenceItem.rootNote);
                        return;
                    }
                    
                    // Generate chord pitches
                    const chordPitchClasses = PitchUtils.generateChordPitchClasses(
                        rootPitchClass, 
                        sequenceItem.chordType, 
                        PitchUtils.chordTypes
                    );
                    
                    // Convert pitch classes to pitches (default octave 3)
                    pitches = chordPitchClasses.map(pitchClass => {
                        const pitch = (3 + 1) * 12 + pitchClass; // Octave 3
                        return pitch;
                    });
                    
    
                } else {
                    console.warn('🎵 [SEQUENCER] Chord item missing rootNote or chordType:', sequenceItem);
                    return;
                }
            }
            
            if (pitches && pitches.length > 0) {

                
                // Use the same audio method as chord buttons for consistency
                // Call the main grid's playActiveNotes method instead of audio manager directly
                if (this.onSequenceItemChange) {
                    // The onSequenceItemChange callback is set to handleSequenceItemChange in MusicalGrid
                    // This will set up the chord notes and then we can call playActiveNotes
                    // For now, let's use the audio manager but with better error handling
                    if (this.audioManager && typeof this.audioManager.playPitches === 'function') {
                        this.audioManager.playPitches(pitches);
                    } else {
                        console.error('🎵 [SEQUENCER] Audio manager not available or playPitches method missing');
                    }
                }
            } else {
    
            }
        } else if (sequenceItem.type === 'rest') {
            // For rests, do nothing (silent)

            // No notification for rests
        }
    }

    // Adjust sequencer speed
    adjustSpeed(delta) {
        // Calculate new speed with bounds checking
        const currentSpeed = 2.5 - (this.sequencerInterval / 1000); // Convert interval to speed
        const newSpeed = Math.max(0.5, Math.min(2.0, currentSpeed + delta));
        
        // Convert speed to interval (inverse relationship)
        const intervalValue = 2.5 - newSpeed;
        this.sequencerInterval = intervalValue * 1000; // Convert to milliseconds
    }

    // Get current state
    getState() {
        const items = this.sequence.items || this.sequence;
        return {
            isPlaying: this.isPlaying,
            currentIndex: this.currentSequenceIndex,
            sequenceLength: items.length,
            interval: this.sequencerInterval,
            insertMode: this.insertMode
        };
    }

    // Set insert mode
    setInsertMode(enabled) {
        this.insertMode = enabled;
        // Call UI update callback to refresh button text
        if (this.onUIUpdate) {
            this.onUIUpdate();
        }
    }

    // Get insert mode
    getInsertMode() {
        return this.insertMode;
    }

    // Set the current sequence index
    setCurrentIndex(index) {
        const items = this.sequence.items || this.sequence;
        if (index >= -1 && index < items.length) {
            this.currentSequenceIndex = index;
            return true;
        }
        return false;
    }

    // Play the next sequence item
    playNext() {

        const items = this.sequence.items || this.sequence;

        if (items.length === 0) {

            if (this.onError) {
                this.onError('No items in sequence');
            }
            return;
        }
        
        // If this is the first time playing (index is -1 or invalid), start with first item
        if (this.currentSequenceIndex < 0 || this.currentSequenceIndex >= items.length) {
            this.currentSequenceIndex = 0;
        } else {
            // Move to next item
            this.currentSequenceIndex++;
            
            if (this.currentSequenceIndex >= items.length) {
                this.currentSequenceIndex = 0; // Loop back to start
            }
        }
        
        this.playCurrentSequenceItem();
    }

    // Play the previous sequence item
    playPrev() {
        const items = this.sequence.items || this.sequence;
        if (items.length === 0) {
            if (this.onError) {
                this.onError('No items in sequence');
            }
            return;
        }
        
        // Move to previous item (decrement first, then check bounds)
        this.currentSequenceIndex--;
        
        if (this.currentSequenceIndex < 0) {
            this.currentSequenceIndex = items.length - 1; // Loop to end
        }
        
        this.playCurrentSequenceItem();
    }

    // Play a specific sequence item by index
    playSequenceItem(index) {
        const items = this.sequence.items || this.sequence;
        if (index < 0 || index >= items.length) {
            if (this.onError) {
                this.onError('Invalid item index');
            }
            return;
        }
        
        this.currentSequenceIndex = index;
        this.playCurrentSequenceItem();
        
        // Call UI update callback to ensure UI is updated
        if (this.onUIUpdate) {
            this.onUIUpdate();
        }
    }

    // Delete a sequence item by index
    deleteSequenceItem(index) {
        const items = this.sequence.items || this.sequence;
        if (index < 0 || index >= items.length) {
            if (this.onError) {
                this.onError('Invalid item index');
            }
            return;
        }
        
        // Remove the item
        items.splice(index, 1);
        
        // Adjust current sequence index if needed
        if (items.length === 0) {
            this.currentSequenceIndex = 0;
        } else if (this.currentSequenceIndex >= items.length) {
            this.currentSequenceIndex = items.length - 1;
        } else if (this.currentSequenceIndex > index) {
            this.currentSequenceIndex--;
        }
    }

    // ===== SAVE & LOAD METHODS =====

    /**
     * Save the current sequence to cloud (requires user to be logged in)
     * @param {string} name - Name for the saved sequence
     * @param {Object} currentKey - Optional current key to include
     * @returns {Object} - Result with success status and message
     */
    async saveSequence(name, currentKey = null) {
        const sequence = this.getSequence();
        
        if (sequence.length === 0 && !currentKey) {
            return { success: false, message: 'No sequence or key to save' };
        }

        if (!name || name.trim() === '') {
            return { success: false, message: 'Sequence name is required' };
        }

        // Create the sequence to save
        let sequenceToSave = [...sequence];
        let itemCount = sequence.length;

        // Check if there's a current key and NO keys exist in the sequence
        if (currentKey && currentKey.rootNote && currentKey.name) {
            const hasAnyKey = sequence.some(item => item.type === 'key');

            if (!hasAnyKey) {
                // Create key sequence item
                const keySequenceItem = {
                    type: 'key',
                    rootNote: currentKey.rootNote,
                    keyType: currentKey.name
                };

                // Add key as first item
                sequenceToSave.unshift(keySequenceItem);
                itemCount++;
            }
        }

        // Check if user is logged in
        try {
            const authResponse = await fetch('/api/auth/me');
            const authResult = await authResponse.json();
            
            if (authResult.success && authResult.user) {
                // User is logged in - save to database
                const saveResponse = await fetch('/api/songs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: name.trim(),
                        sequence: JSON.stringify(sequenceToSave),
                        keyInfo: currentKey ? `${currentKey.rootNote} ${currentKey.name}` : null,
                        notes: `Sequence with ${itemCount} items`
                    })
                });
                
                const saveResult = await saveResponse.json();
                
                if (saveResponse.ok && saveResult.id) {
                    return { 
                        success: true, 
                        message: `Sequence "${name}" saved to cloud (${itemCount} items)`,
                        itemCount: itemCount,
                        savedToCloud: true
                    };
                } else {
                    console.error('Failed to save to database:', saveResult);
                    return { 
                        success: false, 
                        message: 'Failed to save sequence to cloud. Please try again.',
                        error: saveResult
                    };
                }
            } else {
                // User is not logged in
                return { 
                    success: false, 
                    message: 'You must be logged in to save sequences. Please log in and try again.'
                };
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            return { 
                success: false, 
                message: 'Unable to verify login status. Please check your connection and try again.',
                error: error.message
            };
        }
    }

    /**
     * Load a sequence from saved sequences
     * @param {string} name - Name of the sequence to load
     * @returns {Object} - Result with success status and sequence data
     */
    async loadSequence(name) {
        try {
            // Check if user is logged in
            const authResponse = await fetch('/api/auth/me');
            const authResult = await authResponse.json();
            
            if (!authResult.success || !authResult.user) {
                return { 
                    success: false, 
                    message: 'You must be logged in to load sequences. Please log in and try again.'
                };
            }

            // Get all user's songs to find the one with matching name
            const songsResponse = await fetch('/api/songs');
            
            if (!songsResponse.ok) {
                return { 
                    success: false, 
                    message: 'Failed to load sequences from cloud. Please try again.',
                    error: `HTTP ${songsResponse.status}: ${songsResponse.statusText}`
                };
            }

            const songsResult = await songsResponse.json();
            
            if (!Array.isArray(songsResult)) {
                return { 
                    success: false, 
                    message: 'Invalid response from server. Please try again.',
                    error: 'Response is not an array'
                };
            }

            // Find the song with matching name
            const song = songsResult.find(s => s.title === name);
            
            if (!song) {
                return { success: false, message: `Sequence "${name}" not found` };
            }

            // Parse the sequence data
            let sequenceData;
            try {
                sequenceData = JSON.parse(song.sequence);
            } catch (parseError) {
                return { 
                    success: false, 
                    message: 'Failed to parse sequence data. The sequence may be corrupted.',
                    error: parseError.message
                };
            }

            // Load the sequence
            this.setSequence(sequenceData);
            this.setCurrentIndex(-1); // Start at -1 so first "Next" press plays first item
            
            return { 
                success: true, 
                message: `Sequence "${name}" loaded successfully`,
                sequenceData: {
                    sequence: sequenceData,
                    timestamp: song.created_at,
                    itemCount: sequenceData.length,
                    id: song.id
                }
            };
        } catch (error) {
            console.error('Error loading sequence:', error);
            return { 
                success: false, 
                message: 'Unable to load sequence. Please check your connection and try again.',
                error: error.message
            };
        }
    }

    /**
     * Get all saved sequences from cloud
     * @returns {Promise<Object>} - Promise that resolves to object with sequence names as keys and data as values
     */
    async getSavedSequences() {
        try {
            // Check if user is logged in
            const authResponse = await fetch('/api/auth/me');
            const authResult = await authResponse.json();
            
            if (!authResult.success || !authResult.user) {
                return {};
            }

            // Get all user's songs
            const songsResponse = await fetch('/api/songs');
            
            if (!songsResponse.ok) {
                console.error('Failed to load sequences from cloud:', songsResponse.status, songsResponse.statusText);
                return {};
            }

            const songsResult = await songsResponse.json();
            
            // Convert songs array to the expected format
            const savedSequences = {};
            if (Array.isArray(songsResult)) {
                songsResult.forEach(song => {
                    try {
                        const sequenceData = JSON.parse(song.sequence);
                        savedSequences[song.title] = {
                            sequence: sequenceData,
                            timestamp: song.created_at,
                            itemCount: sequenceData.length,
                            id: song.id
                        };
                    } catch (parseError) {
                        console.error(`Failed to parse sequence for song "${song.title}":`, parseError);
                    }
                });
            }

            return savedSequences;
        } catch (error) {
            console.error('Error loading saved sequences:', error);
            return {};
        }
    }

    /**
     * Delete a saved sequence from cloud
     * @param {string} name - Name of the sequence to delete
     * @returns {Promise<Object>} - Promise that resolves to result with success status and updated sequences
     */
    async deleteSavedSequence(name) {
        try {
            // Check if user is logged in
            const authResponse = await fetch('/api/auth/me');
            const authResult = await authResponse.json();
            
            if (!authResult.success || !authResult.user) {
                return { 
                    success: false, 
                    message: 'You must be logged in to delete sequences. Please log in and try again.'
                };
            }

            // Get all user's songs to find the one with matching name
            const songsResponse = await fetch('/api/songs');
            
            if (!songsResponse.ok) {
                return { 
                    success: false, 
                    message: 'Failed to load sequences from cloud. Please try again.',
                    error: `HTTP ${songsResponse.status}: ${songsResponse.statusText}`
                };
            }

            const songsResult = await songsResponse.json();
            
            if (!Array.isArray(songsResult)) {
                return { 
                    success: false, 
                    message: 'Invalid response from server. Please try again.',
                    error: 'Response is not an array'
                };
            }

            // Find the song with matching name
            const song = songsResult.find(s => s.title === name);
            
            if (!song) {
                return { success: false, message: `Sequence "${name}" not found` };
            }

            // Delete the song from the database
            const deleteResponse = await fetch(`/api/songs/${song.id}`, {
                method: 'DELETE'
            });
            
            if (!deleteResponse.ok) {
                const deleteResult = await deleteResponse.json();
                return { 
                    success: false, 
                    message: 'Failed to delete sequence from cloud. Please try again.',
                    error: deleteResult
                };
            }

            // Get updated list of sequences
            const updatedSequences = await this.getSavedSequences();
            
            return { 
                success: true, 
                message: `Sequence "${name}" deleted`,
                savedSequences: updatedSequences
            };
        } catch (error) {
            console.error('Error deleting sequence:', error);
            return { 
                success: false, 
                message: 'Unable to delete sequence. Please check your connection and try again.',
                error: error.message
            };
        }
    }

    /**
     * Parse and load a sequence from text format
     * @param {string} sequenceText - Text representation of sequence
     * @param {Object} currentKey - Optional current key for context
     * @returns {Object} - Result with success status and parsed items
     */
    parseAndLoadSequence(sequenceText, currentKey = null) {
        if (!sequenceText || !sequenceText.trim()) {
            return { success: false, message: 'Please enter a sequence' };
        }

        // Use regex to properly split while preserving parentheses
        const items = [];
        const regex = /\([^)]+\)|[^\s]+/g;
        let match;
        
        while ((match = regex.exec(sequenceText)) !== null) {
            items.push(match[0]);
        }

        if (items.length === 0) {
            return { success: false, message: 'No valid items found in sequence' };
        }

        // Clear current sequence
        this.setSequence([]);
        this.setCurrentIndex(-1);

        let successCount = 0;
        let errorCount = 0;

        for (const item of items) {
            console.log('Processing item:', item);
            
            if (item.startsWith('(') && item.endsWith(')')) {
                // This is a key - parse with parentheses intact
                console.log('Parsing key:', item);
                const keyMatch = this.parseKeyText(item);
                
                if (keyMatch) {
                    // Convert root note to preferred accidentals for this key type
                    const useFlats = PitchUtils.shouldUseFlats(this.noteToPitchClass(keyMatch.rootNote), keyMatch.keyType);
                    const displayRootNote = PitchUtils.pitchClassToNote(this.noteToPitchClass(keyMatch.rootNote), useFlats);
                    
                    const keySequenceItem = {
                        type: 'key',
                        rootNote: displayRootNote,
                        keyType: keyMatch.keyType
                    };
                    this.addItem(keySequenceItem);
                    successCount++;
                    console.log('Successfully added key:', keyMatch);
                    console.log('Created key sequence item:', keySequenceItem);
                } else {
                    errorCount++;
                    console.error(`Could not parse key: ${item}`);
                }
            } else if (item.toLowerCase() === 'rest') {
                // This is a rest
                console.log('Parsing rest:', item);
                const restSequenceItem = {
                    type: 'rest'
                };
                this.addItem(restSequenceItem);
                successCount++;
                console.log('Successfully added rest');
            } else {
                // This is a chord
                console.log('Parsing chord:', item);
                const chordMatch = this.parseChordText(item);
                
                if (chordMatch) {
                    // Convert root note to preferred accidentals based on current key context
                    let displayRootNote = chordMatch.rootNote;
                    let displayBassNote = chordMatch.bassNote;
                    
                    if (currentKey) {
                        // Use current key context for flat/sharp preference
                        displayRootNote = PitchUtils.pitchClassToNote(this.noteToPitchClass(chordMatch.rootNote), PitchUtils.shouldUseFlats(this.noteToPitchClass(currentKey.rootNote), currentKey.name));
                        if (chordMatch.bassNote) {
                            displayBassNote = PitchUtils.pitchClassToNote(this.noteToPitchClass(chordMatch.bassNote), PitchUtils.shouldUseFlats(this.noteToPitchClass(currentKey.rootNote), currentKey.name));
                        }
                    }
                    
                    const chordName = chordMatch.isSlashChord 
                        ? `${displayRootNote}${chordMatch.chordName}/${displayBassNote}`
                        : `${displayRootNote}${chordMatch.chordName}`;
                    
                    // Create chord sequence item (without grid-specific data)
                    const chordSequenceItem = {
                        type: 'chord',
                        rootNote: displayRootNote,
                        chordType: chordMatch.chordType,
                        chordName: chordName,
                        bassNote: displayBassNote,
                        isSlashChord: chordMatch.isSlashChord
                    };
                    
                    // Generate and store pitches for the chord at load time
                    // Generate absolute pitches directly from root note and chord type
                    const pitches = PitchUtils.generateChordPitches(
                        displayRootNote, 
                        chordMatch.chordType, 
                        PitchUtils.chordTypes,
                        3 // root octave
                    );
                    
                    if (pitches.length > 0) {
                        // Store the generated pitches in the sequence item
                        chordSequenceItem.pitches = pitches;
                
                    } else {
                        console.warn('🎵 [SEQUENCER] Invalid root note for pitch generation:', displayRootNote);
                    }
                    
                    this.addItem(chordSequenceItem);
                    successCount++;
                    console.log('Successfully added chord:', chordMatch);
                } else {
                    errorCount++;
                    console.error(`Could not parse chord: ${item}`);
                }
            }
        }

        return { 
            success: true, 
            message: `Parsed ${items.length} items from sequence`,
            items: items,
            successCount: successCount,
            errorCount: errorCount
        };
    }

    /**
     * Export current sequence as text
     * @returns {string} - Text representation of the sequence
     */
    exportSequenceAsText() {
        const sequence = this.getSequence();
        if (sequence.length === 0) {
            return '';
        }

        return sequence.map(item => {
                    if (item.type === 'key') {
            return `(${item.rootNote} ${item.keyType})`;
        } else if (item.type === 'chord') {
                return item.chordName || 'Unknown Chord';
            } else if (item.type === 'rest') {
                return 'rest';
            }
            return 'Unknown';
        }).join(' ');
    }

    // ===== PARSING METHODS =====

    /**
     * Parse chord text and return chord data
     * @param {string} chordText - Text representation of chord
     * @returns {Object|null} - Parsed chord data or null if invalid
     */
    parseChordText(chordText) {
        console.log('Parsing chord text:', chordText);
        
        // Check for slash chords first (e.g., Dm/C, C/G, G/B)
        const slashChordMatch = chordText.match(/^([A-G][#♯b♭]?)([^\/]*)\/([A-G][#♯b♭]?)$/i);
        if (slashChordMatch) {
            const rootNote = slashChordMatch[1];
            const chordTypeText = slashChordMatch[2];
            const bassNote = slashChordMatch[3];
            
            console.log(`Slash chord detected: root=${rootNote}, chordType=${chordTypeText}, bass=${bassNote}`);
            
            // Parse the chord type part - if empty, default to major chord
            let chordType = 'maj'; // Default to major chord
            if (chordTypeText.trim()) {
                chordType = this.parseChordType(chordTypeText);
                if (!chordType) {
                    console.log(`Could not parse chord type: ${chordTypeText}`);
                    return null;
                }
            }
            
            return {
                rootNote: rootNote,
                chordType: chordType,
                chordName: PitchUtils.chordTypes[chordType].name,
                bassNote: bassNote,
                isSlashChord: true
            };
        }
        
        // Common chord patterns - order matters! More specific patterns first
        const chordPatterns = [
            // Major 7th chords - handle M7 notation specifically
            { pattern: /^([A-G][#♯b♭]?)(M7)$/, type: 'maj7' }, // Case-sensitive M7
            { pattern: /^([A-G][#♯b♭]?)(maj7|major7)$/i, type: 'maj7' }, // Case-insensitive maj7/major7
            
            // Major chords (including single letter)
            { pattern: /^([A-G][#♯b♭]?)$/i, type: 'maj' }, // Single letter = major chord
            { pattern: /^([A-G][#♯b♭]?)(maj|major)$/i, type: 'maj' },
            { pattern: /^([A-G][#♯b♭]?)(maj9|major9)$/i, type: 'maj9' },
            { pattern: /^([A-G][#♯b♭]?)(maj11|major11)$/i, type: 'maj11' },
            { pattern: /^([A-G][#♯b♭]?)(maj13|major13)$/i, type: 'maj13' },
            
            // Minor chords
            { pattern: /^([A-G][#♯b♭]?)(min|minor|m)$/i, type: 'min' },
            { pattern: /^([A-G][#♯b♭]?)(m7)$/, type: 'min7' }, // Case-sensitive m7
            { pattern: /^([A-G][#♯b♭]?)(min7|minor7)$/i, type: 'min7' }, // Case-insensitive min7/minor7
            { pattern: /^([A-G][#♯b♭]?)(min9|minor9|m9)$/i, type: 'min9' },
            { pattern: /^([A-G][#♯b♭]?)(min11|minor11|m11)$/i, type: 'min11' },
            
            // Dominant chords - more specific patterns first
            { pattern: /^([A-G][#♯b♭]?)(7b9|dom7b9|dominant7b9)$/i, type: 'dom7b9' },
            { pattern: /^([A-G][#♯b♭]?)(7#9|dom7#9|dominant7#9)$/i, type: 'dom7#9' },
            { pattern: /^([A-G][#♯b♭]?)(7|dom7|dominant7)$/i, type: 'dom7' },
            { pattern: /^([A-G][#♯b♭]?)(9|dom9|dominant9)$/i, type: 'dom9' },
            { pattern: /^([A-G][#♯b♭]?)(11|dom11|dominant11)$/i, type: 'dom11' },
            { pattern: /^([A-G][#♯b♭]?)(13|dom13|dominant13)$/i, type: 'dom13' },
            
            // Diminished chords
            { pattern: /^([A-G][#♯b♭]?)(dim|diminished|°)$/i, type: 'dim' },
            { pattern: /^([A-G][#♯b♭]?)(dim7|diminished7|°7)$/i, type: 'dim7' },
            { pattern: /^([A-G][#♯b♭]?)(ø7?|half-dim|half-diminished|°ø7?|m7b5)$/i, type: 'half-dim7' },
            
            // Augmented chords
            { pattern: /^([A-G][#♯b♭]?)(aug|augmented|aug5)$/i, type: 'aug' },
            
            // 6th chords
            { pattern: /^([A-G][#♯b♭]?)(6|maj6|major6)$/i, type: '6' },
            { pattern: /^([A-G][#♯b♭]?)(m6|min6|minor6)$/i, type: 'm6' },
            
            // Sus chords
            { pattern: /^([A-G][#♯b♭]?)(7sus4|7sus2)$/i, type: (match) => match[2].toLowerCase() },
            { pattern: /^([A-G][#♯b♭]?)(sus2|sus4)$/i, type: (match) => match[2].toLowerCase() },
            
            // Power chord
            { pattern: /^([A-G][#♯b♭]?)(5|power)$/i, type: '5' }
        ];
        
        for (const { pattern, type } of chordPatterns) {
            const match = chordText.match(pattern);
            if (match) {
                const rootNote = match[1];
                const chordType = typeof type === 'function' ? type(match) : type;
                
                console.log(`Matched chord pattern: ${pattern}, rootNote: ${rootNote}, chordType: ${chordType}`);
                
                // Check if this chord type exists in our chordTypes
                if (PitchUtils.chordTypes[chordType]) {
                    console.log(`Chord type ${chordType} found in chordTypes object`);
                    return {
                        rootNote: rootNote,
                        chordType: chordType,
                        chordName: PitchUtils.chordTypes[chordType].name
                    };
                } else {
                    console.log(`Chord type ${chordType} NOT found in chordTypes object`);
                }
            }
        }
        
        console.log('No chord pattern matched');
        return null;
    }

    /**
     * Parse chord type text and return chord type
     * @param {string} chordTypeText - Text representation of chord type
     * @returns {string|null} - Chord type or null if invalid
     */
    parseChordType(chordTypeText) {
        // Parse just the chord type part (without root note)
        const chordTypePatterns = [
            // Major chords
            { pattern: /^(maj|major)$/i, type: 'maj' },
            { pattern: /^(maj7|major7)$/i, type: 'maj7' },
            { pattern: /^(maj9|major9)$/i, type: 'maj9' },
            { pattern: /^(maj11|major11)$/i, type: 'maj11' },
            { pattern: /^(maj13|major13)$/i, type: 'maj13' },
            
            // Minor chords
            { pattern: /^(min|minor|m)$/i, type: 'min' },
            { pattern: /^(min7|minor7|m7)$/i, type: 'min7' },
            { pattern: /^(min9|minor9|m9)$/i, type: 'min9' },
            { pattern: /^(min11|minor11|m11)$/i, type: 'min11' },
            { pattern: /^(min13|minor13|m13)$/i, type: 'min13' },
            { pattern: /^(minmaj7|min-maj7)$/i, type: 'minmaj7' },
            { pattern: /^(min7b5|min7-b5)$/i, type: 'min7b5' },
            { pattern: /^(m6|min6|minor6)$/i, type: 'm6' },
            
            // Dominant chords
            { pattern: /^(7|dom7|dominant7)$/i, type: 'dom7' },
            { pattern: /^(9|dom9|dominant9)$/i, type: 'dom9' },
            { pattern: /^(11|dom11|dominant11)$/i, type: 'dom11' },
            { pattern: /^(13|dom13|dominant13)$/i, type: 'dom13' },
            { pattern: /^(7#9|dom7#9|dominant7#9)$/i, type: 'dom7#9' },
            { pattern: /^(7b9|dom7b9|dominant7b9)$/i, type: 'dom7b9' },
            { pattern: /^(7#5|dom7#5|dominant7#5)$/i, type: 'dom7#5' },
            { pattern: /^(7b5|dom7b5|dominant7b5)$/i, type: 'dom7b5' },
            { pattern: /^(7#11|dom7#11|dominant7#11)$/i, type: 'dom7#11' },
            { pattern: /^(9#11|dom9#11|dominant9#11)$/i, type: 'dom9#11' },
            { pattern: /^(7b13|dom7b13|dominant7b13)$/i, type: 'dom7b13' },
            
            // Diminished chords
            { pattern: /^(dim|diminished|°)$/i, type: 'dim' },
            { pattern: /^(dim7|diminished7|°7)$/i, type: 'dim7' },
            { pattern: /^(ø7?|half-dim|half-diminished|°ø7?)$/i, type: 'half-dim7' },
            
            // Augmented chords
            { pattern: /^(aug|augmented|aug5)$/i, type: 'aug' },
            { pattern: /^(maj7#5|major7#5)$/i, type: 'maj7#5' },
            
            // Sus chords
            { pattern: /^(7sus4)$/i, type: '7sus4' },
            { pattern: /^(7sus2)$/i, type: '7sus2' },
            { pattern: /^(sus2)$/i, type: 'sus2' },
            { pattern: /^(sus4)$/i, type: 'sus4' },
            { pattern: /^(sus2sus4|sus2\/4)$/i, type: 'sus2sus4' },
            
            // Add chords
            { pattern: /^(add9)$/i, type: 'add9' },
            { pattern: /^(add11)$/i, type: 'add11' },
            { pattern: /^(add13)$/i, type: 'add13' },
            
            // 6th chords
            { pattern: /^(6|maj6|major6)$/i, type: '6' },
            
            // Altered chords
            { pattern: /^(alt|altered)$/i, type: 'alt' },
            
            // Power chord
            { pattern: /^(5|power)$/i, type: '5' }
        ];
        
        for (const { pattern, type } of chordTypePatterns) {
            const match = chordTypeText.match(pattern);
            if (match) {
                const chordType = typeof type === 'function' ? type(match) : type;
                
                // Check if this chord type exists in our chordTypes
                if (PitchUtils.chordTypes[chordType]) {
                    return chordType;
                }
            }
        }
        
        return null;
    }

    /**
     * Parse key text and return key data
     * @param {string} keyText - Text representation of key
     * @returns {Object|null} - Parsed key data or null if invalid
     */
    parseKeyText(keyText) {
        // Clean the input by removing all non-printable characters and extra whitespace
        const cleanedText = keyText.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
        console.log('Parsing key text:', cleanedText);
        console.log('Original text length:', keyText.length);
        console.log('Cleaned text length:', cleanedText.length);
        console.log('Original char codes:', Array.from(keyText).map(c => c.charCodeAt(0)));
        console.log('Cleaned char codes:', Array.from(cleanedText).map(c => c.charCodeAt(0)));
        
        // Common key patterns - updated to match actual key types in the system
        const keyPatterns = [
            // Parentheses format (from AI responses) - specific patterns for each key type
            { pattern: /^\(([A-G]#?b?)\s+(Major|major)\)$/i, type: 'major' },
            { pattern: /^\(([A-G]#?b?)\s+(Minor|minor)\)$/i, type: 'natural-minor' },
            { pattern: /^\(([A-G]#?b?)\s+(Harmonic\s+Minor|harmonic\s+minor)\)$/i, type: 'harmonic-minor' },
            { pattern: /^\(([A-G]#?b?)\s+(Melodic\s+Minor|melodic\s+minor)\)$/i, type: 'melodic-minor' },
            { pattern: /^\(([A-G]#?b?)\s+(Dorian|dorian)\)$/i, type: 'dorian' },
            { pattern: /^\(([A-G]#?b?)\s+(Phrygian|phrygian)\)$/i, type: 'phrygian' },
            { pattern: /^\(([A-G]#?b?)\s+(Lydian|lydian)\)$/i, type: 'lydian' },
            { pattern: /^\(([A-G]#?b?)\s+(Mixolydian|mixolydian)\)$/i, type: 'mixolydian' },
            { pattern: /^\(([A-G]#?b?)\s+(Locrian|locrian)\)$/i, type: 'locrian' },
            { pattern: /^\(([A-G]#?b?)\s+(Major\s+Pentatonic|major\s+pentatonic)\)$/i, type: 'major-pentatonic' },
            { pattern: /^\(([A-G]#?b?)\s+(Minor\s+Pentatonic|minor\s+pentatonic)\)$/i, type: 'minor-pentatonic' },
            { pattern: /^\(([A-G]#?b?)\s+(Pentatonic|pentatonic)\)$/i, type: 'minor-pentatonic' },
            { pattern: /^\(([A-G]#?b?)\s+(Blues|blues)\)$/i, type: 'blues' },
            { pattern: /^\(([A-G]#?b?)\s+(Chromatic|chromatic)\)$/i, type: 'chromatic' },
            { pattern: /^\(([A-G]#?b?)\s+(Whole\s+Tone|whole\s+tone)\)$/i, type: 'whole-tone' },
            { pattern: /^\(([A-G]#?b?)\s+(Diminished|diminished)\)$/i, type: 'diminished' },
            { pattern: /^\(([A-G]#?b?)\s+(Octatonic|octatonic)\)$/i, type: 'diminished' },
            
            // Standard format (space-separated)
            { pattern: /^([A-G]#?b?)\s+(major|maj)$/i, type: 'major' },
            { pattern: /^([A-G]#?b?)\s+(minor|min|natural-minor|aeolian)$/i, type: 'natural-minor' },
            { pattern: /^([A-G]#?b?)\s+(harmonic-minor|harmonic)$/i, type: 'harmonic-minor' },
            { pattern: /^([A-G]#?b?)\s+(melodic-minor|melodic)$/i, type: 'melodic-minor' },
            { pattern: /^([A-G]#?b?)\s+(dorian)$/i, type: 'dorian' },
            { pattern: /^([A-G]#?b?)\s+(phrygian)$/i, type: 'phrygian' },
            { pattern: /^([A-G]#?b?)\s+(lydian)$/i, type: 'lydian' },
            { pattern: /^([A-G]#?b?)\s+(mixolydian|mixo)$/i, type: 'mixolydian' },
            { pattern: /^([A-G]#?b?)\s+(locrian)$/i, type: 'locrian' },
            { pattern: /^([A-G]#?b?)\s+(major-pentatonic|major-penta)$/i, type: 'major-pentatonic' },
            { pattern: /^([A-G]#?b?)\s+(minor-pentatonic|minor-penta|pentatonic|penta)$/i, type: 'minor-pentatonic' },
            { pattern: /^([A-G]#?b?)\s+(blues)$/i, type: 'blues' },
            { pattern: /^([A-G]#?b?)\s+(chromatic)$/i, type: 'chromatic' },
            { pattern: /^([A-G]#?b?)\s+(whole-tone|whole-tone)$/i, type: 'whole-tone' },
            { pattern: /^([A-G]#?b?)\s+(diminished|octatonic)$/i, type: 'diminished' }
        ];
        
        for (const { pattern, type } of keyPatterns) {
            console.log(`Testing pattern: ${pattern} against "${cleanedText}"`);
            const match = cleanedText.match(pattern);
            if (match) {
                const rootNote = match[1];
                console.log(`✅ Matched pattern: ${pattern}, rootNote: ${rootNote}, type: ${type}`);
                
                // Check if this key type exists in our keys
                if (PitchUtils.keys[type]) {
                    console.log(`Key type ${type} found in keys object`);
                    return {
                        rootNote: rootNote,
                        keyType: type,
                        keyName: PitchUtils.keys[type].name
                    };
                } else {
                    console.log(`Key type ${type} NOT found in keys object`);
                }
            }
        }
        
        console.log('No key pattern matched');
        return null;
    }

    /**
     * Convert note to pitch class (0-11)
     * @param {string} note - Note name (e.g., 'C', 'F#', 'Bb')
     * @returns {number} - Pitch class (0-11)
     */
    noteToPitchClass(note) {
        return PitchUtils.noteToPitchClass(note);
    }
} 