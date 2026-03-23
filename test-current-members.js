const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function testCurrent() {
    const { data: usersData } = await adminClient.auth.admin.listUsers();
    const user = usersData.users.find(u => u.email === 'r.meichtry@hotmail.com');
    if (!user) {
        console.log("User not found");
        return;
    }
    
    console.log("Found user:", user.email, user.id);
    
    // Check owned workspaces
    const { data: owned } = await adminClient.from('workspaces').select('*').eq('owner_user_id', user.id);
    console.log("Owned workspaces:", owned.length, owned);
    
    // Check memberships
    const { data: directMemberships } = await adminClient.from('workspace_members').select('*').eq('member_user_id', user.id);
    console.log("Direct Memberships:", directMemberships.length, directMemberships);
    
    const { data: emailMemberships } = await adminClient.from('workspace_members').select('*').eq('member_email', user.email);
    console.log("Email Memberships:", emailMemberships.length, emailMemberships);
}

testCurrent();
