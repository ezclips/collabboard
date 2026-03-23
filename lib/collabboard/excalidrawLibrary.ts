// lib/collabboard/excalidrawLibrary.ts

import { supabase } from '@/lib/supabase';

// Types for Excalidraw library items
export interface ExcalidrawLibraryItem {
    id: string;
    name: string;
    description?: string;
    author?: string;
    source: string; // URL to the library or 'local-import'
    preview?: string; // Preview string if available
    elements: any[]; // Excalidraw elements
    created: number;
}

// Storage key for localStorage (used as fallback/cache)
const EXCALIDRAW_LIBRARY_KEY = 'collabboard_excalidraw_library';

// In-memory cache for synchronous access
let memoryCache: ExcalidrawLibraryItem[] = [];
let cacheInitialized = false;

/**
 * Initialize the cache from localStorage (for immediate sync access)
 */
function initializeCache(): void {
    if (cacheInitialized || typeof window === 'undefined') return;
    try {
        const stored = localStorage.getItem(EXCALIDRAW_LIBRARY_KEY);
        memoryCache = stored ? JSON.parse(stored) : [];
        cacheInitialized = true;
    } catch (err) {
        console.error('Failed to parse Excalidraw library from localStorage:', err);
        memoryCache = [];
    }
}

/**
 * Update local cache and localStorage
 */
function updateLocalCache(items: ExcalidrawLibraryItem[]): void {
    memoryCache = items;
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(EXCALIDRAW_LIBRARY_KEY, JSON.stringify(items));
        } catch (err) {
            console.error('Failed to save Excalidraw library to localStorage:', err);
        }
    }
}

/**
 * Fetches all items from the Excalidraw Library (synchronous - returns cached data)
 * For fresh data from database, use fetchExcalidrawLibrary() instead
 */
export function getExcalidrawLibrary(): ExcalidrawLibraryItem[] {
    initializeCache();
    return memoryCache;
}

/**
 * Fetches all items from the Excalidraw Library from database
 */
export async function fetchExcalidrawLibrary(): Promise<ExcalidrawLibraryItem[]> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            // Not authenticated - return cached/localStorage data
            initializeCache();
            return memoryCache;
        }

        const { data, error } = await supabase
            .from('excalidraw_library')
            .select('*')
            .eq('user_id', user.id)
            .order('created', { ascending: false });

        if (error) throw error;

        const items: ExcalidrawLibraryItem[] = (data || []).map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            author: row.author,
            source: row.source,
            preview: row.preview,
            elements: row.elements,
            created: row.created
        }));

        // Update local cache
        updateLocalCache(items);
        return items;
    } catch (err) {
        console.error('Failed to fetch Excalidraw library from database:', err);
        // Fallback to local cache
        initializeCache();
        return memoryCache;
    }
}

/**
 * Saves the entire Excalidraw Library to database
 * @deprecated Use addToExcalidrawLibrary or removeFromExcalidrawLibrary instead
 */
export function saveExcalidrawLibrary(items: ExcalidrawLibraryItem[]): void {
    // Update local cache immediately for backwards compatibility
    updateLocalCache(items);
}

/**
 * Adds a new item to the Excalidraw Library
 */
export async function addToExcalidrawLibrary(item: ExcalidrawLibraryItem): Promise<void> {
    // Update local cache immediately for responsive UI
    const current = getExcalidrawLibrary();
    if (!current.find(i => i.id === item.id)) {
        updateLocalCache([item, ...current]);
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.warn('Not authenticated - Excalidraw library saved to localStorage only');
            return;
        }

        const { error } = await supabase
            .from('excalidraw_library')
            .upsert({
                id: item.id,
                user_id: user.id,
                name: item.name,
                description: item.description,
                author: item.author,
                source: item.source,
                preview: item.preview,
                elements: item.elements,
                created: item.created
            });

        if (error) throw error;
    } catch (err) {
        console.error('Failed to save Excalidraw library item to database:', err);
    }
}

/**
 * Removes an item from the Excalidraw Library by ID
 */
export async function removeFromExcalidrawLibrary(id: string): Promise<void> {
    // Update local cache immediately
    const current = getExcalidrawLibrary();
    updateLocalCache(current.filter(i => i.id !== id));

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('excalidraw_library')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) throw error;
    } catch (err) {
        console.error('Failed to delete Excalidraw library item from database:', err);
    }
}

/**
 * Clears the entire Excalidraw Library
 */
export async function clearExcalidrawLibrary(): Promise<void> {
    // Clear local cache immediately
    updateLocalCache([]);
    if (typeof window !== 'undefined') {
        localStorage.removeItem(EXCALIDRAW_LIBRARY_KEY);
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('excalidraw_library')
            .delete()
            .eq('user_id', user.id);

        if (error) throw error;
    } catch (err) {
        console.error('Failed to clear Excalidraw library from database:', err);
    }
}

/**
 * Migrate localStorage items to database (run once per user)
 */
export async function migrateLocalStorageToDatabase(): Promise<void> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get items from localStorage
        if (typeof window === 'undefined') return;
        const stored = localStorage.getItem(EXCALIDRAW_LIBRARY_KEY);
        if (!stored) return;

        const localItems: ExcalidrawLibraryItem[] = JSON.parse(stored);
        if (localItems.length === 0) return;

        // Check if user already has items in database
        const { data: existing } = await supabase
            .from('excalidraw_library')
            .select('id')
            .eq('user_id', user.id)
            .limit(1);

        // Only migrate if database is empty for this user
        if (existing && existing.length > 0) {
            console.log('Excalidraw library already has items in database, skipping migration');
            return;
        }

        // Migrate items to database
        const itemsToInsert = localItems.map(item => ({
            id: item.id,
            user_id: user.id,
            name: item.name,
            description: item.description,
            author: item.author,
            source: item.source,
            preview: item.preview,
            elements: item.elements,
            created: item.created
        }));

        const { error } = await supabase
            .from('excalidraw_library')
            .insert(itemsToInsert);

        if (error) throw error;
        console.log(`Migrated ${localItems.length} Excalidraw library items to database`);
    } catch (err) {
        console.error('Failed to migrate Excalidraw library to database:', err);
    }
}
