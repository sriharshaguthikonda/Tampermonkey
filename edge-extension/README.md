# ChatGPT TTS Reader Extension

An Edge extension that converts ChatGPT conversations into speech with highlighting and navigation controls. This is a port of the Tampermonkey script to a full-fledged Edge extension.

## Features

- **Text-to-Speech**: Converts ChatGPT responses to natural-sounding speech
- **Word Highlighting**: Visually tracks the currently spoken word
- **Improved Highlighting Reliability**: Fixed DOM exceptions that could occur during per-word highlighting
- **Diagnostic Logging**: Adds an early content diagnostics module so ChatGPT load failures can be inspected from DevTools
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

1. Navigate to [ChatGPT](https://chatgpt.com/) or [ChatGPT legacy](https://chat.openai.com/)
2. Click the extension icon in the toolbar
3. Use the controls to start/stop reading
4. Use the navigation buttons to move between sentences
5. Adjust the speech rate using the slider

### Keyboard Shortcuts

- **Shift + U**: Activate crosshair to choose where reading starts
- **Ctrl + Shift + P**: Pause/Resume reading
- **Escape**: Stop reading
- **Left/Right Arrows**: Navigate between segments
- **Ctrl + Left/Right Arrows**: Jump multiple segments (configurable)
- **Home/End**: Jump to first/last segment (preview)
- **Ctrl + Home/End**: Jump to first/last and resume reading
- **Space**: Pause/Resume while a TTS session is active
- **[ / ]**: Decrease/increase speech rate by configured step
- **R**: Replay current segment
- **L**: Toggle loop to top
- **A**: Toggle auto-scroll

## Troubleshooting and diagnostics

The branch includes an early diagnostics module at:

```text
edge-extension/modules/05-diagnostics.js
```

It loads immediately after `00-namespace.js`, before the rest of the content modules. Open DevTools on the ChatGPT tab and filter the Console for:

```text
[ChatGPT TTS Reader]
```

Debug logs are off by default. Enable **Debug logging (console + diagnostics capture)** in the extension settings or popup to collect verbose console output and diagnostics capture. Warnings and errors are still printed and captured when debug logging is off.

Useful checks from the ChatGPT page console:

```js
window.__TTSDiag.getDiagnostics()
```

```js
window.__TTSDiag.disable()
```

```js
window.__TTSDiag.enable()
```

`window.__TTSDiag.enable()` sets the `chatgptTtsDebug` localStorage override to `true`; `window.__TTSDiag.disable()` sets it to `false`. Those overrides take priority over the checkbox.

The diagnostics module also responds to this extension message action from popup/background tooling:

```text
getDiagnostics
```

Use **Export diagnostics JSON** in settings or the popup to download the latest captured diagnostics buffer, including errors, CSP violations, and long tasks captured while debug logging is enabled.

To force logs off manually:

```js
localStorage.setItem('chatgptTtsDebug', 'false');
```

To force logs on:

```js
localStorage.setItem('chatgptTtsDebug', 'true');
```

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
