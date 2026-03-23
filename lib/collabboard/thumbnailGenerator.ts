// lib/collabboard/thumbnailGenerator.ts

import { supabase } from '@/lib/supabase';

// Type for padlet data needed for thumbnail generation
interface PadletForThumbnail {
    id: string;
    position_x: number;
    position_y: number;
    width: number;
    height: number;
    type: string;
    title?: string;
    content?: string;
    metadata?: { 
        cardColor?: string;
        backgroundColor?: string;
        imageUrl?: string;
    };
}

/**
 * Generate a thumbnail SVG from padlet positions and save to database
 * This is the main function to call when you want to generate/update a thumbnail
 */
export async function generateAndSaveThumbnail(
    boardId: string | number,
    padlets: PadletForThumbnail[],
    canvasWidth: number = 1200,
    canvasHeight: number = 800
): Promise<string | null> {
    try {
        if (!padlets || padlets.length === 0) {
            return null;
        }

        // Generate the SVG data URL
        const svgDataUrl = generateSvgThumbnail(padlets, canvasWidth, canvasHeight);

        // Update the board record with the SVG thumbnail
        const { error } = await supabase
            .from('boards')
            .update({ thumbnail_url: svgDataUrl })
            .eq('id', boardId);

        if (error) {
            console.error('Error saving thumbnail:', error);
            return null;
        }

        return svgDataUrl;
    } catch (err) {
        console.error('Error generating thumbnail:', err);
        return null;
    }
}

/**
 * Generate a thumbnail image from a canvas element and upload to Supabase storage
 * Requires html2canvas to be installed: npm install html2canvas
 * @param canvasElement - The HTML element containing the canvas content
 * @param boardId - The board ID to associate the thumbnail with
 * @returns The public URL of the uploaded thumbnail
 */
export async function generateAndUploadThumbnail(
    canvasElement: HTMLElement,
    boardId: string | number
): Promise<string | null> {
    try {
        // Dynamic import html2canvas to avoid SSR issues
        // If html2canvas is not installed, this will throw and we'll use SVG fallback
        let html2canvas: any;
        try {
            html2canvas = (await import('html2canvas' as any)).default;
        } catch {
            console.warn('html2canvas not installed. Using SVG fallback for thumbnails.');
            return null;
        }

        // Generate canvas image
        const canvas = await html2canvas(canvasElement, {
            backgroundColor: null,
            scale: 0.5, // Lower scale for smaller file size
            logging: false,
            useCORS: true,
            allowTaint: true,
            width: Math.min(canvasElement.scrollWidth, 1920),
            height: Math.min(canvasElement.scrollHeight, 1080),
        });

        // Convert to blob
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.7);
        });

        if (!blob) {
            console.error('Failed to create blob from canvas');
            return null;
        }

        // Upload to Supabase storage
        const fileName = `thumbnail_${boardId}_${Date.now()}.jpg`;
        const filePath = `boards/${boardId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('thumbnails')
            .upload(filePath, blob, {
                contentType: 'image/jpeg',
                upsert: true,
            });

        if (uploadError) {
            console.error('Error uploading thumbnail:', uploadError);
            return null;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('thumbnails')
            .getPublicUrl(filePath);

        // Update board record with thumbnail URL
        const { error: updateError } = await supabase
            .from('boards')
            .update({ thumbnail_url: publicUrl })
            .eq('id', boardId);

        if (updateError) {
            console.error('Error updating board thumbnail:', updateError);
        }

        return publicUrl;
    } catch (err) {
        console.error('Error generating thumbnail:', err);
        return null;
    }
}

/**
 * Generate a rich SVG thumbnail from padlet positions
 * Creates a visual representation with icons and content hints
 */
export function generateSvgThumbnail(
    padlets: Array<{
        position_x: number;
        position_y: number;
        width: number;
        height: number;
        type: string;
        title?: string;
        content?: string;
        metadata?: { 
            cardColor?: string;
            backgroundColor?: string;
            imageUrl?: string;
        };
    }>,
    canvasWidth: number = 400,
    canvasHeight: number = 300
): string {
    if (!padlets || padlets.length === 0) {
        // Return empty canvas placeholder
        return `data:image/svg+xml,${encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" width="${canvasWidth}" height="${canvasHeight}">
                <rect width="100%" height="100%" fill="#f9fafb"/>
                <text x="50%" y="50%" text-anchor="middle" fill="#d1d5db" font-size="14" font-family="system-ui, sans-serif">Empty Canvas</text>
            </svg>
        `.trim())}`;
    }

    const viewBox = `0 0 ${canvasWidth} ${canvasHeight}`;
    
    // Calculate bounds and scale to fit
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    padlets.forEach(p => {
        minX = Math.min(minX, p.position_x || 0);
        minY = Math.min(minY, p.position_y || 0);
        maxX = Math.max(maxX, (p.position_x || 0) + (p.width || 200));
        maxY = Math.max(maxY, (p.position_y || 0) + (p.height || 150));
    });

    // Handle case where all positions are 0
    if (!isFinite(minX)) minX = 0;
    if (!isFinite(minY)) minY = 0;
    if (maxX <= minX) maxX = minX + canvasWidth;
    if (maxY <= minY) maxY = minY + canvasHeight;

    const contentWidth = maxX - minX || canvasWidth;
    const contentHeight = maxY - minY || canvasHeight;
    const padding = 20;
    const scale = Math.min(
        (canvasWidth - padding * 2) / contentWidth, 
        (canvasHeight - padding * 2) / contentHeight
    ) * 0.9;
    const offsetX = (canvasWidth - contentWidth * scale) / 2 - minX * scale;
    const offsetY = (canvasHeight - contentHeight * scale) / 2 - minY * scale;

    // Type-based colors
    const typeColors: Record<string, string> = {
        note: '#fef3c7',
        text: '#fef3c7',
        image: '#dbeafe',
        link: '#e0e7ff',
        todo: '#dcfce7',
        table: '#fee2e2',
        container: '#f3e8ff',
        comment: '#fce7f3',
        drawing: '#e0f2fe',
    };

    // Type-based icons (simplified SVG paths)
    const typeIcons: Record<string, string> = {
        note: 'M3 3h18v18H3V3zm2 2v14h14V5H5z', // Sticky note
        text: 'M3 3h18v18H3V3zm2 2v14h14V5H5z',
        image: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z', // Image
        link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z', // Link
        todo: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z', // Checkbox
        table: 'M3 3h18v18H3V3zm2 4h6v4H5V7zm0 6h6v4H5v-4zm8-6h6v4h-6V7zm0 6h6v4h-6v-4z', // Table grid
        container: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v2H7V7zm0 4h10v2H7v-2z', // Container
        comment: 'M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z', // Comment bubble
        drawing: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z', // Pencil
    };

    const elements = padlets.map((p, i) => {
        const x = (p.position_x || 0) * scale + offsetX;
        const y = (p.position_y || 0) * scale + offsetY;
        const w = Math.max((p.width || 200) * scale, 30);
        const h = Math.max((p.height || 150) * scale, 20);
        const color = p.metadata?.cardColor || p.metadata?.backgroundColor || typeColors[p.type] || '#f3f4f6';
        const borderColor = adjustColor(color, -20);
        
        // Create card rectangle with shadow effect
        let element = `
            <g>
                <rect x="${x + 2}" y="${y + 2}" width="${w}" height="${h}" rx="4" fill="#00000010"/>
                <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${color}" stroke="${borderColor}" stroke-width="1"/>
        `;
        
        // Add content indicator lines if there's title/content
        if (p.title || p.content) {
            const lineY = y + 8;
            const lineWidth = Math.min(w - 16, 60);
            if (w > 40 && h > 30) {
                element += `
                    <rect x="${x + 8}" y="${lineY}" width="${lineWidth}" height="3" rx="1.5" fill="#00000015"/>
                    <rect x="${x + 8}" y="${lineY + 6}" width="${lineWidth * 0.7}" height="2" rx="1" fill="#00000010"/>
                `;
            }
        }
        
        // Add small type icon in corner for larger cards
        if (w > 50 && h > 40 && typeIcons[p.type]) {
            const iconSize = Math.min(12, w / 6, h / 6);
            const iconX = x + w - iconSize - 4;
            const iconY = y + h - iconSize - 4;
            element += `
                <g transform="translate(${iconX}, ${iconY}) scale(${iconSize / 24})">
                    <path d="${typeIcons[p.type]}" fill="#00000020"/>
                </g>
            `;
        }
        
        element += '</g>';
        return element;
    }).join('\n');

    return `data:image/svg+xml,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${canvasWidth}" height="${canvasHeight}">
            <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f0f0f0" stroke-width="0.5"/>
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill="#fafafa"/>
            <rect width="100%" height="100%" fill="url(#grid)"/>
            ${elements}
        </svg>
    `.trim())}`;
}

/**
 * Adjust a hex color by a given amount (negative = darker, positive = lighter)
 */
function adjustColor(color: string, amount: number): string {
    if (!color.startsWith('#')) return color;
    let usePound = false;
    if (color[0] === '#') {
        color = color.slice(1);
        usePound = true;
    }
    const num = parseInt(color, 16);
    let r = (num >> 16) + amount;
    let b = ((num >> 8) & 0x00FF) + amount;
    let g = (num & 0x0000FF) + amount;
    r = Math.max(Math.min(255, r), 0);
    b = Math.max(Math.min(255, b), 0);
    g = Math.max(Math.min(255, g), 0);
    return (usePound ? '#' : '') + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
}

/**
 * Update the last_visited_at timestamp when opening a canvas
 */
export async function updateLastVisited(boardId: string | number): Promise<void> {
    try {
        const { error } = await supabase
            .from('boards')
            .update({ last_visited_at: new Date().toISOString() })
            .eq('id', boardId);

        if (error) {
            console.error('Error updating last_visited_at:', error);
        }
    } catch (err) {
        console.error('Error updating last_visited_at:', err);
    }
}
