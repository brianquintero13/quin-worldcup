import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
        return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    // Connects to your specific provider and handles the daily filter format
    const API_KEY = process.env.FOOTBALL_DATA_KEY || '95a6c629704947a3be9860ba3031169b';
    const url = `https://api.football-data.org/v4/competitions/2000/matches?dateFrom=${date}&dateTo=${date}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-Auth-Token': API_KEY,
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch schedule from football-data.org');
        }

        const data = await response.json();

        // Exact same standardizer from your working sync-matches file
        const normalizeTeamName = (name: string) => {
            if (!name) return 'TBD';
            if (name === 'Congo DR' || name === 'DR Congo') return 'DR Congo';
            if (name.includes('Bosnia')) return 'Bosnia & Herz.';
            if (name === 'United States' || name === 'United States of America' || name === 'USA') return 'USA';
            if (name === 'Cape Verde Islands' || name === 'Cape Verde') return 'Cape Verde';
            return name;
        };

        const processedMatches = (data.matches || []).map((match: any) => ({
            id: match.id,
            utcDate: match.utcDate,
            status: match.status,
            homeTeam: normalizeTeamName(match.homeTeam?.name),
            awayTeam: normalizeTeamName(match.awayTeam?.name),
            homeGoals: match.score?.fullTime?.home ?? match.score?.regularTime?.home ?? null,
            awayGoals: match.score?.fullTime?.away ?? match.score?.regularTime?.away ?? null,
        }));

        return NextResponse.json({ success: true, matches: processedMatches });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}