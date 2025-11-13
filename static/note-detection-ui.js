/**
 * Note Detection UI Module
 * Handles all UI components and interactions for note detection
 * Independent from the tuner system
 */

export class NoteDetectionUI {
    constructor(noteDetection, musicalGrid) {
        this.noteDetection = noteDetection;
        this.musicalGrid = musicalGrid;
        
        // UI state
        this.isActive = false;
        
        // Scale playing state
        this.isPlayingScale = false;
        this.scalePlaybackIndex = 0;
        this.scalePlaybackPattern = [];
        this.scalePlaybackTimer = null;
        
        // DOM elements
        this.micButton = null;
        this.statusElement = null;
        this.notesContainer = null;
        this.chordsContainer = null;
        this.clearButton = null;
        
        // Initialize UI
        this.createUI();
        this.bindEvents();
        this.setupCallbacks();
    }
    
    /**
     * Create the note detection UI elements
     */
    createUI() {
        // Create main container
        const container = document.createElement('div');
        container.id = 'note-detection-container';
        container.className = 'note-detection-section';
        container.innerHTML = `
            <div class="note-detection-header">
                <h3>Note Detection</h3>
                <div class="note-detection-header-buttons">
                    <label class="checkbox-label">
                        <input type="checkbox" id="limitToKeyCheckbox" checked />
                        <span>Limit to Key</span>
                    </label>
                    <button id="referenceToneBtn" class="btn btn-secondary">
                        ▶ Play Scale
                    </button>
                    <button id="clearNotesChordsBtn" class="btn btn-secondary">
                        🗑️ Clear All
                    </button>
                    <button id="noteDetectionMicBtn" class="btn btn-secondary info-pitch-detect">
                        🎤 Turn on Mic
                    </button>
                </div>
            </div>
            
            <div class="note-detection-content">
                <div class="notes-section">
                    <h4>Detected Notes</h4>
                    <div id="detectedNotesList" class="notes-list">
                        <div class="empty-state">No notes detected yet</div>
                    </div>
                </div>
                
                <div class="chords-section">
                    <h4>Detected Chords</h4>
                    <div id="detectedChordsList" class="chords-list">
                        <div class="empty-state">No chords detected yet</div>
                    </div>
                </div>
            </div>
        `;
        
        // Insert into the musical-content container
        const musicalContent = document.querySelector('.musical-content');
        
        if (musicalContent) {
            // Insert at the end of musical-content (after sequencer, before grid-controls)
            musicalContent.appendChild(container);
        } else {
            console.error('🎵 [NOTE-DETECTION] Could not find .musical-content element');
        }
        
        // Store references to DOM elements
        this.micButton = document.getElementById('noteDetectionMicBtn');
        this.notesContainer = document.getElementById('detectedNotesList');
        this.chordsContainer = document.getElementById('detectedChordsList');
        this.clearButton = document.getElementById('clearNotesChordsBtn');
        this.referenceToneButton = document.getElementById('referenceToneBtn');
        this.limitToKeyCheckbox = document.getElementById('limitToKeyCheckbox');
        
        console.log('🎵 [NOTE-DETECTION] UI elements found:', {
            micButton: !!this.micButton,
            notesContainer: !!this.notesContainer,
            chordsContainer: !!this.chordsContainer,
            clearButton: !!this.clearButton,
            referenceToneButton: !!this.referenceToneButton,
            limitToKeyCheckbox: !!this.limitToKeyCheckbox
        });
        
        // Check if all elements were found
        if (!this.micButton || !this.notesContainer || !this.chordsContainer || !this.clearButton || !this.referenceToneButton || !this.limitToKeyCheckbox) {
            console.error('🎵 [NOTE-DETECTION] Some UI elements were not found. Container may not be properly inserted.');
        }
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Mic button toggle
        if (this.micButton) {
            this.micButton.addEventListener('click', () => {
                this.toggleNoteDetection();
            });
        }
        
        // Clear button
        if (this.clearButton) {
            this.clearButton.addEventListener('click', () => {
                this.clearAll();
            });
        }
        
        // Reference tone button (now scale button)
        if (this.referenceToneButton) {
            this.referenceToneButton.addEventListener('click', () => {
                this.toggleScalePlayback();
            });
        }
        
        // Limit to key checkbox
        if (this.limitToKeyCheckbox) {
            this.limitToKeyCheckbox.addEventListener('change', () => {
                this.onLimitToKeyChanged();
            });
        }
        
        // Cleanup on page unload to ensure microphone is stopped
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        
        // Also cleanup on page visibility change (when user switches tabs)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isActive) {
                console.log('🎵 [NOTE-DETECTION-UI] Page hidden, stopping note detection');
                this.stopNoteDetection();
            }
        });
    }
    
    /**
     * Setup callbacks for note detection events
     */
    setupCallbacks() {
        this.noteDetection.setCallbacks(
            (noteInfo, pitch, confidence) => this.handleNoteDetected(noteInfo, pitch, confidence),
            (chord) => this.handleChordDetected(chord),
            (message, type) => this.updateStatus(message, type)
        );
        
        // Initialize with limit to key enabled
        if (this.noteDetection) {
            this.noteDetection.setLimitToKey(true);
        }
        
        // Update reference tone button text
        this.updateReferenceToneButton();
        
        // Initial chord detection with filtered notes
        this.reRunChordDetectionWithFilteredNotes();
    }
    
    /**
     * Update reference tone button text based on current key
     */
    updateReferenceToneButton() {
        // Update the checkbox label based on current key (button stays static)
        if (!this.referenceToneButton || !this.musicalGrid) return;
        
        const currentKey = this.musicalGrid.currentKey;
        if (currentKey && currentKey.rootNote) {
            // Update the checkbox label to show the current key
            if (this.limitToKeyCheckbox) {
                const checkboxLabel = this.limitToKeyCheckbox.nextElementSibling;
                if (checkboxLabel) {
                    checkboxLabel.textContent = `Limit to Key of ${currentKey.rootNote} ${currentKey.name}`;
                }
            }
        } else {
            // Reset checkbox label to default
            if (this.limitToKeyCheckbox) {
                const checkboxLabel = this.limitToKeyCheckbox.nextElementSibling;
                if (checkboxLabel) {
                    checkboxLabel.textContent = 'Limit to Key';
                }
            }
        }
    }
    
    /**
     * Play reference tone (root of current key)
     */
    toggleScalePlayback() {
        if (this.isPlayingScale) {
            this.stopScalePlayback();
        } else {
            this.startScalePlayback();
        }
    }
    
    startScalePlayback() {
        if (!this.musicalGrid) return;
        
        console.log('🎵 [NOTE-DETECTION] Starting scale playback');
        
        this.isPlayingScale = true;
        this.scalePlaybackIndex = 0;
        
        // Get the current key context
        const currentKey = this.musicalGrid.currentKey;
        let rootNote, keyType;
        
        if (currentKey && currentKey.rootNote && currentKey.name) {
            rootNote = currentKey.rootNote;
            keyType = currentKey.name;
            console.log('🎵 [NOTE-DETECTION] Using current key context:', rootNote, keyType);
        } else {
            // Fallback to DOM selectors if no current key context
            const rootNoteSelect = document.getElementById('keyRootSelect');
            const keyTypeSelect = document.getElementById('keyTypeSelect');
            rootNote = rootNoteSelect ? rootNoteSelect.value.split('/')[0] : 'C';
            keyType = keyTypeSelect ? keyTypeSelect.value : 'major';
            console.log('🎵 [NOTE-DETECTION] Using DOM selectors (fallback):', rootNote, keyType);
        }
        
        // Create the ascending scale pattern using pure pitch calculations
        const rootPitchClass = this.musicalGrid.noteToPitchClass(rootNote);
        const PitchUtils = window.PitchUtils || globalThis.PitchUtils;
        this.scalePlaybackPattern = PitchUtils.generateAscendingScalePattern(rootPitchClass, keyType, this.musicalGrid.keys, 3);
        console.log('🎵 [NOTE-DETECTION] Scale pattern created (pitches):', this.scalePlaybackPattern);
        
        // Start sequential playback
        this.playNextScaleNote();
        
        // Update button
        this.updateScaleButton();
    }
    
    playNextScaleNote() {
        if (!this.isPlayingScale || this.scalePlaybackIndex >= this.scalePlaybackPattern.length) {
            this.stopScalePlayback();
            return;
        }
        
        const pitch = this.scalePlaybackPattern[this.scalePlaybackIndex];
        const note = this.musicalGrid.pitchClassToNote(pitch % 12, false);
        const octave = Math.floor(pitch / 12);
        
        console.log('🎵 [NOTE-DETECTION] Playing scale note:', note, octave, 'at index:', this.scalePlaybackIndex);
        
        // Play the note
        this.musicalGrid.playNote(note, octave, 1.0);
        
        // Schedule next note
        this.scalePlaybackIndex++;
        this.scalePlaybackTimer = setTimeout(() => {
            this.playNextScaleNote();
        }, 1000); // 1 second interval
    }
    
    stopScalePlayback() {
        console.log('🎵 [NOTE-DETECTION] Stopping scale playback');
        
        this.isPlayingScale = false;
        
        if (this.scalePlaybackTimer) {
            clearTimeout(this.scalePlaybackTimer);
            this.scalePlaybackTimer = null;
        }
        
        // Stop all notes
        if (this.musicalGrid.piano) {
            this.musicalGrid.piano.releaseAll();
        }
        
        // Update button
        this.updateScaleButton();
    }
    
    updateScaleButton() {
        if (this.referenceToneButton) {
            if (this.isPlayingScale) {
                this.referenceToneButton.textContent = '⏹ Stop Scale';
                this.referenceToneButton.classList.add('playing');
            } else {
                this.referenceToneButton.textContent = '▶ Play Scale';
                this.referenceToneButton.classList.remove('playing');
            }
        }
    }
    
    /**
     * Toggle note detection on/off
     */
    async toggleNoteDetection() {
        console.log('🎵 [NOTE-DETECTION] Toggle button clicked, current state:', this.isActive);
        if (this.isActive) {
            await this.stopNoteDetection();
        } else {
            await this.startNoteDetection();
        }
    }
    
    /**
     * Start note detection
     */
    async startNoteDetection() {
        console.log('🎵 [NOTE-DETECTION] Starting note detection...');
        try {
            const success = await this.noteDetection.initAudio();
            console.log('🎵 [NOTE-DETECTION] Audio init result:', success);
            if (success) {
                this.noteDetection.startDetection();
                this.isActive = true;
                this.updateMicButton();
                console.log('🎵 [NOTE-DETECTION] Note detection started successfully');
            } else {
                console.error('🎵 [NOTE-DETECTION] Failed to initialize audio');
            }
        } catch (error) {
            console.error('🎵 [NOTE-DETECTION] Error starting note detection:', error);
        }
    }
    
    /**
     * Stop note detection
     */
    async stopNoteDetection() {
        console.log('🎵 [NOTE-DETECTION-UI] Stopping note detection');
        
        if (this.noteDetection) {
            this.noteDetection.stopDetection();
        }
        
        this.isActive = false;
        this.updateMicButton();
        
        // Update status
        this.updateStatus('Note detection stopped', 'info');
    }
    
    /**
     * Cleanup resources when the page is unloaded
     */
    cleanup() {
        console.log('🎵 [NOTE-DETECTION-UI] Cleaning up resources');
        
        // Stop scale playback if active
        if (this.isPlayingScale) {
            this.stopScalePlayback();
        }
        
        if (this.noteDetection) {
            this.noteDetection.destroy();
        }
    }
    
    /**
     * Update mic button appearance
     */
    updateMicButton() {
        if (this.isActive) {
            this.micButton.textContent = '🎤 Turn off Mic';
            this.micButton.classList.add('active');
        } else {
            this.micButton.textContent = '🎤 Turn on Mic';
            this.micButton.classList.remove('active');
        }
    }
    
    /**
     * Handle note detected event
     */
    handleNoteDetected(noteInfo, pitch, confidence) {
        console.log(`🎵 Note detected: ${noteInfo.note}${noteInfo.octave} (pitch: ${pitch}, confidence: ${confidence.toFixed(2)})`);
        this.updateNotesDisplay();
        
        // Recalculate chords when a new note is detected
        this.reRunChordDetectionWithFilteredNotes();
    }
    
    /**
     * Handle chord detected event
     */
    handleChordDetected(chord) {
        console.log(`🎸 Chord detected: ${chord.rootNote} ${chord.chordType} (${chord.notes.join(', ')})`);
        this.updateChordsDisplay();
    }
    
    /**
     * Update status display (removed status bar, so this is now a no-op)
     */
    updateStatus(message, type = 'info') {
        // Status bar removed, so this method is now a no-op
        console.log(`🎵 [NOTE-DETECTION] Status: ${message} (${type})`);
    }
    
    /**
     * Update notes display
     */
    updateNotesDisplay() {
        const notes = this.noteDetection.getDetectedNotes();
        
        if (notes.length === 0) {
            this.notesContainer.innerHTML = '<div class="empty-state">No notes detected yet</div>';
            return;
        }
        
        // Sort notes by timestamp (oldest first)
        const sortedNotes = notes.sort((a, b) => a.timestamp - b.timestamp);
        
        // Filter notes if "Limit to Key" is checked
        const limitToKey = this.limitToKeyCheckbox && this.limitToKeyCheckbox.checked;
        let filteredNotes = limitToKey ? sortedNotes.filter(note => this.isNoteInKey(note.note)) : sortedNotes;
        
        // Only show notes with detection count > 20
        filteredNotes = filteredNotes.filter(note => note.count > 20);
        
        if (filteredNotes.length === 0) {
            const filterMessage = limitToKey ? 'No notes in current key with count > 20 detected yet' : 'No notes with count > 20 detected yet';
            this.notesContainer.innerHTML = `<div class="empty-state">${filterMessage}</div>`;
            return;
        }
        
        const notesHTML = filteredNotes.map(note => {
            const noteKey = `${note.note}_${note.octave}`;
            const confidencePercent = Math.round(note.confidence * 100);
            const inKeyClass = limitToKey && this.isNoteInKey(note.note) ? 'in-key' : '';
            
            return `
                <div class="note-item ${inKeyClass}" data-note-key="${noteKey}">
                    <button class="delete-note-btn" data-note-key="${noteKey}">×</button>
                    <div class="note-info">
                        <span class="note-name">${note.note}${note.octave}</span>
                        ${limitToKey && !this.isNoteInKey(note.note) ? '<span class="out-of-key-badge">⚠️ Out of Key</span>' : ''}
                    </div>
                    <div class="note-actions">
                        <button class="btn btn-sm btn-primary play-note-btn" data-note="${note.note}" data-octave="${note.octave}">
                            ▶️ Play
                        </button>
                        <button class="btn btn-sm btn-success add-to-grid-btn" data-note="${note.note}" data-octave="${note.octave}">
                            ➕ Add to Grid
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        this.notesContainer.innerHTML = notesHTML;
        this.bindNoteActions();
    }
    
    /**
     * Update chords display
     */
    updateChordsDisplay() {
        const chords = this.noteDetection.getDetectedChords();
        const notes = this.noteDetection.getDetectedNotes();
        
        console.log('🎵 [UI] updateChordsDisplay called');
        console.log('🎵 [UI] Detected chords:', chords.length);
        console.log('🎵 [UI] Detected notes:', notes.length);
        console.log('🎵 [UI] Notes:', notes.map(n => `${n.note}${n.octave} (count: ${n.count})`));
        
        // Check if we have only one note and should suggest a chord
        const filteredNotes = notes.filter(note => {
            const limitToKey = this.limitToKeyCheckbox && this.limitToKeyCheckbox.checked;
            const inKeyFilter = !limitToKey || this.isNoteInKey(note.note);
            const countFilter = note.count > 20;
            return inKeyFilter && countFilter;
        });
        
        console.log('🎵 [UI] Filtered notes:', filteredNotes.length);
        console.log('🎵 [UI] Filtered notes:', filteredNotes.map(n => `${n.note}${n.octave} (count: ${n.count})`));
        
        // Filter chords if "Limit to Key" is checked (define this early so it's available for title logic)
        const limitToKey = this.limitToKeyCheckbox && this.limitToKeyCheckbox.checked;
        const filteredChords = limitToKey ? chords.filter(chord => this.isChordInKey(chord)) : chords;
        
        let suggestedChord = null;
        let isSuggestionMode = false;
        
        if (filteredNotes.length === 1 && chords.length === 0 && this.musicalGrid) {
            // Single note detected, no chords found - suggest a chord
            console.log('🎵 [UI] Single note detected, suggesting chord');
            console.log('🎵 [UI] Musical grid exists:', !!this.musicalGrid);
            console.log('🎵 [UI] Musical grid object:', this.musicalGrid);
            console.log('🎵 [UI] Current key:', this.musicalGrid.currentKey);
            console.log('🎵 [UI] Musical grid keys property:', this.musicalGrid.keys);
            console.log('🎵 [UI] Musical grid chordTypes property:', this.musicalGrid.chordTypes);
            suggestedChord = this.noteDetection.suggestChordForSingleNote(filteredNotes[0], this.musicalGrid);
            isSuggestionMode = true;
            console.log('🎵 [UI] Suggested chord:', suggestedChord);
        } else {
            console.log('🎵 [UI] Not suggesting chord because:');
            console.log('🎵 [UI] - filteredNotes.length === 1:', filteredNotes.length === 1);
            console.log('🎵 [UI] - chords.length === 0:', chords.length === 0);
            console.log('🎵 [UI] - this.musicalGrid exists:', !!this.musicalGrid);
        }
        
        if (chords.length === 0 && !suggestedChord) {
            // Update the section title before showing empty state
            const chordsSectionTitle = this.chordsContainer.parentElement.querySelector('h4');
            if (chordsSectionTitle) {
                const shouldShowSuggestion = filteredNotes.length === 1 && filteredChords.length === 0 && suggestedChord;
                const newTitle = shouldShowSuggestion ? 'Suggested Chords' : 'Detected Chords';
                
                console.log('🎵 [UI] Title switching logic (empty state):');
                console.log('🎵 [UI] - filteredNotes.length:', filteredNotes.length);
                console.log('🎵 [UI] - filteredChords.length:', filteredChords.length);
                console.log('🎵 [UI] - suggestedChord exists:', !!suggestedChord);
                console.log('🎵 [UI] - shouldShowSuggestion:', shouldShowSuggestion);
                console.log('🎵 [UI] - current title:', chordsSectionTitle.textContent);
                console.log('🎵 [UI] - new title:', newTitle);
                
                chordsSectionTitle.textContent = newTitle;
                console.log('🎵 [UI] Updated section title to:', chordsSectionTitle.textContent);
            }
            
            const filterMessage = this.limitToKeyCheckbox && this.limitToKeyCheckbox.checked ? 
                'No chords in current key detected yet' : 'No chords detected yet';
            this.chordsContainer.innerHTML = `<div class="empty-state">${filterMessage}</div>`;
            return;
        }
        
        // Combine detected chords with suggested chord
        const allChords = [...filteredChords];
        if (suggestedChord) {
            allChords.push(suggestedChord);
        }
        
        console.log('🎵 [UI] All chords (detected + suggested):', allChords.length);
        
        if (allChords.length === 0) {
            const filterMessage = limitToKey ? 'No chords in current key detected yet' : 'No chords detected yet';
            this.chordsContainer.innerHTML = `<div class="empty-state">${filterMessage}</div>`;
            return;
        }
        
        // Update the section title based on whether we're showing suggestions
        // Only show "Suggested Chords" if we have exactly one note AND no detected chords
        const chordsSectionTitle = this.chordsContainer.parentElement.querySelector('h4');
        if (chordsSectionTitle) {
            const shouldShowSuggestion = filteredNotes.length === 1 && filteredChords.length === 0 && suggestedChord;
            const newTitle = shouldShowSuggestion ? 'Suggested Chords' : 'Detected Chords';
            
            console.log('🎵 [UI] Title switching logic:');
            console.log('🎵 [UI] - filteredNotes.length:', filteredNotes.length);
            console.log('🎵 [UI] - filteredChords.length:', filteredChords.length);
            console.log('🎵 [UI] - suggestedChord exists:', !!suggestedChord);
            console.log('🎵 [UI] - shouldShowSuggestion:', shouldShowSuggestion);
            console.log('🎵 [UI] - current title:', chordsSectionTitle.textContent);
            console.log('🎵 [UI] - new title:', newTitle);
            
            chordsSectionTitle.textContent = newTitle;
            console.log('🎵 [UI] Updated section title to:', chordsSectionTitle.textContent);
        }
        
        const chordsHTML = allChords.map(chord => {
            const chordKey = `${chord.rootNote}_${chord.chordType}_${chord.pitches.join('_')}`;
            const chordName = chord.fullName || `${chord.rootNote} ${chord.chordType}`;
            const inKeyClass = limitToKey && this.isChordInKey(chord) ? 'in-key' : '';
            const suggestionClass = chord.isSuggestion ? 'suggestion' : '';
            
            console.log('🎵 [UI] Creating chord HTML for:', {
                chordName: chordName,
                fullName: chord.fullName,
                rootNote: chord.rootNote,
                chordType: chord.chordType,
                notes: chord.notes,
                pitches: chord.pitches,
                isSlashChord: chord.isSlashChord,
                bassNote: chord.bassNote
            });
            
            // Create note names with octaves and sort by pitch
            const notesWithOctaves = chord.notes.map((note, index) => {
                const pitch = chord.pitches[index];
                const octave = Math.floor(pitch / 12) - 1;
                return `${note}${octave}`;
            }).sort((a, b) => {
                // Sort by pitch (lowest to highest)
                const pitchA = this.musicalGrid.noteToPitchClass(a.slice(0, -1)) + (parseInt(a.slice(-1)) * 12);
                const pitchB = this.musicalGrid.noteToPitchClass(b.slice(0, -1)) + (parseInt(b.slice(-1)) * 12);
                return pitchA - pitchB;
            });
            
            const chordDataJSON = JSON.stringify(chord);
            console.log('🎵 [UI] Storing chord data in HTML:', chordDataJSON);
            
            return `
                <div class="chord-item ${inKeyClass} ${suggestionClass}" data-chord-key="${chordKey}" data-chord-data='${chordDataJSON}'>
                    <div class="chord-info">
                        <span class="chord-name">${chordName}</span>
                        <span class="chord-notes">(${notesWithOctaves.join(', ')})</span>
                        ${limitToKey && !this.isChordInKey(chord) ? '<span class="out-of-key-badge">⚠️ Out of Key</span>' : ''}
                    </div>
                    <div class="chord-actions">
                        <button class="btn btn-sm btn-primary play-chord-btn" data-chord-key="${chordKey}">
                            ▶️ Play
                        </button>
                        <button class="btn btn-sm btn-success add-chord-to-grid-btn" data-chord-key="${chordKey}">
                            ➕ Add to Grid
                        </button>
                        <button class="btn btn-sm btn-info add-chord-to-sequence-btn" data-chord-key="${chordKey}">
                            📝 Add to Sequence
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        this.chordsContainer.innerHTML = chordsHTML;
        this.bindChordActions();
    }
    
    /**
     * Bind note action buttons
     */
    bindNoteActions() {
        // Play note buttons
        this.notesContainer.querySelectorAll('.play-note-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const note = e.target.dataset.note;
                const octave = parseInt(e.target.dataset.octave);
                this.playNote(note, octave);
            });
        });
        
        // Add to grid buttons
        this.notesContainer.querySelectorAll('.add-to-grid-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const note = e.target.dataset.note;
                const octave = parseInt(e.target.dataset.octave);
                this.addNoteToGrid(note, octave);
            });
        });
        
        // Delete note buttons
        this.notesContainer.querySelectorAll('.delete-note-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const noteKey = e.target.dataset.noteKey;
                this.removeNote(noteKey);
            });
        });
    }
    
    /**
     * Bind chord action buttons
     */
    bindChordActions() {
        // Play chord buttons
        this.chordsContainer.querySelectorAll('.play-chord-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const chordKey = e.target.dataset.chordKey;
                const chordItem = e.target.closest('.chord-item');
                const chordData = chordItem.dataset.chordData ? JSON.parse(chordItem.dataset.chordData) : null;
                this.playChord(chordKey, chordData);
            });
        });
        
        // Add chord to grid buttons
        this.chordsContainer.querySelectorAll('.add-chord-to-grid-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const chordKey = e.target.dataset.chordKey;
                const chordItem = e.target.closest('.chord-item');
                const chordData = chordItem.dataset.chordData ? JSON.parse(chordItem.dataset.chordData) : null;
                this.addChordToGrid(chordKey, chordData);
            });
        });
        
        // Add chord to sequence buttons
        this.chordsContainer.querySelectorAll('.add-chord-to-sequence-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const chordKey = e.target.dataset.chordKey;
                const chordItem = e.target.closest('.chord-item');
                const chordData = chordItem.dataset.chordData ? JSON.parse(chordItem.dataset.chordData) : null;
                this.addChordToSequence(chordKey, chordData);
            });
        });
    }
    
    /**
     * Play a note
     */
    playNote(note, octave) {
        if (this.musicalGrid && this.musicalGrid.playNote) {
            this.musicalGrid.playNote(note, octave);
        }
    }
    
    /**
     * Add a note to the grid
     */
    addNoteToGrid(note, octave) {
        console.log('🎵 [ADD-NOTE] Starting addNoteToGrid', {
            note: note,
            octave: octave,
            musicalGridExists: !!this.musicalGrid,
            toggleNoteExists: !!(this.musicalGrid && this.musicalGrid.toggleNote)
        });
        
        // First play the note
        this.playNote(note, octave);
        
        // Then add to grid (append mode)
        if (this.musicalGrid && this.musicalGrid.toggleNote) {
            console.log('🎵 [ADD-NOTE] Before toggleNote - current activeNotes:', Array.from(this.musicalGrid.activeNotes || []));
            
            // Find coordinates for this note to get proper dark green styling
            const noteWithOctave = `${note}${octave}`;
            const coordinates = this.musicalGrid.getCoordinatesForNoteInOctave(note, octave);
            
            console.log('🎵 [ADD-NOTE] Found coordinates for note:', {
                noteWithOctave: noteWithOctave,
                coordinates: coordinates
            });
            
            // Smart clone selection: choose the best clone index
            let bestCoord = null;
            if (coordinates && coordinates.length > 0) {
                // If there are existing notes, use Manhattan distance to find the best clone
                const existingNotes = Array.from(this.musicalGrid.activeNotes || []);
                if (existingNotes.length > 0) {
                    // Find the closest existing note coordinate
                    let minDistance = Infinity;
                    for (const coord of coordinates) {
                        for (const existingNote of existingNotes) {
                            const existingCoords = this.musicalGrid.actualClickedNotes.get(existingNote);
                            if (existingCoords) {
                                const distance = Math.abs(coord.x - existingCoords.x) + Math.abs(coord.y - existingCoords.y);
                                if (distance < minDistance) {
                                    minDistance = distance;
                                    bestCoord = coord;
                                }
                            }
                        }
                    }
                } else {
                    // If this is the first note, choose the clone closest to the center
                    const gridCenter = { x: 3.5, y: 3.5 }; // Center of 8x8 grid
                    let minDistanceToCenter = Infinity;
                    
                    for (const coord of coordinates) {
                        const distanceToCenter = Math.abs(coord.x - gridCenter.x) + Math.abs(coord.y - gridCenter.y);
                        if (distanceToCenter < minDistanceToCenter) {
                            minDistanceToCenter = distanceToCenter;
                            bestCoord = coord;
                        }
                    }
                    
                    console.log('🎵 [ADD-NOTE] First note - selected clone closest to center:', {
                        gridCenter: gridCenter,
                        selectedCoord: bestCoord,
                        distanceToCenter: minDistanceToCenter
                    });
                }
                
                // If no best coordinate found (no existing notes or no coordinates), use the first one
                if (!bestCoord) {
                    bestCoord = coordinates[0];
                }
                
                console.log('🎵 [ADD-NOTE] Selected best coordinate:', bestCoord);
                this.musicalGrid.toggleNote(note, bestCoord.x, bestCoord.y, octave);
            } else {
                // Fallback: add without coordinates (will be light green)
                console.log('🎵 [ADD-NOTE] No coordinates found, adding without coordinates');
                this.musicalGrid.toggleNote(note, null, null, octave);
            }
            
            console.log('🎵 [ADD-NOTE] After toggleNote - current activeNotes:', Array.from(this.musicalGrid.activeNotes || []));
            
            // Check if the note was actually added
            const wasAdded = this.musicalGrid.activeNotes && this.musicalGrid.activeNotes.has(noteWithOctave);
            console.log('🎵 [ADD-NOTE] Note addition result:', {
                noteWithOctave: noteWithOctave,
                wasAdded: wasAdded,
                activeNotesSize: this.musicalGrid.activeNotes ? this.musicalGrid.activeNotes.size : 0
            });
        } else {
            console.error('🎵 [ADD-NOTE] Musical grid or toggleNote method not available');
        }
    }
    
    /**
     * Play a chord
     */
    playChord(chordKey, chordData) {
        const chord = chordData || this.noteDetection.detectedChords.get(chordKey);
        if (chord && this.musicalGrid) {
            // Play each note in the chord
            chord.notes.forEach((note, index) => {
                const pitch = chord.pitches[index];
                const octave = Math.floor(pitch / 12) - 1;
                this.playNote(note, octave);
            });
        }
    }
    
    /**
     * Add a chord to the grid (replaces current grid content)
     */
    addChordToGrid(chordKey, chordData) {
        console.log('🎵 [ADD-CHORD] Starting addChordToGrid', {
            chordKey: chordKey,
            musicalGridExists: !!this.musicalGrid,
            fillGridExists: !!(this.musicalGrid && this.musicalGrid.fillGrid),
            toggleNoteExists: !!(this.musicalGrid && this.musicalGrid.toggleNote)
        });
        
        const chord = chordData || this.noteDetection.detectedChords.get(chordKey);
        if (chord && this.musicalGrid) {
            console.log('🎵 [ADD-CHORD] Chord details:', {
                rootNote: chord.rootNote,
                chordType: chord.chordType,
                notes: chord.notes,
                pitches: chord.pitches,
                fullName: chord.fullName
            });
            
            // First play the chord
            this.playChord(chordKey, chord);
            
            // Clear current grid
            if (this.musicalGrid.fillGrid) {
                console.log('🎵 [ADD-CHORD] Clearing current grid');
                this.musicalGrid.fillGrid(false);
                console.log('🎵 [ADD-CHORD] After clearing - activeNotes:', Array.from(this.musicalGrid.activeNotes || []));
            }
            
            // Add each note to the grid
            console.log('🎵 [ADD-CHORD] Adding notes to grid:');
            
            // Convert chord notes to absolute pitches for Manhattan distance optimization
            const chordPitchesArray = chord.notes.map((note, index) => {
                const pitch = chord.pitches[index];
                return pitch;
            });
            
            console.log('🎵 [ADD-CHORD] Chord pitches for optimization:', chordPitchesArray);
            
            // Use Manhattan distance optimization to select the best clone indices
            const PitchUtils = window.PitchUtils || globalThis.PitchUtils;
            if (PitchUtils && PitchUtils.selectChordClonesManhattan) {
                // Check if this is the first chord being added to an empty grid
                const existingNotes = Array.from(this.musicalGrid.activeNotes || []);
                let manhattanClones;
                
                if (existingNotes.length === 0) {
                    // For the first chord, try to position it near the center
                    console.log('🎵 [ADD-CHORD] First chord - positioning near center');
                    
                    // Use a preferred root clone index that's closer to center
                    // Clone index 0 is typically closest to center for most notes
                    const preferredCloneIndices = [0]; // Prefer clone 0 for root note
                    manhattanClones = PitchUtils.selectChordClonesManhattan(
                        chordPitchesArray,
                        PitchUtils.getOriginPitch(),
                        8, 8, // grid dimensions
                        preferredCloneIndices
                    );
                } else {
                    // For subsequent chords, use standard Manhattan distance optimization
                    console.log('🎵 [ADD-CHORD] Subsequent chord - using Manhattan distance optimization');
                    manhattanClones = PitchUtils.selectChordClonesManhattan(
                        chordPitchesArray,
                        PitchUtils.getOriginPitch(),
                        8, 8 // grid dimensions
                    );
                }
                
                console.log('🎵 [ADD-CHORD] Manhattan selection result:', manhattanClones);
                
                // Add notes using the optimized coordinates
                manhattanClones.forEach((clone, index) => {
                    const note = chord.notes[index];
                    const pitch = chord.pitches[index];
                    const octave = Math.floor(pitch / 12) - 1;
                    const noteWithOctave = `${note}${octave}`;
                    
                    console.log('🎵 [ADD-CHORD] Adding note with optimized coordinates:', {
                        note: note,
                        pitch: pitch,
                        octave: octave,
                        noteWithOctave: noteWithOctave,
                        coord: clone.coord
                    });
                    
                    if (this.musicalGrid.toggleNote) {
                        this.musicalGrid.toggleNote(note, clone.coord.x, clone.coord.y, octave);
                    }
                });
            } else {
                // Fallback: use simple coordinate selection
                chord.notes.forEach((note, index) => {
                    const pitch = chord.pitches[index];
                    const octave = Math.floor(pitch / 12) - 1;
                    const noteWithOctave = `${note}${octave}`;
                    
                    console.log('🎵 [ADD-CHORD] Adding note (fallback):', {
                        note: note,
                        pitch: pitch,
                        octave: octave,
                        noteWithOctave: noteWithOctave
                    });
                    
                    if (this.musicalGrid.toggleNote) {
                        // Find coordinates for this note to get proper dark green styling
                        const coordinates = this.musicalGrid.getCoordinatesForNoteInOctave(note, octave);
                        
                        console.log('🎵 [ADD-CHORD] Found coordinates for note:', {
                            noteWithOctave: noteWithOctave,
                            coordinates: coordinates
                        });
                        
                        // Add note with coordinates for proper styling
                        if (coordinates && coordinates.length > 0) {
                            // Use the first available coordinate
                            const coord = coordinates[0];
                            this.musicalGrid.toggleNote(note, coord.x, coord.y, octave);
                        } else {
                            // Fallback: add without coordinates (will be light green)
                            this.musicalGrid.toggleNote(note, null, null, octave);
                        }
                    }
                });
            }
            
            console.log('🎵 [ADD-CHORD] After adding all notes - activeNotes:', Array.from(this.musicalGrid.activeNotes || []));
            
            // Verify all notes were added
            const expectedNotes = chord.notes.map((note, index) => {
                const pitch = chord.pitches[index];
                const octave = Math.floor(pitch / 12) - 1;
                return `${note}${octave}`;
            });
            
            const actualNotes = Array.from(this.musicalGrid.activeNotes || []);
            const missingNotes = expectedNotes.filter(note => !actualNotes.includes(note));
            
            console.log('🎵 [ADD-CHORD] Verification:', {
                expectedNotes: expectedNotes,
                actualNotes: actualNotes,
                missingNotes: missingNotes,
                allAdded: missingNotes.length === 0
            });
        } else {
            console.error('🎵 [ADD-CHORD] Chord not found or musical grid not available', {
                chordFound: !!chord,
                musicalGridExists: !!this.musicalGrid
            });
        }
    }
    
    /**
     * Add a chord to the sequencer
     */
    addChordToSequence(chordKey, chordData) {
        console.log('🎵 [ADD-TO-SEQUENCE] Starting addChordToSequence');
        console.log('🎵 [ADD-TO-SEQUENCE] chordKey:', chordKey);
        console.log('🎵 [ADD-TO-SEQUENCE] chordData:', chordData);
        
        const chord = chordData || this.noteDetection.detectedChords.get(chordKey);
        console.log('🎵 [ADD-TO-SEQUENCE] Final chord object:', chord);
        
        if (chord && this.musicalGrid && this.musicalGrid.sequencer) {
            // Use the proper chord name from the detected chord
            const chordName = chord.fullName || `${chord.rootNote} ${chord.chordType}`;
            console.log('🎵 [ADD-TO-SEQUENCE] Using chordName:', chordName);
            console.log('🎵 [ADD-TO-SEQUENCE] chord.fullName:', chord.fullName);
            console.log('🎵 [ADD-TO-SEQUENCE] chord.rootNote:', chord.rootNote);
            console.log('🎵 [ADD-TO-SEQUENCE] chord.chordType:', chord.chordType);
            
            const sequenceItem = {
                type: 'chord',
                chordName: chordName,
                rootNote: chord.rootNote,
                chordType: chord.chordType,
                notes: chord.notes,
                pitches: chord.pitches,
                duration: 2.0
            };
            
            // Add slash chord information if present
            if (chord.isSlashChord && chord.bassNote) {
                sequenceItem.isSlashChord = true;
                sequenceItem.bassNote = chord.bassNote;
            }
            
            console.log('🎵 [ADD-TO-SEQUENCE] Created sequenceItem:', sequenceItem);
            
            // Temporarily disable automatic chord detection to prevent interference
            const originalDetectAndDisplayChord = this.musicalGrid.detectAndDisplayChord;
            this.musicalGrid.detectAndDisplayChord = () => {
                console.log('🎵 [ADD-TO-SEQUENCE] Temporarily disabled chord detection during sequence addition');
            };
            
            // Add the sequence item
            this.musicalGrid.sequencer.addItem(sequenceItem);
            
            // Re-enable automatic chord detection
            this.musicalGrid.detectAndDisplayChord = originalDetectAndDisplayChord;
            
            // Update sequencer display
            if (this.musicalGrid.updateSequenceDisplay) {
                this.musicalGrid.updateSequenceDisplay();
            }
            
            // Show notification
            if (this.musicalGrid.showNotification) {
                this.musicalGrid.showNotification(`Added ${chordName} to sequence`, 'success');
            }
        }
    }
    
    /**
     * Clear all detected notes and chords
     */
    clearAll() {
        this.noteDetection.clearAll();
        this.updateNotesDisplay();
        this.updateChordsDisplay();
        this.updateStatus('Cleared all notes and chords', 'info');
    }
    
    /**
     * Remove a specific note
     */
    removeNote(noteKey) {
        // Remove the note
        this.noteDetection.removeNote(noteKey);
        
        // Recalculate chords from scratch
        this.reRunChordDetectionWithFilteredNotes();
        
        this.updateNotesDisplay();
        this.updateChordsDisplay();
    }
    
    /**
     * Remove a specific chord
     */
    removeChord(chordKey) {
        this.noteDetection.removeChord(chordKey);
        this.updateChordsDisplay();
    }
    
    /**
     * Get the UI container element
     */
    getContainer() {
        return document.getElementById('note-detection-container');
    }
    
    /**
     * Show/hide the note detection UI
     */
    setVisible(visible) {
        const container = this.getContainer();
        if (container) {
            container.style.display = visible ? 'block' : 'none';
        }
    }
    
    /**
     * Update reference tone button when key changes
     */
    onKeyChanged() {
        this.updateReferenceToneButton();
    }
    
    /**
     * Handle limit to key checkbox change
     */
    onLimitToKeyChanged() {
        const limitToKey = this.limitToKeyCheckbox.checked;
        console.log('🎵 [NOTE-DETECTION] Limit to key changed:', limitToKey);
        
        // Update the note detection filter
        if (this.noteDetection) {
            this.noteDetection.setLimitToKey(limitToKey);
        }
        
        // Re-run chord detection with filtered notes
        this.reRunChordDetectionWithFilteredNotes();
        
        // Update displays
        this.updateNotesDisplay();
        this.updateChordsDisplay();
    }
    
    /**
     * Re-run chord detection with filtered notes and update display
     */
    reRunChordDetectionWithFilteredNotes() {
        console.log('🎵 [UI] Re-running chord detection with filtered notes');
        
        // Clear existing chords
        this.noteDetection.clearChords();
        
        // Get filtered notes (apply same filtering as display methods)
        const allNotes = this.noteDetection.getDetectedNotes();
        const limitToKey = this.limitToKeyCheckbox && this.limitToKeyCheckbox.checked;
        let filteredNotes = limitToKey ? allNotes.filter(note => this.isNoteInKey(note.note)) : allNotes;
        
        // Only use notes with detection count > 20 (same as display filtering)
        filteredNotes = filteredNotes.filter(note => note.count > 20);
        
        console.log('🎵 [UI] Filtered notes for chord detection:', filteredNotes.map(n => n.note + n.octave));
        
        if (filteredNotes.length >= 2) {
            // Run chord detection with filtered notes
            this.noteDetection.detectChordsFromNotes(filteredNotes);
        }
        
        // Update displays
        this.updateNotesDisplay();
        this.updateChordsDisplay();
    }
    
    /**
     * Check if a note is in the current key
     */
    isNoteInKey(note) {
        if (!this.musicalGrid || !this.musicalGrid.currentKey) {
            return true; // If no key is set, allow all notes
        }
        
        const currentKey = this.musicalGrid.currentKey;
        return this.musicalGrid.isPitchInKey(
            this.musicalGrid.noteToPitchClass(note), 
            currentKey.rootNote, 
            currentKey.name
        );
    }
    
    /**
     * Check if a chord is in the current key (all notes must be in key)
     */
    isChordInKey(chord) {
        if (!chord.notes || chord.notes.length === 0) {
            return true; // Empty chord is considered in key
        }
        
        return chord.notes.every(note => this.isNoteInKey(note));
    }
} 