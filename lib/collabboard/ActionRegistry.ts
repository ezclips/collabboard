// lib/collabboard/ActionRegistry.ts

export type ActionScope = 'canvas' | 'post' | 'line' | 'selection';

export type ContextTarget =
    | { kind: 'canvas'; x: number; y: number }
    | { kind: 'post'; postId: string; postType: string; x: number; y: number }
    | { kind: 'line'; lineId: string; x: number; y: number };

export type ActionContext = {
    scope: ActionScope;
    target?: ContextTarget;
    selection?: any;
    [key: string]: any; // Allow for extra context like onUpdate, onDelete etc.
};

export type ActionId =
    | 'canvas.selectAll'
    | 'create.note'
    | 'edit.cut'
    | 'edit.copy'
    | 'edit.paste'
    | 'edit.duplicate'
    | 'edit.delete'
    | 'post.groupIntoColumn'
    | 'post.lockPosition'
    | 'post.bringToFront'
    | 'post.sendToBack'
    | 'post.bringForward'
    | 'post.sendBackward'
    | 'post.createSyncedCopy'
    | 'post.addImage'
    | 'post.copyLinkAddress'
    | 'post.rename'
    | 'image.replace'
    | 'image.download'
    | 'image.cropToGrid'
    | 'line.lockPosition'
    | 'line.bringToFront'
    | 'line.sendToBack';

export type RegisteredAction = {
    id: ActionId;
    label: string;
    shortcut?: string;
    scopes: ActionScope[];
    isEnabled?: (ctx: ActionContext) => boolean;
    run: (ctx: ActionContext) => void | Promise<void>;
};

class ActionRegistry {
    private actions: Map<ActionId, RegisteredAction> = new Map();

    register(action: RegisteredAction) {
        this.actions.set(action.id, action);
    }

    getAction(id: ActionId): RegisteredAction | undefined {
        return this.actions.get(id);
    }

    getActionsForScope(scope: ActionScope): RegisteredAction[] {
        return Array.from(this.actions.values()).filter(a => a.scopes.includes(scope));
    }

    execute(id: ActionId, ctx: ActionContext) {
        const action = this.actions.get(id);
        if (action && (!action.isEnabled || action.isEnabled(ctx))) {
            action.run(ctx);
        }
    }
}

export const actionRegistry = new ActionRegistry();
