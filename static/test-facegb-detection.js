import * as PitchUtils from './pitch-utils.js';

// Test FACEGB chord detection with new pitches
const notes = ['F', 'A', 'C', 'E'];
const pitches = [53, 57, 60, 64];

console.log('Testing FACE chord detection:');
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
    
    // Check against maj7 pattern [0, 4, 7, 11]
    const maj7Intervals = [0, 4, 7, 11];
    const matchesMaj7 = intervals.length === maj7Intervals.length && 
                       intervals.every((interval, index) => interval === maj7Intervals[index]);
    
    console.log('Matches maj7 pattern:', matchesMaj7);
}

// Test the actual detectChord function
console.log('\n=== Testing detectChord function ===');
const detectedChords = PitchUtils.detectChord(notes, PitchUtils.chordTypes, pitches);
console.log('Detected chords:', detectedChords); 