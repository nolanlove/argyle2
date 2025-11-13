import * as PitchUtils from './pitch-utils.js';

// Test ACEB chord detection
const notes = ['A', 'C', 'E', 'B'];
const pitches = [57, 60, 64, 71];

console.log('Testing ACEB chord detection:');
console.log('Notes:', notes);
console.log('Pitches:', pitches);

// Convert notes to pitch classes
const pitchClasses = notes.map(note => PitchUtils.noteToPitchClass(note));
console.log('Pitch classes:', pitchClasses);

// Test each note as root with extended intervals
for (let i = 0; i < pitchClasses.length; i++) {
    const root = pitchClasses[i];
    const baseIntervals = pitchClasses.map(pc => {
        let interval = pc - root;
        if (interval < 0) interval += 12;
        return interval;
    }).sort((a, b) => a - b);
    
    console.log(`\nRoot: ${PitchUtils.pitchClassToNote(root)} (${root})`);
    console.log('Base intervals:', baseIntervals);
    
    // Test extended intervals (convert 2nds to 9ths)
    const extendedIntervals = [...baseIntervals];
    for (let j = 0; j < extendedIntervals.length; j++) {
        if (extendedIntervals[j] === 2) {
            extendedIntervals[j] = 14; // Convert 2nd to 9th
        }
    }
    extendedIntervals.sort((a, b) => a - b);
    console.log('Extended intervals:', extendedIntervals);
    
    // Check against add9 pattern [0, 4, 7, 14]
    const add9Intervals = [0, 4, 7, 14];
    const matchesBase = baseIntervals.length === add9Intervals.length && 
                       baseIntervals.every((interval, index) => interval === add9Intervals[index]);
    const matchesExtended = extendedIntervals.length === add9Intervals.length && 
                           extendedIntervals.every((interval, index) => interval === add9Intervals[index]);
    
    console.log('Matches add9 pattern (base):', matchesBase);
    console.log('Matches add9 pattern (extended):', matchesExtended);
}

// Test the actual detectChord function
console.log('\n=== Testing detectChord function ===');
const detectedChords = PitchUtils.detectChord(notes, PitchUtils.chordTypes, pitches);
console.log('Detected chords:', detectedChords);

// Let's also test what happens if we manually create the add9 intervals
console.log('\n=== Testing manual add9 creation ===');
const aRoot = PitchUtils.noteToPitchClass('A');
const intervals = [0, 3, 7, 14]; // Am add9 intervals
console.log('A root intervals for add9:', intervals);

// Check if this matches any chord type
for (const [chordType, chordData] of Object.entries(PitchUtils.chordTypes)) {
    const chordIntervals = [...chordData.intervals].sort((a, b) => a - b);
    if (intervals.length === chordIntervals.length && 
        intervals.every((interval, index) => interval === chordIntervals[index])) {
        console.log(`Matches ${chordType}:`, chordData);
    }
} 