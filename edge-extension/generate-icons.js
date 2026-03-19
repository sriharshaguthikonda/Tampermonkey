// Script to generate placeholder icons for the extension
// In a real scenario, you would replace these with proper icons
const fs = require('fs');
const { createCanvas } = require('canvas');

const sizes = [16, 48, 128];
const iconDir = './icons';

// Create icons directory if it doesn't exist
if (!fs.existsSync(iconDir)){
    fs.mkdirSync(iconDir);
}

// Generate each icon size
sizes.forEach(size => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Draw background
    ctx.fillStyle = '#1a73e8';
    ctx.fillRect(0, 0, size, size);
    
    // Draw "TTS" text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Adjust font size based on icon size
    const fontSize = Math.floor(size * 0.5);
    ctx.font = `bold ${fontSize}px Arial`;
    
    ctx.fillText('TTS', size / 2, size / 2);
    
    // Save to file
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(`${iconDir}/icon${size}.png`, buffer);
});

console.log(`Generated icons in ${iconDir} directory`);
