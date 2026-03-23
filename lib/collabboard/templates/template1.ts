import { supabase } from '@/lib/supabase';
import { Padlet } from '@/types/collabboard';
import {
    canCreateBoardForEntitlements,
    getWorkspaceEntitlements,
} from '@/lib/auth/permissions';
import {
    buildBoardAccessMetadata,
    createDefaultWorkspaceAccessPolicy,
    normalizeWorkspaceAccessPolicy,
} from '@/lib/workspace/access-policy';

export async function createTemplate1Canvas(userId: string, workspaceId?: string | null) {
    const entitlements = await getWorkspaceEntitlements(supabase, workspaceId);
    const defaultAccessPolicy = createDefaultWorkspaceAccessPolicy();
    let boardAccessPolicy = defaultAccessPolicy;

    if (workspaceId) {
        const { data: workspaceSettings } = await supabase
            .from('workspace_settings')
            .select('access_policy')
            .eq('workspace_id', workspaceId)
            .maybeSingle();

        boardAccessPolicy = normalizeWorkspaceAccessPolicy(workspaceSettings?.access_policy);
    }

    let boardCountQuery = supabase
        .from('boards')
        .select('*', { count: 'exact', head: true });

    boardCountQuery = workspaceId
        ? boardCountQuery.eq('workspace_id', workspaceId)
        : boardCountQuery.eq('user_id', userId);

    const { count: boardCount, error: boardCountError } = await boardCountQuery.is('deleted_at', null);
    if (boardCountError) {
        throw boardCountError;
    }

    if (!canCreateBoardForEntitlements(entitlements, boardCount ?? 0)) {
        throw new Error('Free plan allows up to 3 active boards. Upgrade to Pro to create more.');
    }

    // 1. Create the Board
    const { data: board, error: boardError } = await supabase
        .from('boards')
        .insert({
            title: 'Template 1',
            description: 'Project Planning & Brand Design Template',
            layout: 'freeform', // Important for DrawingLayout
            background_type: 'color',
            background_value: '#f8f9fa',
            comments_enabled: true,
            reactions_enabled: true,
            user_id: userId,
            workspace_id: workspaceId ?? null,
            thumbnail: '🍕',
            metadata: buildBoardAccessMetadata(boardAccessPolicy),
        })
        .select()
        .single();

    if (boardError || !board) throw boardError || new Error('Failed to create board');

    // 2. Create Board Membership
    await supabase.from('kanban_board_members').upsert({
        canvas_id: board.id,
        user_id: userId,
        role: 'owner',
        permission_level: 'admin',
    });

    // 3. Create Master Drawing Padlet (for Excalidraw sync)
    const masterDrawingId = crypto.randomUUID();
    await supabase.from('padlets').insert({
        id: masterDrawingId,
        board_id: board.id,
        type: 'drawing',
        title: 'Master Drawing',
        content: '[]',
        position_x: 0,
        position_y: 0,
        metadata: {
            drawingAppState: JSON.stringify({
                zoom: { value: 0.8 },
                scrollX: 100,
                scrollY: 100
            }),
            drawingFiles: '{}'
        }
    });

    // 4. Create Containers
    const planningId = crypto.randomUUID();
    const inspirationId = crypto.randomUUID();
    const designId = crypto.randomUUID();
    const column4Id = crypto.randomUUID();

    const containers = [
        {
            id: planningId,
            board_id: board.id,
            title: 'Planning',
            type: 'container',
            position_x: 50,
            position_y: 50,
            width: 350,
            height: 800,
            metadata: { isContainer: true, topStrip: '#6366f1' }
        },
        {
            id: inspirationId,
            board_id: board.id,
            title: 'Inspiration',
            type: 'container',
            position_x: 440,
            position_y: 50,
            width: 350,
            height: 800,
            metadata: { isContainer: true, topStrip: '#10b981' }
        },
        {
            id: designId,
            board_id: board.id,
            title: 'Design',
            type: 'container',
            position_x: 830,
            position_y: 50,
            width: 350,
            height: 800,
            metadata: { isContainer: true, topStrip: '#ec4899' }
        }
    ];

    await supabase.from('padlets').insert(containers);

    // 5. Create Child Padlets
    const childPadlets: any[] = [
        // --- Planning Section ---
        {
            board_id: board.id,
            title: 'Papa Pizza brand redesign',
            content: '• Logo refresh for Papa Pizza\n• Branding that resonates with a classic approach to pizza\n\n ❤️ Keep the "traditional" appearance',
            type: 'text',
            metadata: { parentId: planningId, cardColor: '#ffffff' }
        },
        {
            board_id: board.id,
            title: 'Project brief',
            content: '296 words',
            type: 'text',
            metadata: { parentId: planningId, cardColor: '#f9fafb', icon: 'FileText' }
        },
        {
            board_id: board.id,
            title: 'To do',
            content: JSON.stringify([
                { id: '1', text: 'Kickoff meeting with client', completed: true },
                { id: '2', text: 'Explore 3 logo design concepts', completed: false, dueDate: '2025-11-15' },
                { id: '3', text: 'Present final logo concept', completed: false },
                { id: '4', text: 'Brand roll-out and examples', completed: false },
                { id: '5', text: 'Pizza box and signage designs', completed: false }
            ]),
            type: 'todo',
            metadata: { parentId: planningId, cardColor: '#ffffff' }
        },

        // --- Inspiration Section ---
        {
            board_id: board.id,
            title: 'Moodboard',
            content: '0 cards',
            type: 'image',
            file_url: '/templates/moodboard.png',
            metadata: { parentId: inspirationId, cardColor: '#ffffff' }
        },
        {
            board_id: board.id,
            title: 'Ideas',
            content: '0 cards',
            type: 'image',
            file_url: '/templates/moodboard.png', // Placeholder
            metadata: { parentId: inspirationId, cardColor: '#ffffff' }
        },
        {
            board_id: board.id,
            title: 'Mascot Illustration',
            content: '',
            type: 'image',
            file_url: '/templates/mascot.png',
            width: 300,
            height: 400,
            metadata: { parentId: inspirationId }
        },

        // --- Design Section ---
        {
            board_id: board.id,
            title: 'Logo concepts',
            content: '0 cards',
            type: 'image',
            file_url: '/templates/moodboard.png', // Placeholder
            metadata: { parentId: designId, cardColor: '#ffffff' }
        },
        {
            board_id: board.id,
            title: 'Packaging & signage',
            content: '0 cards',
            type: 'image',
            file_url: '/templates/packaging.png',
            metadata: { parentId: designId, cardColor: '#ffffff' }
        },
        {
            board_id: board.id,
            title: 'Design direction',
            content: '"A classic Italian pizzeria delivering handcrafted, quality pizza pies"',
            type: 'text',
            metadata: { parentId: designId, cardColor: '#ffffff', italic: true }
        },
        {
            board_id: board.id,
            title: 'Project budget',
            content: JSON.stringify({
                headers: ['Phase', 'Hours', 'Cost', 'Done'],
                rows: [
                    ['Exploration phase (3 x concepts)', '8', '800,00 $', true],
                    ['Final logo design concept', '12', '3.600,00 $', true],
                    ['Brand rollout (cartons & signage)', '48', '5.200,00 $', true],
                    ['Brand guidelines', '32', '3.800,00 $', false]
                ],
                total: '13.400,00 $'
            }),
            type: 'table',
            metadata: { parentId: designId, cardColor: '#ffffff' }
        }
    ];

    // Insert children
    const { data: createdChildren, error: childrenError } = await supabase
        .from('padlets')
        .insert(childPadlets)
        .select();

    if (childrenError) console.error('Error creating template children:', childrenError);

    // Update containers metadata with child IDs
    if (createdChildren) {
        const planningChildrenIds = createdChildren.filter(c => c.metadata?.parentId === planningId).map(c => c.id);
        const inspirationChildrenIds = createdChildren.filter(c => c.metadata?.parentId === inspirationId).map(c => c.id);
        const designChildrenIds = createdChildren.filter(c => c.metadata?.parentId === designId).map(c => c.id);

        await Promise.all([
            supabase.from('padlets').update({ metadata: { ...containers[0].metadata, childPadletIds: planningChildrenIds } }).eq('id', planningId),
            supabase.from('padlets').update({ metadata: { ...containers[1].metadata, childPadletIds: inspirationChildrenIds } }).eq('id', inspirationId),
            supabase.from('padlets').update({ metadata: { ...containers[2].metadata, childPadletIds: designChildrenIds } }).eq('id', designId),
        ]);
    }

    // 6. Create stand-alone padlets (right side)
    const standalonePadlets: any[] = [
        {
            board_id: board.id,
            title: 'Pizza Mockup',
            content: '',
            type: 'image',
            file_url: '/templates/mockup.png',
            position_x: 1220,
            position_y: 50,
            width: 400,
            height: 400,
        },
        {
            board_id: board.id,
            title: 'Mockup-Pizza.pdf',
            content: 'Download - Open - 20.1 MB',
            type: 'link',
            position_x: 1220,
            position_y: 500,
            width: 350,
            height: 100,
            metadata: { cardColor: '#ffffff', icon: 'file-text' }
        }
    ];

    await supabase.from('padlets').insert(standalonePadlets);

    return board.id;
}
