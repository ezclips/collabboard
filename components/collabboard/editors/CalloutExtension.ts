import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        callout: {
            toggleCallout: () => ReturnType;
        };
    }
}

export const Callout = Node.create({
    name: 'callout',
    group: 'block',
    content: 'block+',

    parseHTML() {
        return [{ tag: 'div.callout' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'callout' }), 0];
    },

    addCommands() {
        return {
            toggleCallout: () => ({ commands, state }) => {
                const { from, to } = state.selection;
                const nodeAtPos = state.doc.nodeAt(from);

                // Check if we're already in a callout
                let isInCallout = false;
                state.doc.nodesBetween(from, to, (node) => {
                    if (node.type.name === 'callout') {
                        isInCallout = true;
                    }
                });

                if (isInCallout) {
                    // Remove callout - lift content out
                    return commands.lift('callout');
                } else {
                    // Wrap in callout
                    return commands.wrapIn('callout');
                }
            },
        };
    },
});

export default Callout;
