// VoiceLink API Integration Test
// This script tests the VoiceLink API integration

// Test VoiceLink Client class
class TestVoiceLinkClient {
    constructor(baseUrl = 'http://127.0.0.1:7860') {
        this.baseUrl = baseUrl;
        this.voices = [];
        this.cache = new Map();
        this.maxCacheSize = 50;
        this.timeout = 5000;
    }

    async getVoices() {
        // Mock implementation for testing
        return [
            {
                id: "af_jessica",
                name: "Jessica",
                language: "en-US",
                gender: "female",
                description: "Natural, pleasant female voice with clear articulation.",
                model: "kokoro_pytorch",
                tags: ["natural", "pleasant", "clear"],
                sample_rate: 24000
            },
            {
                id: "am_adam",
                name: "Adam",
                language: "en-US",
                gender: "male",
                description: "Natural, conversational male voice.",
                model: "kokoro_pytorch",
                tags: ["natural", "conversational"],
                sample_rate: 24000
            }
        ];
    }

    async synthesize(text, voiceId, speed = 1.0) {
        // Mock implementation
        console.log(`Synthesizing "${text}" with voice ${voiceId} at speed ${speed}`);
        return "mock-audio-url";
    }

    async healthCheck() {
        // Mock implementation - assume healthy
        return true;
    }

    getVoicesByCriteria(language = 'en-US', gender = 'female') {
        return this.voices.filter(voice => 
            voice.language === language && voice.gender === gender
        );
    }

    getVoicesByTags(requiredTags) {
        return this.voices.filter(voice => 
            requiredTags.some(tag => voice.tags.includes(tag))
        );
    }

    selectVoiceForContext(context = 'natural', userPreference = null) {
        let candidates = [];
        
        if (userPreference === 'professional') {
            candidates = this.getVoicesByTags(['professional', 'clear']);
        } else if (userPreference === 'friendly') {
            candidates = this.getVoicesByTags(['friendly', 'conversational']);
        } else if (userPreference === 'natural') {
            candidates = this.getVoicesByTags(['natural']);
        } else {
            candidates = this.getVoicesByCriteria('en-US', 'female');
        }
        
        const selected = candidates[0];
        return selected ? selected.id : 'af_jessica';
    }
}

// Test the integration
async function testVoiceLinkIntegration() {
    console.log('Testing VoiceLink API Integration...');
    
    const client = new TestVoiceLinkClient();
    
    // Test health check
    const isHealthy = await client.healthCheck();
    console.log('Health check:', isHealthy);
    
    // Test getting voices
    const voices = await client.getVoices();
    console.log('Available voices:', voices);
    
    // Test voice selection strategies
    const naturalVoice = client.selectVoiceForContext('natural', 'natural');
    console.log('Natural voice:', naturalVoice);
    
    const professionalVoice = client.selectVoiceForContext('professional');
    console.log('Professional voice:', professionalVoice);
    
    const friendlyVoice = client.selectVoiceForContext('friendly');
    console.log('Friendly voice:', friendlyVoice);
    
    // Test synthesis
    const audioUrl = await client.synthesize('Hello world', naturalVoice, 1.0);
    console.log('Audio URL:', audioUrl);
    
    console.log('VoiceLink API Integration test completed!');
}

// Run tests if in browser console
if (typeof window !== 'undefined') {
    window.testVoiceLinkIntegration = testVoiceLinkIntegration;
    console.log('VoiceLink test functions loaded. Run testVoiceLinkIntegration() to test.');
}
