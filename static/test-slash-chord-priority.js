// Test script to verify slash chord prioritization
import { detectChord, chordTypes } from './pitch-utils.js';

// Test cases where root is not in bass
const testCases = [
    {
        name: "C/G (C-E-G with G as lowest pitch)",
        notes: ['C', 'E', 'G'],
        actualPitches: [60, 64, 55], // C4, E4, G3 (G is lowest)
        expected: "C/G should be prioritized over C maj"
    },
    {
        name: "Dm/F (D-F-A with F as lowest pitch)",
        notes: ['D', 'F', 'A'],
        actualPitches: [62, 53, 57], // D4, F3, A3 (F is lowest)
        expected: "Dm/F should be prioritized over D min"
    },
    {
        name: "G/B (G-B-D with B as lowest pitch)",
        notes: ['G', 'B', 'D'],
        actualPitches: [67, 47, 62], // G4, B2, D4 (B is lowest)
        expected: "G/B should be prioritized over G maj"
    },
    {
        name: "Am/C (A-C-E with C as lowest pitch)",
        notes: ['A', 'C', 'E'],
        actualPitches: [69, 48, 64], // A4, C3, E4 (C is lowest)
        expected: "Am/C should be prioritized over A min"
    },
    {
        name: "F/A (F-A-C with A as lowest pitch)",
        notes: ['F', 'A', 'C'],
        actualPitches: [65, 45, 60], // F4, A2, C4 (A is lowest)
        expected: "F/A should be prioritized over F maj"
    }
];

console.log("Testing slash chord prioritization when root is not in bass:\n");

testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    console.log(`Notes: [${testCase.notes.join(', ')}]`);
    console.log(`Actual pitches: [${testCase.actualPitches.join(', ')}]`);
    console.log(`Expected: ${testCase.expected}`);
    
    try {
        const detectedChords = detectChord(testCase.notes, chordTypes, testCase.actualPitches);
        
        if (detectedChords && detectedChords.length > 0) {
            console.log(`\nAll interpretations: ${detectedChords.map(c => c.fullName).join(' / ')}`);
            
            const primaryChord = detectedChords[0];
            console.log(`Primary result: ${primaryChord.fullName}`);
            
            // Check if slash chord is prioritized
            if (primaryChord.isSlashChord) {
                console.log("✅ SUCCESS: Slash chord is prioritized");
                console.log(`  - ${primaryChord.rootNote}${primaryChord.chordName}/${primaryChord.bassNote}`);
            } else {
                console.log("❌ FAIL: Standard chord is prioritized over slash chord");
                console.log(`  - Got: ${primaryChord.fullName}`);
                
                // Check if there are slash chord alternatives
                const slashChords = detectedChords.filter(c => c.isSlashChord);
                if (slashChords.length > 0) {
                    console.log(`  - Available slash chords: ${slashChords.map(c => c.fullName).join(', ')}`);
                }
            }
            
            // Show all interpretations
            console.log("\nAll interpretations in order:");
            detectedChords.forEach((chord, i) => {
                const type = chord.isSlashChord ? "SLASH" : "STANDARD";
                console.log(`  ${i + 1}. ${chord.fullName} (${type})`);
            });
            
        } else {
            console.log("❌ FAIL: No chord detected");
        }
    } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
    }
    
    console.log(""); // Empty line for readability
});

console.log("Test completed!"); 