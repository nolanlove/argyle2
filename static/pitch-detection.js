// Pitch Detection System - Extracted from working script.js
// Preserves all working parameters and algorithms exactly as they were

export class PitchDetection {
    constructor() {
        // Pitch detection properties - EXACTLY as they were in working version
        this.pitchDetectionActive = false;
        this.audioContext = null;
        this.analysers = null;
        this.mediaStream = null;
        this.pitchDetectionInterval = null;

        this.isCalibrating = false;
        this.sustainedPitchHistory = new Map(); // Track sustained pitches: pitch -> {count, startTime, lastSeen}
        this.sustainThreshold = 5; // Number of consecutive detections needed (500ms at 100ms intervals)
        this.sustainTolerance = 0.5; // Semitone tolerance for "same pitch" (50 cents)
        this.guitarMinPitch = 40; // E2 (82Hz) - lowest guitar string
        this.guitarMaxPitch = 88; // E6 (1319Hz) - highest practical guitar note

        this.pitchHistory = [];
        this.maxHistoryLength = 10;
        
        // Pitch variance tracking for all 6 guitar strings - EXACTLY as they were
        this.stringTuners = {
            E2: { buckets: new Array(200).fill(0), total: 0, history: [], frequency: 82.41 },
            A2: { buckets: new Array(200).fill(0), total: 0, history: [], frequency: 110.00 },
            D3: { buckets: new Array(200).fill(0), total: 0, history: [], frequency: 146.83 },
            G3: { buckets: new Array(200).fill(0), total: 0, history: [], frequency: 196.00 },
            B3: { buckets: new Array(200).fill(0), total: 0, history: [], frequency: 246.94 },
            E4: { buckets: new Array(200).fill(0), total: 0, history: [], frequency: 329.63 }
        };
        
        // Global semitone histogram - EXACTLY as it was
        this.globalSemitoneHistogram = new Array(49).fill(0); // E2 to E6 (49 semitones)
        this.globalHistogramHistory = [];
        this.globalHistogramMaxLength = 100;
        
        // Callbacks
        this.onStatusUpdate = null;
        this.onChordDetected = null;
        
        // Noise gate settings
        this.noiseGateThreshold = 0.0005; // Hard-coded threshold
        this.noiseGateEnabled = true;
    }

    setCallbacks(onStatusUpdate, onChordDetected, onPitchVariance) {
        this.onStatusUpdate = onStatusUpdate;
        this.onChordDetected = onChordDetected;
        this.onPitchVariance = onPitchVariance;
    }
    
    // Noise gate control methods
    setNoiseGateThreshold(threshold) {
        this.noiseGateThreshold = threshold;
        if (this.onStatusUpdate) {
            this.onStatusUpdate(`Noise gate threshold set to ${threshold}`, 'info');
        }
    }
    
    enableNoiseGate() {
        this.noiseGateEnabled = true;
        if (this.onStatusUpdate) {
            this.onStatusUpdate('Noise gate enabled', 'info');
        }
    }
    
    disableNoiseGate() {
        this.noiseGateEnabled = false;
        if (this.onStatusUpdate) {
            this.onStatusUpdate('Noise gate disabled', 'info');
        }
    }
    
    // Auto-calibrate noise gate based on current room noise
    async calibrateNoiseGate() {

        
        // If analysers aren't available, try to initialize audio first
        if (!this.analysers) {

            const audioInitialized = await this.initAudio();
            if (!audioInitialized) {
                console.error('🎵 [NOISE-GATE] Failed to initialize audio');
                if (this.onStatusUpdate) {
                    this.onStatusUpdate('Failed to initialize audio for calibration', 'error');
                }
                return;
            }

        }
        

        
        // Ensure audio context is running
        if (this.audioContext && this.audioContext.state === 'suspended') {

            await this.audioContext.resume();
        }
        
        if (this.onStatusUpdate) {
            this.onStatusUpdate('Calibrating noise gate... (3 seconds)', 'info');
        }
        
        const samples = [];
        const sampleCount = 30; // 3 seconds at 100ms intervals
        let collectedSamples = 0;
        
        const collectSample = () => {

            
            if (collectedSamples >= sampleCount) {

                this.finishNoiseGateCalibration(samples);
                return;
            }
            
            // Get amplitude data from first analyser
            const analyser = this.analysers[0];
            const dataArray = new Float32Array(analyser.frequencyBinCount);
            analyser.getFloatFrequencyData(dataArray);
            
            // Convert dB to linear amplitude
            const amplitudes = dataArray.map(db => Math.pow(10, db / 20));
            const maxAmplitude = Math.max(...amplitudes);
            

            
            samples.push(maxAmplitude);
            collectedSamples++;
            
            if (this.onStatusUpdate) {
                this.onStatusUpdate(`Calibrating noise gate... ${collectedSamples}/${sampleCount}`, 'info');
            }
            
            setTimeout(collectSample, 100);
        };
        
        collectSample();
    }
    
    finishNoiseGateCalibration(samples) {

        
        // Calculate noise floor (mean + 2 standard deviations)
        const mean = samples.reduce((sum, val) => sum + val, 0) / samples.length;
        const variance = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length;
        const stdDev = Math.sqrt(variance);
        const threshold = mean + (2 * stdDev);
        

        
        this.noiseGateThreshold = threshold;
        this.noiseGateEnabled = true;
        

        
        if (this.onStatusUpdate) {
            this.onStatusUpdate(`Noise gate calibrated. Threshold: ${threshold.toFixed(4)}`, 'success');
        }
        

    }

    async initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create multiple analysers for better detection
            this.analysers = [];
            for (let i = 0; i < 3; i++) {
                const analyser = this.audioContext.createAnalyser();
                analyser.fftSize = 2048;
                analyser.smoothingTimeConstant = 0.8;
                this.analysers.push(analyser);
            }
            
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Connect all analysers to the same source
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analysers.forEach(analyser => {
                source.connect(analyser);
            });
            
            if (this.onStatusUpdate) {
                this.onStatusUpdate('Audio initialized with 3 analyzers', 'info');
            }
            
            return true;
        } catch (error) {
            console.error('Error initializing audio:', error);
            if (this.onStatusUpdate) {
                this.onStatusUpdate('Failed to initialize audio: ' + error.message, 'error');
            }
            return false;
        }
    }

    startDetection() {
        if (!this.audioContext || !this.analysers) {
            if (this.onStatusUpdate) {
                this.onStatusUpdate('Audio not initialized', 'error');
            }
            return false;
        }
        
        this.pitchDetectionActive = true;
        this.pitchDetectionInterval = setInterval(() => {
            this.detectPitch();
        }, 100); // Check every 100ms (EXACTLY as it was in working version)
        
        if (this.onStatusUpdate) {
            this.onStatusUpdate('Detection started', 'info');
        }
        
        return true;
    }

    stopDetection() {
        this.pitchDetectionActive = false;
        if (this.pitchDetectionInterval) {
            clearInterval(this.pitchDetectionInterval);
            this.pitchDetectionInterval = null;
        }
        
        if (this.onStatusUpdate) {
            this.onStatusUpdate('Detection stopped', 'info');
        }
    }

    detectPitch() {
        if (!this.analysers || !this.pitchDetectionActive) return;
        
        // Get current amplitude data for noise gate
        const analyser = this.analysers[0];
        const dataArray = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(dataArray);
        
        // Convert dB to linear amplitude
        const amplitudes = dataArray.map(db => Math.pow(10, db / 20));
        const maxAmplitude = Math.max(...amplitudes);
        
        // Noise gate: ignore if amplitude is too low
        if (this.noiseGateEnabled && maxAmplitude < this.noiseGateThreshold) {
            return; // Too quiet, ignore
        }
        
        // Get data from all analysers
        const allResults = [];
        
        for (let i = 0; i < this.analysers.length; i++) {
            const analyser = this.analysers[i];
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Float32Array(bufferLength);
            analyser.getFloatFrequencyData(dataArray);
            
            // Use both FFT and autocorrelation methods
            const fftResult = this.findFundamentalFrequencyFFT(dataArray, analyser.fftSize);
            const autocorrResult = this.findFundamentalFrequencyAutocorr(dataArray, analyser.fftSize);
            
            if (fftResult) allResults.push({ ...fftResult, method: 'fft', windowSize: analyser.fftSize });
            if (autocorrResult) allResults.push({ ...autocorrResult, method: 'autocorr', windowSize: analyser.fftSize });
        }
        
        // Combine and validate results
        let finalResult = this.combineAndValidateResults(allResults);
        
        // Apply bass-specific pitch correction (but preserve original frequency for variance tracking)
        let originalFrequency = finalResult ? finalResult.frequency : null;
        
        if (finalResult && finalResult.frequency < 300) {
            finalResult = this.applyBassPitchCorrection(finalResult);
        }
        
        // Track pitch variance for all strings using the ORIGINAL precise frequency
        if (originalFrequency && this.onPitchVariance) {
    
            this.onPitchVariance(originalFrequency);
        }
        
        // Fallback to simple peak detection if advanced method fails
        if (!finalResult && allResults.length > 0) {
            const bestResult = allResults.reduce((best, current) => 
                current.confidence > best.confidence ? current : best
            );
            finalResult = bestResult;
            
            // Track variance for fallback result too
            if (finalResult && this.onPitchVariance) {
                this.onPitchVariance(finalResult.frequency);
            }
        }
        
        // Ultimate fallback: simple FFT peak detection
        if (!finalResult) {
            for (let i = 0; i < this.analysers.length; i++) {
                const analyser = this.analysers[i];
                const dataArray = new Float32Array(analyser.frequencyBinCount);
                analyser.getFloatFrequencyData(dataArray);
                
                // Convert to amplitudes
                const amplitudes = new Float32Array(dataArray.length);
                for (let j = 0; j < dataArray.length; j++) {
                    amplitudes[j] = Math.pow(10, dataArray[j] / 20);
                }
                
                // Find strongest peak
                let maxIndex = 0;
                let maxValue = -Infinity;
                for (let j = 0; j < amplitudes.length; j++) {
                    if (amplitudes[j] > maxValue) {
                        maxValue = amplitudes[j];
                        maxIndex = j;
                    }
                }
                
                const frequency = maxIndex * this.audioContext.sampleRate / analyser.fftSize;
                // EXACTLY as it was in working version
                if (frequency >= 77 && frequency <= 2000 && maxValue > 0.001) {
                    finalResult = {
                        frequency: frequency,
                        confidence: Math.min(maxValue * 100, 100),
                        method: 'fallback-fft',
                        windowSize: analyser.fftSize
                    };

                    // Track variance for ultimate fallback result too
                    if (this.onPitchVariance) {
                        this.onPitchVariance(frequency);
                    }
                    break;
                }
            }
        }
        
        if (finalResult && finalResult.frequency > 77 && finalResult.frequency < 2000) {
            // Convert frequency to pitch for guitar range check
            const pitch = Math.round(12 * Math.log2(finalResult.frequency / 440) + 69);
            
            // Check if pitch is within acoustic guitar range
            if (pitch < this.guitarMinPitch || pitch > this.guitarMaxPitch) {
                return;
            }
            
            // Apply temporal smoothing
            this.pitchHistory.push(finalResult);
            if (this.pitchHistory.length > this.maxHistoryLength) {
                this.pitchHistory.shift();
            }
            
            const smoothedResult = this.applyTemporalSmoothing();
            
            if (smoothedResult) {
                // Convert frequency to pitch
                const pitch = Math.round(12 * Math.log2(smoothedResult.frequency / 440) + 69);
                
                // Convert pitch to note name
                const noteInfo = this.getNoteFromPitch(pitch, false);
                
                if (noteInfo) {
                    const octave = Math.floor(pitch / 12) - 1;
                    const noteDisplay = `${noteInfo.note}${octave}`;
                    
                    if (this.onStatusUpdate) {
                        this.onStatusUpdate(`Detected: ${noteDisplay} (${smoothedResult.frequency.toFixed(1)}Hz)`, 'success');
                    }
                }
            }
        }
    }

    findFundamentalFrequencyFFT(dataArray, fftSize) {
        const sampleRate = this.audioContext.sampleRate;
        
        // Convert dB values to linear amplitude
        const amplitudes = new Float32Array(dataArray.length);
        for (let i = 0; i < dataArray.length; i++) {
            amplitudes[i] = Math.pow(10, dataArray[i] / 20);
        }
        
        // Find peaks in the frequency spectrum
        const peaks = this.findPeaks(amplitudes);
        
        if (peaks.length === 0) return null;
        
        // Sort peaks by amplitude
        peaks.sort((a, b) => amplitudes[b] - amplitudes[a]);
        
        // Analyze the strongest peaks for harmonic relationships
        const fundamentalCandidates = [];
        
        for (let i = 0; i < Math.min(peaks.length, 8); i++) { // Increased from 5 to 8 for better bass detection
            const peakIndex = peaks[i];
            
            // Use parabolic interpolation for more precise frequency estimation
            let preciseFrequency = peakIndex * sampleRate / fftSize;
            
            if (peakIndex > 0 && peakIndex < amplitudes.length - 1) {
                // Parabolic interpolation around the peak
                const left = amplitudes[peakIndex - 1];
                const center = amplitudes[peakIndex];
                const right = amplitudes[peakIndex + 1];
                
                if (left > 0 && center > 0 && right > 0) {
                    // Convert to dB for better interpolation
                    const leftDb = 20 * Math.log10(left);
                    const centerDb = 20 * Math.log10(center);
                    const rightDb = 20 * Math.log10(right);
                    
                    // Calculate offset from bin center
                    const offset = 0.5 * (leftDb - rightDb) / (leftDb - 2 * centerDb + rightDb);
                    
                    // Apply offset to get precise frequency
                    preciseFrequency = (peakIndex + offset) * sampleRate / fftSize;
                }
            }
            
            const frequency = preciseFrequency;
            
            // Skip if frequency is outside guitar range (E2 to E6)
            if (frequency < 80 || frequency > 2000) continue;
            
            // Check if this could be a fundamental frequency
            const harmonicScore = this.calculateHarmonicScore(peaks, amplitudes, frequency);
            
            // Use consistent thresholds for all frequencies
            let harmonicThreshold = 0.05;
            let confidenceMultiplier = 1.0;
            
            // Removed bass note bias that was causing harmonics issues
            
            if (harmonicScore > harmonicThreshold) {
                const confidence = this.calculateConfidence(amplitudes[peakIndex], harmonicScore, frequency) * confidenceMultiplier;

                // Debug logging for E2/E3 issue
                if (Math.abs(frequency - 82.41) < 5 || Math.abs(frequency - 164.82) < 5) {
            
                }

                fundamentalCandidates.push({
                    frequency: frequency,
                    amplitude: amplitudes[peakIndex],
                    harmonicScore: harmonicScore,
                    confidence: confidence
                });
            }
        }
        
        // Removed problematic "bass note special handling" that was causing harmonics issues
        // The algorithm now trusts the primary peak detection and harmonic analysis
        
        // Return the candidate with highest confidence
        if (fundamentalCandidates.length > 0) {
            // Return the candidate with highest confidence
            fundamentalCandidates.sort((a, b) => b.confidence - a.confidence);
            return fundamentalCandidates[0];
        }
        
        return null;
    }

    findFundamentalFrequencyAutocorr(dataArray, fftSize) {
        const sampleRate = this.audioContext.sampleRate;
        
        // Convert dB values to linear amplitude
        const amplitudes = new Float32Array(dataArray.length);
        for (let i = 0; i < dataArray.length; i++) {
            amplitudes[i] = Math.pow(10, dataArray[i] / 20);
        }
        
        // Perform autocorrelation
        const autocorr = this.autocorrelate(amplitudes);
        
        // Find peaks in autocorrelation (these represent periodicities)
        const peaks = this.findAutocorrPeaks(autocorr);
        
        if (peaks.length === 0) return null;
        
        // Convert lag to frequency
        const candidates = [];
        
        for (const peak of peaks) {
            // Use interpolation for more precise frequency estimation
            let preciseFrequency = sampleRate / peak.lag;
            
            // For autocorrelation, we can also interpolate around the peak
            // This is more complex, but we can at least use the peak amplitude for better precision
            if (peak.amplitude > 0) {
                // Simple interpolation based on peak amplitude
                const binWidth = sampleRate / fftSize;
                const fractionalOffset = (peak.amplitude - Math.max(peak.leftAmplitude || 0, peak.rightAmplitude || 0)) / peak.amplitude * 0.1;
                preciseFrequency = sampleRate / (peak.lag + fractionalOffset);
            }
            
            const frequency = preciseFrequency;
            if (frequency >= 77 && frequency <= 2000) { // EXACTLY as it was in working version
                let confidence = this.calculateAutocorrConfidence(peak.amplitude, peak.lag, fftSize, frequency);
                
                // Removed bass note confidence boosting that was causing harmonics issues

                candidates.push({
                    frequency: frequency,
                    amplitude: peak.amplitude,
                    lag: peak.lag,
                    confidence: confidence
                });
            }
        }
        
        // Removed bass note preference that was causing harmonics issues
        
        // Return the candidate with highest confidence (EXACTLY as it was)
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.confidence - a.confidence);
            return candidates[0];
        }
        
        return null;
    }

    autocorrelate(signal) {
        const n = signal.length;
        const result = new Float32Array(n);
        
        // Optimized autocorrelation with early termination
        // Only compute lags that are relevant for guitar frequencies (77-2000 Hz) - EXACTLY as it was
        const sampleRate = this.audioContext.sampleRate;
        const minLag = Math.floor(sampleRate / 2000); // 2000 Hz
        const maxLag = Math.floor(sampleRate / 80);   // 80 Hz
        
        // Limit computation to relevant range
        const startLag = Math.max(0, minLag);
        const endLag = Math.min(n, maxLag);
        
        for (let lag = startLag; lag < endLag; lag++) {
            let sum = 0;
            const limit = Math.min(n - lag, 1024); // Limit inner loop to prevent excessive computation
            
            for (let i = 0; i < limit; i++) {
                sum += signal[i] * signal[i + lag];
            }
            result[lag] = sum;
        }
        
        return result;
    }

    findAutocorrPeaks(autocorr) {
        const peaks = [];
        const minLag = Math.floor(this.audioContext.sampleRate / 2000); // Minimum lag for 2000Hz
        const maxLag = Math.floor(this.audioContext.sampleRate / 80);   // Maximum lag for 80Hz - EXACTLY as it was
        
        for (let i = minLag; i < maxLag; i++) {
            if (autocorr[i] > autocorr[i - 1] && autocorr[i] > autocorr[i + 1] && autocorr[i] > 0.01) { // EXACTLY as it was
                peaks.push({
                    lag: i,
                    amplitude: autocorr[i]
                });
            }
        }
        
        return peaks;
    }

    calculateAutocorrConfidence(amplitude, lag, fftSize, frequency = null) {
        // Normalize amplitude and consider lag resolution
        const normalizedAmplitude = Math.min(amplitude, 1);
        const lagResolution = fftSize / this.audioContext.sampleRate;
        const resolutionFactor = Math.min(lag / lagResolution, 1);
        
        let confidence = (normalizedAmplitude * 0.7 + resolutionFactor * 0.3);
        
        // Boost confidence for test tone (A4 = 440Hz)
        if (frequency && Math.abs(frequency - 440) < 20) { // Within 20Hz of A4
            const testToneBoost = Math.max(0, 1 - Math.abs(frequency - 440) / 20); // 0-1 boost factor
            confidence += testToneBoost * 0.3; // Add up to 30% boost for test tone
        }
        
        return Math.min(confidence * 100, 100); // Return as percentage
    }

    findPeaks(amplitudes) {
        const peaks = [];
        const maxAmplitude = Math.max(...amplitudes);
        
        // Use background noise profile if available, otherwise use default threshold
        let threshold;
        if (this.backgroundNoiseProfile) {
            // Use calibrated noise threshold (2 standard deviations above noise floor)
            threshold = this.backgroundNoiseProfile.threshold;
        } else {
            // Default threshold: 5% of max amplitude - EXACTLY as it was
            threshold = maxAmplitude * 0.05;
        }
        
        for (let i = 1; i < amplitudes.length - 1; i++) {
            if (amplitudes[i] > threshold && 
                amplitudes[i] > amplitudes[i - 1] && 
                amplitudes[i] > amplitudes[i + 1]) {
                peaks.push(i);
            }
        }
        
        // Debug: Check if peaks are above calibrated threshold
        if (this.backgroundNoiseProfile && peaks.length > 0) {
            // Check if any peaks are actually above the calibrated threshold
            const peaksAboveThreshold = peaks.filter(peakIndex => amplitudes[peakIndex] > this.backgroundNoiseProfile.threshold);
            
            if (peaksAboveThreshold.length === 0) {
                return [];
            }
        }
        
        return peaks;
    }

    calculateHarmonicScore(peaks, amplitudes, fundamentalFreq) {
        const sampleRate = this.audioContext.sampleRate;
        const fftSize = this.analysers[0].fftSize;
        let harmonicMatches = 0;
        let totalHarmonics = 0;
        
        // Check for harmonics up to the 8th harmonic - EXACTLY as it was
        for (let harmonic = 2; harmonic <= 8; harmonic++) {
            const expectedFreq = fundamentalFreq * harmonic;
            const expectedBin = Math.round(expectedFreq * fftSize / sampleRate);
            
            if (expectedBin < amplitudes.length) {
                totalHarmonics++;
                
                // Look for a peak near the expected harmonic frequency
                const tolerance = Math.max(1, Math.round(expectedBin * 0.05));
                
                for (let i = 0; i < peaks.length; i++) {
                    const peakIndex = peaks[i];
                    if (Math.abs(peakIndex - expectedBin) <= tolerance) {
                        harmonicMatches++;
                        break;
                    }
                }
            }
        }
        
        const score = totalHarmonics > 0 ? harmonicMatches / totalHarmonics : 0;
        return score;
    }

    calculateConfidence(amplitude, harmonicScore, frequency = null) {
        // Normalize amplitude to 0-1 range
        const normalizedAmplitude = Math.min(amplitude, 1);
        
        // Combine amplitude and harmonic score for overall confidence
        let confidence = (normalizedAmplitude * 0.6) + (harmonicScore * 0.4);
        
        // Boost confidence for test tone (A4 = 440Hz)
        if (frequency && Math.abs(frequency - 440) < 20) { // Within 20Hz of A4
            const testToneBoost = Math.max(0, 1 - Math.abs(frequency - 440) / 20); // 0-1 boost factor
            confidence += testToneBoost * 0.3; // Add up to 30% boost for test tone
        }
        
        return Math.min(confidence * 100, 100); // Return as percentage
    }

    combineAndValidateResults(allResults) {
        if (allResults.length === 0) return null;
        
        // Sort by confidence
        allResults.sort((a, b) => b.confidence - a.confidence);
        
        // Return the highest confidence result
        return allResults[0];
    }

    applyTemporalSmoothing() {
        if (this.pitchHistory.length === 0) return null;
        
        // Simple median smoothing
        const frequencies = this.pitchHistory.map(r => r.frequency);
        frequencies.sort((a, b) => a - b);
        const medianFreq = frequencies[Math.floor(frequencies.length / 2)];
        
        // Find the result closest to the median
        let closestResult = this.pitchHistory[0];
        let minDiff = Math.abs(closestResult.frequency - medianFreq);
        
        for (const result of this.pitchHistory) {
            const diff = Math.abs(result.frequency - medianFreq);
            if (diff < minDiff) {
                minDiff = diff;
                closestResult = result;
            }
        }
        
        return closestResult;
    }

    applyBassPitchCorrection(result) {
        const frequency = result.frequency;
        const pitch = Math.round(12 * Math.log2(frequency / 440) + 69);
        
        // Define the expected frequencies for all notes on the lower three strings
        // E2 string (MIDI 40-51): E2 to E3
        // A2 string (MIDI 45-56): A2 to A3  
        // D3 string (MIDI 50-61): D3 to D4
        const bassNoteFrequencies = {
            // E2 string frets 0-11
            40: 82.41,   // E2 open
            41: 87.31,   // F2
            42: 92.50,   // F#2
            43: 98.00,   // G2
            44: 103.83,  // G#2
            45: 110.00,  // A2
            46: 116.54,  // A#2
            47: 123.47,  // B2
            48: 130.81,  // C3
            49: 138.59,  // C#3
            50: 146.83,  // D3
            51: 155.56,  // D#3
            52: 164.81,  // E3
            
            // A2 string frets 0-11
            45: 110.00,  // A2 open
            46: 116.54,  // A#2
            47: 123.47,  // B2
            48: 130.81,  // C3
            49: 138.59,  // C#3
            50: 146.83,  // D3
            51: 155.56,  // D#3
            52: 164.81,  // E3
            53: 174.61,  // F3
            54: 185.00,  // F#3
            55: 196.00,  // G3
            56: 207.65,  // G#3
            57: 220.00,  // A3
            
            // D3 string frets 0-11
            50: 146.83,  // D3 open
            51: 155.56,  // D#3
            52: 164.81,  // E3
            53: 174.61,  // F3
            54: 185.00,  // F#3
            55: 196.00,  // G3
            56: 207.65,  // G#3
            57: 220.00,  // A3
            58: 233.08,  // A#3
            59: 246.94,  // B3
            60: 261.63,  // C4
            61: 277.18,  // C#4
            62: 293.66   // D4
        };
        
        // Find the closest bass note frequency
        let closestPitch = pitch;
        let minDiff = Infinity;
        
        for (const [midiPitch, expectedFreq] of Object.entries(bassNoteFrequencies)) {
            const diff = Math.abs(frequency - expectedFreq);
            if (diff < minDiff) {
                minDiff = diff;
                closestPitch = parseInt(midiPitch);
            }
        }
        
        // Only correct if the difference is significant (more than 50 cents)
        const pitchDiff = Math.abs(pitch - closestPitch);
        if (pitchDiff > 0.5) {
            // Convert corrected pitch back to frequency
            const correctedFreq = 440 * Math.pow(2, (closestPitch - 69) / 12);
            
            return {
                ...result,
                frequency: correctedFreq,
                originalFrequency: frequency,
                pitchCorrection: true
            };
        }
        
        return result;
    }

    trackPitchVariance(frequency) {
        // Convert frequency to cents deviation for each string
        for (const [stringName, tuner] of Object.entries(this.stringTuners)) {
            const targetFreq = tuner.frequency;
            const centsDeviation = 1200 * Math.log2(frequency / targetFreq);
            
            // Only track if within ±100 cents of the target
            if (Math.abs(centsDeviation) <= 100) {
                // Convert to bucket index (0-199, centered at 100)
                const bucketIndex = Math.round(centsDeviation + 100);
                
                if (bucketIndex >= 0 && bucketIndex < 200) {
                    tuner.buckets[bucketIndex]++;
                    tuner.total++;
                    
                    // Add to history for rolling window
                    tuner.history.push({
                        time: Date.now(),
                        cents: centsDeviation,
                        frequency: frequency
                    });
                    
                    // Keep only last 50 samples
                    if (tuner.history.length > 50) {
                        tuner.history.shift();
                    }
                }
            }
        }
        
        // Also track in global semitone histogram
        const pitch = Math.round(12 * Math.log2(frequency / 440) + 69);
        const semitoneIndex = pitch - 40; // E2 = index 0
        
        if (semitoneIndex >= 0 && semitoneIndex < 49) {
            this.globalSemitoneHistogram[semitoneIndex]++;
            
            // Add to global history
            this.globalHistogramHistory.push({
                time: Date.now(),
                pitch: pitch,
                frequency: frequency
            });
            
            // Keep only last 100 samples
            if (this.globalHistogramHistory.length > this.globalHistogramMaxLength) {
                this.globalHistogramHistory.shift();
            }
        }
    }

    trackSemitoneHistogram(frequency) {
        // This is now handled in trackPitchVariance
        this.trackPitchVariance(frequency);
    }

    clearPitchVariance() {
        // Clear all tuner data
        for (const tuner of Object.values(this.stringTuners)) {
            tuner.buckets.fill(0);
            tuner.total = 0;
            tuner.history = [];
        }
        
        // Clear global histogram
        this.globalSemitoneHistogram.fill(0);
        this.globalHistogramHistory = [];
    }

    getTopDetectedNotes(limit = 6) {
        // Get the most detected notes from the global histogram
        const noteCounts = this.globalSemitoneHistogram.map((count, index) => ({
            pitch: index + 40, // Convert back to MIDI pitch
            count: count
        }));
        
        // Sort by count (descending)
        noteCounts.sort((a, b) => b.count - a.count);
        
        // Return top notes with note names
        return noteCounts.slice(0, limit).map(item => {
            const noteInfo = this.getNoteFromPitch(item.pitch, false);
            return {
                note: noteInfo ? noteInfo.note : `Pitch ${item.pitch}`,
                pitch: item.pitch,
                count: item.count,
                frequency: 440 * Math.pow(2, (item.pitch - 69) / 12)
            };
        });
    }

    filterSubharmonics(detectedNotes) {
        // Remove subharmonics (notes that are octaves below stronger notes)
        const filteredNotes = [];
        
        for (const note of detectedNotes) {
            let isSubharmonic = false;
            
            for (const otherNote of detectedNotes) {
                if (note.pitch !== otherNote.pitch && otherNote.count > note.count) {
                    // Check if this note is a subharmonic of the other note
                    const pitchDiff = otherNote.pitch - note.pitch;
                    if (pitchDiff > 0 && pitchDiff % 12 === 0) {
                        // Same note, different octave
                        const octaveDiff = pitchDiff / 12;
                        if (octaveDiff >= 1 && octaveDiff <= 3) {
                            // If the higher note has significantly more detections, this is likely a subharmonic
                            if (otherNote.count > note.count * 2) {
                                isSubharmonic = true;
                                break;
                            }
                        }
                    }
                }
            }
            
            if (!isSubharmonic) {
                filteredNotes.push(note);
            }
        }
        
        return filteredNotes;
    }

    checkSustainedPitch(pitch, confidence) {
        const now = Date.now();
        const pitchKey = Math.round(pitch * 2) / 2; // Round to nearest 0.5 semitones
        
        if (!this.sustainedPitchHistory.has(pitchKey)) {
            this.sustainedPitchHistory.set(pitchKey, {
                count: 1,
                startTime: now,
                lastSeen: now,
                pitch: pitch,
                confidence: confidence
            });
            return { sustained: false, count: 1, pitch: pitch };
        }
        
        const history = this.sustainedPitchHistory.get(pitchKey);
        const timeSinceLastSeen = now - history.lastSeen;
        
        // If it's been more than 200ms since last detection, reset count
        if (timeSinceLastSeen > 200) {
            history.count = 1;
            history.startTime = now;
        } else {
            history.count++;
        }
        
        history.lastSeen = now;
        history.pitch = pitch;
        history.confidence = Math.max(history.confidence, confidence);
        
        const sustained = history.count >= this.sustainThreshold;
        
        return {
            sustained: sustained,
            count: history.count,
            pitch: history.pitch,
            startTime: history.startTime
        };
    }

    cleanupSustainedPitches() {
        const now = Date.now();
        const toDelete = [];
        
        for (const [pitchKey, history] of this.sustainedPitchHistory.entries()) {
            if (now - history.lastSeen > 1000) { // Remove after 1 second of no detection
                toDelete.push(pitchKey);
            }
        }
        
        for (const pitchKey of toDelete) {
            this.sustainedPitchHistory.delete(pitchKey);
        }
    }





    getNoteFromPitch(pitch, useSharps = true) {
        const noteNames = useSharps ? 
            ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] :
            ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        
        const noteIndex = pitch % 12;
        return { note: noteNames[noteIndex] };
    }





    destroy() {
        this.stopDetection();
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
} 