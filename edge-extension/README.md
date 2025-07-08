# ChatGPT TTS Reader Extension

An Edge extension that converts ChatGPT conversations into speech with highlighting and navigation controls. This is a port of the Tampermonkey script to a full-fledged Edge extension.

## Features

- **Text-to-Speech**: Converts ChatGPT responses to natural-sounding speech
- **Word Highlighting**: Visually tracks the currently spoken word
- **Improved Highlighting Reliability**: Fixed DOM exceptions that could occur during per-word highlighting
- **Emoji Skipping**: Emojis are marked with `aria-hidden` so they're not spoken
- **Navigation Controls**: Navigate sentence by sentence
- **Customizable Speed**: Adjust the speech rate to your preference
- **Keyboard Shortcuts**: Control playback with keyboard shortcuts
- **Responsive UI**: Clean and intuitive interface
- **Crosshair Start**: Press the activation key and click anywhere to begin
  reading from that paragraph
- **Pointer Arrow**: An arrow guides you to off-screen text when reading

## Installation

### Prerequisites
- Microsoft Edge browser (version 88 or later)
- Node.js and npm (for building the extension)

### Steps

1. **Clone or download** this repository
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Generate icons** (if needed):
   ```bash
   node generate-icons.js
   ```
4. **Load the extension in Edge**:
   - Open Edge and go to `edge://extensions/`
   - Enable "Developer mode" (toggle in the bottom left)
   - Click "Load unpacked" and select the `edge-extension` directory

## Usage

1. Navigate to [ChatGPT](https://chat.openai.com/)
2. Click the extension icon in the toolbar
3. Use the controls to start/stop reading
4. Use the navigation buttons to move between paragraphs
5. Adjust the speech rate using the slider

### Keyboard Shortcuts

- **U**: Activate crosshair to choose where reading starts
- **P**: Pause/Resume reading
- **Escape**: Stop reading
- **Left/Right Arrows**: Navigate between paragraphs

## Building for Distribution

To create a package for the Edge Add-ons store:

1. Run the build script:
   ```bash
   npm run build
   ```
2. This will create a `dist` directory with the production-ready extension
3. Zip the contents of the `dist` directory
4. Submit to the Microsoft Edge Add-ons store

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with the Web Speech API
- Inspired by various TTS browser extensions
