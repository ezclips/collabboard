import fs from 'fs';
import path from 'path';

const localesDir = path.join(process.cwd(), 'components/collabboard/canvas/excalidraw_fork/packages/excalidraw/locales');
const files = fs.readdirSync(localesDir);

for (const file of files) {
    if (file.endsWith('.json')) {
        const filePath = path.join(localesDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        try {
            let data = JSON.parse(content);
            if (data?.toolBar?.mermaidToExcalidraw) {
                // Keep translations for everything except English, which we force to "Mermaid Diagram"
                if (file === 'en.json') {
                    data.toolBar.mermaidToExcalidraw = "Mermaid Diagram";
                }
            }
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            console.error(`Error processing ${file}`, e);
        }
    }
}
console.log('Locales updated successfully!');
