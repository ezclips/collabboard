const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function simulateApi(userId, userEmail) {
    const normalizeRole = (role) => (role || '').trim().toLowerCase();
    const isManagerRole = (role) => {
        const normalized = normalizeRole(role);
        return normalized === 'owner' || normalized === 'admin';
    };

    const { data: directMemberships } = await adminClient
        .from('workspace_members')
        .select('*')
        .eq('status', 'active')
        .eq('member_user_id', userId)
        .order('created_at', { ascending: true });

    const { data: emailMemberships } = userEmail
        ? await adminClient
            .from('workspace_members')
            .select('*')
            .eq('status', 'active')
            .eq('member_email', userEmail)
            .order('created_at', { ascending: true })
        : { data: [] };

    const membershipMap = new Map();
    for (const membership of [...(directMemberships || []), ...(emailMemberships || [])]) {
        const key = `${membership.workspace_id}:${membership.member_user_id || ''}:${membership.member_email || ''}:${membership.role || ''}`;
        if (!membershipMap.has(key)) {
            membershipMap.set(key, membership);
        }
    }

    const memberships = Array.from(membershipMap.values());
    const normalizedMemberships = memberships.map((membership) => ({
        workspaceId: membership.workspace_id,
        role: normalizeRole(membership.role),
        match: membership.member_user_id === userId ? 'user_id' : 'email',
        memberEmail: membership.member_email || null,
        createdAt: membership.created_at || null,
    }));

    const managerMembership = normalizedMemberships.find((membership) =>
        isManagerRole(membership.role),
    );

    if (managerMembership) {
        return { can_manage: true, source: managerMembership.match, role: managerMembership.role, memberships: normalizedMemberships };
    }

    const { data: ownedWorkspace } = await adminClient
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (ownedWorkspace?.id) {
        return { can_manage: true, source: 'owner_lookup', role: 'owner', memberships: normalizedMemberships };
    }

    const firstMembership = normalizedMemberships[0] || null;
    if (firstMembership?.workspaceId) {
        return { can_manage: false, source: firstMembership.match, role: firstMembership.role, memberships: normalizedMemberships };
    }
    
    return { can_manage: "would_create_new", memberships: normalizedMemberships };
}

async function run() {
    const { data: usersData } = await adminClient.auth.admin.listUsers();
    for (const user of usersData.users) {
        const result = await simulateApi(user.id, user.email);
        console.log(`\nUser: ${user.email}`);
        console.log(JSON.stringify(result, null, 2));
    }
}
run();
