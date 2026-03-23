const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'components/collabboard/canvas/excalidraw_fork/packages/excalidraw/locales');
const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));

let fixed = 0;
for (const file of files) {
    const filePath = path.join(localesDir, file);
    try {
        let raw = fs.readFileSync(filePath, 'utf8');

        // The keys themselves were accidentally renamed during the bulk find/replace
        raw = raw.replace(/"the CanvasLib":/g, '"excalidrawLib":');
        raw = raw.replace(/"mermaidTothe Canvas":/g, '"mermaidToExcalidraw":');

        fs.writeFileSync(filePath, raw);
        fixed++;
    } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
    }
}

console.log(`Reverted keys in ${fixed} files`);
