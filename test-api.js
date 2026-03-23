const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function testLiveApi() {
    require('dotenv').config({ path: '.env.local' });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !anonKey) {
        console.error("Missing env vars");
        return;
    }

    const supabase = createClient(supabaseUrl, anonKey);
    
    // Create a temporary user
    const email = `test.user${Date.now()}@gmail.com`;
    const password = 'Password!123';
    
    console.log(`Creating user: ${email}...`);
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
    });
    
    if (signUpError) {
        console.error("SignUp Error:", signUpError);
        return;
    }
    
    const session = signUpData.session;
    if (!session) {
        console.error("No session returned from signup (email confirmation might be required)");
        return;
    }
    
    console.log("Got session token.");
    
    try {
        const response = await fetch('http://localhost:3000/api/workspace/settings-access', {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });
        
        console.log(`API Status: ${response.status}`);
        const text = await response.text();
        console.log(`API Response: ${text}`);
    } catch (e) {
        console.error("Fetch failed (is localhost:3000 running?):", e);
    }
}

testLiveApi();
