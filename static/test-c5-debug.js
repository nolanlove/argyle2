// Test script to debug C5 chord detection bug
import { detectChord, chordTypes } from './pitch-utils.js';

console.log('=== Debugging C5 Chord Detection Bug ===\n');

// The problematic case: B2, C3, G3, C4
const testNotes = ['B', 'C', 'G', 'C'];
const testPitches = [47, 48, 55, 60]; // B2, C3, G3, C4

console.log('Test Case:');
console.log('Notes:', testNotes);
console.log('Pitches:', testPitches);
console.log('Expected: Should NOT be detected as C5 power chord\n');

// Step 1: Convert notes to pitch classes
console.log('=== Step 1: Convert to Pitch Classes ===');
const pitchClasses = testNotes.map(note => {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const index = noteNames.indexOf(note);
    console.log(`${note} -> pitch class ${index}`);
    return index;
});

console.log('Pitch classes:', pitchClasses);
console.log('Sorted pitch classes:', [...pitchClasses].sort((a, b) => a - b));
console.log('Unique pitch classes:', [...new Set(pitchClasses)].sort((a, b) => a - b));
console.log('Number of unique pitch classes:', new Set(pitchClasses).size);

// Step 2: Test each note as root
console.log('\n=== Step 2: Test Each Note as Root ===');

for (let i = 0; i < pitchClasses.length; i++) {
    const potentialRoot = pitchClasses[i];
    console.log(`\nTrying ${testNotes[i]} (pitch class ${potentialRoot}) as root:`);
    
    // Calculate intervals from this root
    const intervals = pitchClasses.map(pc => {
        let interval = pc - potentialRoot;
        if (interval < 0) interval += 12;
        return interval;
    });
    
    console.log('All intervals:', intervals);
    
    // Get unique intervals
    const uniqueIntervals = [...new Set(intervals)].sort((a, b) => a - b);
    console.log('Unique intervals:', uniqueIntervals);
    console.log('Number of unique intervals:', uniqueIntervals.length);
    
    // Check against power chord pattern [0, 7]
    const powerChordPattern = [0, 7];
    const isPowerChord = uniqueIntervals.length === 2 && 
                        uniqueIntervals[0] === powerChordPattern[0] && 
                        uniqueIntervals[1] === powerChordPattern[1];
    
    console.log('Matches power chord pattern [0, 7]:', isPowerChord);
    
    if (isPowerChord) {
        console.log('🚨 BUG FOUND: This is being detected as a power chord!');
        console.log('Root note:', testNotes[i]);
        console.log('Intervals:', uniqueIntervals);
    }
}

// Step 3: Test the actual detectChord function
console.log('\n=== Step 3: Test detectChord Function ===');
console.log('Calling detectChord with:', testNotes, testPitches);

const detectedChords = detectChord(testNotes, chordTypes, testPitches);

if (detectedChords && detectedChords.length > 0) {
    console.log('🚨 BUG CONFIRMED: detectChord returned:');
    detectedChords.forEach((chord, index) => {
        console.log(`  ${index + 1}. ${chord.fullName} (${chord.chordType})`);
        console.log(`     Root: ${chord.rootNote}`);
        console.log(`     Intervals: [${chord.intervals || 'N/A'}]`);
    });
} else {
    console.log('✅ No chords detected (correct behavior)');
}

// Step 4: Analyze what this should be
console.log('\n=== Step 4: What Should This Be? ===');
const uniquePCs = [...new Set(pitchClasses)].sort((a, b) => a - b);
console.log('Unique pitch classes:', uniquePCs);

if (uniquePCs.length === 3) {
    console.log('This has 3 unique pitch classes - should be a triad or no chord');
    
    // Check if it's a valid triad
    const triadPatterns = [
        [0, 4, 7],   // Major
        [0, 3, 7],   // Minor
        [0, 4, 8],   // Augmented
        [0, 3, 6]    // Diminished
    ];
    
    for (const pattern of triadPatterns) {
        if (uniquePCs.length === pattern.length && 
            uniquePCs.every((pc, i) => pc === pattern[i])) {
            console.log(`✅ This matches a valid triad pattern: ${pattern}`);
            break;
        }
    }
} else if (uniquePCs.length === 2) {
    console.log('This has 2 unique pitch classes - could be a power chord or interval');
    console.log('But it should NOT include additional notes beyond the 2 pitch classes');
} else {
    console.log(`This has ${uniquePCs.length} unique pitch classes - not a standard chord`);
}

console.log('\n=== Conclusion ===');
console.log('The bug is that the chord detection is finding a subset of notes that matches');
console.log('the power chord pattern, but it should only detect power chords when ALL notes');
console.log('in the input form exactly 2 pitch classes with a perfect 5th interval.'); 