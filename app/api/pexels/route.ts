import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const page = searchParams.get('page') || '1';

    if (!query) {
        return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
    }

    const apiKey = process.env.PEXELS_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ error: 'Pexels API key not configured' }, { status: 500 });
    }

    try {
        const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12&page=${page}`, {
            headers: {
                Authorization: apiKey,
            },
        });

        if (!response.ok) {
            throw new Error(`Pexels API error: ${response.statusText}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Pexels API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch from Pexels' }, { status: 500 });
    }
}
