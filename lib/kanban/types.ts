export interface KanbanDBBoard {
    id: string;
    canvas_id: string;
    created_at: string;
}

export interface KanbanDBSwimlane {
    id: string;
    canvas_id: string;
    name: string;
    description?: string;
    order_index: number;
    is_collapsed: boolean;
    created_at: string;
    updated_at: string;
}

export interface KanbanDBColumn {
    id: string;
    canvas_id: string;
    name: string;
    description?: string;
    group_id?: string;
    order_index: number;
    task_limit: number;
    is_collapsed: boolean;
    created_at: string;
    updated_at: string;
}

export interface KanbanDBColumnGroup {
    id: string;
    canvas_id: string;
    label: string;
    order_index: number;
    is_collapsed: boolean;
    created_at: string;
    updated_at: string;
}

export interface KanbanDBCard {
    id: string;
    canvas_id: string;
    column_id: string;
    swimlane_id?: string;
    parent_id?: string;
    title: string;
    content?: string;
    task_type?: 'Feature' | 'Task' | 'Milestone';
    color_id?: string;
    project_id?: string;
    status?: string;
    priority: number;
    score: number;
    date_due?: string;
    date_started?: string;
    reference?: string;
    time_estimated: number;
    time_spent: number;
    order_index: number;
    assignee_id?: string;
    creator_id?: string;
    created_at: string;
    updated_at: string;
}

export interface KanbanDBMember {
    id: string;
    canvas_id: string;
    user_id: string;
    role: string;
    permission_level?: 'view' | 'comment' | 'edit' | 'admin';
    sort_by?: string | null;
    sort_order?: 'asc' | 'desc';
    group_by?: 'none' | 'assignee' | 'priority' | 'project' | 'status';
    date_format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
    email?: string;
    display_name?: string;
    avatar_url?: string;
    created_at: string;
}

export interface KanbanDBLink {
    id: string;
    canvas_id: string;
    from_card_id: string;
    to_card_id: string;
    relation: string;
    created_at: string;
}

export interface KanbanDBCardAssignee {
    id: string;
    canvas_id: string;
    card_id: string;
    user_id: string;
    created_at: string;
}

export interface KanbanDBComment {
    id: string;
    canvas_id: string;
    card_id: string;
    user_id: string;
    text: string;
    created_at: string;
    updated_at: string;
}

export interface KanbanDBVote {
    id: string;
    canvas_id: string;
    card_id: string;
    user_id: string;
    value: number;
    created_at: string;
}

export interface KanbanFullData {
    cards: KanbanDBCard[];
    columns: KanbanDBColumn[];
    columnGroups: KanbanDBColumnGroup[];
    rows: KanbanDBSwimlane[];
    members: KanbanDBMember[];
    links: KanbanDBLink[];
    assignees: KanbanDBCardAssignee[];
    comments: KanbanDBComment[];
    votes: KanbanDBVote[];
}

export interface KanbanColumnCardsData {
    cards: KanbanDBCard[];
    assignees: KanbanDBCardAssignee[];
    comments: KanbanDBComment[];
    votes: KanbanDBVote[];
}
