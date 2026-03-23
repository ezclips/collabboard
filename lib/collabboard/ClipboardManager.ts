// lib/collabboard/ClipboardManager.ts

export interface ClipboardItem {
    type: 'post' | 'line' | 'selection';
    data: any;
}

export interface CollabBoardClipboard {
    kind: 'collabboard.clipboard.v1';
    items: ClipboardItem[];
}

class ClipboardManager {
    private inMemoryClipboard: CollabBoardClipboard | null = null;

    async copy(items: ClipboardItem[]) {
        const payload: CollabBoardClipboard = {
            kind: 'collabboard.clipboard.v1',
            items,
        };

        const json = JSON.stringify(payload);

        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                // Write to system clipboard as internal type and plain text fallback
                const blob = new Blob([json], { type: 'application/x-collabboard+json' });
                const textBlob = new Blob([JSON.stringify(items.map(i => i.data.title || i.data.content || 'Padlet'), null, 2)], { type: 'text/plain' });

                // Some browsers don't support multiple types in ClipboardItem yet, or custom types
                // Fallback to text/plain if needed, but try custom first
                await navigator.clipboard.write([
                    new window.ClipboardItem({
                        'text/plain': textBlob,
                        // 'application/x-collabboard+json': blob // Browsers might reject this
                    })
                ]);
            }
        } catch (err) {
            console.warn('System clipboard write failed, using in-memory fallback', err);
        }

        this.inMemoryClipboard = payload;
    }

    async paste(): Promise<CollabBoardClipboard | null> {
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                // In a real app, we'd try to read 'application/x-collabboard+json'
                // But for now, let's rely on in-memory or text parsing if we want to be fancy
            }
        } catch (err) {
            console.warn('System clipboard read failed', err);
        }

        return this.inMemoryClipboard;
    }
}

export const clipboardManager = new ClipboardManager();
