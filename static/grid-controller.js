// Grid Controller - Handles all grid-specific logic and coordinate operations
// This separates grid concerns from pure musical concepts in PitchUtils

import * as PitchUtils from './pitch-utils.js';

export class GridController {
    constructor(gridModel) {
        this.gridModel = gridModel;
    }

    // Get pitch at specific coordinates using the grid's origin
    getPitchAt(x, y) {
        const cell = this.gridModel.getCell(x, y);
        if (cell) {
            return {
                pitch: cell.pitch,
                note: cell.note,
                octave: cell.octave,
                totalSemitones: cell.pitch - this.gridModel.originPitch
            };
        }
        return null;
    }

    // Get note at specific coordinates
    getNoteAt(x, y) {
        const cell = this.gridModel.getCell(x, y);
        return cell ? cell.note : null;
    }

    // Get all coordinates that correspond to a specific note
    getCoordinatesForNote(note) {
        const coords = [];
        const dims = this.gridModel.getDimensions();
        
        for (let y = 0; y < dims.height; y++) {
            for (let x = 0; x < dims.width; x++) {
                const cell = this.gridModel.getCell(x, y);
                if (cell && cell.note === note) {
                    coords.push({ x, y });
                }
            }
        }
        return coords;
    }

    // Get all coordinates for a note in a specific octave
    getCoordinatesForNoteInOctave(note, targetOctave = 3) {
        const coords = [];
        const dims = this.gridModel.getDimensions();
        
        for (let y = 0; y < dims.height; y++) {
            for (let x = 0; x < dims.width; x++) {
                const cell = this.gridModel.getCell(x, y);
                if (cell && cell.note === note && cell.octave === targetOctave) {
                    coords.push({ x, y });
                }
            }
        }
        return coords;
    }

    // Get all clone coordinates for a specific pitch
    getAllCloneCoordsForPitch(pitch) {
        const coords = [];
        const dims = this.gridModel.getDimensions();
        
        for (let y = 0; y < dims.height; y++) {
            for (let x = 0; x < dims.width; x++) {
                const cell = this.gridModel.getCell(x, y);
                if (cell && cell.pitch === pitch) {
                    coords.push({ x, y, cloneIndex: coords.length });
                }
            }
        }
        return coords;
    }

    // Get pitch and clone index from coordinates
    getPitchAndCloneFromCoord(x, y) {
        const cell = this.gridModel.getCell(x, y);
        if (!cell) return null;
        
        const allClones = this.getAllCloneCoordsForPitch(cell.pitch);
        const cloneIndex = allClones.findIndex(coord => coord.x === x && coord.y === y);
        
        return {
            pitch: cell.pitch,
            cloneIndex: cloneIndex >= 0 ? cloneIndex : 0
        };
    }

    // Get coordinates from pitch and clone index
    getCoordFromPitchAndClone(pitch, cloneIndex) {
        const allClones = this.getAllCloneCoordsForPitch(pitch);
        return allClones[cloneIndex] || null;
    }

    // Select chord clones using Manhattan distance
    selectChordClonesManhattan(pitches, preferredCloneIndices = null) {
        const dims = this.gridModel.getDimensions();
        const selectedClones = [];
        
        pitches.forEach((pitch, index) => {
            const allClones = this.getAllCloneCoordsForPitch(pitch);
            
            if (allClones.length === 0) return;
            
            let selectedClone;
            
            if (preferredCloneIndices && preferredCloneIndices[index] !== undefined) {
                // Use preferred clone index if available
                selectedClone = allClones[preferredCloneIndices[index]] || allClones[0];
            } else {
                // Use Manhattan distance to select the best clone
                selectedClone = this.selectBestCloneByManhattan(allClones, selectedClones, dims);
            }
            
            selectedClones.push(selectedClone);
        });
        
        return selectedClones;
    }

    // Select chord clones with specific indices
    selectChordClonesWithIndices(pitches, cloneIndices) {
        const selectedClones = [];
        
        pitches.forEach((pitch, index) => {
            const allClones = this.getAllCloneCoordsForPitch(pitch);
            const cloneIndex = cloneIndices[index] || 0;
            
            if (allClones.length > 0) {
                selectedClones.push(allClones[cloneIndex] || allClones[0]);
            }
        });
        
        return selectedClones;
    }

    // Select best clone using Manhattan distance
    selectBestCloneByManhattan(availableClones, existingClones, dims) {
        if (availableClones.length === 1) return availableClones[0];
        
        let bestClone = availableClones[0];
        let bestScore = Infinity;
        
        availableClones.forEach(clone => {
            let totalDistance = 0;
            
            // Calculate distance to existing clones
            existingClones.forEach(existing => {
                const distance = Math.abs(clone.x - existing.x) + Math.abs(clone.y - existing.y);
                totalDistance += distance;
            });
            
            // Prefer clones closer to center of grid
            const centerX = dims.width / 2;
            const centerY = dims.height / 2;
            const centerDistance = Math.abs(clone.x - centerX) + Math.abs(clone.y - centerY);
            totalDistance += centerDistance * 0.5; // Weight center preference
            
            if (totalDistance < bestScore) {
                bestScore = totalDistance;
                bestClone = clone;
            }
        });
        
        return bestClone;
    }

    // Calculate tonic coordinates for a key
    calculateTonicCoordinates(tonicNote, keyType) {
        const tonicPitch = PitchUtils.getPitchFromNote(tonicNote, 3); // Default to octave 3
        const allTonicCoords = this.getAllCloneCoordsForPitch(tonicPitch);
        
        if (allTonicCoords.length === 0) return null;
        
        // For now, return the first tonic coordinate found
        // This could be enhanced with more sophisticated selection logic
        return allTonicCoords[0];
    }

    // Calculate chromatic position from base coordinate and offset
    calculateChromaticPosition(baseCoord, chromaticOffset) {
        const dims = this.gridModel.getDimensions();
        
        // Calculate target pitch
        const basePitch = this.getPitchAt(baseCoord.x, baseCoord.y);
        if (!basePitch) return null;
        
        const targetPitch = basePitch.pitch + chromaticOffset;
        
        // Find coordinates for target pitch
        const targetCoords = this.getAllCloneCoordsForPitch(targetPitch);
        
        if (targetCoords.length === 0) return null;
        
        // Return the closest coordinate to base
        return this.findClosestCoordinate(baseCoord, targetCoords);
    }

    // Find closest coordinate to reference
    findClosestCoordinate(referenceCoord, coords) {
        if (coords.length === 0) return null;
        if (coords.length === 1) return coords[0];
        
        let closest = coords[0];
        let minDistance = Infinity;
        
        coords.forEach(coord => {
            const distance = Math.abs(coord.x - referenceCoord.x) + Math.abs(coord.y - referenceCoord.y);
            if (distance < minDistance) {
                minDistance = distance;
                closest = coord;
            }
        });
        
        return closest;
    }

    // Calculate all chord button positions for a key
    calculateAllChordButtonPositions(tonicCoord, keyNotes, chordTypes) {
        const positions = [];
        
        keyNotes.forEach((note, index) => {
            const chordType = chordTypes[index];
            if (!chordType) return;
            
            // Calculate position for this key degree
            const position = this.calculateChordPositionForKeyDegree(tonicCoord, index, note, chordType);
            if (position) {
                positions.push({
                    buttonIndex: index,
                    coord: position.coord,
                    note: position.note,
                    chordType: position.chordType,
                    octave: position.octave
                });
            }
        });
        
        return positions;
    }

    // Calculate chord position for a specific key degree
    calculateChordPositionForKeyDegree(tonicCoord, degreeIndex, note, chordType) {
        // Calculate chromatic offset from tonic
        const tonicPitch = this.getPitchAt(tonicCoord.x, tonicCoord.y);
        const notePitch = PitchUtils.getPitchFromNote(note, 3);
        
        if (!tonicPitch || !notePitch) return null;
        
        const chromaticOffset = notePitch - tonicPitch.pitch;
        const coord = this.calculateChromaticPosition(tonicCoord, chromaticOffset);
        
        if (!coord) return null;
        
        return {
            coord: coord,
            note: note,
            chordType: chordType,
            octave: 3
        };
    }

    // Calculate all chord button positions from pitch classes
    calculateAllChordButtonPositionsFromPitchClasses(tonicPitchClass, keyPitchClasses, chordTypes) {
        const positions = [];
        
        // Convert tonic pitch class to note
        const tonicNote = PitchUtils.pitchClassToNote(tonicPitchClass, false);
        
        // Calculate tonic coordinates
        const tonicCoord = this.calculateTonicCoordinates(tonicNote, 'major');
        if (!tonicCoord) return positions;
        
        // Convert key pitch classes to notes
        const keyNotes = keyPitchClasses.map(pitchClass => 
            PitchUtils.pitchClassToNote(pitchClass, false)
        );
        
        // Calculate positions for each key degree
        keyNotes.forEach((note, index) => {
            const chordType = chordTypes[index];
            if (!chordType) return;
            
            const position = this.calculateChordPositionForKeyDegree(tonicCoord, index, note, chordType);
            if (position) {
                positions.push({
                    buttonIndex: index,
                    coord: position.coord,
                    note: position.note,
                    chordType: position.chordType,
                    octave: position.octave
                });
            }
        });
        
        return positions;
    }

    // Stack chord notes with bass note handling
    stackChordNotes(notes, isSlashChord, bassNote) {
        const noteCoords = {};
        const stackedNotes = [];
        
        // Get coordinates for each note
        notes.forEach(note => {
            noteCoords[note] = this.getCoordinatesForNote(note);
        });
        
        if (isSlashChord && bassNote) {
            // Handle slash chord - find best bass note position
            const bassCoords = this.getCoordinatesForNote(bassNote);
            if (bassCoords.length > 0) {
                // Find the lowest bass note position
                let bestBassCoord = bassCoords[0];
                let lowestPitch = this.getPitchAt(bestBassCoord.x, bestBassCoord.y);
                
                bassCoords.forEach(coord => {
                    const pitch = this.getPitchAt(coord.x, coord.y);
                    if (pitch && pitch.pitch < lowestPitch.pitch) {
                        lowestPitch = pitch;
                        bestBassCoord = coord;
                    }
                });
                
                stackedNotes.push({
                    note: bassNote,
                    coord: bestBassCoord,
                    pitch: lowestPitch.pitch
                });
            }
        }
        
        // Stack remaining notes
        notes.forEach(note => {
            const coords = noteCoords[note];
            if (coords.length > 0) {
                // Find the best position for this note
                let bestCoord = coords[0];
                let bestPitch = this.getPitchAt(bestCoord.x, bestCoord.y);
                
                coords.forEach(coord => {
                    const pitch = this.getPitchAt(coord.x, coord.y);
                    if (pitch && pitch.pitch > bestPitch.pitch) {
                        bestPitch = pitch;
                        bestCoord = coord;
                    }
                });
                
                stackedNotes.push({
                    note: note,
                    coord: bestCoord,
                    pitch: bestPitch.pitch
                });
            }
        });
        
        return stackedNotes;
    }

    // Get all note coordinates in the grid
    getAllNoteCoordinates() {
        const noteMap = {};
        const dims = this.gridModel.getDimensions();
        
        for (let y = 0; y < dims.height; y++) {
            for (let x = 0; x < dims.width; x++) {
                const cell = this.gridModel.getCell(x, y);
                if (cell && cell.note) {
                    if (!noteMap[cell.note]) {
                        noteMap[cell.note] = [];
                    }
                    noteMap[cell.note].push({ x, y });
                }
            }
        }
        
        return noteMap;
    }

    // Get all unique pitches in the grid
    getAllGridPitches() {
        const pitchSet = new Set();
        const dims = this.gridModel.getDimensions();
        
        for (let y = 0; y < dims.height; y++) {
            for (let x = 0; x < dims.width; x++) {
                const cell = this.gridModel.getCell(x, y);
                if (cell && cell.pitch !== null) {
                    pitchSet.add(cell.pitch);
                }
            }
        }
        
        return Array.from(pitchSet).sort((a, b) => a - b);
    }
} 