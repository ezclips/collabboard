import { Mark, mergeAttributes } from '@tiptap/core';

export interface CommentOptions {
    HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        comment: {
            /**
             * Set a comment mark
             */
            setComment: (attributes: {
                commentId: string;
                commentText: string;
                commentThread?: string;
                userId: string;
                userName: string;
                timestamp: number;
            }) => ReturnType;
            /**
             * Unset a comment mark
             */
            unsetComment: () => ReturnType;
            /**
             * Update a comment
             */
            updateComment: (attributes: {
                commentText: string;
                commentThread?: string;
            }) => ReturnType;
        };
    }
}

export const Comment = Mark.create<CommentOptions>({
    name: 'comment',

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            commentId: {
                default: null,
                parseHTML: element => element.getAttribute('data-comment-id'),
                renderHTML: attributes => {
                    if (!attributes.commentId) {
                        return {};
                    }
                    return { 'data-comment-id': attributes.commentId };
                },
            },
            commentText: {
                default: null,
                parseHTML: element => element.getAttribute('data-comment-text'),
                renderHTML: attributes => {
                    if (!attributes.commentText) {
                        return {};
                    }
                    return { 'data-comment-text': attributes.commentText };
                },
            },
            commentThread: {
                default: null,
                parseHTML: element => element.getAttribute('data-comment-thread'),
                renderHTML: attributes => {
                    if (!attributes.commentThread) {
                        return {};
                    }
                    return { 'data-comment-thread': attributes.commentThread };
                },
            },
            userId: {
                default: null,
                parseHTML: element => element.getAttribute('data-user-id'),
                renderHTML: attributes => {
                    if (!attributes.userId) {
                        return {};
                    }
                    return { 'data-user-id': attributes.userId };
                },
            },
            userName: {
                default: null,
                parseHTML: element => element.getAttribute('data-user-name'),
                renderHTML: attributes => {
                    if (!attributes.userName) {
                        return {};
                    }
                    return { 'data-user-name': attributes.userName };
                },
            },
            timestamp: {
                default: null,
                parseHTML: element => {
                    const ts = element.getAttribute('data-timestamp');
                    return ts ? parseInt(ts, 10) : null;
                },
                renderHTML: attributes => {
                    if (!attributes.timestamp) {
                        return {};
                    }
                    return { 'data-timestamp': attributes.timestamp.toString() };
                },
            },
            color: {
                default: null,
                parseHTML: element => element.getAttribute('data-color'),
                renderHTML: attributes => {
                    if (!attributes.color) {
                        return {};
                    }
                    return { 'data-color': attributes.color };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-comment-id]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        const style = HTMLAttributes['data-color']
            ? `background-color: ${HTMLAttributes['data-color']}20;`
            : '';
        return ['span', mergeAttributes(
            this.options.HTMLAttributes,
            HTMLAttributes,
            { class: 'comment-mark', style }
        ), 0];
    },

    addCommands() {
        return {
            setComment:
                (attributes) =>
                    ({ commands }) => {
                        return commands.setMark(this.name, attributes);
                    },
            unsetComment:
                () =>
                    ({ commands }) => {
                        return commands.unsetMark(this.name);
                    },
            updateComment:
                (attributes) =>
                    ({ commands, editor }) => {
                        const currentAttrs = editor.getAttributes(this.name);
                        return commands.setMark(this.name, { ...currentAttrs, ...attributes });
                    },
        };
    },
});
