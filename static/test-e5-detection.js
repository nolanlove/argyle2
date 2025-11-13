// Test script to verify correct chord detection behavior
import { detectChord, chordTypes } from './pitch-utils.js';

console.log('=== Testing Correct Chord Detection Behavior ===\n');

// Test cases for pitch-utils detectChord (should only consider ALL notes passed)
const testCases = [
    {
        name: 'E5 (2 notes)',
        notes: ['E', 'B'],
        pitches: [4, 11],
        expected: 'E5'
    },
    {
        name: 'E, A#, B (3 notes - should be no chord)',
        notes: ['E', 'A#', 'B'],
        pitches: [4, 10, 11],
        expected: 'no chord'
    },
    {
        name: 'A major (3 notes)',
        notes: ['A', 'C#', 'E'],
        pitches: [9, 1, 4],
        expected: 'A'
    },
    {
        name: 'C major 7th (4 notes)',
        notes: ['C', 'E', 'G', 'B'],
        pitches: [0, 4, 7, 11],
        expected: 'Cmaj7'
    }
];

console.log('=== Testing pitch-utils detectChord (ALL notes only) ===');

testCases.forEach((testCase, index) => {
    console.log(`\n${index + 1}. ${testCase.name}`);
    console.log(`   Notes: [${testCase.notes.join(', ')}]`);
    console.log(`   Expected: ${testCase.expected}`);
    
    const detectedChords = detectChord(testCase.notes, chordTypes, testCase.pitches);
    
    if (detectedChords && detectedChords.length > 0) {
        const result = detectedChords[0].fullName;
        console.log(`   Result: ${result}`);
        if (result === testCase.expected) {
            console.log(`   ✅ CORRECT!`);
        } else {
            console.log(`   ❌ INCORRECT! Expected ${testCase.expected}`);
        }
    } else {
        console.log(`   Result: no chord detected`);
        if (testCase.expected === 'no chord') {
            console.log(`   ✅ CORRECT!`);
        } else {
            console.log(`   ❌ INCORRECT! Expected ${testCase.expected}`);
        }
    }
});

// Test NoteDetection-style combination generation
console.log('\n=== Testing NoteDetection-style combinations ===');

const simulateNoteDetectionCombinations = (notes) => {
    const combinations = [];
    
    // Try 2-note combinations (for power chords)
    for (let i = 0; i <= notes.length - 2; i++) {
        for (let j = i + 1; j < notes.length; j++) {
            combinations.push([notes[i], notes[j]]);
        }
    }
    
    // Try 3-note combinations
    for (let i = 0; i <= notes.length - 3; i++) {
        for (let j = i + 1; j <= notes.length - 2; j++) {
            for (let k = j + 1; k < notes.length; k++) {
                combinations.push([notes[i], notes[j], notes[k]]);
            }
        }
    }
    
    return combinations;
};

// Test with E, A#, B (3 notes)
const testNotes = ['E', 'A#', 'B'];
const testPitches = [4, 10, 11];

console.log(`\nSimulating NoteDetection with: [${testNotes.join(', ')}]`);
const combinations = simulateNoteDetectionCombinations(testNotes);
console.log(`Generated ${combinations.length} combinations`);

console.log('\nTesting each combination with pitch-utils detectChord:');
let foundChords = [];

combinations.forEach((combo, index) => {
    // Get pitches for this combination
    const comboPitches = combo.map(note => {
        const noteIndex = testNotes.indexOf(note);
        return testPitches[noteIndex];
    });
    
    const detectedChords = detectChord(combo, chordTypes, comboPitches);
    
    if (detectedChords && detectedChords.length > 0) {
        console.log(`  ${index + 1}. [${combo.join(', ')}] → ${detectedChords[0].fullName}`);
        foundChords.push({
            chord: detectedChords[0].fullName,
            notes: combo
        });
    }
});

console.log('\n=== Summary ===');
if (foundChords.length > 0) {
    console.log('Chords found by NoteDetection:');
    foundChords.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.chord} from [${result.notes.join(', ')}]`);
    });
} else {
    console.log('No chords found by NoteDetection');
}

console.log('\nExpected behavior:');
console.log('- NoteDetection: Try different combinations of detected notes');
console.log('- pitch-utils detectChord: Only consider ALL notes passed to it');
console.log('- Result: E5 should be detected from E+B combination, not from E+A#+B'); 