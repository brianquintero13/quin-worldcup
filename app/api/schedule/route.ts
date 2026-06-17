import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    // Grab the date from the URL (e.g., ?date=2026-06-17)
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    // Make sure the URL matches your specific RapidAPI provider (e.g., api-football)
    const url = `https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${date}`;

    const options = {
        method: 'GET',
        headers: {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY as string,
            'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com' // Adjust if using a different API
        }
    };

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
    }
}