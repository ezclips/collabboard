const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function testInsert() {
    // get r.meichtry@hotmail.com user id
    const { data: usersData } = await adminClient.auth.admin.listUsers();
    const user = usersData.users.find(u => u.email === 'r.meichtry@hotmail.com');
    if (!user) {
        console.log("User not found");
        return;
    }
    
    console.log("Found user:", user.id);
    
    // Attempt the insert as done in route.ts
    const { data: createdWorkspace, error: createWorkspaceError } = await adminClient
        .from('workspaces')
        .insert({
            owner_user_id: user.id,
            name: "Test Workspace Insert",
        })
        .select('id, name, logo_url')
        .single();
        
    console.log("Create Workspace Result:", { createdWorkspace, createWorkspaceError });
}

testInsert();
