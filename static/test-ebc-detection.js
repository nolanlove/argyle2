import * as PitchUtils from './pitch-utils.js';

// Test EBC chord detection
const notes = ['E', 'B', 'C'];
const pitches = [64, 71, 60];

console.log('Testing EBC chord detection:');
console.log('Notes:', notes);
console.log('Pitches:', pitches);

// Convert notes to pitch classes
const pitchClasses = notes.map(note => PitchUtils.noteToPitchClass(note));
console.log('Pitch classes:', pitchClasses);

// Test each note as root
for (let i = 0; i < pitchClasses.length; i++) {
    const root = pitchClasses[i];
    const intervals = pitchClasses.map(pc => {
        let interval = pc - root;
        if (interval < 0) interval += 12;
        return interval;
    }).sort((a, b) => a - b);
    
    console.log(`\nRoot: ${PitchUtils.pitchClassToNote(root)} (${root})`);
    console.log('Intervals:', intervals);
    
    // Check against power chord pattern [0, 7]
    const powerChordIntervals = [0, 7];
    const matchesPowerChord = intervals.length === powerChordIntervals.length && 
                             intervals.every((interval, index) => interval === powerChordIntervals[index]);
    
    console.log('Matches power chord pattern:', matchesPowerChord);
    
    // Check against 6th chord patterns
    const major6Intervals = [0, 4, 7, 9];
    const minor6Intervals = [0, 3, 7, 9];
    
    const matchesMajor6 = intervals.length === major6Intervals.length && 
                         intervals.every((interval, index) => interval === major6Intervals[index]);
    const matchesMinor6 = intervals.length === minor6Intervals.length && 
                         intervals.every((interval, index) => interval === minor6Intervals[index]);
    
    console.log('Matches major 6 pattern:', matchesMajor6);
    console.log('Matches minor 6 pattern:', matchesMinor6);
}

// Test the actual detectChord function
console.log('\n=== Testing detectChord function ===');
const detectedChords = PitchUtils.detectChord(notes, PitchUtils.chordTypes, pitches);
console.log('Detected chords:', detectedChords);

// Test the arraysEqual function
console.log('\n=== Testing arraysEqual function ===');
const testIntervals = [0, 7, 8];
const powerChordPattern = [0, 7];
console.log('Test intervals:', testIntervals);
console.log('Power chord pattern:', powerChordPattern);
console.log('Arrays equal:', PitchUtils.arraysEqual(testIntervals, powerChordPattern)); 