/**
 * AI Musical Assistant for Argyle
 * Handles natural language requests for chord progressions, keys, and musical information
 */

class MusicalAI {
    constructor() {
        this.isOpen = false;
        this.messagesContainer = null;
        this.input = null;
        this.sendButton = null;
        this.musicalGrid = null;
        this.openaiApiKey = null;
        this.useOpenAI = false;
        this.conversationHistory = [];
        this.lastSequenceHash = null; // Track the last sequence to detect changes
        
        // Check for OpenAI API key (will be set to true by default, updated by async call)
        this.useOpenAI = true;
        this.checkOpenAIConfig();
        
        // Song database with popular chord progressions
        this.songDatabase = {
            'yesterday': {
                artist: 'The Beatles',
                key: 'F',
                progression: 'F Em Am F Bb F C F',
                description: 'The classic Beatles ballad with a melancholic progression'
            },
            'wonderwall': {
                artist: 'Oasis',
                key: 'C',
                progression: 'C G Am F',
                description: 'The iconic 90s anthem with a simple but effective progression'
            },
            'let it be': {
                artist: 'The Beatles',
                key: 'C',
                progression: 'C G Am F C G F C',
                description: 'The uplifting Beatles classic'
            },
            'hey jude': {
                artist: 'The Beatles',
                key: 'F',
                progression: 'F C F C F Bb F C',
                description: 'The epic Beatles singalong'
            },
            'bohemian rhapsody': {
                artist: 'Queen',
                key: 'Bb',
                progression: 'Bb Gm Eb F Bb Gm Eb F',
                description: 'The operatic rock masterpiece'
            },
            'stairway to heaven': {
                artist: 'Led Zeppelin',
                key: 'Am',
                progression: 'Am Em F C Dm G Am',
                description: 'The legendary rock ballad'
            },
            'hotel california': {
                artist: 'Eagles',
                key: 'Bm',
                progression: 'Bm F# A E G D Em F#',
                description: 'The haunting Eagles classic'
            },
            'nothing else matters': {
                artist: 'Metallica',
                key: 'Em',
                progression: 'Em C G D Em C G D',
                description: 'The melodic metal ballad'
            },
            'wish you were here': {
                artist: 'Pink Floyd',
                key: 'G',
                progression: 'G Em C D G Em C D',
                description: 'The emotional Pink Floyd classic'
            },
            'comfortably numb': {
                artist: 'Pink Floyd',
                key: 'D',
                progression: 'D A Bm G D A G D',
                description: 'The atmospheric Pink Floyd masterpiece'
            }
        };
        
        // Key database
        this.keyDatabase = {
            'major': {
                intervals: [0, 2, 4, 5, 7, 9, 11],
                description: 'The bright, happy major key'
            },
            'minor': {
                intervals: [0, 2, 3, 5, 7, 8, 10],
                description: 'The melancholic natural minor key'
            },
            'harmonic minor': {
                intervals: [0, 2, 3, 5, 7, 8, 11],
                description: 'The exotic harmonic minor key'
            },
            'melodic minor': {
                intervals: [0, 2, 3, 5, 7, 9, 11],
                description: 'The jazz melodic minor key'
            },
            'pentatonic': {
                intervals: [0, 2, 4, 7, 9],
                description: 'The versatile pentatonic key'
            },
            'blues': {
                intervals: [0, 3, 5, 6, 7, 10],
                description: 'The soulful blues key'
            }
        };
        
        this.init();
    }
    
    checkOpenAIConfig() {
        // Check if server-side OpenAI is available
        console.log('🤖 Checking server-side OpenAI integration...');
        console.log('🤖 Initial useOpenAI value:', this.useOpenAI);
        
        // Test server connectivity
        this.testServerConnection();
    }
    
    async testServerConnection() {
        try {
            console.log('🤖 Testing server connection...');
            const response = await fetch('/api/health');
            const data = await response.json();
            console.log('🤖 Health check response:', data);
            
            if (data.openaiConfigured) {
                console.log('🤖 Server-side OpenAI integration enabled');
                this.useOpenAI = true;
            } else {
                console.log('🤖 Server-side OpenAI not configured, using local database');
                this.useOpenAI = false;
            }
            
            console.log('🤖 Final useOpenAI value:', this.useOpenAI);
            this.updateOpenAIStatus();
        } catch (error) {
            console.log('🤖 Server not available, but will try server-side API anyway');
            console.log('🤖 Error details:', error);
            // Even if health check fails, try to use server-side API
            // The actual API call will handle errors gracefully
            this.useOpenAI = true;
            console.log('🤖 Final useOpenAI value (fallback):', this.useOpenAI);
            this.updateOpenAIStatus();
        }
    }
    
    updateOpenAIStatus() {
        const statusElement = document.getElementById('openai-status');
        const statusText = document.getElementById('status-text');
        const setupElement = document.getElementById('openai-setup');
        const resetStatusBtn = document.getElementById('reset-openai-key-status');
        
        if (!statusElement || !statusText || !setupElement) return;
        
        if (this.useOpenAI) {
            statusElement.style.background = 'rgba(16, 185, 129, 0.2)';
            statusElement.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            statusText.innerHTML = '✅ <strong>AI Enabled</strong> - Server-side OpenAI integration active';
            setupElement.style.display = 'none';
            if (resetStatusBtn) {
                resetStatusBtn.style.display = 'none';
            }
        } else {
            statusElement.style.background = 'rgba(245, 158, 11, 0.2)';
            statusElement.style.border = '1px solid rgba(245, 158, 11, 0.4)';
            statusText.innerHTML = '⚠️ <strong>Local Mode</strong> - Limited to built-in database';
            setupElement.style.display = 'block';
            if (resetStatusBtn) {
                resetStatusBtn.style.display = 'none';
            }
        }
    }
    
    async saveOpenAIKey() {
        this.addMessage('🔧 API key management is now handled server-side. Please configure your OpenAI API key in the Vercel environment variables.', 'bot');
        console.log('🤖 API key management moved to server-side');
    }
    
    resetOpenAIKey() {
        this.addMessage('🔧 API key management is now handled server-side. Please configure your OpenAI API key in the Vercel environment variables.', 'bot');
        console.log('🤖 API key management moved to server-side');
    }
    
    init() {
        console.log('🤖 Initializing Musical AI...');
        this.setupElements();
        this.bindEvents();
        this.musicalGrid = window.musicalGrid;
        console.log('🤖 Musical Grid reference:', this.musicalGrid ? 'Found' : 'Not found');
        console.log('🤖 Musical AI initialized successfully');
    }
    
    setupElements() {
        console.log('🤖 Setting up chatbot elements...');
        this.messagesContainer = document.getElementById('chatbot-messages');
        this.input = document.getElementById('chatbot-input');
        this.sendButton = document.getElementById('chatbot-send');
        
        console.log('🤖 Elements found:', {
            messagesContainer: !!this.messagesContainer,
            input: !!this.input,
            sendButton: !!this.sendButton
        });
    }
    
    bindEvents() {
        console.log('🤖 Binding chatbot events...');
        
        // Toggle chatbot
        const toggle = document.getElementById('chatbot-toggle');
        const panel = document.getElementById('chatbot-panel');
        const close = document.getElementById('chatbot-close');
        
        console.log('🤖 Event elements found:', {
            toggle: !!toggle,
            panel: !!panel,
            close: !!close
        });
        
        if (toggle) {
            toggle.addEventListener('click', () => {
                console.log('🤖 Toggle clicked, isOpen:', this.isOpen);
                this.isOpen = !this.isOpen;
                panel.classList.toggle('active', this.isOpen);
                if (this.isOpen) {
                    this.input.focus();
                    this.updateOpenAIStatus();
                }
            });
        }
        
        if (close) {
            close.addEventListener('click', () => {
                this.isOpen = false;
                panel.classList.remove('active');
            });
        }
        
        // Send message
        if (this.sendButton) {
            this.sendButton.addEventListener('click', () => this.sendMessage());
        }
        if (this.input) {
            this.input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMessage();
                }
            });
        }
        
        // OpenAI setup (now server-side)
        const saveKeyBtn = document.getElementById('save-openai-key');
        if (saveKeyBtn) {
            saveKeyBtn.addEventListener('click', async () => {
                try {
                    const response = await fetch('/api/health');
                    const data = await response.json();
                    this.addMessage(`🔍 Server Status: ${data.status} | OpenAI Configured: ${data.openaiConfigured ? 'Yes' : 'No'} | Environment: ${data.environment}`, 'bot');
                } catch (error) {
                    this.addMessage('❌ Server not available. Please deploy to Vercel and configure environment variables.', 'bot');
                }
            });
        }
        
        const resetKeyBtn = document.getElementById('reset-openai-key');
        if (resetKeyBtn) {
            resetKeyBtn.addEventListener('click', async () => {
                try {
                    const response = await fetch('/api/health');
                    const data = await response.json();
                    this.addMessage(`📊 Server Info:\n• Status: ${data.status}\n• Version: ${data.version}\n• OpenAI: ${data.openaiConfigured ? 'Configured' : 'Not configured'}\n• Environment: ${data.environment}`, 'bot');
                } catch (error) {
                    this.addMessage('❌ Cannot connect to server. Make sure the API is deployed and running.', 'bot');
                }
            });
        }
        
        // Reset key button removed - no longer needed for server-side approach
        
        console.log('🤖 Events bound successfully');
    }
    
    checkAndAddSequenceUpdate() {
        // Get current musicalGrid reference
        const musicalGrid = window.musicalGrid || this.musicalGrid;
        if (!musicalGrid || !musicalGrid.sequencer) return;
        
        // Get the current sequence from the sequencer
        const sequence = musicalGrid.sequencer.getSequence();
        if (!sequence || sequence.length === 0) return;
        
        // Create a hash of the current sequence
        const currentSequenceHash = JSON.stringify(sequence);
        
        // Check if sequence has changed
        if (this.lastSequenceHash !== currentSequenceHash) {
            console.log('🤖 Sequence changed, adding to conversation history');
            
            // Create timestamp
            const now = new Date();
            const timestamp = now.toLocaleDateString('en-US', { 
                month: 'numeric', 
                day: 'numeric', 
                year: '2-digit' 
            }) + ' ' + now.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit', 
                hour12: true 
            });
            
            // Build sequence content
            const sequenceItems = sequence.map((item, index) => {
                if (item.type === 'key') {
                    return `${index + 1}. [KEY: ${item.keyName || `${item.rootNote} ${item.keyType}`}]`;
                } else if (item.type === 'chord') {
                    return `${index + 1}. ${item.chordName || `${item.rootNote}${item.chordType}`}`;
                } else if (item.type === 'rest') {
                    return `${index + 1}. [REST]`;
                } else {
                    return `${index + 1}. [UNKNOWN]`;
                }
            });
            
            let sequenceContent = `${timestamp} sequence: ${sequenceItems.join(' → ')}`;
            
            // Add song name if available
            const currentSongName = window.musicalGrid ? window.musicalGrid.currentSongName : null;
            if (currentSongName) {
                sequenceContent += `\nSong name: ${currentSongName}`;
            }
            
            // Add to conversation history as a system message
            this.conversationHistory.push({
                role: 'system',
                content: sequenceContent
            });
            
            // Update the last sequence hash
            this.lastSequenceHash = currentSequenceHash;
            
            console.log('🤖 Added sequence update to conversation history:', sequenceContent);
        }
    }

    async sendMessage() {
        const message = this.input.value.trim();
        if (!message) return;
        
        // Check for sequence changes and add to conversation history
        this.checkAndAddSequenceUpdate();
        
        // Check for duplicate messages
        const lastMessage = this.conversationHistory[this.conversationHistory.length - 1];
        if (lastMessage && lastMessage.role === 'user' && lastMessage.content === message) {
            console.log('🤖 Duplicate message detected, ignoring:', message);
            return;
        }
        
        // Debug: Log the full message length and content
        console.log('🤖 Input message length:', message.length);
        console.log('🤖 Input message content:', message);
        
        // Add user message
        this.addMessage(message, 'user');
        this.input.value = '';
        this.sendButton.disabled = true;
        
        // Show loading
        this.showLoading();
        
        try {
            // Process the message
            const response = await this.processMessage(message);
            this.addMessage(response, 'bot');
        } catch (error) {
            console.error('Chatbot error:', error);
            this.addMessage('Sorry, I encountered an error processing your request. Please try again.', 'bot');
        } finally {
            this.hideLoading();
            this.sendButton.disabled = false;
            this.input.focus();
        }
    }
    
    addMessage(content, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chatbot-message chatbot-${type}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (typeof content === 'string') {
            contentDiv.innerHTML = content.replace(/\n/g, '<br>');
        } else {
            contentDiv.appendChild(content);
        }
        
        // Force styling for user messages
        if (type === 'user') {
            messageDiv.style.justifyContent = 'flex-end';
            contentDiv.style.background = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
            contentDiv.style.color = 'white';
            contentDiv.style.borderBottomRightRadius = '4px';
        }
        
        messageDiv.appendChild(contentDiv);
        this.messagesContainer.appendChild(messageDiv);
        
        // Store message in conversation history
        const messageText = typeof content === 'string' ? content : content.textContent || 'DOM element';
        const newMessage = {
            role: type === 'user' ? 'user' : 'assistant',
            content: messageText
        };
        
        // Debug: Log before adding to conversation history
        console.log('🤖 About to add message to conversation history:', {
            type,
            content: messageText,
            currentHistoryLength: this.conversationHistory.length,
            stackTrace: new Error().stack
        });
        
        this.conversationHistory.push(newMessage);
        
        // Debug: Log the classes being applied
        const contentPreview = typeof content === 'string' ? content.substring(0, 50) + '...' : 'DOM element';
        console.log('🤖 Added message:', { type, classes: messageDiv.className, content: contentPreview });
        console.log('🤖 Conversation history length:', this.conversationHistory.length);
        
        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    
    showLoading() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'chatbot-message chatbot-bot';
        loadingDiv.id = 'loading-message';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        const loadingSpinner = document.createElement('div');
        loadingSpinner.className = 'chatbot-loading';
        loadingSpinner.innerHTML = '<span></span><span></span><span></span>';
        
        contentDiv.appendChild(loadingSpinner);
        loadingDiv.appendChild(contentDiv);
        this.messagesContainer.appendChild(loadingDiv);
        
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    
    hideLoading() {
        const loadingMessage = document.getElementById('loading-message');
        if (loadingMessage) {
            loadingMessage.remove();
        }
    }
    
    async processMessage(message) {
        console.log('🤖 Processing message length:', message.length);
        console.log('🤖 Processing message:', message);
        const lowerMessage = message.toLowerCase();
        
        console.log('🤖 OpenAI status:', {
            useOpenAI: this.useOpenAI,
            serverSide: true
        });
        
        // If OpenAI is available, try to use it first
        if (this.useOpenAI) {
            console.log('🤖 Attempting OpenAI response...');
            try {
                const aiResponse = await this.getOpenAIResponse(message);
                if (aiResponse) {
                    console.log('🤖 Got OpenAI response, returning it');
                    return aiResponse;
                }
            } catch (error) {
                console.error('🤖 OpenAI error, falling back to local:', error);
                
                // Handle specific error types
                if (error.message.includes('429')) {
                    this.addMessage('⚠️ OpenAI rate limit reached. Using local database instead. Try again in a few minutes.', 'bot');
                } else if (error.message.includes('401')) {
                    this.addMessage('❌ Invalid API key. Please check your OpenAI API key.', 'bot');
                } else {
                    this.addMessage('⚠️ OpenAI temporarily unavailable. Using local database instead.', 'bot');
                }
                
                // Fall back to local processing
            }
        } else {
            console.log('🤖 OpenAI not available, using local processing');
        }
        
        // Local processing as fallback
        if (this.isSongRequest(lowerMessage)) {
            console.log('🤖 Handling as song request');
            return this.handleSongRequest(lowerMessage);
        }
        
        if (this.isKeyRequest(lowerMessage)) {
            console.log('🤖 Handling as key request');
            return this.handleKeyRequest(lowerMessage);
        }
        
        if (this.isChordFormatRequest(lowerMessage)) {
            console.log('🤖 Handling as chord format request');
            return this.handleChordFormatRequest(lowerMessage);
        }
        
        if (this.isHelpRequest(lowerMessage)) {
            console.log('🤖 Handling as help request');
            return this.handleHelpRequest();
        }
        
        console.log('🤖 Handling as general request');
        return this.handleGeneralRequest(message);
    }
    
    isSongRequest(message) {
        const songKeywords = ['find', 'get', 'show', 'chords', 'progression', 'song', 'tune'];
        const songArtists = ['beatles', 'oasis', 'queen', 'led zeppelin', 'eagles', 'metallica', 'pink floyd'];
        
        return songKeywords.some(keyword => message.includes(keyword)) ||
               songArtists.some(artist => message.includes(artist)) ||
               Object.keys(this.songDatabase).some(song => message.includes(song));
    }
    
    isKeyRequest(message) {
        const keyKeywords = ['key', 'major', 'minor', 'pentatonic', 'blues'];
        return keyKeywords.some(keyword => message.includes(keyword));
    }
    
    isChordFormatRequest(message) {
        const formatKeywords = ['format', 'convert', 'sequence', 'argyle'];
        const chordPattern = /[A-G][#b]?(m|maj|min|dim|aug|sus|add)?/;
        
        return formatKeywords.some(keyword => message.includes(keyword)) ||
               chordPattern.test(message);
    }
    
    isHelpRequest(message) {
        const helpKeywords = ['help', 'what can you do', 'how', 'examples'];
        return helpKeywords.some(keyword => message.includes(keyword));
    }
    
    handleSongRequest(message) {
        // Find the song in our database
        const song = Object.keys(this.songDatabase).find(songName => 
            message.includes(songName)
        );
        
        if (song) {
            const songData = this.songDatabase[song];
            // Format with key included: "(Key) Chord1 Chord2..."
            const keyKey = `(${songData.key} major)`;
            const formattedProgression = `${keyKey} ${this.formatForArgyle(songData.progression)}`;
            const songTitle = `${songData.artist} - ${song.charAt(0).toUpperCase() + song.slice(1)}`;
            
            const responseDiv = document.createElement('div');
            responseDiv.innerHTML = `
                <p><strong>${songTitle}</strong></p>
                <p>Key: ${songData.key}</p>
                <p>${songData.description}</p>
                <p><strong>Chord Progression:</strong></p>
                <div style="background: rgba(59, 130, 246, 0.1); padding: 12px; border-radius: 8px; margin: 8px 0; font-family: monospace; border: 1px solid rgba(59, 130, 246, 0.3);">
                    ${formattedProgression}
                </div>
            `;
            
            // Add load button
            const loadButton = this.createLoadButton(formattedProgression, songTitle);
            responseDiv.appendChild(loadButton);
            
            return responseDiv;
        } else {
            return `
                <p>I can help you find chord progressions for popular songs! Try asking about:</p>
                <ul>
                    <li>Yesterday by The Beatles</li>
                    <li>Wonderwall by Oasis</li>
                    <li>Let It Be by The Beatles</li>
                    <li>Bohemian Rhapsody by Queen</li>
                    <li>Stairway to Heaven by Led Zeppelin</li>
                    <li>Hotel California by Eagles</li>
                    <li>Nothing Else Matters by Metallica</li>
                    <li>Wish You Were Here by Pink Floyd</li>
                </ul>
            `;
        }
    }
    
    handleKeyRequest(message) {
        // Extract key type and root note
        const keyMatch = message.match(/([A-G][#b]?)\s*(major|minor|harmonic minor|melodic minor|pentatonic|blues)/i);
        
        if (keyMatch) {
            const rootNote = keyMatch[1].toUpperCase();
            const keyType = keyMatch[2].toLowerCase();
            
            if (this.keyDatabase[keyType]) {
                const keyData = this.keyDatabase[keyType];
                const formattedKey = `(${rootNote} ${keyType})`;
                const keyTitle = `${rootNote} ${keyType.charAt(0).toUpperCase() + keyType.slice(1)} Key`;
                
                const responseDiv = document.createElement('div');
                responseDiv.innerHTML = `
                    <p><strong>${keyTitle}</strong></p>
                    <p>${keyData.description}</p>
                    <p><strong>Key for Argyle:</strong></p>
                    <div style="background: rgba(59, 130, 246, 0.1); padding: 12px; border-radius: 8px; margin: 8px 0; font-family: monospace; border: 1px solid rgba(59, 130, 246, 0.3);">
                        ${formattedKey}
                    </div>
                `;
                
                // Add load button
                const loadButton = this.createLoadButton(formattedKey, keyTitle);
                responseDiv.appendChild(loadButton);
                
                return responseDiv;
            }
        }
        
        return `
            <p>I can help you with keys! Try asking for:</p>
            <ul>
                <li>C Major key</li>
                <li>Am Minor key</li>
                <li>G Harmonic minor key</li>
                <li>F Pentatonic key</li>
                <li>Bb Blues key</li>
            </ul>
        `;
    }
    
    handleChordFormatRequest(message) {
        // Extract chords from the message
        const chordPattern = /[A-G][#b]?(m|maj|min|dim|aug|sus|add)?/g;
        const chords = message.match(chordPattern);
        
        if (chords && chords.length > 0) {
            const formattedChords = this.formatForArgyle(chords.join(' '));
            const chordTitle = `Chord Progression (${chords.length} chords)`;
            
            const responseDiv = document.createElement('div');
            responseDiv.innerHTML = `
                <p><strong>Formatted for Argyle:</strong></p>
                <p><em>Note: You may want to add a key key at the beginning, like "(C major)"</em></p>
                <div style="background: rgba(59, 130, 246, 0.1); padding: 12px; border-radius: 8px; margin: 8px 0; font-family: monospace; border: 1px solid rgba(59, 130, 246, 0.3);">
                    ${formattedChords}
                </div>
            `;
            
            // Add load button
            const loadButton = this.createLoadButton(formattedChords, chordTitle);
            responseDiv.appendChild(loadButton);
            
            return responseDiv;
        }
        
        return `
            <p>I can format chord progressions for you! Try:</p>
            <ul>
                <li>"Format these chords: Am F C G"</li>
                <li>"Convert Am Em F C to Argyle format"</li>
                <li>"Format this sequence: C G Am F"</li>
            </ul>
        `;
    }
    
    handleHelpRequest() {
        return `
            <p><strong>I'm your musical AI assistant! Here's what I can do:</strong></p>
            <ul>
                <li><strong>Find song chords:</strong> "Find me the chords to Yesterday by the Beatles"</li>
                <li><strong>Get keys:</strong> "Show me the C major key"</li>
                <li><strong>Format chords:</strong> "Format these chords: Am F C G"</li>
                <li><strong>Popular songs:</strong> Wonderwall, Let It Be, Bohemian Rhapsody, Stairway to Heaven</li>
            </ul>
            <p>Just ask me anything musical and I'll format it for Argyle's sequencer!</p>
        `;
    }
    
    handleGeneralRequest(message) {
        return `
            <p>I'm not sure how to help with that specific request, but I can:</p>
            <ul>
                <li>Find chord progressions for popular songs</li>
                <li>Show you keys in any key</li>
                <li>Format chord progressions for Argyle</li>
                <li>Help you with music theory</li>
            </ul>
            <p>Try asking me about a specific song or key!</p>
        `;
    }
    
    formatForArgyle(chordString) {
        // Convert common chord notations to Argyle format
        let formatted = chordString
            .replace(/\b([A-G][#b]?)m\b/g, '$1m') // Am, Bbm, etc.
            .replace(/\b([A-G][#b]?)maj\b/g, '$1') // Cmaj -> C
            .replace(/\b([A-G][#b]?)min\b/g, '$1m') // Cmin -> Cm
            .replace(/\b([A-G][#b]?)dim\b/g, '$1dim') // Cdim
            .replace(/\b([A-G][#b]?)aug\b/g, '$1aug') // Caug
            .replace(/\b([A-G][#b]?)sus\b/g, '$1sus4') // Csus -> Csus4
            .replace(/\b([A-G][#b]?)add\b/g, '$1add9'); // Cadd -> Cadd9
        
        return formatted;
    }
    
    createLoadButton(formattedSequence, title) {
        const button = document.createElement('button');
        button.className = 'chatbot-load-btn';
        button.textContent = `🎵 Load "${title}" to Sequencer`;
        button.style.cssText = `
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 8px 16px;
            margin-top: 8px;
            cursor: pointer;
            font-weight: 500;
            font-size: 0.85rem;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
        `;
        
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-1px)';
            button.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
        });
        
        button.addEventListener('click', () => {
            this.loadToSequencer(formattedSequence, title);
        });
        
        return button;
    }
    
    async getOpenAIResponse(message) {
        console.log('🤖 Calling server-side OpenAI API with message length:', message.length);
        console.log('🤖 Calling server-side OpenAI API with message:', message);
        
        // Static system prompt (doesn't change between requests)
        const staticSystemPrompt = `You are a musical AI assistant for Argyle, an isomorphic musical grid system. You're knowledgeable about music theory, chord progressions, keys, and musical concepts.


RESPONSE STYLE:
- Be conversational and helpful
- Provide musical insights and explanations
- Answer questions about music theory, keys, chords, and musical concepts
- You can reference the sequence context when relevant to the conversation
- ONLY provide loadable sequences (Title: ... Sequence: ... format) when explicitly requested or agreed to
- When you provide a loadable sequence for a song just based on the title, you should provide the full canonical set of chords (with extensions) for the full song in the original key.

SEQUENCE CONTEXT UNDERSTANDING:
- When you see "[KEY: Root KeyType]" in a sequence, this indicates a key change, not a chord
- For example: "1. [KEY: F major] → 2. C → 3. Gm" means the sequence starts in F major key, then plays C major chord, then G minor chord
- Key changes establish the musical context for subsequent chords
- Chords should be interpreted relative to the current key context

CHORD FORMAT RULES (CRITICAL):
- NO SPACES in chord names: Use "Cmaj7" not "C maj7", "Dmin7" not "D min7"
- Major chords: Use "C" not "Cmaj", "F" not "Fmaj", "G" not "Gmaj"
- Minor chords: Use "Am" not "Amin", "Dm" not "Dmin", "Em" not "Emin"
- Diminished chords: Use "Bdim" not "Bdim7" (unless specifically a dim7 chord)
- Augmented chords: Use "Caug" not "C+"
- Suspended chords: Use "Csus4" not "Csus", "Dsus2" not "D2"
- Power chords: Use "C5" not "C(5)" or "C power"
- Slash chords: Use "C/G" not "C over G" or "C with G bass"
- 7th chords: Use "Cmaj7", "C7", "Cm7", "Cdim7", "Cm7b5"
- Extended chords: Use "Cmaj9", "C13", "Cm11"
- Altered chords: Use "C7#5", "Cm7b5", "C7b9", "C9#11"

CHORD SEQUENCE FORMATTING (STRICTLY LIMITED):
ONLY use this format when users explicitly ask for it or agree to it:

Title: Song Name
Sequence: (Root KeyType) Chord1 Chord2 Chord3 Chord4 Chord5 Chord6...

KEY FORMAT RULES:
- For major keys: Use "(Root major)" - e.g., "(C major)", "(F major)", "(Bb major)"
- For minor keys: Use "(Root minor)" - e.g., "(A minor)", "(D minor)", "(G minor)"
- For harmonic minor: Use "(Root Harmonic Minor)" - e.g., "(A Harmonic Minor)"
- For melodic minor: Use "(Root Melodic Minor)" - e.g., "(A Melodic Minor)"
- For other keys: Use "(Root KeyName)" - e.g., "(C Dorian)", "(F Mixolydian)"

REST FORMAT RULES:
- Do NOT use "rest" in sequences
- Focus only on actual chords and keys
- Do not include silent pauses or rests in your suggestions
- Example: "Cmaj7 Dm7 Em F" (no rests)

WHEN TO PROVIDE LOADABLE SEQUENCES (Title: ... Sequence: ... format):
- When users explicitly say "format this" or "give me the sequence"
- When users explicitly ask "what are the chords to [song name]?"
- When users explicitly ask for a loadable sequence
- When users agree to receive a formatted sequence
- When users provide chord lists and ask for formatting

WHEN NOT TO PROVIDE LOADABLE SEQUENCES:
- General music theory questions
- Explanations of concepts
- Questions about keys, modes, or theory
- General conversation about music
- Analysis of existing sequences
- Musical commentary or insights
- When users ask "what is this?" or "analyze this"

Examples of when to provide loadable sequences:
- "Format this: C G Am F"
- "Format this: Happy Birthday G to you D7 Happy birthday to you G" 
- "What's the sequence for Autumn Leaves?"
- "What are the chords for Amazing Grace?"
- "What is the chord progression for the blues in Am?"

Examples of when NOT to provide loadable sequences:
- "What is a dominant 7th chord?"
- "Explain the circle of fifths"
- "Analyze this song"
- "What's the difference between major and minor keys?"
- "How do I build a chord?"
- "Tell me about this sequence"

Be helpful, musical, and conversational - but be somewhat conservative about providing loadable sequences. Only provide them if that's what the user is asking for.`;

        // Update our cached musicalGrid reference
        this.musicalGrid = window.musicalGrid || this.musicalGrid;

        try {
            console.log('🤖 Making API request...');
            
            // Build messages array with static system prompt and conversation history
            const messages = [
                { role: 'system', content: staticSystemPrompt }
            ];
            
            // Add conversation history (which includes sequence updates and current user message)
            messages.push(...this.conversationHistory);
            
            // Log the complete request for debugging
            console.log('🤖 FULL OPENAI REQUEST:');
            console.log('🤖 Messages array:', JSON.stringify(messages, null, 2));
            console.log('🤖 Conversation history length:', this.conversationHistory.length);
            console.log('🤖 Current sequence from musicalGrid:', this.musicalGrid?.sequence);
            
            const response = await fetch('/api/openai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: messages,
                    max_tokens: 4000,
                    temperature: 0.7
                })
            });

            console.log('🤖 Server API response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('🤖 Server API error response:', errorText);
                throw new Error(`Server API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log('🤖 Server API response data:', data);
            
            const aiResponse = data.choices[0].message.content;
            console.log('🤖 AI response:', aiResponse);
            
            // Parse the AI response to extract formatted sequences
            return this.parseAIResponse(aiResponse, message);
            
        } catch (error) {
            console.error('🤖 OpenAI API error:', error);
            throw error;
        }
    }
    
    parseAIResponse(aiResponse, originalMessage) {
        console.log('🤖 Parsing AI response:', aiResponse);
        
        let formattedSequence = null;
        let title = 'AI Response';
        
        // Extract title and sequence from the clean format
        const titleMatch = aiResponse.match(/Title:\s*(.+)/i);
        const sequenceMatch = aiResponse.match(/Sequence:\s*(.+)/i);
        
        if (titleMatch && sequenceMatch) {
            title = titleMatch[1].trim();
            formattedSequence = sequenceMatch[1].trim();
            
            console.log('🤖 Extracted title:', title);
            console.log('🤖 Extracted sequence:', formattedSequence);
        } else {
            console.log('🤖 Failed to parse title/sequence format, falling back to original message');
            // Fallback: use the original message as title and try to extract sequence
            title = originalMessage;
            
            // Look for any sequence pattern as fallback
            const sequencePattern = /\(([A-G][#b]?\s+(major|minor|harmonic minor|melodic minor|pentatonic|blues))\)\s*([A-G][#b]?(m|maj|min|dim|aug|sus|add)?\s*)*/g;
            const fallbackMatch = aiResponse.match(sequencePattern);
            if (fallbackMatch && fallbackMatch.length > 0) {
                formattedSequence = fallbackMatch[0].trim();
                console.log('🤖 Found fallback sequence:', formattedSequence);
            }
        }
        
        // Create response with load button if we found a sequence
        if (formattedSequence) {
            const responseDiv = document.createElement('div');
            responseDiv.innerHTML = `
                <div style="background: rgba(59, 130, 246, 0.1); padding: 12px; border-radius: 8px; margin: 8px 0; border: 1px solid rgba(59, 130, 246, 0.3);">
                    ${aiResponse.replace(/\n/g, '<br>')}
                </div>
            `;
            
            // Add load button
            const loadButton = this.createLoadButton(formattedSequence, title);
            responseDiv.appendChild(loadButton);
            
            return responseDiv;
        }
        
        // If no sequence found, return plain text response
        return aiResponse;
    }
    
    loadToSequencer(sequence, title) {
        try {
            // Find the sequence input field
            const sequenceInput = document.getElementById('sequenceInput');
            if (sequenceInput) {
                // Store the song name for the sequencer to use
                if (title && title !== 'AI Response' && !title.startsWith('Key:') && !title.startsWith('Chord Progression')) {
                    // Extract song name from title (e.g., "Autumn Leaves in G minor" -> "Autumn Leaves")
                    const songName = title.split(' in ')[0];
                    if (songName && songName !== 'Song') {
                        // Store in the MusicalGrid instance for the sequencer to access
                        if (window.musicalGrid && window.musicalGrid.currentSongName !== undefined) {
                            window.musicalGrid.currentSongName = songName;
                            console.log('🤖 Stored song name for sequencer:', songName);
                        }
                    }
                }
                
                // Call the parsing function directly instead of using the text area
                if (window.musicalGrid && window.musicalGrid.parseAndLoadSequence) {
                    window.musicalGrid.parseAndLoadSequence(sequence);
                } else {
                    // Fallback: trigger the load sequence button
                    const loadButton = document.getElementById('loadSequence');
                    if (loadButton) {
                        loadButton.click();
                    }
                }
                
                // Show success message
                this.addMessage(`✅ Successfully loaded "${title}" into the sequencer!`, 'bot');
                
                // Close the chatbot panel
                this.isOpen = false;
                document.getElementById('chatbot-panel').classList.remove('active');
                
                // Show notification in the main app
                if (this.musicalGrid && this.musicalGrid.showNotification) {
                    this.musicalGrid.showNotification(`Loaded "${title}" into sequencer`, 'success');
                }
            } else {
                this.addMessage('❌ Could not find the sequence input field. Please make sure the sequencer is visible.', 'bot');
            }
        } catch (error) {
            console.error('Error loading to sequencer:', error);
            this.addMessage('❌ Error loading sequence. Please try copying and pasting manually.', 'bot');
        }
    }
}

// Initialize the chatbot when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.musicalAI = new MusicalAI();
}); 