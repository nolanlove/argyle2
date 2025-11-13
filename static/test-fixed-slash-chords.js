// Test script to verify fixed slash chord detection
import { detectChord, chordTypes } from './pitch-utils.js';

// Test cases for fixed slash chord detection
const testCases = [
    {
        name: "EDGD (E2, D3, G3, D4) - E should be bass",
        notes: ['E', 'D', 'G', 'D'],
        actualPitches: [40, 50, 55, 62], // E2, D3, G3, D4
        expected: "G5/E (G power chord with E bass)"
    },
    {
        name: "C/G (C4, E4, G3) - G should be bass",
        notes: ['C', 'E', 'G'],
        actualPitches: [60, 64, 55], // C4, E4, G3
        expected: "C/G (C major with G bass)"
    },
    {
        name: "Dm/F (D4, F3, A3) - F should be bass",
        notes: ['D', 'F', 'A'],
        actualPitches: [62, 53, 57], // D4, F3, A3
        expected: "Dm/F (D minor with F bass)"
    }
];

console.log("Testing fixed slash chord detection:\n");

testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    console.log(`Notes: [${testCase.notes.join(', ')}]`);
    console.log(`Actual pitches: [${testCase.actualPitches.join(', ')}]`);
    console.log(`Expected: ${testCase.expected}`);
    
    try {
        const detectedChords = detectChord(testCase.notes, chordTypes, testCase.actualPitches);
        
        if (detectedChords && detectedChords.length > 0) {
            console.log(`\nAll interpretations: ${detectedChords.map(c => c.fullName).join(' / ')}`);
            
            // Check for slash chords
            const slashChords = detectedChords.filter(c => c.isSlashChord);
            const standardChords = detectedChords.filter(c => !c.isSlashChord);
            
            if (slashChords.length > 0) {
                console.log("✅ SUCCESS: Slash chord(s) detected");
                slashChords.forEach(chord => {
                    console.log(`  - ${chord.rootNote}${chord.chordName}/${chord.bassNote}`);
                });
                
                // Verify only one slash chord interpretation (the lowest pitch as bass)
                if (slashChords.length === 1) {
                    console.log("✅ SUCCESS: Only one slash chord interpretation (correct)");
                } else {
                    console.log(`❌ FAIL: Multiple slash chord interpretations (${slashChords.length})`);
                }
                
                // Check if the bass note is the lowest pitch
                const minPitch = Math.min(...testCase.actualPitches);
                const minPitchIndex = testCase.actualPitches.indexOf(minPitch);
                const lowestPitchNote = testCase.notes[minPitchIndex];
                
                const primarySlashChord = slashChords[0];
                if (primarySlashChord.bassNote === lowestPitchNote) {
                    console.log("✅ SUCCESS: Lowest pitch correctly identified as bass note");
                } else {
                    console.log(`❌ FAIL: Expected bass note ${lowestPitchNote}, got ${primarySlashChord.bassNote}`);
                }
            }
            
            if (standardChords.length > 0) {
                console.log("ℹ️  INFO: Standard chord(s) also detected");
                standardChords.forEach(chord => {
                    console.log(`  - ${chord.fullName}`);
                });
            }
        } else {
            console.log("❌ FAIL: No chord detected");
        }
    } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
    }
    
    console.log(""); // Empty line for readability
});

console.log("Test completed!"); 