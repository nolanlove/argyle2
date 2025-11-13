// Test script to verify slash chord display in sequence
import { detectChord, chordTypes } from './pitch-utils.js';

// Simulate the sequence item creation process
const notes = ['E', 'D', 'G', 'D'];
const actualPitches = [40, 50, 55, 62]; // E2, D3, G3, D4

console.log("Testing slash chord sequence display:");
console.log(`Notes: [${notes.join(', ')}]`);
console.log(`Actual pitches: [${actualPitches.join(', ')}]`);

try {
    const detectedChords = detectChord(notes, chordTypes, actualPitches);
    
    if (detectedChords && detectedChords.length > 0) {
        const detectedChord = detectedChords[0];
        console.log(`\nDetected chord: ${detectedChord.fullName}`);
        console.log(`Is slash chord: ${detectedChord.isSlashChord}`);
        
        if (detectedChord.isSlashChord) {
            console.log(`Root note: ${detectedChord.rootNote}`);
            console.log(`Chord type: ${detectedChord.chordType}`);
            console.log(`Bass note: ${detectedChord.bassNote}`);
        }
        
        // Simulate sequence item creation
        const chordName = detectedChord.fullName;
        const sequenceItem = {
            type: 'chord',
            chordName: chordName,
            isSlashChord: detectedChord.isSlashChord,
            bassNote: detectedChord.bassNote,
            rootNote: detectedChord.rootNote,
            chordType: detectedChord.chordType
        };
        
        console.log(`\nSequence item:`);
        console.log(`  chordName: "${sequenceItem.chordName}"`);
        console.log(`  isSlashChord: ${sequenceItem.isSlashChord}`);
        console.log(`  bassNote: ${sequenceItem.bassNote}`);
        console.log(`  rootNote: ${sequenceItem.rootNote}`);
        console.log(`  chordType: ${sequenceItem.chordType}`);
        
        // Simulate getSequenceItemName function
        const isSlashChord = sequenceItem.chordName && sequenceItem.chordName.includes('/');
        console.log(`\nDisplay logic:`);
        console.log(`  chordName includes '/': ${isSlashChord}`);
        console.log(`  Final display name: "${sequenceItem.chordName}"`);
        
        if (isSlashChord) {
            console.log("✅ SUCCESS: Slash chord will display correctly in sequence");
        } else {
            console.log("❌ FAIL: Slash chord will not display correctly in sequence");
        }
        
    } else {
        console.log("No chord detected");
    }
} catch (error) {
    console.log(`Error: ${error.message}`);
}

console.log("\nTest completed!"); 