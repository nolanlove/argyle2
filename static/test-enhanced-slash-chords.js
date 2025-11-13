// Test script to verify enhanced slash chord detection
import { detectChord, chordTypes } from './pitch-utils.js';

// Test cases for enhanced slash chord detection
const testCases = [
    {
        name: "C/G (C-E-G with G as lowest pitch)",
        notes: ['C', 'E', 'G'],
        actualPitches: [60, 64, 55], // C4, E4, G3 (G is lowest)
        expected: "C/G (C major with G bass)"
    },
    {
        name: "Dm/F (D-F-A with F as lowest pitch)",
        notes: ['D', 'F', 'A'],
        actualPitches: [62, 53, 57], // D4, F3, A3 (F is lowest)
        expected: "Dm/F (D minor with F bass)"
    },
    {
        name: "G/B (G-B-D with B as lowest pitch)",
        notes: ['G', 'B', 'D'],
        actualPitches: [67, 47, 62], // G4, B2, D4 (B is lowest)
        expected: "G/B (G major with B bass)"
    },
    {
        name: "Am/C (A-C-E with C as lowest pitch)",
        notes: ['A', 'C', 'E'],
        actualPitches: [69, 48, 64], // A4, C3, E4 (C is lowest)
        expected: "Am/C (A minor with C bass)"
    },
    {
        name: "F/A (F-A-C with A as lowest pitch)",
        notes: ['F', 'A', 'C'],
        actualPitches: [65, 45, 60], // F4, A2, C4 (A is lowest)
        expected: "F/A (F major with A bass)"
    },
    {
        name: "C maj (C-E-G with C as lowest pitch - should NOT be slash chord)",
        notes: ['C', 'E', 'G'],
        actualPitches: [48, 52, 55], // C3, E3, G3 (C is lowest)
        expected: "C maj (standard chord, no slash needed)"
    }
];

console.log("Testing enhanced slash chord detection:\n");

testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    console.log(`Notes: [${testCase.notes.join(', ')}]`);
    console.log(`Actual pitches: [${testCase.actualPitches.join(', ')}]`);
    console.log(`Expected: ${testCase.expected}`);
    
    try {
        const detectedChords = detectChord(testCase.notes, chordTypes, testCase.actualPitches);
        
        if (detectedChords && detectedChords.length > 0) {
            console.log(`All interpretations: ${detectedChords.map(c => c.fullName).join(' / ')}`);
            
            const primaryChord = detectedChords[0];
            console.log(`Primary result: ${primaryChord.fullName}`);
            
            // Check if any slash chords were detected
            const slashChords = detectedChords.filter(c => c.isSlashChord);
            const standardChords = detectedChords.filter(c => !c.isSlashChord);
            
            if (slashChords.length > 0) {
                console.log("✅ SUCCESS: Slash chord(s) detected");
                slashChords.forEach(chord => {
                    console.log(`  - ${chord.rootNote}${chord.chordName}/${chord.bassNote}`);
                });
            }
            
            if (standardChords.length > 0) {
                console.log("ℹ️  INFO: Standard chord(s) also detected");
                standardChords.forEach(chord => {
                    console.log(`  - ${chord.fullName}`);
                });
            }
            
            // Check if the lowest pitch is correctly identified
            const minPitch = Math.min(...testCase.actualPitches);
            const minPitchIndex = testCase.actualPitches.indexOf(minPitch);
            const lowestPitchNote = testCase.notes[minPitchIndex];
            
            // For slash chords, check if the bass note matches the lowest pitch
            if (slashChords.length > 0) {
                const primarySlashChord = slashChords[0];
                if (primarySlashChord.bassNote === lowestPitchNote) {
                    console.log("✅ SUCCESS: Lowest pitch correctly identified as bass note");
                } else {
                    console.log(`❌ FAIL: Expected bass note ${lowestPitchNote}, got ${primarySlashChord.bassNote}`);
                }
            }
            
            // For standard chords, check if the root matches the lowest pitch
            if (standardChords.length > 0 && slashChords.length === 0) {
                const primaryStandardChord = standardChords[0];
                if (primaryStandardChord.rootNote === lowestPitchNote) {
                    console.log("✅ SUCCESS: Lowest pitch correctly identified as chord root");
                } else {
                    console.log(`❌ FAIL: Expected root ${lowestPitchNote}, got ${primaryStandardChord.rootNote}`);
                }
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