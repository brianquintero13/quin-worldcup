import { NextResponse } from 'next/server';

export async function GET() {
    const API_KEY = process.env.FOOTBALL_DATA_KEY || '95a6c629704947a3be9860ba3031169b';

    try {
        const response = await fetch('https://api.football-data.org/v4/competitions/2000/matches', {
            method: 'GET',
            headers: {
                'X-Auth-Token': API_KEY,
            },
            next: { revalidate: 60 }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch live feed from football-data.org');
        }

        const data = await response.json();

        // Standardizes API naming formats to match your Draft Board precisely
        const normalizeTeamName = (name: string) => {
            if (!name) return 'TBD';
            if (name === 'Congo DR' || name === 'DR Congo') return 'DR Congo';
            if (name.includes('Bosnia')) return 'Bosnia & Herz.';
            if (name === 'United States' || name === 'United States of America' || name === 'USA') return 'USA';
            if (name === 'Cape Verde Islands' || name === 'Cape Verde') return 'Cape Verde';
            return name;
        };

        const processedMatches = (data.matches || []).map((match: any) => {
            const status = match.status;

            let homeGoals = null;
            let awayGoals = null;
            if (match.score && ['IN_PLAY', 'PAUSED', 'FINISHED', 'AWARDED'].includes(status)) {
                homeGoals = match.score.fullTime?.home ?? match.score.regularTime?.home ?? match.score.halfTime?.home ?? 0;
                awayGoals = match.score.fullTime?.away ?? match.score.regularTime?.away ?? match.score.halfTime?.away ?? 0;
            }

            const isComplete = ['FINISHED', 'AWARDED'].includes(status);
            const homeCleanSheet = isComplete && awayGoals === 0;
            const awayCleanSheet = isComplete && homeGoals === 0;

            let stage = 'Group';
            const round = match.stage;
            if (round === 'LAST_32') stage = 'R32';
            else if (round === 'LAST_16') stage = 'R16';
            else if (round === 'QUARTER_FINALS') stage = 'QF';
            else if (round === 'SEMI_FINALS') stage = 'SF';
            else if (round === 'THIRD_PLACE') stage = '3rdPlace';
            else if (round === 'FINAL') stage = 'Final';

            const groupName = match.group ? match.group.replace('_', ' ') : undefined;

            const isStarted = ['IN_PLAY', 'PAUSED', 'FINISHED', 'AWARDED'].includes(status);
            let winner = undefined;
            if (isStarted && homeGoals !== null && awayGoals !== null) {
                if (homeGoals > awayGoals) winner = normalizeTeamName(match.homeTeam?.name);
                else if (awayGoals > homeGoals) winner = normalizeTeamName(match.awayTeam?.name);
                else if (homeGoals === awayGoals) winner = 'DRAW';
            }

            return {
                id: `wc-${match.id}`,
                status: status,
                minute: match.minute || null, // Captures live minute
                stage: stage,
                group: groupName,
                homeTeam: normalizeTeamName(match.homeTeam?.name),
                awayTeam: normalizeTeamName(match.awayTeam?.name),
                homeGoals: homeGoals,
                awayGoals: awayGoals,
                homeCleanSheet: homeCleanSheet,
                awayCleanSheet: awayCleanSheet,
                winner: winner
            };
        });

        return NextResponse.json({ success: true, matches: processedMatches, mode: 'live' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}