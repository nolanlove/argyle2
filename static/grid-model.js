// Grid Model - Central data model for the musical grid
// Contains only data and pure data access/modification methods

import * as PitchUtils from './pitch-utils.js';

export class GridModel {
    constructor(width = 8, height = 8, originPitch = 36) { // Default to C2 (pitch 36)
        // Grid dimensions
        this.width = width;
        this.height = height;
        
        // Grid configuration
        this.originPitch = originPitch;
        
        // Grid data - 2D array of cells
        this.grid = this.createEmptyGrid(width, height);
        
        // Active state tracking
        this.activeNotes = new Set(); // Track which notes are currently active
        this.keyNotes = new Set(); // Track key notes separately
        this.chordNotes = new Set(); // Track chord notes separately
        this.actualClickedNotes = new Map(); // Track actual clicked coordinates: note -> {x, y}
        
        // Initialize grid with pitch data
        this.populateGridWithPitches();
    }

    // Create an empty grid structure
    createEmptyGrid(width, height) {
        const grid = [];
        for (let y = 0; y < height; y++) {
            grid[y] = [];
            for (let x = 0; x < width; x++) {
                grid[y][x] = {
                    x: x,
                    y: y,
                    active: false,
                    note: null,
                    octave: null,
                    pitch: null
                };
            }
        }
        return grid;
    }

    // Populate grid with pitch data using PitchUtils
    populateGridWithPitches() {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                // Calculate the absolute pitch for this cell using configured origin
                const pitchData = PitchUtils.getPitchAt(x, y, this.originPitch);
                
                // Get note information from pitch
                const noteInfo = PitchUtils.getNoteFromPitch(pitchData.pitch, false); // Use sharps for internal processing
                
                this.grid[y][x] = {
                    x: x,
                    y: y,
                    active: false,
                    note: noteInfo.note,
                    octave: noteInfo.octave,
                    pitch: pitchData.pitch
                };
            }
        }
    }

    // Get grid dimensions
    getDimensions() {
        return {
            width: this.width,
            height: this.height
        };
    }

    // Get grid configuration
    getConfiguration() {
        return {
            originPitch: this.originPitch,
            originNote: PitchUtils.getNoteFromPitch(this.originPitch, false)
        };
    }

    // Check if coordinates are valid
    isValidCoordinate(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    // Get cell at coordinates
    getCell(x, y) {
        if (this.isValidCoordinate(x, y)) {
            return this.grid[y][x];
        }
        return null;
    }

    // Set cell data
    setCell(x, y, data) {
        if (this.isValidCoordinate(x, y)) {
            this.grid[y][x] = { ...this.grid[y][x], ...data };
            return true;
        }
        return false;
    }

    // Get the current state of the grid model
    getState() {
        return {
            width: this.width,
            height: this.height,
            originPitch: this.originPitch,
            activeNotes: Array.from(this.activeNotes),
            keyNotes: Array.from(this.keyNotes),
            chordNotes: Array.from(this.chordNotes),
            actualClickedNotes: Array.from(this.actualClickedNotes.entries())
        };
    }
} 