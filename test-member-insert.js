const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function testInsert() {
    const user = { id: '40f7e106-a775-408a-b214-b07b6f98b1dc', email: 'r.meichtry@hotmail.com' };
    const workspace_id = 'c43986c9-9db2-477b-a037-53f388a85da3';
    
    console.log("Attempting insert into members...");
    const { data: createdMember, error: createMemberError } = await adminClient
        .from('workspace_members')
        .insert({
            workspace_id: workspace_id,
            workspace_owner_id: user.id,
            member_user_id: user.id,
            member_email: user.email ?? '',
            role: 'owner',
            status: 'active',
            invited_at: new Date().toISOString(),
            joined_at: new Date().toISOString(),
        });
        
    console.log("Create Member Result:", { createdMember, createMemberError });
}

testInsert();
