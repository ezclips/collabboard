import { supabaseBrowser } from '@/lib/supabase/browser';
import type {
    KanbanDBCard,
    KanbanDBCardAssignee,
    KanbanColumnCardsData,
    KanbanDBComment,
    KanbanDBColumn,
    KanbanDBColumnGroup,
    KanbanDBSwimlane,
    KanbanDBVote,
    KanbanFullData
} from './types';

let cardAssigneesTableAvailable: boolean | null = null;
let commentsTableAvailable: boolean | null = null;
let votesTableAvailable: boolean | null = null;

const supabase = supabaseBrowser();

export type SaveLinkResult = {
    ok: boolean;
    isDuplicate: boolean;
    message?: string;
};

export type SaveEntityResult = {
    ok: boolean;
    conflict: boolean;
    message?: string;
};

export type SaveCommentResult = SaveEntityResult & {
    comment?: KanbanDBComment;
};

export type SaveVoteResult = SaveEntityResult & {
    vote?: KanbanDBVote;
};

type SaveEntityOptions = {
    isNew?: boolean;
    expectedUpdatedAt?: string;
};

function toDbPriority(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') return value;
    if (value === 'low') return 1;
    if (value === 'high') return 3;
    if (value === 'medium') return 2;
    return undefined;
}

function formatSupabaseError(error: unknown) {
    if (!error) return null;
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...(error as unknown as Record<string, unknown>),
        };
    }
    if (typeof error === 'object') {
        const record = error as Record<string, unknown>;
        const formatted: Record<string, unknown> = {};
        const keys = new Set<string>([
            ...Object.keys(record),
            ...Object.getOwnPropertyNames(error),
            'code',
            'message',
            'details',
            'hint',
            'name',
            'status',
            'statusCode',
        ]);
        for (const key of keys) {
            try {
                const value = record[key];
                if (value !== undefined) {
                    formatted[key] = value;
                }
            } catch (readError) {
                formatted[key] = `[unreadable: ${String(readError)}]`;
            }
        }
        if (!('stringValue' in formatted)) {
            try {
                formatted.stringValue = String(error);
            } catch {}
        }
        if (!('prototype' in formatted)) {
            try {
                formatted.prototype = Object.getPrototypeOf(error)?.constructor?.name ?? null;
            } catch {}
        }
        return formatted;
    }
    return { message: String(error) };
}

function stringifyForConsole(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function getSupabaseErrorMessage(error: unknown): string {
    const formatted = formatSupabaseError(error);
    if (!formatted || typeof formatted !== 'object') return '';
    const message = (formatted as Record<string, unknown>).message;
    const details = (formatted as Record<string, unknown>).details;
    const hint = (formatted as Record<string, unknown>).hint;
    return [message, details, hint].filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ');
}

function getSupabaseErrorCode(error: unknown): string | undefined {
    const formatted = formatSupabaseError(error);
    if (!formatted || typeof formatted !== 'object') return undefined;
    const code = (formatted as Record<string, unknown>).code;
    return typeof code === 'string' ? code : undefined;
}

function getMissingColumnFromError(error: unknown, tableName: string): string | null {
    const message = getSupabaseErrorMessage(error);
    if (!message) return null;

    const quotedColumnMatch = message.match(/column ["']?([a-zA-Z0-9_]+)["']?/i);
    if (quotedColumnMatch?.[1]) return quotedColumnMatch[1];

    const schemaCachePattern = new RegExp(`Could not find the ['"]([a-zA-Z0-9_]+)['"] column of ['"]${tableName}['"]`, 'i');
    const schemaCacheMatch = message.match(schemaCachePattern);
    if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

    return null;
}

async function insertCardWithFallback(payload: Partial<KanbanDBCard>) {
    const retryableOptionalColumns = new Set(['parent_id', 'project_id', 'status', 'task_type']);
    const insertPayload = { ...payload };

    while (true) {
        const result = await supabase.from('kanban_cards').insert(insertPayload);
        if (!result.error) return result;

        const code = getSupabaseErrorCode(result.error);
        const missingColumn = getMissingColumnFromError(result.error, 'kanban_cards');
        if ((code === '42703' || code === 'PGRST204') && missingColumn && retryableOptionalColumns.has(missingColumn) && missingColumn in insertPayload) {
            delete (insertPayload as Record<string, unknown>)[missingColumn];
            continue;
        }

        return result;
    }
}

async function updateCardWithFallback(card: { id: string; canvas_id: string; updated_at?: string }, payload: Partial<KanbanDBCard>) {
    const retryableOptionalColumns = new Set(['parent_id', 'project_id', 'status', 'task_type']);
    const updatePayload = { ...payload };

    while (true) {
        let query = supabase
            .from('kanban_cards')
            .update({
                ...updatePayload,
                updated_at: new Date().toISOString()
            })
            .eq('id', card.id)
            .eq('canvas_id', card.canvas_id);

        if (card.updated_at) {
            query = query.eq('updated_at', card.updated_at);
        }

        const result = await query.select('id');
        if (!result.error) return { ...result, attemptedPayload: { ...updatePayload } };

        const code = getSupabaseErrorCode(result.error);
        const missingColumn = getMissingColumnFromError(result.error, 'kanban_cards');
        if ((code === '42703' || code === 'PGRST204') && missingColumn && retryableOptionalColumns.has(missingColumn) && missingColumn in updatePayload) {
            delete (updatePayload as Record<string, unknown>)[missingColumn];
            continue;
        }

        return { ...result, attemptedPayload: { ...updatePayload } };
    }
}

function sanitizeCardPayload(card: Record<string, any>): Partial<KanbanDBCard> {
    const payload: Partial<KanbanDBCard> = {};
    const allowedKeys: Array<keyof KanbanDBCard> = [
        'id',
        'canvas_id',
        'column_id',
        'swimlane_id',
        'parent_id',
        'title',
        'content',
        'task_type',
        'color_id',
        'project_id',
        'status',
        'priority',
        'score',
        'date_due',
        'date_started',
        'reference',
        'time_estimated',
        'time_spent',
        'order_index',
        'assignee_id',
        'creator_id',
        'created_at',
        'updated_at',
    ];

    for (const key of allowedKeys) {
        if (card[key] !== undefined) {
            (payload as any)[key] = card[key];
        }
    }

    // Fallback mapping from frontend card shape in case camelCase leaks in.
    if (payload.column_id === undefined && card.columnId !== undefined) payload.column_id = card.columnId;
    if (payload.swimlane_id === undefined && card.rowId !== undefined) payload.swimlane_id = card.rowId;
    if (payload.parent_id === undefined && card.parent !== undefined) payload.parent_id = card.parent;
    if (payload.task_type === undefined && card.task_type !== undefined) payload.task_type = card.task_type;
    if (payload.title === undefined && card.label !== undefined) payload.title = card.label;
    if (payload.content === undefined && card.description !== undefined) payload.content = card.description;
    if (payload.order_index === undefined && card.order !== undefined) payload.order_index = card.order;
    if (payload.color_id === undefined && card.color !== undefined) payload.color_id = card.color;
    if (payload.project_id === undefined && card.projectId !== undefined) payload.project_id = card.projectId;
    if (payload.status === undefined && card.status !== undefined) payload.status = card.status;
    if (payload.date_due === undefined && card.end_date !== undefined) payload.date_due = card.end_date;
    if (payload.date_started === undefined && card.start_date !== undefined) payload.date_started = card.start_date;
    if (payload.score === undefined && card.progress !== undefined) payload.score = card.progress;
    if (payload.priority === undefined) {
        const mappedPriority = toDbPriority(card.priority);
        if (mappedPriority !== undefined) payload.priority = mappedPriority;
    }

    return payload;
}

function sanitizeColumnPayload(column: Record<string, any>): Partial<KanbanDBColumn> {
    const payload: Partial<KanbanDBColumn> = {};
    const allowedKeys: Array<keyof KanbanDBColumn> = [
        'id',
        'canvas_id',
        'name',
        'description',
        'group_id',
        'order_index',
        'task_limit',
        'is_collapsed',
        'created_at',
        'updated_at',
    ];

    for (const key of allowedKeys) {
        if (column[key] !== undefined) {
            (payload as any)[key] = column[key];
        }
    }

    if (payload.name === undefined && column.label !== undefined) payload.name = column.label;
    if (payload.group_id === undefined && column.groupId !== undefined) payload.group_id = column.groupId;
    if (payload.order_index === undefined && column.order !== undefined) payload.order_index = column.order;
    if (payload.task_limit === undefined && column.limit !== undefined) payload.task_limit = column.limit;
    if (payload.is_collapsed === undefined && column.collapsed !== undefined) payload.is_collapsed = column.collapsed;

    return payload;
}

function sanitizeSwimlanePayload(swimlane: Record<string, any>): Partial<KanbanDBSwimlane> {
    const payload: Partial<KanbanDBSwimlane> = {};
    const allowedKeys: Array<keyof KanbanDBSwimlane> = [
        'id',
        'canvas_id',
        'name',
        'description',
        'order_index',
        'is_collapsed',
        'created_at',
        'updated_at',
    ];

    for (const key of allowedKeys) {
        if (swimlane[key] !== undefined) {
            (payload as any)[key] = swimlane[key];
        }
    }

    if (payload.name === undefined && swimlane.label !== undefined) payload.name = swimlane.label;
    if (payload.order_index === undefined && swimlane.order !== undefined) payload.order_index = swimlane.order;
    if (payload.is_collapsed === undefined && swimlane.collapsed !== undefined) payload.is_collapsed = swimlane.collapsed;

    return payload;
}

/**
 * Load all Kanban-related data for a specific board (canvas)
 */
export async function loadKanbanData(canvasId: string): Promise<KanbanFullData | null> {
    try {
        const membersPromise = (async () => {
            const rpcRes = await supabase.rpc('get_board_members_with_profile', { board_id: canvasId });
            if (!rpcRes.error) {
                return rpcRes;
            }
            if (rpcRes.error.code === '42883' || rpcRes.error.code === 'PGRST202') {
                return await supabase.from('kanban_board_members').select('*').eq('canvas_id', canvasId);
            }
            return rpcRes;
        })();

        const [cardsRes, columnsRes, columnGroupsRes, swimlanesRes, membersRes, linksRes, assigneesRes, commentsRes, votesRes] = await Promise.all([
            supabase.from('kanban_cards').select('*').eq('canvas_id', canvasId).order('order_index', { ascending: true }),
            supabase.from('kanban_columns').select('*').eq('canvas_id', canvasId).order('order_index', { ascending: true }),
            supabase.from('kanban_column_groups').select('*').eq('canvas_id', canvasId).order('order_index', { ascending: true }),
            supabase.from('kanban_swimlanes').select('*').eq('canvas_id', canvasId).order('order_index', { ascending: true }),
            membersPromise,
            supabase.from('kanban_links').select('*').eq('canvas_id', canvasId),
            supabase.from('kanban_card_assignees').select('*').eq('canvas_id', canvasId),
            supabase.from('kanban_comments').select('*').eq('canvas_id', canvasId).order('created_at', { ascending: true }),
            supabase.from('kanban_votes').select('*').eq('canvas_id', canvasId)
        ]);

        if (cardsRes.error) throw cardsRes.error;
        if (columnsRes.error) throw columnsRes.error;
        if (columnGroupsRes.error) throw columnGroupsRes.error;
        if (swimlanesRes.error) throw swimlanesRes.error;
        if (membersRes.error) throw membersRes.error;
        if (linksRes.error) throw linksRes.error;
        // Allow older environments (before migration) to continue working without hard failure.
        if (assigneesRes.error) {
            if (assigneesRes.error.code === '42P01') {
                cardAssigneesTableAvailable = false;
            } else {
                throw assigneesRes.error;
            }
        } else {
            cardAssigneesTableAvailable = true;
        }

        if (commentsRes.error) {
            if (commentsRes.error.code === '42P01') {
                commentsTableAvailable = false;
            } else {
                throw commentsRes.error;
            }
        } else {
            commentsTableAvailable = true;
        }

        if (votesRes.error) {
            if (votesRes.error.code === '42P01') {
                votesTableAvailable = false;
            } else {
                throw votesRes.error;
            }
        } else {
            votesTableAvailable = true;
        }

        return {
            cards: cardsRes.data || [],
            columns: columnsRes.data || [],
            columnGroups: columnGroupsRes.data || [],
            rows: swimlanesRes.data || [],
            members: membersRes.data || [],
            links: linksRes.data || [],
            assignees: assigneesRes.data || [],
            comments: commentsRes.data || [],
            votes: votesRes.data || []
        };
    } catch (error) {
        console.error('Failed to load kanban data:', error);
        return null;
    }
}

/**
 * Load board scaffold data first (without cards), so cards can be fetched lazily per column.
 */
export async function loadKanbanScaffoldData(canvasId: string): Promise<KanbanFullData | null> {
    try {
        const membersPromise = (async () => {
            const rpcRes = await supabase.rpc('get_board_members_with_profile', { board_id: canvasId });
            if (!rpcRes.error) {
                return rpcRes;
            }
            if (rpcRes.error.code === '42883' || rpcRes.error.code === 'PGRST202') {
                return await supabase.from('kanban_board_members').select('*').eq('canvas_id', canvasId);
            }
            return rpcRes;
        })();

        const [columnsRes, columnGroupsRes, swimlanesRes, membersRes, linksRes] = await Promise.all([
            supabase.from('kanban_columns').select('*').eq('canvas_id', canvasId).order('order_index', { ascending: true }),
            supabase.from('kanban_column_groups').select('*').eq('canvas_id', canvasId).order('order_index', { ascending: true }),
            supabase.from('kanban_swimlanes').select('*').eq('canvas_id', canvasId).order('order_index', { ascending: true }),
            membersPromise,
            supabase.from('kanban_links').select('*').eq('canvas_id', canvasId)
        ]);

        if (columnsRes.error) throw columnsRes.error;
        if (columnGroupsRes.error) {
            if (columnGroupsRes.error.code === '42P01') {
                // Allow older environments (before migration) to continue working without hard failure.
            } else {
                throw columnGroupsRes.error;
            }
        }
        if (swimlanesRes.error) throw swimlanesRes.error;
        if (membersRes.error) throw membersRes.error;
        if (linksRes.error) throw linksRes.error;

        return {
            cards: [],
            columns: columnsRes.data || [],
            columnGroups: columnGroupsRes.data || [],
            rows: swimlanesRes.data || [],
            members: membersRes.data || [],
            links: linksRes.data || [],
            assignees: [],
            comments: [],
            votes: []
        };
    } catch (error) {
        console.error('Failed to load kanban scaffold data:', error);
        return null;
    }
}

/**
 * Load cards and dependent entities for one column.
 */
export async function loadKanbanCardsForColumn(
    canvasId: string,
    columnId: string
): Promise<KanbanColumnCardsData | null> {
    try {
        const cardsRes = await supabase
            .from('kanban_cards')
            .select('*')
            .eq('canvas_id', canvasId)
            .eq('column_id', columnId)
            .order('order_index', { ascending: true });

        if (cardsRes.error) throw cardsRes.error;

        const cards = cardsRes.data || [];
        const cardIds = cards.map((card) => card.id);

        if (cardIds.length === 0) {
            return {
                cards,
                assignees: [],
                comments: [],
                votes: []
            };
        }

        const [assigneesRes, commentsRes, votesRes] = await Promise.all([
            supabase.from('kanban_card_assignees').select('*').eq('canvas_id', canvasId).in('card_id', cardIds),
            supabase.from('kanban_comments').select('*').eq('canvas_id', canvasId).in('card_id', cardIds).order('created_at', { ascending: true }),
            supabase.from('kanban_votes').select('*').eq('canvas_id', canvasId).in('card_id', cardIds)
        ]);

        if (assigneesRes.error) {
            if (assigneesRes.error.code === '42P01') {
                cardAssigneesTableAvailable = false;
            } else {
                throw assigneesRes.error;
            }
        } else {
            cardAssigneesTableAvailable = true;
        }

        if (commentsRes.error) {
            if (commentsRes.error.code === '42P01') {
                commentsTableAvailable = false;
            } else {
                throw commentsRes.error;
            }
        } else {
            commentsTableAvailable = true;
        }

        if (votesRes.error) {
            if (votesRes.error.code === '42P01') {
                votesTableAvailable = false;
            } else {
                throw votesRes.error;
            }
        } else {
            votesTableAvailable = true;
        }

        return {
            cards,
            assignees: assigneesRes.data || [],
            comments: commentsRes.data || [],
            votes: votesRes.data || []
        };
    } catch (error) {
        console.error('Failed to load kanban cards for column:', error);
        return null;
    }
}

/**
 * Persist per-user sort preference for a board.
 */
export async function saveMemberSortPreference(
    canvasId: string,
    sortBy: string | null,
    sortOrder: 'asc' | 'desc'
) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) {
        return { ok: false, message: 'User not authenticated.' };
    }

    const { error } = await supabase
        .from('kanban_board_members')
        .update({
            sort_by: sortBy,
            sort_order: sortOrder,
        })
        .eq('canvas_id', canvasId)
        .eq('user_id', authData.user.id);

    if (error) {
        console.error('Error saving kanban sort preference:', error);
        return { ok: false, message: 'Failed to save sort preference.' };
    }

    return { ok: true };
}

/**
 * Persist per-user date format preference for a board.
 */
export async function saveMemberDateFormatPreference(
    canvasId: string,
    dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) {
        return { ok: false, message: 'User not authenticated.' };
    }

    const { error } = await supabase
        .from('kanban_board_members')
        .update({
            date_format: dateFormat,
        })
        .eq('canvas_id', canvasId)
        .eq('user_id', authData.user.id);

    if (error) {
        console.error('Error saving kanban date format preference:', error);
        return { ok: false, message: 'Failed to save date format preference.' };
    }

    return { ok: true };
}

/**
 * Persist per-user card grouping preference for a board.
 */
export async function saveMemberGroupByPreference(
    canvasId: string,
    groupBy: 'none' | 'assignee' | 'priority' | 'project' | 'status'
) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) {
        return { ok: false, message: 'User not authenticated.' };
    }

    const { error } = await supabase
        .from('kanban_board_members')
        .update({
            group_by: groupBy,
        })
        .eq('canvas_id', canvasId)
        .eq('user_id', authData.user.id);

    if (error) {
        console.error('Error saving kanban group preference:', error);
        return { ok: false, message: 'Failed to save group preference.' };
    }

    return { ok: true };
}

/**
 * Card Persistence
 */
export async function saveCard(card: Partial<KanbanDBCard> & { id: string; canvas_id: string }, isNew = false) {
    const safePayload = sanitizeCardPayload(card as Record<string, any>);
    const shouldInsert = Boolean(isNew);

    // For new cards, use insert. For existing cards, use update to allow partial updates
    if (shouldInsert) {
        const { error } = await insertCardWithFallback({
            ...safePayload,
            updated_at: new Date().toISOString()
        });
        if (error) {
            console.error(`Error creating kanban card: ${stringifyForConsole({
                error: formatSupabaseError(error),
                cardId: card.id,
                canvasId: card.canvas_id,
                payload: safePayload,
            })}`);
            return { ok: false, conflict: false, message: 'Failed to create card.' } as SaveEntityResult;
        }
        return { ok: true, conflict: false } as SaveEntityResult;
    } else {
        const updatePayload = { ...safePayload };
        delete (updatePayload as Partial<KanbanDBCard>).id;
        delete (updatePayload as Partial<KanbanDBCard>).canvas_id;
        delete (updatePayload as Partial<KanbanDBCard>).created_at;
        delete (updatePayload as Partial<KanbanDBCard>).updated_at;

        const { data, error, attemptedPayload } = await updateCardWithFallback(card, updatePayload);
        if (error) {
            console.error(`Error updating kanban card: ${stringifyForConsole({
                error: formatSupabaseError(error),
                cardId: card.id,
                canvasId: card.canvas_id,
                payload: attemptedPayload,
                expectedUpdatedAt: card.updated_at,
            })}`);
            return { ok: false, conflict: false, message: 'Failed to update card.' } as SaveEntityResult;
        }

        if (card.updated_at && (!data || data.length === 0)) {
            return { ok: false, conflict: true, message: 'Card was changed by another user.' } as SaveEntityResult;
        }

        return { ok: true, conflict: false } as SaveEntityResult;
    }
}

export async function deleteCard(cardId: string) {
    const { error } = await supabase.from('kanban_cards').delete().eq('id', cardId);
    if (error) console.error('Error deleting kanban card:', error);
    return !error;
}

/**
 * Column Persistence
 */
export async function saveColumn(column: Partial<KanbanDBColumn> & { id: string; canvas_id: string }, options: SaveEntityOptions = {}) {
    const safePayload = sanitizeColumnPayload(column as Record<string, any>);
    const payload = {
        ...safePayload,
        updated_at: new Date().toISOString()
    };

    if (options.isNew) {
        const { error } = await supabase.from('kanban_columns').insert(payload);
        if (error) {
            console.error(`Error creating kanban column: ${stringifyForConsole({
                error: formatSupabaseError(error),
                columnId: column.id,
                canvasId: column.canvas_id,
                payload,
            })}`);
            return { ok: false, conflict: false, message: 'Failed to create column.' } as SaveEntityResult;
        }
        return { ok: true, conflict: false } as SaveEntityResult;
    }

    let query = supabase
        .from('kanban_columns')
        .update(payload)
        .eq('id', column.id)
        .eq('canvas_id', column.canvas_id);

    if (options.expectedUpdatedAt) {
        query = query.eq('updated_at', options.expectedUpdatedAt);
    }

    const { data, error } = await query.select('id');
    if (error) {
        console.error('Error saving kanban column:', error);
        return { ok: false, conflict: false, message: 'Failed to update column.' } as SaveEntityResult;
    }

    if (options.expectedUpdatedAt && (!data || data.length === 0)) {
        return { ok: false, conflict: true, message: 'Column was changed by another user.' } as SaveEntityResult;
    }

    return { ok: true, conflict: false } as SaveEntityResult;
}

export async function deleteColumn(columnId: string) {
    const { error } = await supabase.from('kanban_columns').delete().eq('id', columnId);
    if (error) console.error('Error deleting kanban column:', error);
    return !error;
}

/**
 * Column Group Persistence
 */
export async function saveColumnGroup(group: Partial<KanbanDBColumnGroup> & { id: string; canvas_id: string }, options: SaveEntityOptions = {}) {
    const payload = {
        id: group.id,
        canvas_id: group.canvas_id,
        label: group.label,
        order_index: group.order_index,
        is_collapsed: group.is_collapsed,
        updated_at: new Date().toISOString()
    };

    if (options.isNew) {
        const { error } = await supabase.from('kanban_column_groups').insert(payload);
        if (error) {
            console.error('Error creating kanban column group:', error);
            return { ok: false, conflict: false, message: 'Failed to create column group.' } as SaveEntityResult;
        }
        return { ok: true, conflict: false } as SaveEntityResult;
    }

    let query = supabase
        .from('kanban_column_groups')
        .update(payload)
        .eq('id', group.id)
        .eq('canvas_id', group.canvas_id);

    if (options.expectedUpdatedAt) {
        query = query.eq('updated_at', options.expectedUpdatedAt);
    }

    const { data, error } = await query.select('id');
    if (error) {
        console.error('Error saving kanban column group:', error);
        return { ok: false, conflict: false, message: 'Failed to update column group.' } as SaveEntityResult;
    }

    if (options.expectedUpdatedAt && (!data || data.length === 0)) {
        return { ok: false, conflict: true, message: 'Column group was changed by another user.' } as SaveEntityResult;
    }

    return { ok: true, conflict: false } as SaveEntityResult;
}

export async function deleteColumnGroup(groupId: string) {
    const { error } = await supabase.from('kanban_column_groups').delete().eq('id', groupId);
    if (error) console.error('Error deleting kanban column group:', error);
    return !error;
}

/**
 * Swimlane (Row) Persistence
 */
export async function saveSwimlane(swimlane: Partial<KanbanDBSwimlane> & { id: string; canvas_id: string }, options: SaveEntityOptions = {}) {
    const safePayload = sanitizeSwimlanePayload(swimlane as Record<string, any>);
    const payload = {
        ...safePayload,
        updated_at: new Date().toISOString()
    };

    if (options.isNew) {
        const { error } = await supabase.from('kanban_swimlanes').insert(payload);
        if (error) {
            console.error(`Error creating kanban swimlane: ${stringifyForConsole({
                error: formatSupabaseError(error),
                swimlaneId: swimlane.id,
                canvasId: swimlane.canvas_id,
                payload,
            })}`);
            return { ok: false, conflict: false, message: 'Failed to create row.' } as SaveEntityResult;
        }
        return { ok: true, conflict: false } as SaveEntityResult;
    }

    let query = supabase
        .from('kanban_swimlanes')
        .update(payload)
        .eq('id', swimlane.id)
        .eq('canvas_id', swimlane.canvas_id);

    if (options.expectedUpdatedAt) {
        query = query.eq('updated_at', options.expectedUpdatedAt);
    }

    const { data, error } = await query.select('id');
    if (error) {
        console.error('Error saving kanban swimlane:', error);
        return { ok: false, conflict: false, message: 'Failed to update row.' } as SaveEntityResult;
    }

    if (options.expectedUpdatedAt && (!data || data.length === 0)) {
        return { ok: false, conflict: true, message: 'Row was changed by another user.' } as SaveEntityResult;
    }

    return { ok: true, conflict: false } as SaveEntityResult;
}

export async function deleteSwimlane(swimlaneId: string) {
    const { error } = await supabase.from('kanban_swimlanes').delete().eq('id', swimlaneId);
    if (error) console.error('Error deleting kanban swimlane:', error);
    return !error;
}

/**
 * Link Persistence
 */
export async function saveLink(link: { id: string; canvas_id: string; from_card_id: string; to_card_id: string; relation: string }): Promise<SaveLinkResult> {
    const { error } = await supabase.from('kanban_links').upsert({
        id: link.id,
        canvas_id: link.canvas_id,
        from_card_id: link.from_card_id,
        to_card_id: link.to_card_id,
        relation: link.relation
    });
    if (error) {
        if (error.code === '23505') {
            return {
                ok: false,
                isDuplicate: true,
                message: 'This link already exists.'
            };
        }
        console.error('Error saving kanban link:', error);
        return {
            ok: false,
            isDuplicate: false,
            message: 'Failed to save link. Please try again.'
        };
    }
    return { ok: true, isDuplicate: false };
}

export async function deleteLink(linkId: string) {
    const { error } = await supabase.from('kanban_links').delete().eq('id', linkId);
    if (error) console.error('Error deleting kanban link:', error);
    return !error;
}

/**
 * Card Assignee Persistence (many-to-many)
 */
export async function saveCardAssignees(canvasId: string, cardId: string, userIds: string[]) {
    if (cardAssigneesTableAvailable === false) return true;
    const uniqueUserIds = Array.from(new Set((userIds || []).filter(Boolean)));

    const { error: deleteError } = await supabase
        .from('kanban_card_assignees')
        .delete()
        .eq('canvas_id', canvasId)
        .eq('card_id', cardId);
    if (deleteError) {
        if (deleteError.code === '42P01') {
            cardAssigneesTableAvailable = false;
            return true;
        }
        console.error(`Error clearing kanban card assignees: ${stringifyForConsole({
            error: formatSupabaseError(deleteError),
            cardId,
            canvasId,
        })}`);
        return false;
    }

    if (uniqueUserIds.length === 0) return true;

    const rows: Omit<KanbanDBCardAssignee, 'created_at'>[] = uniqueUserIds.map((userId) => ({
        id: crypto.randomUUID(),
        canvas_id: canvasId,
        card_id: cardId,
        user_id: userId,
    }));

    const { error: insertError } = await supabase
        .from('kanban_card_assignees')
        .insert(rows);
    if (insertError) {
        if (insertError.code === '42P01') {
            cardAssigneesTableAvailable = false;
            return true;
        }
        console.error(`Error saving kanban card assignees: ${stringifyForConsole({
            error: formatSupabaseError(insertError),
            cardId,
            canvasId,
            userIds: uniqueUserIds,
        })}`);
        return false;
    }
    cardAssigneesTableAvailable = true;
    return true;
}

/**
 * Comment Persistence
 */
export async function saveComment(comment: {
    id: string;
    canvas_id: string;
    card_id: string;
    user_id: string;
    text: string;
}): Promise<SaveCommentResult> {
    if (commentsTableAvailable === false) {
        return { ok: false, conflict: false, message: 'Comments table not available.' };
    }

    const payload = {
        id: comment.id,
        canvas_id: comment.canvas_id,
        card_id: comment.card_id,
        user_id: comment.user_id,
        text: comment.text
    };

    const { data, error } = await supabase
        .from('kanban_comments')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        if (error.code === '42P01') {
            commentsTableAvailable = false;
            return { ok: false, conflict: false, message: 'Comments table not available.' };
        }
        console.error('Error saving kanban comment:', error);
        return { ok: false, conflict: false, message: 'Failed to save comment.' };
    }

    commentsTableAvailable = true;
    return { ok: true, conflict: false, comment: data as KanbanDBComment };
}

export async function deleteComment(commentId: string): Promise<SaveEntityResult> {
    if (commentsTableAvailable === false) {
        return { ok: false, conflict: false, message: 'Comments table not available.' };
    }
    const { error } = await supabase.from('kanban_comments').delete().eq('id', commentId);
    if (error) {
        if (error.code === '42P01') {
            commentsTableAvailable = false;
            return { ok: false, conflict: false, message: 'Comments table not available.' };
        }
        console.error('Error deleting kanban comment:', error);
        return { ok: false, conflict: false, message: 'Failed to delete comment.' };
    }
    commentsTableAvailable = true;
    return { ok: true, conflict: false };
}

/**
 * Vote Persistence
 */
export async function saveVote(vote: {
    id: string;
    canvas_id: string;
    card_id: string;
    user_id: string;
    value: number;
}): Promise<SaveVoteResult> {
    if (votesTableAvailable === false) {
        return { ok: false, conflict: false, message: 'Votes table not available.' };
    }

    const payload = {
        id: vote.id,
        canvas_id: vote.canvas_id,
        card_id: vote.card_id,
        user_id: vote.user_id,
        value: vote.value
    };

    const { data, error } = await supabase
        .from('kanban_votes')
        .upsert(payload, { onConflict: 'card_id,user_id' })
        .select('*')
        .single();

    if (error) {
        if (error.code === '42P01') {
            votesTableAvailable = false;
            return { ok: false, conflict: false, message: 'Votes table not available.' };
        }
        console.error('Error saving kanban vote:', error);
        return { ok: false, conflict: false, message: 'Failed to save vote.' };
    }

    votesTableAvailable = true;
    return { ok: true, conflict: false, vote: data as KanbanDBVote };
}

export async function deleteVote(voteId: string): Promise<SaveEntityResult> {
    if (votesTableAvailable === false) {
        return { ok: false, conflict: false, message: 'Votes table not available.' };
    }
    const { error } = await supabase.from('kanban_votes').delete().eq('id', voteId);
    if (error) {
        if (error.code === '42P01') {
            votesTableAvailable = false;
            return { ok: false, conflict: false, message: 'Votes table not available.' };
        }
        console.error('Error deleting kanban vote:', error);
        return { ok: false, conflict: false, message: 'Failed to delete vote.' };
    }
    votesTableAvailable = true;
    return { ok: true, conflict: false };
}
