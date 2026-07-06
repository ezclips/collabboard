import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    if (!query) {
        return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
    }

    const apiKey = process.env.GIPHY_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ error: 'Giphy API key not configured' }, { status: 500 });
    }

    try {
        const response = await fetch(
            `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=24&rating=g`
        );

        if (!response.ok) {
            throw new Error(`Giphy API error: ${response.statusText}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Giphy API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch from Giphy' }, { status: 500 });
    }
}
