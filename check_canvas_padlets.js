const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const canvasId = 'a8e0355d-319d-47f3-a900-658946bb6a27';
    console.log(`Deleting all non-drawing padlets for canvas: ${canvasId}`);

    const { data: deleteData, error: deleteError } = await supabase
        .from('padlets')
        .delete()
        .eq('board_id', canvasId)
        .neq('type', 'drawing');

    if (deleteError) {
        console.error('Error deleting padlets:', deleteError);
        return;
    }

    console.log(`Successfully deleted orphaned padlets.`);
}

check();
