import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
        return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

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

        const normalizeTeamName = (name: string) => {
            if (!name) return 'TBD';
            if (name === 'Congo DR' || name === 'DR Congo') return 'DR Congo';
            if (name.includes('Bosnia')) return 'Bosnia & Herz.';
            if (name === 'United States' || name === 'United States of America' || name === 'USA') return 'USA';
            if (name === 'Cape Verde Islands' || name === 'Cape Verde') return 'Cape Verde';
            return name;
        };

        const processedMatches = (data.matches || []).map((match: any) => {
            let homeGoals = match.score?.fullTime?.home ?? match.score?.regularTime?.home ?? null;
            let awayGoals = match.score?.fullTime?.away ?? match.score?.regularTime?.away ?? null;

            // Subtract shootout penalties so the daily schedule scoreboard stays correct [2]
            if (match.score?.duration === 'PENALTY_SHOOTOUT' && match.score?.penalties) {
                if (homeGoals !== null) homeGoals -= (match.score.penalties.home ?? 0);
                if (awayGoals !== null) awayGoals -= (match.score.penalties.away ?? 0);
            }

            return {
                id: match.id,
                utcDate: match.utcDate,
                status: match.status,
                homeTeam: normalizeTeamName(match.homeTeam?.name),
                awayTeam: normalizeTeamName(match.awayTeam?.name),
                homeGoals,
                awayGoals,
            };
        });

        return NextResponse.json({ success: true, matches: processedMatches });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}