import { supabase } from '@/lib/supabase';

export interface LibraryItemContent {
    title: string;
    content: string;
    type?: string;
    file_url?: string;
    file_name?: string;
    file_type?: string;
    file_size?: number;
    width: number;
    height: number;
    // Any other padlet fields we want to preserve
    metadata?: Record<string, any>;
}

export interface LibraryItem {
    id: string;
    user_id: string;
    title: string;
    description?: string;
    type: string;
    content: LibraryItemContent;
    thumbnail_url?: string;
    is_public: boolean;
    created_at: string;
    updated_at: string;
}

/**
 * Fetch all library items for the current user
 */
export async function fetchLibraryItems() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('library_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data as LibraryItem[];
}

/**
 * Add a new item to the library
 */
export async function addToLibrary(item: Omit<LibraryItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('library_items')
        .insert([{
            ...item,
            user_id: user.id
        }])
        .select()
        .single();

    if (error) throw error;
    return data as LibraryItem;
}

/**
 * Delete an item from the library
 */
export async function deleteFromLibrary(id: string) {
    const { error } = await supabase
        .from('library_items')
        .delete()
        .eq('id', id);

    if (error) throw error;
}
