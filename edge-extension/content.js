// Content script for ChatGPT TTS Reader

class TTSReader {
    constructor() {
        this.speechSynthesis = window.speechSynthesis;
        this.ttsActive = false;
        this.isPaused = false;
        this.isNavigating = false;
        this.continuousReadingActive = false;
        this.pageFullyLoaded = false;
        this.lastSpokenElement = null;
        this.navigationTimeoutId = null;
        this.pointerLoopId = null;
        this.paragraphsList = [];
        this.processedParagraph = { element: null, originalHTML: '', wordSpans: [] };
        this.CONFIG = {
            CANDIDATE_SELECTORS: 'p, li, h1, h2, h3, h4, h5, h6, td, th, .markdown, div[class*="content"], article',
            IGNORE_SELECTORS: 'nav, script, style, noscript, header, footer, button, a, form, [aria-hidden="true"], [data-message-author-role="user"], pre, code, [class*="code"], [class*="language-"], [class*="highlight"], .token, #thread-bottom-container',
            MIN_TEXT_LENGTH: 10,
            SPEECH_RATE: 1.3,
            NAV_READ_DELAY_MS: 0,
            NAV_THROTTLE_MS: 20,
            HOTKEYS: { 
                ACTIVATE: 'U', 
                PAUSE_RESUME: 'P', 
                NAV_NEXT: 'ArrowRight', 
                NAV_PREV: 'ArrowLeft', 
                STOP: 'Escape' 
            },
            EMOJI_REGEX: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/ug
        };
    }

    // Wait for the page to be fully loaded
    waitForPageLoad() {
        return new Promise((resolve) => {
            if (document.readyState === 'complete') {
                setTimeout(() => {
                    this.pageFullyLoaded = true;
                    resolve();
                }, 1000);
            } else {
                window.addEventListener('load', () => {
                    setTimeout(() => {
                        this.pageFullyLoaded = true;
                        resolve();
                    }, 2000);
                });
            }
        });
    }

    // Create the UI elements for the TTS controls
    createUI() {
        // Create the main container
        this.uiContainer = document.createElement('div');
        this.uiContainer.id = 'tts-controls-container';
        this.uiContainer.style.position = 'fixed';
        this.uiContainer.style.bottom = '20px';
        this.uiContainer.style.right = '20px';
        this.uiContainer.style.zIndex = '10000';
        this.uiContainer.style.display = 'none'; // Hidden by default

        // Add the controls container to the page
        document.body.appendChild(this.uiContainer);
        
        console.log('TTS UI created');
    }

    // Show or hide the UI
    toggleUI(show = true) {
        if (this.uiContainer) {
            this.uiContainer.style.display = show ? 'block' : 'none';
        }
    }

    // Set up event listeners for keyboard shortcuts and interactions
    setupEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Only trigger if not in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                return;
            }

            // Handle keyboard shortcuts
            switch (e.key) {
                case this.CONFIG.HOTKEYS.ACTIVATE:
                    e.preventDefault();
                    if (this.ttsActive) {
                        this.stopTTS();
                        return;
                    }
                    document.body.style.cursor = 'crosshair';
                    const clickHandler = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        document.body.style.cursor = '';
                        this.startReadingOnClick(ev);
                    };
                    document.addEventListener('click', clickHandler, { once: true, capture: true });
                    break;
                case this.CONFIG.HOTKEYS.PAUSE_RESUME:
                    e.preventDefault();
                    this.pauseResumeTTS();
                    break;
                case this.CONFIG.HOTKEYS.STOP:
                    e.preventDefault();
                    this.stopTTS();
                    break;
                case this.CONFIG.HOTKEYS.NAV_NEXT:
                    e.preventDefault();
                    this.navigate('next');
                    break;
                case this.CONFIG.HOTKEYS.NAV_PREV:
                    e.preventDefault();
                    this.navigate('prev');
                    break;
            }
        });

        console.log('Event listeners set up');
    }

    // Load available voices
    loadVoices() {
        return new Promise((resolve) => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                console.log('Voices loaded:', voices);
                resolve(voices);
            } else {
                console.log('Waiting for voices to be loaded...');
                window.speechSynthesis.onvoiceschanged = () => {
                    const loadedVoices = window.speechSynthesis.getVoices();
                    console.log('Voices loaded after event:', loadedVoices);
                    resolve(loadedVoices);
                };
            }
        });
    }

    // Initialize the TTS Reader
    async init() {
        try {
            await this.waitForPageLoad();
            this.createUI();
            this.setupEventListeners();
            await this.loadVoices();
            
            // Listen for messages from the popup or background script
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                switch (message.action) {
                    case 'startReading':
                        this.startReadingFromCursor();
                        break;
                    case 'pauseResume':
                        this.pauseResumeTTS();
                        break;
                    case 'stopReading':
                        this.stopTTS();
                        break;
                    case 'navigate':
                        this.navigate(message.direction);
                        break;
                    case 'getState':
                        sendResponse({
                            state: this.ttsActive ? (this.isPaused ? 'paused' : 'playing') : 'stopped'
                        });
                        break;
                }
                return true;
            });
            
            console.log('TTS Reader initialized');
        } catch (error) {
            console.error('Error initializing TTS Reader:', error);
        }
    }

    // Start reading from the current cursor position
    startReadingFromCursor() {
        if (this.ttsActive && !this.isPaused) return;
        
        if (this.isPaused) {
            this.pauseResumeTTS();
            return;
        }

        // Find all readable paragraphs
        const paragraphs = this.findAllParagraphs();
        if (paragraphs.length === 0) {
            console.log('No readable content found');
            return;
        }

        // Start reading from the first paragraph
        this.currentParagraphIndex = 0;
        this.readParagraph(paragraphs[0]);

        console.log('Started reading from cursor');
    }

    // Start reading based on a user click
    startReadingOnClick(event) {
        this.stopTTS(false);
        this.paragraphsList = this.findAllParagraphs();

        let startIndex = -1;
        const containing = this.paragraphsList.find(p => p.element.contains(event.target));
        if (containing) {
            startIndex = this.paragraphsList.indexOf(containing);
        } else {
            const clickY = event.clientY;
            for (let i = 0; i < this.paragraphsList.length; i++) {
                const rect = this.paragraphsList[i].element.getBoundingClientRect();
                if (rect.top > clickY) {
                    startIndex = i;
                    break;
                }
            }
        }

        if (startIndex !== -1) {
            this.currentParagraphIndex = startIndex;
            this.continuousReadingActive = true;
            this.readParagraph(this.paragraphsList[startIndex]);
        } else {
            console.log('No readable text found at or below your click');
        }
    }

    // Read a specific paragraph
    readParagraph(paragraph) {
        if (!paragraph || !paragraph.element) return;
        
        const text = this.getTextFromElement(paragraph.element);
        if (!text) return;
        
        this.currentUtterance = new SpeechSynthesisUtterance(text);
        this.currentUtterance.rate = this.CONFIG.SPEECH_RATE;
        this.currentParagraph = paragraph;
        
        // Set up event handlers
        this.currentUtterance.onboundary = (event) => {
            // Handle word highlighting
            if (event.name === 'word' && event.charIndex > 0) {
                this.highlightCurrentWord(event, paragraph.element);
            }
        };
        
        this.currentUtterance.onend = () => {
            this.ttsActive = false;
            this.currentUtterance = null;
            this.hidePointerArrow();
            // Move to next paragraph if in continuous mode
            if (this.continuousReadingActive && this.paragraphsList.length > this.currentParagraphIndex + 1) {
                this.currentParagraphIndex++;
                this.readParagraph(this.paragraphsList[this.currentParagraphIndex]);
            }
        };
        
        this.currentUtterance.onerror = (event) => {
            console.error('TTS Error:', event);
            this.ttsActive = false;
            this.currentUtterance = null;
        };
        
        // Start speaking
        this.ttsActive = true;
        this.isPaused = false;
        window.speechSynthesis.speak(this.currentUtterance);
        this.updatePointerArrow();
    }
    
    // Pause or resume TTS
    pauseResumeTTS() {
        if (!this.ttsActive) return;
        
        if (this.isPaused) {
            // Resume
            window.speechSynthesis.resume();
            this.isPaused = false;
            console.log('TTS Resumed');
        } else {
            // Pause
            window.speechSynthesis.pause();
            this.isPaused = true;
            console.log('TTS Paused');
        }
    }
    
    // Stop TTS
    stopTTS(notify = true) {
        if (this.currentUtterance) {
            window.speechSynthesis.cancel();
            this.currentUtterance = null;
        }
        
        this.ttsActive = false;
        this.isPaused = false;
        this.clearHighlights();
        this.hidePointerArrow();
        
        if (notify) {
            console.log('TTS Stopped');
        }
    }
    
    // Navigate between paragraphs
    navigate(direction) {
        if (!this.paragraphsList || this.paragraphsList.length === 0) return;
        
        let newIndex;
        if (direction === 'next') {
            newIndex = Math.min(this.currentParagraphIndex + 1, this.paragraphsList.length - 1);
        } else {
            newIndex = Math.max(this.currentParagraphIndex - 1, 0);
        }
        
        if (newIndex !== this.currentParagraphIndex) {
            this.currentParagraphIndex = newIndex;
            this.stopTTS(false);
            this.readParagraph(this.paragraphsList[this.currentParagraphIndex]);
        }
    }

    // Helper method to get clean text from an element
    getTextFromElement(element) {
        if (!element) return '';
        
        // Clone the node to avoid modifying the original
        const clone = element.cloneNode(true);
        
        // Remove any buttons or interactive elements
        const buttons = clone.querySelectorAll('button, a, input, textarea, select');
        buttons.forEach(btn => btn.remove());
        
        // Get the text content and clean it up
        let text = clone.textContent || '';
        
        // Clean up whitespace and newlines
        text = text.replace(/\s+/g, ' ').trim();
        
        return text;
    }
    
    // Find all readable paragraphs on the page
    findAllParagraphs() {
        this.paragraphsList = [];
        
        // Find all candidate elements
        const elements = document.querySelectorAll(this.CONFIG.CANDIDATE_SELECTORS);
        
        // Filter out elements that should be ignored
        elements.forEach((el, index) => {
            // Skip elements that match ignore selectors
            if (el.closest(this.CONFIG.IGNORE_SELECTORS)) return;
            
            // Skip elements with too little text
            const text = this.getTextFromElement(el);
            if (text.length < this.CONFIG.MIN_TEXT_LENGTH) return;
            
            // Add to paragraphs list
            this.paragraphsList.push({
                element: el,
                text: text,
                index: index
            });
        });
        
        console.log(`Found ${this.paragraphsList.length} readable paragraphs`);
        return this.paragraphsList;
    }
    
    // Highlight the current word being spoken
    highlightCurrentWord(event, container) {
        if (!container || !event.charIndex || !event.charLength) return;
        
        // Clear previous highlights
        this.clearHighlights();
        
        // Get the text content and find the current word
        const text = container.textContent || '';
        const wordStart = event.charIndex;
        const wordEnd = wordStart + event.charLength;
        const word = text.substring(wordStart, wordEnd);
        
        if (!word.trim()) return;
        
        // Create a range for the current word
        const range = document.createRange();
        const textNode = this.findTextNode(container, wordStart);
        
        if (!textNode) return;
        
        try {
            range.setStart(textNode, wordStart);
            range.setEnd(textNode, wordEnd);
            
            // Create a highlight span
            const highlightSpan = document.createElement('span');
            highlightSpan.className = 'tts-highlight';
            highlightSpan.textContent = word;
            
            // Apply the highlight
            range.deleteContents();
            range.insertNode(highlightSpan);
            
            // Scroll the highlighted word into view
            highlightSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
        } catch (e) {
            console.error('Error highlighting word:', e);
        }
    }
    
    // Helper to find the text node containing a specific character index
    findTextNode(element, charIndex) {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let currentIndex = 0;
        let node;
        
        while (node = walker.nextNode()) {
            const nodeLength = node.textContent.length;
            if (currentIndex + nodeLength > charIndex) {
                return node;
            }
            currentIndex += nodeLength;
        }
        
        return null;
    }
    
    // Clear all TTS highlights
    clearHighlights() {
        const highlights = document.querySelectorAll('.tts-highlight');
        highlights.forEach(hl => {
            const parent = hl.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(hl.textContent), hl);
                parent.normalize(); // Combine adjacent text nodes
            }
        });
    }

    // Continuously update the pointer arrow to guide the user
    updatePointerArrow() {
        if (!this.ttsActive || !this.currentParagraph) {
            this.hidePointerArrow();
            return;
        }

        if (!this.pointerEl) {
            this.pointerEl = document.createElement('div');
            this.pointerEl.id = 'tts-pointer';
            this.pointerEl.className = 'tts-pointer';
            document.body.appendChild(this.pointerEl);
        }

        const rect = this.currentParagraph.element.getBoundingClientRect();
        const viewport = { w: window.innerWidth, h: window.innerHeight };

        const isVisible = rect.bottom > 0 && rect.top < viewport.h;
        if (isVisible) {
            this.pointerEl.style.opacity = '0';
        } else {
            const origin = { x: viewport.w / 2, y: viewport.h / 2 };
            const target = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
            const deg = angle * 180 / Math.PI + 90;
            const radius = 80;
            const x = origin.x + radius * Math.cos(angle);
            const y = origin.y + radius * Math.sin(angle);
            this.pointerEl.style.left = `${x}px`;
            this.pointerEl.style.top = `${y}px`;
            this.pointerEl.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
            this.pointerEl.style.opacity = '1';
        }

        this.pointerLoopId = requestAnimationFrame(() => this.updatePointerArrow());
    }

    hidePointerArrow() {
        if (this.pointerEl) {
            this.pointerEl.style.opacity = '0';
        }
        if (this.pointerLoopId) {
            cancelAnimationFrame(this.pointerLoopId);
            this.pointerLoopId = null;
        }
    }

    // ... [Other methods from the original script] ...
}

// Initialize the TTS Reader when the page loads
let ttsReader;

// Function to initialize the TTS Reader
function initializeTTSReader() {
    // Create a new instance
    ttsReader = new TTSReader();
    
    // Initialize it
    ttsReader.init().catch(error => {
        console.error('Failed to initialize TTS Reader:', error);
    });
    
    // Make it available globally for debugging
    window.ttsReader = ttsReader;
}

// Wait for the page to be fully loaded before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Small delay to ensure all page content is loaded
        setTimeout(initializeTTSReader, 1000);
    });
} else {
    // If the page is already loaded, initialize immediately
    setTimeout(initializeTTSReader, 500);
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!ttsReader) return false;
    
    switch (message.action) {
        case 'startReading':
            ttsReader.startReadingFromCursor();
            break;
        case 'pauseResume':
            ttsReader.pauseResumeTTS();
            break;
        case 'stopReading':
            ttsReader.stopTTS();
            break;
        case 'navigate':
            ttsReader.navigate(message.direction);
            break;
        case 'getState':
            sendResponse({
                state: ttsReader.ttsActive ? 
                    (ttsReader.isPaused ? 'paused' : 'playing') : 'stopped',
                rate: ttsReader.CONFIG.SPEECH_RATE
            });
            return true; // Keep the message channel open for async response
    }
    
    return false;
});
