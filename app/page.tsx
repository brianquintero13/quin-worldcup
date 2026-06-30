"use client";
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Oswald } from 'next/font/google';

import ScheduleTab from './components/ScheduleTab';
import FlagIcon from './components/FlagIcon';

const oswald = Oswald({ subsets: ['latin'], weight: ['400', '700'] });

const ManagerAvatar = ({ name, size = 'sm' }: { name: string, size?: 'sm' | 'md' | 'lg' | 'xl' }) => {
    if (!name) return null;
    const firstWord = name.trim().split(/\s+/)[0];
    let fileName = firstWord.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (fileName === 'angelo') fileName = 'anuzzil';
    const src = `/managers/${fileName}.png`;
    const sizeClasses = {
        sm: "w-6 h-6 sm:w-8 sm:h-8 rounded-full border border-white/20 object-cover avatar-img-custom bg-white/10 shrink-0 relative z-10",
        md: "w-12 h-12 sm:w-16 sm:h-16 rounded-full border border-white/20 object-cover avatar-img-custom bg-white/10 shrink-0 relative z-10",
        lg: "w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-sky-400 object-cover avatar-img-custom bg-white/10 shrink-0 relative z-10",
        xl: "w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border-2 border-sky-400 object-cover avatar-img-custom bg-white/10 shrink-0 relative z-10"
    }[size];

    return (
        <img src={src} alt={name} className={sizeClasses} onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=0ea5e9&textColor=ffffff`;
        }} />
    );
};

const getUniqueMatches = (matchesList: any[]) => {
    const seen = new Set();
    return matchesList.filter(m => {
        if (!m) return false;
        const key = m.id || `${m.utcDate}_${m.homeTeam}_${m.awayTeam}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

// Calculates and ranks the 3rd-place teams across all 12 groups to find the 8 wildcards that advance
const getEliminatedThirdPlaceTeams = (matchesList: any[]): Set<string> => {
    const eliminatedThirds = new Set<string>();
    const allGroupMatches = matchesList.filter(m => m.stage === 'Group');
    if (allGroupMatches.length === 0) return eliminatedThirds;

    // Group matches by group name
    const groups: Record<string, any[]> = {};
    allGroupMatches.forEach(m => {
        if (m.group) {
            if (!groups[m.group]) groups[m.group] = [];
            groups[m.group].push(m);
        }
    });

    const thirdPlaceTeams: any[] = [];
    const finishedGroupsCount = Object.keys(groups).filter(g => groups[g].every(m => m.status === 'FINISHED' || m.status === 'AWARDED')).length;

    // We can only evaluate who is eliminated once all 12 groups are complete
    if (finishedGroupsCount === 12) {
        Object.entries(groups).forEach(([groupName, groupMatches]) => {
            const table: Record<string, any> = {};
            groupMatches.forEach(m => {
                if (m.homeTeam !== 'TBD' && !table[m.homeTeam]) table[m.homeTeam] = { name: m.homeTeam, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
                if (m.awayTeam !== 'TBD' && !table[m.awayTeam]) table[m.awayTeam] = { name: m.awayTeam, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
            });
            groupMatches.forEach(m => {
                const hG = m.homeGoals || 0; const aG = m.awayGoals || 0;
                if (table[m.homeTeam]) { table[m.homeTeam].mp++; table[m.homeTeam].gf += hG; table[m.homeTeam].ga += aG; }
                if (table[m.awayTeam]) { table[m.awayTeam].mp++; table[m.awayTeam].gf += aG; table[m.awayTeam].ga += hG; }
                if (m.winner === m.homeTeam) {
                    if (table[m.homeTeam]) { table[m.homeTeam].w++; table[m.homeTeam].pts += 3; }
                    if (table[m.awayTeam]) table[m.awayTeam].l++;
                } else if (m.winner === m.awayTeam) {
                    if (table[m.awayTeam]) { table[m.awayTeam].w++; table[m.awayTeam].pts += 3; }
                    if (table[m.homeTeam]) table[m.homeTeam].l++;
                } else if (m.winner === 'DRAW') {
                    if (table[m.homeTeam]) { table[m.homeTeam].d++; table[m.homeTeam].pts++; }
                    if (table[m.awayTeam]) { table[m.awayTeam].d++; table[m.awayTeam].pts++; }
                }
            });
            const groupTable = Object.values(table).sort((a: any, b: any) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);

            // 3rd place is index 2
            if (groupTable[2]) {
                thirdPlaceTeams.push({
                    name: groupTable[2].name,
                    pts: groupTable[2].pts,
                    gd: groupTable[2].gf - groupTable[2].ga,
                    gf: groupTable[2].gf,
                    w: groupTable[2].w
                });
            }
        });

        // Sort third-place teams by World Cup tie-breakers [2]:
        // 1. Points
        // 2. Goal Difference
        // 3. Goals Scored
        // 4. Wins
        thirdPlaceTeams.sort((a, b) => {
            return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.w - a.w;
        });

        // The top 8 advance, while the bottom 4 (indexes 8 to 11) are eliminated [2]
        thirdPlaceTeams.slice(8).forEach(t => {
            eliminatedThirds.add(t.name.toUpperCase());
        });
    }

    return eliminatedThirds;
};

const isTeamEliminated = (teamName: string, matchesList: any[]): boolean => {
    if (!teamName || teamName === 'TBD') return false;

    // 1. Check if they have been knocked out of an active Knockout Stage match
    let lostKnockout = false;
    matchesList.forEach(m => {
        if (m.status === 'FINISHED' && m.stage !== 'Group') {
            const isHome = m.homeTeam && m.homeTeam.toUpperCase() === teamName.toUpperCase();
            const isAway = m.awayTeam && m.awayTeam.toUpperCase() === teamName.toUpperCase();
            if (isHome || isAway) {
                const won = (isHome && m.winner === m.homeTeam) || (isAway && m.winner === m.awayTeam);
                if (!won && m.winner !== 'DRAW') lostKnockout = true;
            }
        }
    });
    if (lostKnockout) return true;

    // 2. Identify the group standings for wildcard assessment
    let groupName = '';
    matchesList.forEach(m => {
        if (m.stage === 'Group' && ((m.homeTeam && m.homeTeam.toUpperCase() === teamName.toUpperCase()) || (m.awayTeam && m.awayTeam.toUpperCase() === teamName.toUpperCase()))) {
            groupName = m.group;
        }
    });

    if (groupName) {
        const groupMatches = matchesList.filter(m => m.group === groupName);
        const groupFinished = groupMatches.length > 0 && groupMatches.every(m => m.status === 'FINISHED' || m.status === 'AWARDED');

        if (groupFinished) {
            const table: Record<string, any> = {};
            groupMatches.forEach(m => {
                if (m.homeTeam !== 'TBD' && !table[m.homeTeam]) table[m.homeTeam] = { name: m.homeTeam, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
                if (m.awayTeam !== 'TBD' && !table[m.awayTeam]) table[m.awayTeam] = { name: m.awayTeam, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
            });
            groupMatches.forEach(m => {
                const hG = m.homeGoals || 0; const aG = m.awayGoals || 0;
                if (table[m.homeTeam]) { table[m.homeTeam].mp++; table[m.homeTeam].gf += hG; table[m.homeTeam].ga += aG; }
                if (table[m.awayTeam]) { table[m.awayTeam].mp++; table[m.awayTeam].gf += aG; table[m.awayTeam].ga += hG; }
                if (m.winner === m.homeTeam) { if (table[m.homeTeam]) { table[m.homeTeam].w++; table[m.homeTeam].pts += 3; } if (table[m.awayTeam]) table[m.awayTeam].l++; }
                else if (m.winner === m.awayTeam) { if (table[m.awayTeam]) { table[m.awayTeam].w++; table[m.awayTeam].pts += 3; } if (table[m.homeTeam]) table[m.homeTeam].l++; }
                else if (m.winner === 'DRAW') { if (table[m.homeTeam]) { table[m.homeTeam].d++; table[m.homeTeam].pts++; } if (table[m.awayTeam]) { table[m.awayTeam].d++; table[m.awayTeam].pts++; } }
            });
            const groupTable = Object.values(table).sort((a: any, b: any) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
            const rank = groupTable.findIndex((t: any) => t.name.toUpperCase() === teamName.toUpperCase());

            // 4th place is always automatically eliminated from the group
            if (rank === 3) return true;

            // Evaluating 3rd place wildcards
            if (rank === 2) {
                const allGroupMatches = matchesList.filter(m => m.stage === 'Group');
                const allGroupsFinished = allGroupMatches.length > 0 && allGroupMatches.every(m => m.status === 'FINISHED' || m.status === 'AWARDED');

                if (allGroupsFinished) {
                    // All 12 groups are complete. Evaluate which 4 third-place teams are eliminated.
                    const eliminatedThirds = getEliminatedThirdPlaceTeams(matchesList);
                    if (eliminatedThirds.has(teamName.toUpperCase())) {
                        return true;
                    }
                } else {
                    // Do not eliminate third-place teams while other groups are still in play
                    return false;
                }
            }
        }
    }
    return false;
};

// Check if a team has mathematically or physically advanced to the Round of 32
const hasTeamAdvanced = (teamName: string, matchesList: any[]): boolean => {
    if (!teamName || teamName === 'TBD') return false;

    // 1. If they have already played in a knockout match, they definitely advanced
    const playedKnockout = matchesList.some(m => m.stage !== 'Group' && (teamsMatch(m.homeTeam, teamName) || teamsMatch(m.awayTeam, teamName)));
    if (playedKnockout) return true;

    // 2. Identify the group standings
    let groupName = '';
    matchesList.forEach(m => {
        if (m.stage === 'Group' && (teamsMatch(m.homeTeam, teamName) || teamsMatch(m.awayTeam, teamName))) {
            groupName = m.group;
        }
    });

    if (groupName) {
        const groupMatches = matchesList.filter(m => m.group === groupName);
        const groupFinished = groupMatches.length > 0 && groupMatches.every(m => m.status === 'FINISHED' || m.status === 'AWARDED');

        if (groupFinished) {
            const table: Record<string, any> = {};
            groupMatches.forEach(m => {
                if (m.homeTeam !== 'TBD' && !table[m.homeTeam]) table[m.homeTeam] = { name: m.homeTeam, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
                if (m.awayTeam !== 'TBD' && !table[m.awayTeam]) table[m.awayTeam] = { name: m.awayTeam, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
            });
            groupMatches.forEach(m => {
                const hG = m.homeGoals || 0; const aG = m.awayGoals || 0;
                if (table[m.homeTeam]) { table[m.homeTeam].mp++; table[m.homeTeam].gf += hG; table[m.homeTeam].ga += aG; }
                if (table[m.awayTeam]) { table[m.awayTeam].mp++; table[m.awayTeam].gf += aG; table[m.awayTeam].ga += hG; }
                if (m.winner === m.homeTeam) {
                    if (table[m.homeTeam]) { table[m.homeTeam].w++; table[m.homeTeam].pts += 3; }
                    if (table[m.awayTeam]) table[m.awayTeam].l++;
                } else if (m.winner === m.awayTeam) {
                    if (table[m.awayTeam]) { table[m.awayTeam].w++; table[m.awayTeam].pts += 3; }
                    if (table[m.homeTeam]) table[m.homeTeam].l++;
                } else if (m.winner === 'DRAW') {
                    if (table[m.homeTeam]) { table[m.homeTeam].d++; table[m.homeTeam].pts++; }
                    if (table[m.awayTeam]) { table[m.awayTeam].d++; table[m.awayTeam].pts++; }
                }
            });
            const groupTable = Object.values(table).sort((a: any, b: any) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
            const rank = groupTable.findIndex((t: any) => t.name.toUpperCase() === teamName.toUpperCase());

            // Top 2 always advance
            if (rank === 0 || rank === 1) return true;

            // 3rd place advances if they are in the top 8 wildcard list
            if (rank === 2) {
                const allGroupMatches = matchesList.filter(m => m.stage === 'Group');
                const allGroupsFinished = allGroupMatches.length > 0 && allGroupMatches.every(m => m.status === 'FINISHED' || m.status === 'AWARDED');
                if (allGroupsFinished) {
                    const eliminatedThirds = getEliminatedThirdPlaceTeams(matchesList);
                    if (!eliminatedThirds.has(teamName.toUpperCase())) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
};

// Model baseline expected points relative to snake draft absolute pick selection
const getExpectedPoints = (pickNumber: number) => {
    if (pickNumber <= 12) {
        return 35 - (pickNumber - 1) * 0.9;
    } else if (pickNumber <= 24) {
        return 24 - (pickNumber - 13) * 0.7;
    } else if (pickNumber <= 36) {
        return 15 - (pickNumber - 25) * 0.5;
    } else {
        return 8 - (pickNumber - 37) * 0.35;
    }
};

const teamsMatch = (nameA: string, nameB: string): boolean => {
    if (!nameA || !nameB) return false;
    const norm = (str: string) => {
        const u = str.toUpperCase().trim();
        if (u === 'USA' || u === 'UNITED STATES' || u === 'UNITED STATES OF AMERICA') return 'USA';
        if (u === 'CAPE VERDE ISLANDS') return 'CAPE VERDE';
        return u;
    };
    const cleanA = norm(nameA); const cleanB = norm(nameB);
    return cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
};

// Helper calculating dynamic team point outcomes cleanly
const getTeamPointsAndLogs = (teamId: string, matchesList: any[], showProjected: boolean) => {
    let points = 0;
    let goals = 0;
    let cleanSheets = 0;
    let wins = 0, draws = 0, losses = 0;
    const logs: any[] = [];

    matchesList.forEach(m => {
        const isHome = m.homeTeam && teamsMatch(m.homeTeam, teamId);
        const isAway = m.awayTeam && teamsMatch(m.awayTeam, teamId);
        if (!isHome && !isAway) return;

        const isFinished = m.status === 'FINISHED' || m.status === 'AWARDED';
        const isLive = m.status === 'IN_PLAY' || m.status === 'PAUSED';
        if (!isFinished && !isLive) return;
        if (isLive && !showProjected) return;

        let matchPts = 0;
        let logDetails: string[] = [];

        let projectedWinner = m.winner;
        if (isLive && !projectedWinner && m.homeGoals !== null && m.awayGoals !== null) {
            if (m.homeGoals > m.awayGoals) projectedWinner = m.homeTeam;
            else if (m.awayGoals > m.homeGoals) projectedWinner = m.awayTeam;
            else projectedWinner = 'DRAW';
        }

        const isWin = (isHome && projectedWinner === m.homeTeam) || (isAway && projectedWinner === m.awayTeam);
        const isDraw = projectedWinner === 'DRAW';
        const isLoss = projectedWinner && !isWin && !isDraw;

        if (isWin) wins++; else if (isDraw) draws++; else if (isLoss) losses++;

        const matchGoals = isHome ? (m.homeGoals || 0) : (m.awayGoals || 0);
        const matchCleanSheet = (isHome && m.homeCleanSheet) || (isAway && m.awayCleanSheet) ? 1 : 0;

        goals += matchGoals;
        cleanSheets += matchCleanSheet;

        if (matchGoals > 0) {
            matchPts += (matchGoals * 1);
            logDetails.push(`+${matchGoals * 1} (${matchGoals} Goal${matchGoals > 1 ? 's' : ''})`);
        }
        if (matchCleanSheet) {
            matchPts += 2;
            logDetails.push(`+2 (CS)`);
        }
        if (isWin) {
            matchPts += 4; logDetails.push(`+4 (Win)`);
            const stageBonus: any = { R32: 10, R16: 12, QF: 15, SF: 20, '3rdPlace': 10, Final: 30 };
            if (stageBonus[m.stage]) {
                matchPts += stageBonus[m.stage];
                logDetails.push(`+${stageBonus[m.stage]} (${m.stage} Bonus)`);
            }
        } else if (isDraw && m.stage === 'Group') {
            matchPts += 2; logDetails.push(`+2 (Draw)`);
        }

        points += matchPts;
        logs.push({
            matchId: m.id, stage: m.group && m.stage === 'Group' ? m.group : m.stage, team: teamId, opponent: isHome ? m.awayTeam : m.homeTeam,
            score: isHome ? `${m.homeGoals ?? '-'} : ${m.awayGoals ?? '-'}` : `${m.awayGoals ?? '-'} : ${m.homeGoals ?? '-'}`,
            result: isWin ? 'W' : isDraw ? 'D' : isLoss ? 'L' : '-', points: matchPts, details: logDetails, isLive: isLive
        });
    });

    // Populate Group Advancement points instantly upon mathematical security
    const advanced = hasTeamAdvanced(teamId, matchesList);
    if (advanced) {
        points += 8;
        logs.push({
            matchId: `adv-${teamId}`,
            stage: 'Group',
            team: teamId,
            opponent: 'R32 Spot Secured',
            score: 'N/A',
            result: 'W',
            points: 8,
            details: ['+8 (Advance)'],
            isLive: false
        });
    }

    // Stable sort to ensure all Group Stage matches and advancement secure event sit together on top
    const stageOrder = (stageName: string) => {
        if (!stageName) return 8;
        if (stageName.startsWith('Group') || stageName === 'Group') return 1;
        if (stageName === 'R32') return 2;
        if (stageName === 'R16') return 3;
        if (stageName === 'QF') return 4;
        if (stageName === 'SF') return 5;
        if (stageName === '3rdPlace') return 6;
        if (stageName === 'Final') return 7;
        return 8;
    };

    logs.sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage));

    return { points, goals, cleanSheets, wins, draws, losses, logs };
};

export default function AutomatedDashboard() {
    const [picks, setPicks] = useState<any[]>([]);
    const [drafters, setDrafters] = useState<string[]>([]);
    const [matches, setMatches] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'draft' | 'matches' | 'schedule' | 'standings' | 'awards' | 'rules' | 'banter'>('standings');
    const [draftSearch, setDraftSearch] = useState<string>('');
    const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
    const [selectedManager, setSelectedManager] = useState<any | null>(null);
    const [showProjected, setShowProjected] = useState<boolean>(false);
    const [standingsView, setStandingsView] = useState<'grid' | 'table'>('grid');
    const [matchesSubTab, setMatchesSubTab] = useState<'groups' | 'bracket'>('groups');

    // State for temporary interactive projections and overrides
    const [customScores, setCustomScores] = useState<Record<string, { homeGoals: number, awayGoals: number, status: string }>>({});

    const adjustWhatIf = (matchId: string, side: 'home' | 'away', amount: number) => {
        setCustomScores(prev => {
            const current = prev[matchId] || {
                homeGoals: uniqueMatches.find(m => m.id === matchId)?.homeGoals ?? 0,
                awayGoals: uniqueMatches.find(m => m.id === matchId)?.awayGoals ?? 0,
                status: 'IN_PLAY'
            };
            const nextVal = Math.max(0, (side === 'home' ? current.homeGoals : current.awayGoals) + amount);
            return {
                ...prev,
                [matchId]: {
                    ...current,
                    homeGoals: side === 'home' ? nextVal : current.homeGoals,
                    awayGoals: side === 'away' ? nextVal : current.awayGoals,
                    status: 'IN_PLAY'
                }
            };
        });
    };

    useEffect(() => {
        const stateRef = ref(db, 'state');
        const unsubscribe = onValue(stateRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                if (data.picks) setPicks(Object.values(data.picks).filter((p: any) => p && p.drafter && p.team));
                if (data.drafters) setDrafters(Object.values(data.drafters));
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const fetchLiveScores = async () => {
            try {
                const res = await fetch('/api/sync-matches');
                const data = await res.json();
                if (data.success && data.matches) setMatches(data.matches);
            } catch (err) { console.error("Live sync error:", err); }
        };
        fetchLiveScores();
        const interval = setInterval(fetchLiveScores, 60000);
        return () => clearInterval(interval);
    }, []);

    const getDrafterForTeam = (teamName: string) => {
        const pick = picks.find(p => teamsMatch(p.team, teamName));
        return pick ? pick.drafter : null;
    };

    const uniqueMatches = getUniqueMatches(matches);

    // Apply What-If scores to compile modified matches globally
    const modifiedMatches = uniqueMatches.map(m => {
        const custom = customScores[m.id];
        if (custom) {
            const homeGoals = custom.homeGoals;
            const awayGoals = custom.awayGoals;
            const isComplete = true; // Treats overrides as active projection parameters
            let winner = 'DRAW';
            if (homeGoals > awayGoals) winner = m.homeTeam;
            else if (awayGoals > homeGoals) winner = m.awayTeam;

            return {
                ...m,
                homeGoals,
                awayGoals,
                status: custom.status,
                homeCleanSheet: isComplete && awayGoals === 0,
                awayCleanSheet: isComplete && homeGoals === 0,
                winner
            };
        }
        return m;
    });

    const standings = drafters.map(name => {
        let totalPoints = 0, totalGoals = 0, totalCleanSheets = 0, wins = 0, draws = 0, losses = 0;
        const myTeams = picks.filter(p => p.drafter === name).map(p => p.team);
        const matchLogs: any[] = [];
        const goalsByTeam: Record<string, number> = {};
        const csByTeam: Record<string, number> = {};

        myTeams.forEach(teamId => {
            const stats = getTeamPointsAndLogs(teamId, modifiedMatches, showProjected || Object.keys(customScores).length > 0);
            totalPoints += stats.points;
            totalGoals += stats.goals;
            totalCleanSheets += stats.cleanSheets;
            wins += stats.wins;
            draws += stats.draws;
            losses += stats.losses;
            goalsByTeam[teamId] = stats.goals;
            csByTeam[teamId] = stats.cleanSheets;
            matchLogs.push(...stats.logs);
        });

        return { name, teams: myTeams, totalPoints, totalGoals, totalCleanSheets, wins, draws, losses, matchLogs, goalsByTeam, csByTeam };
    });

    const overallLeaders = [...standings].sort((a, b) => b.totalPoints - a.totalPoints);
    const bootLeaders = [...standings].sort((a, b) => b.totalGoals - a.totalGoals);
    const gloveLeaders = [...standings].sort((a, b) => b.totalCleanSheets - a.totalCleanSheets);

    const getRealGroupStandings = (groupMatches: any[]) => {
        const table: Record<string, any> = {};
        groupMatches.forEach(m => {
            if (m.homeTeam !== 'TBD' && !table[m.homeTeam]) table[m.homeTeam] = { name: m.homeTeam, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
            if (m.awayTeam !== 'TBD' && !table[m.awayTeam]) table[m.awayTeam] = { name: m.awayTeam, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
        });
        groupMatches.forEach(m => {
            if (m.status === 'FINISHED' || m.status === 'IN_PLAY' || m.status === 'AWARDED') {
                const hG = m.homeGoals || 0; const aG = m.awayGoals || 0;
                if (table[m.homeTeam]) { table[m.homeTeam].mp++; table[m.homeTeam].gf += hG; table[m.homeTeam].ga += aG; }
                if (table[m.awayTeam]) { table[m.awayTeam].mp++; table[m.awayTeam].gf += aG; table[m.awayTeam].ga += hG; }
                if (m.winner === m.homeTeam) {
                    if (table[m.homeTeam]) { table[m.homeTeam].w++; table[m.homeTeam].pts += 3; }
                    if (table[m.awayTeam]) table[m.awayTeam].l++;
                } else if (m.winner === m.awayTeam) {
                    if (table[m.awayTeam]) { table[m.awayTeam].w++; table[m.awayTeam].pts += 3; }
                    if (table[m.homeTeam]) table[m.homeTeam].l++;
                } else if (m.winner === 'DRAW') {
                    if (table[m.homeTeam]) { table[m.homeTeam].d++; table[m.homeTeam].pts++; }
                    if (table[m.awayTeam]) { table[m.awayTeam].d++; table[m.awayTeam].pts++; }
                }
            }
        });
        return Object.values(table).sort((a: any, b: any) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
    };

    const groupNames = Array.from(new Set(modifiedMatches.map(m => m.group).filter(Boolean))).sort() as string[];
    const filteredGroupNames = selectedGroupFilter === 'ALL' ? groupNames : groupNames.filter(g => g === selectedGroupFilter);
    const teamToGroup = new Map<string, string>();
    modifiedMatches.forEach(m => {
        if (m.stage === 'Group' && m.group) { teamToGroup.set(m.homeTeam, m.group); teamToGroup.set(m.awayTeam, m.group); }
    });

    const groupedTeams: Record<string, string[]> = {};
    Array.from(teamToGroup.keys()).forEach(team => {
        const grp = teamToGroup.get(team);
        if (grp) {
            if (!groupedTeams[grp]) groupedTeams[grp] = [];
            if (!groupedTeams[grp].includes(team) && team !== 'TBD') groupedTeams[grp].push(team);
        }
    });

    const getTickerHeadlines = () => {
        const headlines: string[] = [];
        if (overallLeaders.length < 2) return headlines;

        const leader = overallLeaders[0];
        const runnerUp = overallLeaders[1];
        const lastPlace = overallLeaders[overallLeaders.length - 1];
        const gap = leader.totalPoints - lastPlace.totalPoints;

        // 1. Live Standings & Chase
        headlines.push(`🏆 STANDINGS: ${leader.name} leads the pack with ${leader.totalPoints} PTS!`);
        headlines.push(`🥈 CHASE IN PROGRESS: ${runnerUp.name} trails the lead by only ${leader.totalPoints - runnerUp.totalPoints} points.`);

        // 2. Real-time Live Matches
        const liveGames = modifiedMatches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
        if (liveGames.length > 0) {
            liveGames.forEach(m => {
                headlines.push(`📺 LIVE NOW: ${m.homeTeam} ${m.homeGoals ?? 0} - ${m.awayGoals ?? 0} ${m.awayTeam} (${m.minute ? `${m.minute}'` : 'HT'})`);
            });
        }

        // 3. Unfiltered Sarcastic / Savage News Ticker Items
        headlines.push(`🚨 STAT EMERGENCY: Send thoughts, prayers, and maybe a map to ${lastPlace.name} (only ${lastPlace.totalPoints} PTS). The tactical setup is in absolute ruins.`);
        headlines.push(`📈 MARKET UPDATE: Stocks in ${leader.name}'s draft choices are soaring. The rest of the league is mathematically down bad.`);
        headlines.push(`📉 FINANCIAL RUIN: Analysts predict ${lastPlace.name}'s investment in ${lastPlace.teams.join(', ')} is the worst financial decision since buying Enron stock.`);
        headlines.push(`🧱 TERRORIST FOOTBALL: ${gloveLeaders[0].name} has parked the bus so hard they are violating local zoning laws. Someone tell them scoring is allowed.`);
        headlines.push(`💨 MISSED TARGET: ${bootLeaders[bootLeaders.length - 1].name} is shooting complete blanks. Zero goals. Someone check if their forwards are actually blindfolded.`);
        headlines.push(`⚖️ CONSPIRACY: Rumors suggest ${leader.name}'s draft was assisted by an elite supercomputer, while ${lastPlace.name} let a lobotomized dog pick their squad.`);
        headlines.push(`⚠️ WARNING: High concentrations of concentrated copium detected radiating from ${lastPlace.name}'s camp. Disbelief expected to last all weekend.`);
        headlines.push(`🏥 INJURY UPDATE: ${lastPlace.name}'s self-esteem has been ruled OUT for the remainder of the tournament after looking at the live leaderboard.`);
        headlines.push(`🍼 BABY MODE: ${leader.name} is riding the coattails of heavy tournament favorites like an absolute parasite. Try playing on veteran mode next time.`);
        headlines.push(`🕵️‍♂️ INVESTIGATION: Local authorities investigating whether ${lastPlace.name} actually knows what a soccer ball looks like after drafting ${lastPlace.teams.join(', ')}.`);
        headlines.push(`🥱 SNOOZE FEST: Watching ${gloveLeaders[0].name}'s teams play is currently being trialed as a cure for chronic insomnia.`);
        headlines.push(`🔥 SAVAGE STATS: ${leader.name} is currently outscoring ${lastPlace.name} by ${gap} points. This isn't a fantasy league, it's a public execution.`);

        // 4. Sarcastic Sports Journalism Headlines
        const wildSarcasticLines = [
            `⚽ GOLDEN BOOT: ${bootLeaders[0].name}'s strikers are firing absolute heat-seeking missiles (${bootLeaders[0].totalGoals} goals).`,
            `📰 TRANSFER RUMORS: Reports suggest ${lastPlace.name} is looking to trade their entire drafted roster for a bag of slightly stale potato chips.`,
            `🕵️‍♂️ SCOUTING REPORT: Mid-table managers continue to redefine 'vanilla'. If unseasoned, boiled chicken breast played football, it would look like this.`,
            `🚨 BREAKING: FIFA considering launching a formal inquiry into how ${lastPlace.name} manages to screw up every single tactical decision so consistently.`,
            `💡 PRO TIP: Remind ${lastPlace.name} that the goal of the game is to get points, not collect losses like Pokémon cards.`,
            `🤷‍♂️ STAT OF THE DAY: Even if you doubled ${lastPlace.name}'s points, they would still be trailing ${leader.name}. Tragic.`,
            `⚡ ENERGY REPORT: ${leader.name}'s draft choices are currently running on premium rocket fuel while ${lastPlace.name}'s teams move slower than parked cars.`,
            `📢 PRESS CONFERENCE: Asked about their draft, ${lastPlace.name} reportedly wept silently for ten minutes before leaving the media room.`
        ];

        headlines.push(...wildSarcasticLines);

        return headlines;
    };

    const tickerHeadlines = getTickerHeadlines();
    const eliminatedTeamsSet = new Set<string>();
    modifiedMatches.forEach(m => {
        if (m.homeTeam && m.homeTeam !== 'TBD' && isTeamEliminated(m.homeTeam, modifiedMatches)) eliminatedTeamsSet.add(m.homeTeam.toUpperCase());
        if (m.awayTeam && m.awayTeam !== 'TBD' && isTeamEliminated(m.awayTeam, modifiedMatches)) eliminatedTeamsSet.add(m.awayTeam.toUpperCase());
    });

    // Compute complete Draft Value ROI statistics based on Picks list
    const draftAnalysis = picks.map((p, index) => {
        const pickNumber = index + 1;
        const stats = getTeamPointsAndLogs(p.team, modifiedMatches, showProjected || Object.keys(customScores).length > 0);
        const expected = getExpectedPoints(pickNumber);
        const surplus = stats.points - expected;
        const roi = (surplus / expected) * 100;
        return {
            team: p.team,
            drafter: p.drafter,
            pickNumber,
            actualPoints: stats.points,
            expectedPoints: expected,
            surplus,
            roi,
            eliminated: eliminatedTeamsSet.has(p.team.toUpperCase())
        };
    });

    const sortedBestPicks = [...draftAnalysis].sort((a, b) => b.roi - a.roi);
    const sortedWorstPicks = [...draftAnalysis].sort((a, b) => a.roi - b.roi);

    const goldenPick = sortedBestPicks[0];
    const biggestBust = sortedWorstPicks[0];

    const managerRoiStats = drafters.map(name => {
        const managerPicks = draftAnalysis.filter(da => da.drafter === name);
        const totalActual = managerPicks.reduce((acc, p) => acc + p.actualPoints, 0);
        const totalExpected = managerPicks.reduce((acc, p) => acc + p.expectedPoints, 0);
        const surplus = totalActual - totalExpected;
        const avgRoi = totalExpected > 0 ? (surplus / totalExpected) * 100 : 0;
        return {
            name,
            totalActual,
            totalExpected,
            surplus,
            avgRoi,
            picks: managerPicks,
            picksCount: managerPicks.length
        };
    }).sort((a, b) => b.surplus - a.surplus); // Sorted by total surplus points created!

    const bestManager = [...managerRoiStats].sort((a, b) => b.avgRoi - a.avgRoi)[0];

    const getSavageReport = () => {
        if (overallLeaders.length < 2) return null;
        const king = overallLeaders[0];
        const runnerUp = overallLeaders[1];
        const clown = overallLeaders[overallLeaders.length - 1];
        const pointGap = king.totalPoints - clown.totalPoints;
        const chaseGap = king.totalPoints - runnerUp.totalPoints;

        return (
            <div className="bg-gradient-to-br from-red-500/20 via-black/50 to-orange-600/10 border border-red-500/30 rounded-xl p-4 shadow-2xl mt-2 sm:mt-4 content-animate">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2 mb-3">
                    <span className="text-xl">🔥</span>
                    <h3 className={`text-[10px] sm:text-xs font-mono font-black text-rose-400 uppercase tracking-widest drop-shadow-md`}>Matchday Savage Report</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="bg-black/60 border border-emerald-500/20 p-3 rounded-lg flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <ManagerAvatar name={king.name} size="sm" />
                                <span className="font-black text-emerald-400 uppercase tracking-wide">🏆 THE LEAGUE KING: {king.name}</span>
                            </div>
                            <p className="text-slate-300 font-semibold leading-relaxed">
                                {king.name} is sitting comfortably at the top with <strong className="text-emerald-400 font-bold">{king.totalPoints} PTS</strong>.
                                Their draft choices are running wild, leaving the rest of the managers in complete shambles.
                                {chaseGap <= 12 ? ` However, ${runnerUp.name} is lurking only ${chaseGap} points behind. Don't pop the champagne just yet.` : ` They have a comfortable ${chaseGap}-point cushion. Absolute tactical mastery.`}
                            </p>
                        </div>
                    </div>
                    <div className="bg-black/60 border border-red-500/20 p-3 rounded-lg flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <ManagerAvatar name={clown.name} size="sm" />
                                <span className="font-black text-red-400 uppercase tracking-wide">🤡 THE TAIL-ENDER: {clown.name}</span>
                            </div>
                            <p className="text-slate-300 font-semibold leading-relaxed">
                                Down in the trenches, we find {clown.name} with a tragic <strong className="text-red-400 font-bold">{clown.totalPoints} PTS</strong>.
                                They are currently trailing the lead by a massive <strong className="text-red-400 font-bold">{pointGap} PTS</strong>.
                                Their teams are moving slower than a line of parked cars on a highway. Time to fire the coaching staff, rebuild the roster, or start praying for a miracle.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderBracketMatch = (m: any) => {
        const homeDrafter = getDrafterForTeam(m.homeTeam);
        const awayDrafter = getDrafterForTeam(m.awayTeam);
        const isHomeWin = m.winner === m.homeTeam;
        const isAwayWin = m.winner === m.awayTeam;
        const homeEliminated = isTeamEliminated(m.homeTeam, modifiedMatches);
        const awayEliminated = isTeamEliminated(m.awayTeam, modifiedMatches);

        return (
            <div key={m.id} className="bg-black/80 border border-white/10 rounded-lg p-2.5 flex flex-col w-[230px] sm:w-[250px] shadow-lg text-[10px] sm:text-xs font-semibold shrink-0">
                <div className="text-[8px] font-mono text-slate-400 uppercase tracking-widest border-b border-white/5 pb-1 mb-2 flex justify-between">
                    <span>{m.stage}</span>
                    {m.status === 'IN_PLAY' && <span className="text-red-500 animate-pulse font-black">LIVE</span>}
                    {m.status === 'PAUSED' && <span className="text-[#fbbf24] font-black">HT</span>}
                    {m.status === 'FINISHED' && <span className="text-emerald-400">FT</span>}
                </div>
                <div className={`flex items-center justify-between p-1 rounded ${isHomeWin ? 'bg-emerald-500/15 border border-emerald-500/30' : ''} ${homeEliminated ? 'opacity-35 grayscale' : ''}`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                        <FlagIcon teamName={m.homeTeam} />
                        <span className={`truncate block w-20 sm:w-24 ${isHomeWin ? 'text-emerald-400 font-bold' : 'text-slate-100'}`}>{m.homeTeam}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {homeDrafter && <ManagerAvatar name={homeDrafter} size="sm" />}
                        <div className="flex flex-col items-center">
                            <button onClick={() => adjustWhatIf(m.id, 'home', 1)} className="text-[7px] text-slate-500 hover:text-sky-400 leading-none">▲</button>
                            <span className={`font-black text-xs sm:text-sm w-4 text-center leading-none ${oswald.className}`}>{m.homeGoals !== null ? m.homeGoals : '-'}</span>
                            <button onClick={() => adjustWhatIf(m.id, 'home', -1)} className="text-[7px] text-slate-500 hover:text-sky-400 leading-none">▼</button>
                        </div>
                    </div>
                </div>
                <div className="h-1" />
                <div className={`flex items-center justify-between p-1 rounded ${isAwayWin ? 'bg-emerald-500/15 border border-emerald-500/30' : ''} ${awayEliminated ? 'opacity-35 grayscale' : ''}`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                        <FlagIcon teamName={m.awayTeam} />
                        <span className={`truncate block w-20 sm:w-24 ${isAwayWin ? 'text-emerald-400 font-bold' : 'text-slate-100'}`}>{m.awayTeam}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {awayDrafter && <ManagerAvatar name={awayDrafter} size="sm" />}
                        <div className="flex flex-col items-center">
                            <button onClick={() => adjustWhatIf(m.id, 'away', 1)} className="text-[7px] text-slate-500 hover:text-sky-400 leading-none">▲</button>
                            <span className={`font-black text-xs sm:text-sm w-4 text-center leading-none ${oswald.className}`}>{m.awayGoals !== null ? m.awayGoals : '-'}</span>
                            <button onClick={() => adjustWhatIf(m.id, 'away', -1)} className="text-[7px] text-slate-500 hover:text-sky-400 leading-none">▼</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="relative min-h-screen font-sans text-slate-100 overflow-x-hidden">

            <style jsx global>{`
                @keyframes bgReveal {
                    0% { opacity: 0; transform: scale(1.05); }
                    100% { opacity: 1; transform: scale(1); }
                }
                @keyframes contentPop {
                    0% { opacity: 0; transform: translateY(20px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-33.33%); }
                }

                .bg-animate { animation: bgReveal 1.5s ease-out forwards; }
                .content-animate { animation: contentPop 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.8s both; }
                .animate-marquee { display: flex; width: max-content; animation: marquee 130s linear infinite; }
                .animate-marquee:hover { animation-play-state: paused; }
                .avatar-img-custom { object-fit: cover; object-position: center 25%; }
            `}</style>

            <div
                key={`bg-${activeTab}`}
                className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat bg-animate brightness-125 contrast-125 saturate-110"
                style={{
                    backgroundImage:
                        activeTab === 'draft' ? "url('/draft.png')" :
                            activeTab === 'matches' ? "url('/scores.png')" :
                                activeTab === 'schedule' ? "url('/schedule.png')" :
                                    activeTab === 'rules' ? "url('/rules.png')" :
                                        activeTab === 'standings' ? "url('/leaderboard.png')" :
                                            activeTab === 'banter' ? "url('/leaderboard.png')" :
                                                "url('/awards.png')"
                }}
            />

            <div className="fixed inset-0 z-0 bg-black/20" />

            <div className="relative z-10 p-2 sm:p-5">

                {selectedManager && (
                    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-md" onClick={() => setSelectedManager(null)}>
                        <div className="bg-black/90 backdrop-blur-xl border border-white/20 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="p-4 sm:p-5 border-b border-white/10 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-black/60 rounded-t-xl shrink-0">
                                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 w-full">
                                    <div className="relative shrink-0">
                                        <ManagerAvatar name={selectedManager.name} size="xl" />
                                    </div>
                                    <div className="flex-1 text-center sm:text-left">
                                        <h2 className={`text-xl sm:text-2xl font-black text-sky-400 uppercase tracking-wider drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>
                                            {selectedManager.name}'S DASHBOARD
                                        </h2>
                                        <div className="flex flex-wrap gap-2 mt-2 justify-center sm:justify-start">
                                            <span className="bg-black/60 border border-white/10 px-2.5 py-1 rounded-md text-[10px] font-bold text-white flex items-center gap-1.5 shadow-sm">
                                                <strong className="text-[#fbbf24] text-xs">Total:</strong> {selectedManager.totalPoints} PTS
                                            </span>
                                            <span className="bg-black/60 border border-white/10 px-2.5 py-1 rounded-md text-[10px] font-bold text-white flex items-center gap-1.5 shadow-sm">
                                                <strong className="text-emerald-400 text-xs">Wins:</strong> {selectedManager.wins}
                                            </span>
                                            <span className="bg-black/60 border border-white/10 px-2.5 py-1 rounded-md text-[10px] font-bold text-white flex items-center gap-1.5 shadow-sm">
                                                <strong className="text-slate-300 text-xs">Draws:</strong> {selectedManager.draws}
                                            </span>
                                            <span className="bg-black/60 border border-white/10 px-2.5 py-1 rounded-md text-[10px] font-bold text-white flex items-center gap-1.5 shadow-sm">
                                                <strong className="text-rose-400 text-xs">Losses:</strong> {selectedManager.losses}
                                            </span>
                                            <span className="bg-black/60 border border-white/10 px-2.5 py-1 rounded-md text-[10px] font-bold text-white flex items-center gap-1.5 shadow-sm">
                                                <strong className="text-amber-400 text-xs">GF:</strong> {selectedManager.totalGoals} Goals
                                            </span>
                                            <span className="bg-black/60 border border-white/10 px-2.5 py-1 rounded-md text-[10px] font-bold text-white flex items-center gap-1.5 shadow-sm">
                                                <strong className="text-blue-400 text-xs">CS:</strong> {selectedManager.totalCleanSheets} Sheets
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedManager(null)} className="w-full md:w-auto text-center text-white hover:text-sky-400 bg-white/10 hover:bg-white/20 border border-white/20 py-1.5 px-4 rounded-lg transition text-[10px] font-mono uppercase tracking-widest shadow-md font-bold shrink-0">Close</button>
                            </div>

                            <div className="p-2 sm:p-4 overflow-y-auto space-y-3">
                                {selectedManager.teams.map((team: string) => {
                                    const logs = selectedManager.matchLogs.filter((l: any) => l.team === team);
                                    const teamTotal = logs.reduce((sum: number, l: any) => sum + l.points, 0);
                                    const eliminated = isTeamEliminated(team, modifiedMatches);

                                    return (
                                        <div key={team} className={`bg-black/70 backdrop-blur-md border border-white/20 rounded-lg overflow-hidden shadow-xl ${eliminated ? 'opacity-50 grayscale' : ''}`}>
                                            <div className="bg-black/90 px-2.5 sm:px-3 py-2 border-b border-white/10 flex justify-between items-center">
                                                <h3 className="font-black text-[10px] sm:text-sm flex items-center text-slate-100 uppercase tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
                                                    <FlagIcon teamName={team} /> {team} {eliminated && <span className="text-[8px] font-black text-rose-500 ml-2">(ELIMINATED)</span>}
                                                </h3>
                                                <span className={`text-[#fbbf24] font-black text-base sm:text-lg drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>{teamTotal} PTS</span>
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left text-[9px] sm:text-xs border-collapse min-w-[450px] sm:min-w-[500px]">
                                                    <thead>
                                                    <tr className="border-b border-white/10 text-slate-300 text-[8px] sm:text-[10px] uppercase font-mono bg-black/60 tracking-widest font-black">
                                                        <th className="py-1.5 sm:py-2 pl-2 sm:pl-3 drop-shadow-md">Stage</th>
                                                        <th className="py-1.5 sm:py-2 drop-shadow-md">Opponent</th>
                                                        <th className="py-1.5 sm:py-2 text-center drop-shadow-md">Score</th>
                                                        <th className="py-1.5 sm:py-2 drop-shadow-md">Points Breakdown</th>
                                                        <th className="py-1.5 sm:py-2 text-right pr-2 sm:pr-3 drop-shadow-md">Match PTS</th>
                                                    </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/10">
                                                    {logs.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} className="py-3 sm:py-4 text-center text-slate-400 font-bold italic text-[9px] sm:text-xs">No matches played yet.</td>
                                                        </tr>
                                                    ) : (
                                                        logs.map((log: any, i: number) => (
                                                            <tr key={i} className="hover:bg-black/40 transition">
                                                                <td className="py-1.5 sm:py-2 pl-2 sm:pl-3 font-mono text-slate-100 text-[9px] sm:text-xs uppercase drop-shadow-md font-bold">
                                                                    {log.stage} {log.isLive && <span className="text-[8px] font-black text-emerald-400 animate-pulse ml-1">(LIVE)</span>}
                                                                </td>
                                                                <td className="py-1.5 sm:py-2 font-black text-slate-100 flex items-center drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
                                                                    <FlagIcon teamName={log.opponent} /> {log.opponent}
                                                                </td>
                                                                <td className="py-1.5 sm:py-2 text-center">
                                                                        <span className={`font-mono font-black drop-shadow-md text-[10px] sm:text-sm ${log.result === 'W' ? 'text-emerald-400' : log.result === 'D' ? 'text-white' : log.result === 'L' ? 'text-rose-400' : 'text-slate-400'}`}>
                                                                            {log.score} <span className="text-[8px] sm:text-[9px] ml-1">({log.result})</span>
                                                                        </span>
                                                                </td>
                                                                <td className="py-1.5 sm:py-2 font-mono text-[#fbbf24] text-[9px] sm:text-xs break-words whitespace-normal leading-tight font-black drop-shadow-md" title={log.details.join(', ')}>
                                                                    {log.details.join(', ')}
                                                                </td>
                                                                <td className="py-1.5 sm:py-2 text-right pr-2 sm:pr-3">
                                                                    {log.points > 0 ? (
                                                                        <span className={`font-black text-emerald-400 text-[10px] sm:text-sm bg-black/80 border border-white/10 px-1.5 sm:px-2 py-0.5 rounded shadow-sm drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+{log.points}</span>
                                                                    ) : (
                                                                        <span className="font-mono text-slate-300 font-bold drop-shadow-md text-[9px] sm:text-[10px]">0</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}

                <header className="border-b border-white/20 pb-3 sm:pb-4 mb-4 sm:mb-5 max-w-7xl mx-auto content-animate">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-2 sm:gap-3">
                        <div className="text-center md:text-left">
                            <h1 className="text-xl sm:text-3xl font-black tracking-tight uppercase flex items-center gap-1.5 sm:gap-2 justify-center md:justify-start">
                                <span className="text-xl sm:text-3xl drop-shadow-lg">🏆</span>
                                <span className={`text-slate-50 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>League World Cup</span>
                            </h1>
                        </div>
                        <div className="flex overflow-x-auto no-scrollbar bg-black/70 backdrop-blur-xl p-1 sm:p-1.5 rounded-lg border border-white/20 w-full md:w-auto shadow-2xl">
                            {['draft', 'matches', 'schedule', 'standings', 'awards', 'rules', 'banter'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab as any)}
                                    className={`flex-1 md:flex-none whitespace-nowrap px-2.5 sm:px-3 py-1.5 rounded-md text-[9px] sm:text-xs uppercase tracking-wider font-black transition-all duration-300 drop-shadow-md ${activeTab === tab ? 'bg-sky-500/20 text-sky-400 shadow-md border border-sky-400/50 scale-105' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
                                >
                                    {tab === 'draft' ? 'Draft' : tab === 'matches' ? 'Scores' : tab === 'schedule' ? 'Schedule' : tab === 'standings' ? 'Leaderboard' : tab === 'awards' ? 'Awards' : tab === 'rules' ? 'Rules' : 'Value Board'}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                {/* ESPN-Style Live News Ticker Tape */}
                {tickerHeadlines.length > 0 && (
                    <div className="bg-red-600/85 backdrop-blur-md border-y border-red-500 py-2 overflow-hidden w-full max-w-7xl mx-auto rounded-lg mb-4 sm:mb-5 shadow-lg relative flex items-center content-animate">
                        <div className="absolute left-0 z-10 bg-red-700 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-md select-none">
                            Live news
                        </div>
                        <div className="flex whitespace-nowrap pl-24 animate-marquee font-mono text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white gap-16">
                            {[...tickerHeadlines, ...tickerHeadlines, ...tickerHeadlines].map((headline, idx) => (
                                <span key={idx} className="flex items-center gap-2">
                                    {headline}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div key={`content-${activeTab}`} className="content-animate">

                    {activeTab === 'draft' && (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-5 max-w-7xl mx-auto">
                            <div className="bg-black/70 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden flex flex-col h-auto max-h-[80vh] shadow-2xl">
                                <div className="p-2.5 sm:p-3 border-b border-white/20 bg-black/80">
                                    <h2 className="text-[9px] sm:text-xs font-mono font-black text-slate-200 uppercase tracking-widest drop-shadow-md">Drafters & Picks</h2>
                                </div>
                                <div className="overflow-y-auto p-2.5 sm:p-3 space-y-3">
                                    {drafters.map((drafter, idx) => (
                                        <div key={drafter}>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="text-slate-400 font-mono text-[9px] sm:text-[10px] font-black drop-shadow-md">{idx + 1}</span>
                                                <ManagerAvatar name={drafter} size="sm" />
                                                <h3 className="font-black text-sky-400 text-xs sm:text-sm drop-shadow-md [text-shadow:0_1px_2px_black]">{drafter}</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-1 sm:gap-1.5 pl-2">
                                                {picks.filter(p => p.drafter === drafter).map((pick, pIdx) => {
                                                    const eliminated = isTeamEliminated(pick.team, modifiedMatches);
                                                    return (
                                                        <div key={pIdx} className={`bg-black/60 border border-white/20 rounded-md px-1.5 sm:px-2 py-1 sm:py-1.5 flex items-center text-[9px] sm:text-xs shadow-md min-w-0 ${eliminated ? 'opacity-35 grayscale' : ''}`}>
                                                            <FlagIcon teamName={pick.team}/>
                                                            <span className="truncate block whitespace-nowrap text-slate-100 font-black drop-shadow-[0_2px_2px_rgba(0,0,0,1)] w-full">{pick.team}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="lg:col-span-2 bg-black/70 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden flex flex-col h-auto max-h-[80vh] shadow-2xl">
                                <div className="p-2.5 sm:p-3 border-b border-white/20 bg-black/80 flex justify-between items-center gap-2">
                                    <h2 className="text-[9px] sm:text-xs font-mono font-black text-slate-200 uppercase tracking-widest truncate drop-shadow-md">Tournament Field</h2>
                                    <input type="text" placeholder="Search..." value={draftSearch} onChange={(e) => setDraftSearch(e.target.value)} className="bg-black/60 border border-white/30 text-white rounded-md px-2 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-xs focus:outline-none focus:border-sky-400 w-24 sm:w-40 transition shadow-inner font-bold placeholder-slate-400" />
                                </div>
                                <div className="overflow-y-auto p-2.5 sm:p-5 space-y-4 sm:space-y-5">
                                    {Object.keys(groupedTeams).sort().map(group => {
                                        const groupTeams = groupedTeams[group].filter(t => t.toLowerCase().includes(draftSearch.toLowerCase()));
                                        if (groupTeams.length === 0) return null;
                                        return (
                                            <div key={group}>
                                                <h3 className="text-[9px] sm:text-[10px] font-mono font-black text-slate-300 mb-1.5 sm:mb-2 uppercase tracking-widest drop-shadow-md">{group}</h3>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3">
                                                    {groupTeams.sort().map(team => {
                                                        const drafter = getDrafterForTeam(team);
                                                        const eliminated = isTeamEliminated(team, modifiedMatches);
                                                        return (
                                                            <div key={team} className={`border rounded-lg p-1.5 sm:p-2 flex flex-col justify-center items-center text-center transition-all min-w-0 shadow-lg ${eliminated ? 'opacity-30 grayscale border-white/5 bg-black/90' : drafter ? 'bg-black/90 border-white/5 opacity-70' : 'bg-black/60 border-white/30 hover:border-white/50 hover:bg-black/80'}`}>
                                                                <div className="mb-0.5 sm:mb-1"><FlagIcon teamName={team}/></div>
                                                                <span className={`text-[9px] sm:text-[11px] truncate block w-full drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${eliminated ? 'line-through text-slate-500 font-bold' : 'font-black text-slate-100'}`}>{team}</span>
                                                                <span className="text-[7px] sm:text-[9px] text-sky-400 font-mono mt-0.5 sm:mt-1 h-2 drop-shadow-md font-black">{eliminated ? 'OUT' : drafter || ''}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="bg-black/70 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden flex flex-col h-auto max-h-[80vh] shadow-2xl">
                                <div className="p-2.5 sm:p-3 border-b border-white/20 bg-black/80">
                                    <h2 className="text-[9px] sm:text-[10px] font-mono font-black text-slate-200 uppercase tracking-widest drop-shadow-md">Pick Log</h2>
                                </div>
                                <div className="overflow-y-auto p-2.5 sm:p-3 space-y-1.5 sm:space-y-2">
                                    {[...picks].reverse().map((pick, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-black/60 border border-white/10 p-1.5 sm:p-2 rounded-md min-w-0 hover:bg-black/90 transition shadow-md">
                                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 pr-1 sm:pr-2">
                                                <span className={`text-[9px] sm:text-[10px] font-mono text-slate-300 font-black shrink-0 w-4 sm:w-5 drop-shadow-md ${oswald.className}`}>#{picks.length - idx}</span>
                                                <div className={`flex items-center text-[9px] sm:text-[10px] font-black text-slate-100 min-w-0 drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${isTeamEliminated(pick.team, modifiedMatches) ? 'opacity-35 grayscale line-through text-slate-500' : ''}`}>
                                                    <FlagIcon teamName={pick.team}/>
                                                    <span className="truncate block whitespace-nowrap">{pick.team}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className="text-[7px] sm:text-[8px] text-sky-400 font-black drop-shadow-md">{pick.drafter}</span>
                                                <ManagerAvatar name={pick.drafter} size="sm" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'matches' && (
                        <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">

                            {/* What-If Simulator Alert Banner */}
                            {Object.keys(customScores).length > 0 && (
                                <div className="bg-amber-600/90 border border-amber-500 rounded-lg p-3 text-xs sm:text-sm font-bold flex justify-between items-center text-white shadow-lg content-animate">
                                    <span className="flex items-center gap-2">
                                        <span>⚠️</span> WHAT-IF SIMULATOR ACTIVE: You are viewing simulated projections.
                                    </span>
                                    <button
                                        onClick={() => setCustomScores({})}
                                        className="bg-black/40 hover:bg-black/60 border border-white/20 px-3 py-1 rounded text-[10px] font-mono uppercase tracking-widest transition"
                                    >
                                        Reset Leaders
                                    </button>
                                </div>
                            )}

                            {/* Today's Active Rooting Guide */}
                            {(() => {
                                const todayStr = new Date().toISOString().split('T')[0];
                                let activeMatches = modifiedMatches.filter(m => m.utcDate && m.utcDate.startsWith(todayStr));
                                if (activeMatches.length === 0) {
                                    // Fallback: Grab up to 3 upcoming unfinished matches
                                    activeMatches = modifiedMatches.filter(m => m.status !== 'FINISHED').slice(0, 3);
                                }
                                if (activeMatches.length === 0) return null;

                                return (
                                    <div className="bg-gradient-to-br from-sky-950/50 via-black/80 to-indigo-950/40 border border-sky-500/20 rounded-xl p-4 shadow-2xl content-animate">
                                        <h3 className="text-[10px] sm:text-xs font-mono font-black text-sky-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3 flex items-center gap-2">
                                            <span>🎯</span> Active Rooting Guide
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {activeMatches.map(m => {
                                                const homeDrafter = getDrafterForTeam(m.homeTeam);
                                                const awayDrafter = getDrafterForTeam(m.awayTeam);
                                                return (
                                                    <div key={m.id} className="bg-black/40 border border-white/5 p-3 rounded-lg flex flex-col justify-between space-y-2">
                                                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                                                            <span>{m.stage}</span>
                                                            {m.status === 'IN_PLAY' && <span className="text-red-500 animate-pulse font-black">LIVE</span>}
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="flex items-center gap-1 font-black text-white">
                                                                    <FlagIcon teamName={m.homeTeam} /> {m.homeTeam}
                                                                </span>
                                                                <span className="text-sky-400 font-mono text-[10px] font-black">{homeDrafter || 'Neutral'}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="flex items-center gap-1 font-black text-white">
                                                                    <FlagIcon teamName={m.awayTeam} /> {m.awayTeam}
                                                                </span>
                                                                <span className="text-sky-400 font-mono text-[10px] font-black">{awayDrafter || 'Neutral'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="border-t border-white/5 pt-1.5 text-[8px] sm:text-[9px] font-mono leading-relaxed text-slate-300">
                                                            {homeDrafter && <div>• <strong className="text-white">{homeDrafter}</strong> wants <strong className="text-emerald-400">{m.homeTeam} Win (+4)</strong> & CS (+2)</div>}
                                                            {awayDrafter && <div>• <strong className="text-white">{awayDrafter}</strong> wants <strong className="text-emerald-400">{m.awayTeam} Win (+4)</strong> & CS (+2)</div>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2 sm:gap-3 mb-2 sm:mb-3">
                                <div className="flex flex-col gap-2.5 w-full sm:w-auto">
                                    <h2 className={`text-lg sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-xl [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>ALL SCORES</h2>

                                    <div className="flex bg-black/60 border border-white/10 p-0.5 rounded-lg shadow-md w-max">
                                        <button
                                            onClick={() => setMatchesSubTab('groups')}
                                            className={`px-3.5 py-1 rounded-md text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                                                matchesSubTab === 'groups'
                                                    ? 'bg-sky-500/20 text-sky-400 border border-sky-400/30'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            Group Stage
                                        </button>
                                        <button
                                            onClick={() => setMatchesSubTab('bracket')}
                                            className={`px-3.5 py-1 rounded-md text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                                                matchesSubTab === 'bracket'
                                                    ? 'bg-sky-500/20 text-sky-400 border border-sky-400/30'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            Knockout Bracket
                                        </button>
                                    </div>
                                </div>

                                {matchesSubTab === 'groups' && (
                                    <div className="flex items-center gap-1.5 w-full sm:w-auto self-end">
                                        <label htmlFor="groupFilter" className="text-[8px] sm:text-[10px] font-mono text-white font-black uppercase tracking-widest shrink-0 drop-shadow-md">Filter:</label>
                                        <select
                                            id="groupFilter"
                                            value={selectedGroupFilter}
                                            onChange={(e) => setSelectedGroupFilter(e.target.value)}
                                            className="bg-black/80 backdrop-blur-xl border border-white/30 text-white font-bold rounded-md px-2 sm:px-3 py-1 text-[9px] sm:text-xs focus:outline-none focus:border-emerald-400 transition shadow-lg w-full sm:w-auto"
                                        >
                                            <option value="ALL">All Groups</option>
                                            {groupNames.map(grp => (
                                                <option key={grp} value={grp}>{grp}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            {matchesSubTab === 'groups' && (
                                <div className="space-y-4">
                                    {filteredGroupNames.length === 0 ? (
                                        <div className="text-center py-4 sm:py-6 text-white font-bold bg-black/70 backdrop-blur-xl border border-dashed border-white/30 rounded-xl text-[9px] sm:text-xs shadow-2xl drop-shadow-md">
                                            <p>No matches found for the selected filter.</p>
                                        </div>
                                    ) : (
                                        filteredGroupNames.map(group => {
                                            const groupMatches = modifiedMatches.filter(m => m.group === group);
                                            const groupTable = getRealGroupStandings(groupMatches);

                                            return (
                                                <div key={group} className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl">
                                                    <div className="bg-black/80 px-2.5 sm:px-4 py-1.5 sm:py-2 border-b border-white/20 flex justify-between items-center">
                                                        <h3 className={`font-black text-[#fbbf24] text-[10px] sm:text-sm uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>{group}</h3>
                                                        <span className="text-[7px] sm:text-[8px] text-slate-300 font-bold font-mono uppercase tracking-widest drop-shadow-md">Top 2 advance</span>
                                                    </div>

                                                    <div className="flex flex-col lg:flex-row">
                                                        <div className="w-full lg:w-[35%] xl:w-[30%] border-b lg:border-b-0 lg:border-r border-white/20 overflow-x-auto flex bg-black/60">
                                                            <table className="w-full text-left text-[9px] sm:text-xs min-w-[280px]">
                                                                <thead>
                                                                <tr className="border-b border-white/10 text-slate-300 text-[7px] sm:text-[9px] uppercase font-mono bg-black/80 font-black">
                                                                    <th className="py-1.5 sm:py-2 px-2 sm:px-3 drop-shadow-md">Team</th>
                                                                    <th className="py-1.5 sm:py-2 text-center w-4 sm:w-5 drop-shadow-md">MP</th>
                                                                    <th className="py-1.5 sm:py-2 text-center w-4 sm:w-5 drop-shadow-md">W</th>
                                                                    <th className="py-1.5 sm:py-2 text-center w-4 sm:w-5 drop-shadow-md">D</th>
                                                                    <th className="py-1.5 sm:py-2 text-center w-4 sm:w-5 drop-shadow-md">L</th>
                                                                    <th className="py-1.5 sm:py-2 text-center w-4 sm:w-5 drop-shadow-md">GF</th>
                                                                    <th className="py-1.5 sm:py-2 text-center w-4 sm:w-5 drop-shadow-md">GA</th>
                                                                    <th className="py-1.5 sm:py-2 text-center w-6 sm:w-7 pr-2 sm:pr-3 drop-shadow-md">PTS</th>
                                                                </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-white/10">
                                                                {groupTable.map((teamRow) => {
                                                                    const teamEliminated = isTeamEliminated(teamRow.name, modifiedMatches);
                                                                    return (
                                                                        <tr key={teamRow.name} className={`hover:bg-black/50 transition ${teamEliminated ? 'opacity-35 grayscale' : ''}`}>
                                                                            <td className="py-2.5 px-3 font-black text-slate-100 drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
                                                                                <div className="flex items-center whitespace-nowrap min-w-0">
                                                                                    <FlagIcon teamName={teamRow.name}/>
                                                                                    <span className="truncate block whitespace-nowrap">{teamRow.name}</span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="py-2 sm:py-2.5 text-center text-white font-bold font-mono drop-shadow-md">{teamRow.mp}</td>
                                                                            <td className="py-2 sm:py-2.5 text-center text-white font-bold font-mono drop-shadow-md">{teamRow.w}</td>
                                                                            <td className="py-2 sm:py-2.5 text-center text-white font-bold font-mono drop-shadow-md">{teamRow.d}</td>
                                                                            <td className="py-2 sm:py-2.5 text-center text-white font-bold font-mono drop-shadow-md">{teamRow.l}</td>
                                                                            <td className="py-2 sm:py-2.5 text-center text-white font-bold font-mono drop-shadow-md">{teamRow.gf}</td>
                                                                            <td className="py-2 sm:py-2.5 text-center text-white font-bold font-mono drop-shadow-md">{teamRow.ga}</td>
                                                                            <td className={`py-2 sm:py-2.5 text-center font-black text-[#fbbf24] pr-2 sm:pr-3 text-xs sm:text-sm drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>{teamRow.pts}</td>
                                                                        </tr>
                                                                    )
                                                                })}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        <div className="w-full lg:w-[65%] xl:w-[70%] p-2 sm:p-3 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5 content-start bg-transparent">
                                                            {groupMatches.map(m => {
                                                                const homeDrafter = getDrafterForTeam(m.homeTeam);
                                                                const awayDrafter = getDrafterForTeam(m.awayTeam);
                                                                const homeEliminated = isTeamEliminated(m.homeTeam, modifiedMatches);
                                                                const awayEliminated = isTeamEliminated(m.awayTeam, modifiedMatches);

                                                                const isHomeWin = m.winner === m.homeTeam;
                                                                const isAwayWin = m.winner === m.awayTeam;

                                                                const homeNameColor = isHomeWin ? 'font-black text-emerald-400' : isAwayWin ? 'font-bold text-rose-400' : 'font-black text-slate-100';
                                                                const awayNameColor = isAwayWin ? 'font-black text-emerald-400' : isHomeWin ? 'font-bold text-rose-400' : 'font-black text-slate-100';

                                                                const homeScoreColor = isHomeWin ? 'text-emerald-400' : isAwayWin ? 'text-rose-400' : 'text-[#fbbf24]';
                                                                const awayScoreColor = isAwayWin ? 'text-emerald-400' : isHomeWin ? 'text-rose-400' : 'text-[#fbbf24]';

                                                                return (
                                                                    <div key={m.id} className="flex items-center justify-between p-2 sm:p-2.5 bg-black/60 border border-white/20 rounded-lg hover:bg-black/80 hover:border-white/30 transition shadow-xl h-full">
                                                                        <div className={`flex-1 flex flex-col items-end text-right min-w-0 ${homeEliminated ? 'opacity-35 grayscale' : ''}`}>
                                                                            <div className="flex items-center gap-1 sm:gap-1.5 w-full justify-end min-w-0">
                                                                                <span className={`text-[9px] sm:text-xs truncate block drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${homeNameColor}`}>{m.homeTeam}</span>
                                                                                <div className="shrink-0"><FlagIcon teamName={m.homeTeam} /></div>
                                                                            </div>
                                                                            {homeDrafter && <span className="text-[7px] sm:text-[8px] text-sky-400 font-black font-mono mt-0.5 sm:mt-1 shrink-0 truncate block w-full drop-shadow-md">{homeDrafter}</span>}
                                                                        </div>

                                                                        <div className="mx-1.5 sm:mx-2 flex flex-col items-center shrink-0 min-w-[70px] sm:min-w-[85px]">
                                                                            <div className="flex items-center justify-center gap-1.5 bg-black/80 px-1 py-1 rounded-md border border-white/20 w-full shadow-inner mb-0.5 sm:mb-1">

                                                                                {/* Home What-If Adjuster */}
                                                                                <div className="flex flex-col items-center">
                                                                                    <button onClick={() => adjustWhatIf(m.id, 'home', 1)} className="text-[8px] text-slate-500 hover:text-sky-400 leading-none">▲</button>
                                                                                    <span className={`font-black text-sm sm:text-lg w-3 sm:w-4 text-center leading-tight drop-shadow-xl [-webkit-text-stroke:0.5px_black] ${homeScoreColor} ${oswald.className}`}>{m.homeGoals !== null ? m.homeGoals : '-'}</span>
                                                                                    <button onClick={() => adjustWhatIf(m.id, 'home', -1)} className="text-[8px] text-slate-500 hover:text-sky-400 leading-none">▼</button>
                                                                                </div>

                                                                                <span className="text-slate-400 font-black text-[8px] sm:text-[9px] leading-none drop-shadow-md self-center"> : </span>

                                                                                {/* Away What-If Adjuster */}
                                                                                <div className="flex flex-col items-center">
                                                                                    <button onClick={() => adjustWhatIf(m.id, 'away', 1)} className="text-[8px] text-slate-500 hover:text-sky-400 leading-none">▲</button>
                                                                                    <span className={`font-black text-sm sm:text-lg w-3 sm:w-4 text-center leading-tight drop-shadow-xl [-webkit-text-stroke:0.5px_black] ${awayScoreColor} ${oswald.className}`}>{m.awayGoals !== null ? m.awayGoals : '-'}</span>
                                                                                    <button onClick={() => adjustWhatIf(m.id, 'away', -1)} className="text-[8px] text-slate-500 hover:text-sky-400 leading-none">▼</button>
                                                                                </div>

                                                                            </div>
                                                                            {m.status === 'IN_PLAY' && <span className="text-[7px] sm:text-[8px] font-black tracking-widest text-red-500 animate-pulse drop-shadow-md">{m.minute ? `${m.minute}'` : 'LIVE'}</span>}
                                                                            {m.status === 'PAUSED' && <span className="text-[7px] sm:text-[8px] font-black tracking-widest text-[#fbbf24] drop-shadow-md">HT</span>}
                                                                            {m.status === 'FINISHED' && <span className="text-[7px] sm:text-[8px] font-black tracking-widest text-emerald-400 drop-shadow-md">FT</span>}
                                                                        </div>

                                                                        <div className={`flex-1 flex flex-col items-start text-left min-w-0 ${awayEliminated ? 'opacity-35 grayscale' : ''}`}>
                                                                            <div className="flex items-center gap-1.5 w-full justify-start min-w-0">
                                                                                <div className="shrink-0"><FlagIcon teamName={m.awayTeam} /></div>
                                                                                <span className={`text-[9px] sm:text-xs truncate block w-full drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${awayNameColor}`}>{m.awayTeam}</span>
                                                                            </div>
                                                                            {awayDrafter && <span className="text-[7px] sm:text-[8px] text-sky-400 font-black font-mono mt-0.5 sm:mt-1 shrink-0 truncate block w-full drop-shadow-md">{awayDrafter}</span>}
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            )}

                            {matchesSubTab === 'bracket' && (
                                <div className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl p-4 sm:p-5 shadow-2xl overflow-x-auto no-scrollbar content-animate">
                                    <div className="flex gap-6 sm:gap-8 min-w-[1250px] h-[720px] items-stretch pb-2">
                                        <div className="flex flex-col justify-around h-full w-[240px] shrink-0 border-r border-white/5 pr-4">
                                            <h4 className="text-[9px] font-mono text-slate-300 font-black tracking-widest uppercase border-b border-white/10 pb-1.5 mb-2 text-center shrink-0">Round of 32</h4>
                                            <div className="flex flex-col justify-around flex-grow py-2">
                                                {modifiedMatches.filter(m => m.stage === 'R32').length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic text-center w-[230px]">No Round of 32 matches populated.</p>
                                                ) : (
                                                    modifiedMatches.filter(m => m.stage === 'R32').map(m => renderBracketMatch(m))
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col justify-around h-full w-[240px] shrink-0 border-r border-white/5 pr-4">
                                            <h4 className="text-[9px] font-mono text-slate-300 font-black tracking-widest uppercase border-b border-white/10 pb-1.5 mb-2 text-center shrink-0">Round of 16</h4>
                                            <div className="flex flex-col justify-around flex-grow py-2">
                                                {modifiedMatches.filter(m => m.stage === 'R16').length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic text-center w-[230px]">Matches pending group play.</p>
                                                ) : (
                                                    modifiedMatches.filter(m => m.stage === 'R16').map(m => renderBracketMatch(m))
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col justify-around h-full w-[240px] shrink-0 border-r border-white/5 pr-4">
                                            <h4 className="text-[9px] font-mono text-slate-300 font-black tracking-widest uppercase border-b border-white/10 pb-1.5 mb-2 text-center shrink-0">Quarterfinals</h4>
                                            <div className="flex flex-col justify-around flex-grow py-2">
                                                {modifiedMatches.filter(m => m.stage === 'QF').length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic text-center w-[230px]">QF matches pending.</p>
                                                ) : (
                                                    modifiedMatches.filter(m => m.stage === 'QF').map(m => renderBracketMatch(m))
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col justify-around h-full w-[240px] shrink-0 border-r border-white/5 pr-4">
                                            <h4 className="text-[9px] font-mono text-slate-300 font-black tracking-widest uppercase border-b border-white/10 pb-1.5 mb-2 text-center shrink-0">Semifinals</h4>
                                            <div className="flex flex-col justify-around flex-grow py-2">
                                                {modifiedMatches.filter(m => m.stage === 'SF').length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic text-center w-[230px]">SF matches pending.</p>
                                                ) : (
                                                    modifiedMatches.filter(m => m.stage === 'SF').map(m => renderBracketMatch(m))
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col justify-around h-full w-[240px] shrink-0">
                                            <h4 className="text-[9px] font-mono text-slate-300 font-black tracking-widest uppercase border-b border-white/10 pb-1.5 mb-2 text-center shrink-0">Finals</h4>
                                            <div className="flex flex-col justify-around flex-grow py-2">
                                                {modifiedMatches.filter(m => m.stage === 'Final' || m.stage === '3rdPlace').length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic text-center w-[230px]">Final matches pending.</p>
                                                ) : (
                                                    modifiedMatches.filter(m => m.stage === 'Final' || m.stage === '3rdPlace').map(m => renderBracketMatch(m))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'schedule' && (
                        <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">
                            <h2 className={`text-lg sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-xl [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>MATCH SCHEDULE</h2>
                            <ScheduleTab eliminatedTeams={eliminatedTeamsSet} customScores={customScores} adjustWhatIf={adjustWhatIf} />
                        </div>
                    )}

                    {activeTab === 'standings' && (
                        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <h2 className={`text-xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-xl sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>
                                    LEADERBOARD
                                </h2>

                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex bg-black/60 border border-white/10 p-0.5 rounded-lg shadow-md">
                                        <button
                                            onClick={() => setStandingsView('grid')}
                                            className={`px-3 py-1 rounded-md text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-300 ${standingsView === 'grid' ? 'bg-sky-500/20 text-sky-400 border border-sky-400/30' : 'text-slate-400 hover:text-white'}`}
                                        >
                                            Grid
                                        </button>
                                        <button
                                            onClick={() => setStandingsView('table')}
                                            className={`px-3 py-1 rounded-md text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-300 ${standingsView === 'table' ? 'bg-sky-500/20 text-sky-400 border border-sky-400/30' : 'text-slate-400 hover:text-white'}`}
                                        >
                                            Table
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => setShowProjected(!showProjected)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-300 shadow-md ${showProjected ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-black/60 border-white/10 text-slate-400 hover:text-white hover:border-white/30'}`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${showProjected ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
                                        {showProjected ? 'Live Projections On' : 'Show Live Projections'}
                                    </button>
                                </div>
                            </div>

                            {standingsView === 'grid' && (
                                <div className="space-y-4 sm:space-y-6">
                                    <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-2xl">
                                        <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-3">
                                            <h3 className="text-[9px] sm:text-[10px] font-mono font-black text-slate-300 uppercase tracking-widest drop-shadow-md">Current Standings Grid</h3>
                                            <span className="text-[8px] font-mono text-slate-400">Ordered 1st to 12th</span>
                                        </div>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
                                            {overallLeaders.map((leader, index) => {
                                                const rankColor = index === 0 ? 'bg-amber-500 text-black' : index === 1 ? 'bg-slate-300 text-black' : index === 2 ? 'bg-orange-600 text-white' : 'bg-black/80 text-slate-300 border border-white/20';
                                                return (
                                                    <div key={leader.name} onClick={() => setSelectedManager(leader)} className="bg-black/60 border border-white/10 rounded-xl p-2.5 flex flex-col items-center justify-center relative cursor-pointer hover:bg-black/90 hover:border-sky-400/50 transition-all duration-300 group shadow-md">
                                                        <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-black font-mono shadow-md ${rankColor}`}>#{index + 1}</div>
                                                        <div className="mb-2"><ManagerAvatar name={leader.name} size="lg" /></div>
                                                        <div className="text-center w-full min-w-0">
                                                            <span className="block font-black text-[10px] sm:text-xs text-white truncate drop-shadow-md group-hover:text-sky-400 transition-colors">{leader.name}</span>
                                                            <span className={`block text-[11px] sm:text-xs font-black text-[#fbbf24] mt-0.5 ${oswald.className}`}>{leader.totalPoints} PTS</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    {getSavageReport()}
                                    <div className="grid grid-cols-3 gap-2 sm:gap-5">
                                        {overallLeaders.slice(0, 3).map((leader, i) => (
                                            <div key={leader.name} onClick={() => setSelectedManager(leader)} className={`backdrop-blur-xl rounded-xl flex flex-col items-center justify-center p-3 sm:p-5 text-center transition-all duration-300 cursor-pointer hover:bg-black/40 ${i === 0 ? 'bg-gradient-to-b from-amber-500/80 to-yellow-800/90 border border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.5)] sm:shadow-[0_0_30px_rgba(251,191,36,0.6)]' : i === 1 ? 'bg-gradient-to-b from-slate-400/80 to-slate-700/90 border border-slate-300 shadow-[0_0_15px_rgba(203,213,225,0.4)] sm:shadow-[0_0_30px_rgba(203,213,225,0.5)]' : 'bg-gradient-to-b from-orange-600/80 to-amber-900/90 border border-orange-500 shadow-[0_0_15px_rgba(194,65,12,0.4)] sm:shadow-[0_0_30px_rgba(194,65,12,0.6)]'}`}>
                                                <div className="relative mb-2.5">
                                                    <ManagerAvatar name={leader.name} size="md" />
                                                    <span className="absolute -bottom-1 -right-1 text-xl sm:text-2xl drop-shadow-md">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                                                </div>
                                                <h3 className="text-[11px] sm:text-xl md:text-2xl font-black text-white mb-0.5 sm:mb-1.5 tracking-wide truncate w-full px-1 sm:px-2 drop-shadow-md [-webkit-text-stroke:0.5px_black] sm:[-webkit-text-stroke:1px_black]">{leader.name}</h3>
                                                <div className={`text-2xl sm:text-5xl md:text-6xl font-black text-white leading-none mb-1 sm:mb-2.5 drop-shadow-2xl [-webkit-text-stroke:1px_black] sm:[-webkit-text-stroke:1.5px_black] ${oswald.className}`}>{leader.totalPoints}</div>
                                                <span className="text-[7px] sm:text-[11px] text-white font-bold font-mono mb-1.5 sm:mb-3 uppercase tracking-widest hidden sm:block drop-shadow-md [text-shadow:0_1px_2px_black]">Points</span>
                                                <div className="flex flex-wrap justify-center gap-0.5 sm:gap-1.5 px-1 sm:scale-110">
                                                    {leader.teams.map(t => {
                                                        const eliminated = eliminatedTeamsSet.has(t.toUpperCase());
                                                        return (<div key={t} title={t} className={eliminated ? 'opacity-35 grayscale' : ''}><FlagIcon teamName={t} /></div>);
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {standingsView === 'table' && (
                                <div className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl overflow-x-auto content-animate">
                                    <table className="w-full text-left text-[10px] sm:text-sm border-collapse min-w-[500px] sm:min-w-[800px]">
                                        <thead>
                                        <tr className="border-b border-white/20 text-slate-300 text-[8px] sm:text-[10px] uppercase font-mono bg-black/80 tracking-widest font-black">
                                            <th className="py-2 sm:py-4 pl-3 sm:pl-5 w-8 sm:w-12 drop-shadow-md">#</th>
                                            <th className="py-2 sm:py-4 w-28 sm:w-48 drop-shadow-md">Drafter</th>
                                            <th className="py-2 sm:py-4 w-12 sm:w-20 drop-shadow-md">PTS</th>
                                            <th className="py-2 sm:py-4 drop-shadow-md">Teams</th>
                                            <th className="py-2 sm:py-4 text-center w-8 sm:w-14 drop-shadow-md">W</th>
                                            <th className="py-2 sm:py-4 text-center w-8 sm:w-14 drop-shadow-md">D</th>
                                            <th className="py-2 sm:py-4 text-center w-8 sm:w-14 drop-shadow-md">L</th>
                                            <th className="py-2 sm:py-4 text-center w-8 sm:w-14 drop-shadow-md">GF</th>
                                            <th className="py-2 sm:py-4 text-center pr-3 sm:pr-5 w-8 sm:w-14 drop-shadow-md">CS</th>
                                        </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/10">
                                        {overallLeaders.map((row, index) => (
                                            <tr key={row.name} className="hover:bg-black/50 transition">
                                                <td className={`py-1.5 sm:py-3.5 pl-3 sm:pl-5 font-black text-white text-[11px] sm:text-base drop-shadow-md [text-shadow:0_1px_2px_black] ${oswald.className}`}>{index + 1}</td>
                                                <td className="py-1.5 sm:py-3.5">
                                                    <div className="flex items-center gap-2">
                                                        <ManagerAvatar name={row.name} size="sm" />
                                                        <button onClick={() => setSelectedManager(row)} className="font-black text-[10px] sm:text-sm text-sky-400 hover:text-[#fbbf24] transition text-left truncate max-w-[90px] sm:max-w-[150px] drop-shadow-md [text-shadow:0_1px_2px_black]">{row.name}</button>
                                                    </div>
                                                </td>
                                                <td className={`py-1.5 sm:py-3.5 font-black text-[#fbbf24] text-[13px] sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>{row.totalPoints}</td>
                                                <td className="py-1.5 sm:py-3.5">
                                                    <div className="flex gap-0.5 sm:gap-1.5 flex-wrap">
                                                        {row.teams.map(t => {
                                                            const eliminated = eliminatedTeamsSet.has(t.toUpperCase());
                                                            return (<div key={t} title={t} className={eliminated ? 'opacity-35 grayscale' : ''}><FlagIcon teamName={t} /></div>);
                                                        })}
                                                    </div>
                                                </td>
                                                <td className={`py-1.5 sm:py-3.5 text-center font-black text-emerald-400 text-[10px] sm:text-base drop-shadow-md ${oswald.className}`}>{row.wins}</td>
                                                <td className={`py-1.5 sm:py-3.5 text-center font-black text-slate-100 text-[10px] sm:text-base drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${oswald.className}`}>{row.draws}</td>
                                                <td className={`py-1.5 sm:py-3.5 text-center font-black text-rose-400 text-[10px] sm:text-base drop-shadow-md ${oswald.className}`}>{row.losses}</td>
                                                <td className={`py-1.5 sm:py-3.5 text-center font-black text-slate-100 text-[10px] sm:text-base drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${oswald.className}`}>{row.totalGoals}</td>
                                                <td className={`py-1.5 sm:py-3.5 text-center font-black text-blue-400 pr-3 sm:pr-5 text-[10px] sm:text-base drop-shadow-md ${oswald.className}`}>{row.totalCleanSheets}</td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-xl p-3 shadow-2xl hidden md:block mt-4 sm:mt-6">
                                <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-2">
                                    <h3 className="text-[9px] sm:text-[10px] font-mono font-black text-slate-300 uppercase tracking-widest drop-shadow-md">Scoring System Reference</h3>
                                    <span className="text-[8px] font-mono text-slate-400">Values stack dynamically per match result</span>
                                </div>
                                <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-white">
                                    <span className="bg-black/60 border border-white/10 px-2 py-1 rounded-md flex items-center gap-1.5"><strong className="text-[#fbbf24]">+4</strong> Win</span>
                                    <span className="bg-black/60 border border-white/10 px-2 py-1 rounded-md flex items-center gap-1.5"><strong className="text-[#fbbf24]">+2</strong> Draw</span>
                                    <span className="bg-black/60 border border-white/10 px-2 py-1 rounded-md flex items-center gap-1.5"><strong className="text-[#fbbf24]">+1</strong> Goal</span>
                                    <span className="bg-black/60 border border-white/10 px-2 py-1 rounded-md flex items-center gap-1.5"><strong className="text-[#fbbf24]">+2</strong> Clean Sheet</span>
                                    <span className="bg-black/60 border border-white/10 px-2 py-1 rounded-md flex items-center gap-1.5"><strong className="text-[#fbbf24]">+8</strong> Group Advance</span>
                                    <span className="bg-black/60 border border-white/10 px-2 py-1 rounded-md flex items-center gap-1.5"><strong className="text-[#fbbf24]">+10</strong> Win R32</span>
                                    <span className="bg-black/60 border border-white/10 px-2 py-1 rounded-md flex items-center gap-1.5"><strong className="text-[#fbbf24]">+12</strong> Win R16</span>
                                    <span className="bg-black/60 border border-white/10 px-2 py-1 rounded-md flex items-center gap-1.5"><strong className="text-[#fbbf24]">+15</strong> Win QF</span>
                                    <span className="bg-black/60 border border-white/10 px-2 py-1 rounded-md flex items-center gap-1.5"><strong className="text-[#fbbf24]">+20</strong> Win SF</span>
                                    <span className="bg-black/60 border border-white/10 px-2 py-1 rounded-md flex items-center gap-1.5"><strong className="text-[#fbbf24]">+10</strong> Win 3rd</span>
                                    <span className="bg-black/60 border border-white/10 px-2 py-1 rounded-md flex items-center gap-1.5"><strong className="text-[#fbbf24]">+30</strong> Win Final</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'awards' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-7xl mx-auto">
                            <div className="bg-gradient-to-br from-amber-500/20 via-black/40 to-yellow-800/10 border border-amber-500/30 p-[1px] rounded-xl shadow-2xl h-full drop-shadow-lg">
                                <div className="bg-black/70 backdrop-blur-xl p-3.5 sm:p-4 rounded-xl h-full flex flex-col">
                                    <div className="flex items-center gap-3 border-b border-white/10 pb-2 mb-3">
                                        <div className="bg-black/80 p-1.5 rounded-lg border border-amber-400/50 shadow-inner">
                                            <span className="text-xl sm:text-2xl block leading-none drop-shadow-md">⚽</span>
                                        </div>
                                        <div>
                                            <h3 className={`text-sm sm:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 uppercase tracking-widest ${oswald.className}`}>Golden Boot</h3>
                                            <span className="text-[8px] font-mono text-slate-400 uppercase tracking-wider block">15% Pot • Individual Goals Tracker</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 flex-1">
                                        {bootLeaders.slice(0, 5).map((row, idx) => {
                                            const breakdownText = Object.entries(row.goalsByTeam).filter(([_, goals]) => (goals as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([team, goals]) => `${team} (${goals})`).join(', ');
                                            return (
                                                <div key={row.name} onClick={() => setSelectedManager(row)} className={`flex justify-between items-center py-2.5 px-4 rounded-lg border transition-all cursor-pointer ${idx === 0 ? 'bg-amber-500/10 border-amber-400/30 shadow-md scale-[1.01]' : 'bg-black/40 border-white/5 hover:border-white/15 hover:bg-black/60'}`}>
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <span className="font-mono font-black text-xs text-slate-300 w-4 text-center">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}</span>
                                                        <ManagerAvatar name={row.name} size="sm" />
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="font-black text-xs sm:text-lg leading-tight break-words text-sky-400 drop-shadow-md">{row.name}</span>
                                                            <span className="text-[8px] sm:text-[9px] text-slate-300 font-bold max-w-[120px] sm:max-w-[220px] truncate" title={breakdownText}>{breakdownText || "No goals yet"}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-baseline gap-1 shrink-0">
                                                        <span className={`font-black text-2xl sm:text-5xl text-white ${oswald.className}`}>{row.totalGoals}</span>
                                                        <span className="text-[7px] text-slate-400 uppercase tracking-widest font-mono">G</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gradient-to-br from-blue-500/20 via-black/40 to-slate-800/10 border border-blue-500/30 p-[1px] rounded-xl shadow-2xl h-full drop-shadow-lg">
                                <div className="bg-black/70 backdrop-blur-xl p-3.5 sm:p-4 rounded-xl h-full flex flex-col">
                                    <div className="flex items-center gap-3 mb-4 border-b border-white/20 pb-3">
                                        <div className="bg-black/80 p-1.5 rounded-lg border border-blue-400/50 shadow-inner">
                                            <span className="text-xl sm:text-3xl block leading-none drop-shadow-md">🧤</span>
                                        </div>
                                        <div>
                                            <h3 className={`text-sm sm:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-blue-500 uppercase tracking-widest ${oswald.className}`}>Golden Glove</h3>
                                            <p className="text-blue-300 text-[8px] sm:text-xs font-mono font-black tracking-widest uppercase mt-0.5">10% Pot • Clean Sheets</p>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 flex-1">
                                        {gloveLeaders.slice(0, 5).map((row, idx) => {
                                            const breakdownText = Object.entries(row.csByTeam).filter(([_, cs]) => (cs as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([team, cs]) => `${team} (${cs})`).join(', ');
                                            return (
                                                <div key={row.name} onClick={() => setSelectedManager(row)} className={`flex justify-between items-center py-2.5 px-4 rounded-lg border transition-all cursor-pointer ${idx === 0 ? 'bg-blue-500/10 border-blue-400/30 shadow-md scale-[1.01]' : 'bg-black/40 border-white/5 hover:border-white/15 hover:bg-black/60'}`}>
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <span className="font-mono font-black text-xs text-slate-300 w-4 text-center">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}</span>
                                                        <ManagerAvatar name={row.name} size="sm" />
                                                        <div className="flex flex-col min-w-0 font-semibold">
                                                            <span className="font-black text-xs sm:text-lg leading-tight break-words text-sky-400 drop-shadow-md">{row.name}</span>
                                                            <span className="text-[10px] sm:text-xs text-slate-300 font-bold max-w-[140px] sm:max-w-[250px] truncate" title={breakdownText}>{breakdownText || "No clean sheets yet"}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-baseline gap-1 shrink-0">
                                                        <span className={`font-black text-2xl sm:text-5xl text-white ${oswald.className}`}>{row.totalCleanSheets}</span>
                                                        <span className="text-[7px] text-slate-400 uppercase tracking-widest font-mono">CS</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'rules' && (
                        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
                            <h2 className={`text-xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-xl sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>LEAGUE RULES & PAYOUTS</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                <div className="bg-gradient-to-br from-emerald-500/30 to-teal-600/30 p-[1px] rounded-xl shadow-2xl h-full drop-shadow-lg card-fut-premium">
                                    <div className="bg-black/70 backdrop-blur-xl p-4 sm:p-8 rounded-xl h-full flex flex-col">
                                        <div className="flex items-center gap-3 sm:gap-5 mb-4 sm:mb-6 border-b border-white/20 pb-3 sm:pb-5">
                                            <div className="bg-black/80 p-2 sm:p-4 rounded-xl border border-emerald-400/50 shadow-inner">
                                                <span className="text-3xl sm:text-5xl block leading-none drop-shadow-md">💰</span>
                                            </div>
                                            <div>
                                                <h2 className={`text-xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 to-emerald-500 uppercase tracking-widest drop-shadow-md sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>Prize Pool</h2>
                                                <p className="text-emerald-300 text-[9px] sm:text-sm font-mono font-black tracking-widest uppercase mt-1 sm:mt-1.5 drop-shadow-md sm:[text-shadow:0_2px_4px_black]">Entry & Payout Structure</p>
                                            </div>
                                        </div>
                                        <div className="space-y-3 sm:space-y-4">
                                            <div className="flex justify-between items-center bg-black/60 border border-white/10 p-3 sm:p-4 rounded-xl shadow-md">
                                                <span className="text-slate-200 font-black text-sm sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black]">1st Place (Overall)</span>
                                                <span className={`text-emerald-400 font-black text-xl sm:text-3xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>50%</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-black/60 border border-white/10 p-3 sm:p-4 rounded-xl shadow-md">
                                                <span className="text-slate-200 font-black text-sm sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black]">2nd Place (Overall)</span>
                                                <span className={`text-emerald-400 font-black text-xl sm:text-3xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>25%</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-black/60 border border-white/10 p-3 sm:p-4 rounded-xl shadow-md">
                                                <span className="text-slate-200 font-black text-sm sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black]">Golden Boot</span>
                                                <span className={`text-amber-400 font-black text-xl sm:text-3xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>15%</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-black/60 border border-white/10 p-3 sm:p-4 rounded-xl shadow-md">
                                                <span className="text-slate-200 font-black text-sm sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black]">Golden Glove</span>
                                                <span className={`text-blue-400 font-black text-xl sm:text-3xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>10%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-amber-500/30 to-orange-600/30 p-[1px] rounded-xl shadow-2xl h-full drop-shadow-lg card-fut-premium">
                                    <div className="bg-black/70 backdrop-blur-xl p-4 sm:p-8 rounded-xl h-full flex flex-col">
                                        <div className="flex items-center gap-3 sm:gap-5 mb-4 sm:mb-6 border-b border-white/20 pb-3 sm:pb-5">
                                            <div className="bg-black/80 p-2 sm:p-4 rounded-xl border border-amber-400/50 shadow-inner">
                                                <span className="text-3xl sm:text-5xl block leading-none drop-shadow-md">📊</span>
                                            </div>
                                            <div>
                                                <h2 className={`text-xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 uppercase tracking-widest drop-shadow-md sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>Scoring System</h2>
                                                <p className="text-[#fbbf24] text-[9px] sm:text-sm font-mono font-black tracking-widest uppercase mt-1 sm:mt-1.5 drop-shadow-md sm:[text-shadow:0_2px_4px_black]">How To Earn Points</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                            <div className="bg-black/60 border border-white/10 p-3 sm:p-4 rounded-xl shadow-md flex items-center gap-2 sm:gap-3">
                                                <span className={`text-[#fbbf24] font-black text-lg sm:text-2xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+4</span>
                                                <span className="text-white font-black text-[10px] sm:text-sm uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win Match</span>
                                            </div>
                                            <div className="bg-black/60 border border-white/10 p-3 sm:p-4 rounded-xl shadow-md flex items-center gap-2 sm:gap-3">
                                                <span className={`text-[#fbbf24] font-black text-lg sm:text-2xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+2</span>
                                                <span className="text-white font-black text-[10px] sm:text-sm uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black]">Group Draw</span>
                                            </div>
                                            <div className="bg-black/60 border border-white/10 p-3 sm:p-4 rounded-xl shadow-md flex items-center gap-2 sm:gap-3">
                                                <span className={`text-[#fbbf24] font-black text-lg sm:text-2xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+1</span>
                                                <span className="text-white font-black text-[10px] sm:text-sm uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black]">Goal Scored</span>
                                            </div>
                                            <div className="bg-black/60 border border-white/10 p-3 sm:p-4 rounded-xl shadow-md flex items-center gap-2 sm:gap-3">
                                                <span className={`text-[#fbbf24] font-black text-lg sm:text-2xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+2</span>
                                                <span className="text-white font-black text-[10px] sm:text-sm uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black]">Clean Sheet</span>
                                            </div>
                                            <div className="bg-black/60 border border-white/10 p-3 sm:p-4 rounded-xl shadow-md flex items-center gap-2 sm:gap-3 sm:col-span-2">
                                                <span className={`text-[#fbbf24] font-black text-lg sm:text-2xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+8</span>
                                                <span className="text-white font-black text-[10px] sm:text-sm uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black]">Advance out of Group</span>
                                            </div>
                                            <div className="col-span-1 sm:col-span-2 mt-1 sm:mt-2">
                                                <h3 className="text-slate-300 font-mono text-[9px] sm:text-xs uppercase tracking-widest font-black mb-2 sm:mb-3 border-b border-white/10 pb-1.5 sm:pb-2 drop-shadow-md">Knockout Stage Bonuses</h3>
                                                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                                    <div className="flex justify-between items-center text-xs sm:text-sm font-black">
                                                        <span className="text-white drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win R32</span>
                                                        <span className={`text-[#fbbf24] text-base sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black] sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>+10</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs sm:text-sm font-black">
                                                        <span className="text-white drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win R16</span>
                                                        <span className={`text-[#fbbf24] text-base sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black] sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>+12</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs sm:text-sm font-black">
                                                        <span className="text-white drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win QF</span>
                                                        <span className={`text-[#fbbf24] text-base sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black] sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>+15</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs sm:text-sm font-black">
                                                        <span className="text-white drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win SF</span>
                                                        <span className={`text-[#fbbf24] text-base sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black] sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>+20</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs sm:text-sm font-black">
                                                        <span className="text-white drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win 3rd</span>
                                                        <span className={`text-[#fbbf24] text-base sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black] sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>+10</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs sm:text-sm font-black">
                                                        <span className="text-white drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win Final</span>
                                                        <span className={`text-[#fbbf24] text-base sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black] sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>+30</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl mt-4 sm:mt-8">
                                <div className="bg-black/80 px-4 sm:px-6 py-3 sm:py-4 border-b border-white/20 flex justify-between items-center">
                                    <h3 className={`font-black text-white text-lg sm:text-2xl uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>Format & Guidelines</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8 p-4 sm:p-8">
                                    <div>
                                        <h4 className="text-sky-400 font-black uppercase tracking-widest text-[11px] sm:text-sm mb-3 sm:mb-4 flex items-center gap-2 border-b border-white/10 pb-2 drop-shadow-md"><span className="text-lg sm:text-xl">👥</span> Draft & Teams</h4>
                                        <ul className="space-y-2 sm:space-y-3 text-[11px] sm:text-sm text-slate-200 font-semibold drop-shadow-md leading-relaxed">
                                            <li><span className="text-sky-400 mr-2">■</span> Exactly 12 players participate.</li>
                                            <li><span className="text-sky-400 mr-2">■</span> Each player drafts 4 national teams via a snake draft format.</li>
                                            <li><span className="text-sky-400 mr-2">■</span> All 48 tournament teams are drafted, meaning every match affects the standings.</li>
                                            <li><span className="text-sky-400 mr-2">■</span> Drafts are locked before the June 11, 2026 kickoff.</li>
                                            <li><span className="text-sky-400 mr-2">■</span> No trades are allowed after the draft closes.</li>
                                        </ul>
                                    </div>
                                    <div>
                                        <h4 className="text-sky-400 font-black uppercase tracking-widest text-[11px] sm:text-sm mb-3 sm:mb-4 flex items-center gap-2 border-b border-white/10 pb-2 drop-shadow-md"><span className="text-lg sm:text-xl">⚖️</span> Tie-Breakers & Rules</h4>
                                        <ul className="space-y-2 sm:space-y-3 text-[11px] sm:text-sm text-slate-200 font-semibold drop-shadow-md leading-relaxed">
                                            <li><span className="text-sky-400 mr-2">■</span> <strong>Stacking Points:</strong> Advancement and win bonuses stack on a single match result. (e.g., A quarterfinal win earns 19 points: 4 for the win + 15 for advancing).</li>
                                            <li><span className="text-sky-400 mr-2">■</span> <strong>Penalties:</strong> Goals scored during penalty shootouts do not count toward your total.</li>
                                            <li><span className="text-sky-400 mr-2">■</span> <strong>Clean Sheets:</strong> Clean sheets are judged at the 90-minute mark only, excluding shootouts.</li>
                                            <li><span className="text-sky-400 mr-2">■</span> <strong>Tie-Breakers:</strong> In the event of a tie for the Golden Boot or Golden Glove, the prize is split equally between the tied players.</li>
                                            <li><span className="text-sky-400 mr-2">■</span> <strong>Strategy:</strong> Drafting four teams that make deep runs will typically outscore drafting one tournament champion and three group-stage exits.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'banter' && (
                        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 content-animate">
                            <h2 className={`text-xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-xl sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>
                                DRAFT VALUE BOARD
                            </h2>

                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-gradient-to-br from-emerald-500/20 via-black/80 to-teal-500/10 border border-emerald-500/30 rounded-xl p-4 shadow-xl">
                                    <span className="text-2xl mb-1.5 block">💎</span>
                                    <h4 className="text-[10px] font-mono font-black text-emerald-400 uppercase tracking-widest">The Golden Pick</h4>
                                    {goldenPick ? (
                                        <div className="mt-2 space-y-1">
                                            <div className="flex items-center gap-1.5">
                                                <FlagIcon teamName={goldenPick.team} />
                                                <span className="font-black text-sm sm:text-base text-white">{goldenPick.team}</span>
                                            </div>
                                            <p className="text-[11px] text-slate-300 font-semibold leading-snug">
                                                Selected by <strong className="text-sky-400">{goldenPick.drafter}</strong> at pick #{goldenPick.pickNumber}. Expected {goldenPick.expectedPoints.toFixed(1)} PTS, generated <strong className="text-emerald-400">{goldenPick.actualPoints} PTS</strong> (<span className="text-emerald-400 font-bold">+{goldenPick.roi.toFixed(1)}% ROI</span>).
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-400 mt-2 font-mono">Calculating...</p>
                                    )}
                                </div>

                                <div className="bg-gradient-to-br from-rose-500/20 via-black/80 to-red-500/10 border border-rose-500/30 rounded-xl p-4 shadow-xl">
                                    <span className="text-2xl mb-1.5 block">📉</span>
                                    <h4 className="text-[10px] font-mono font-black text-rose-400 uppercase tracking-widest">The Biggest Bust</h4>
                                    {biggestBust ? (
                                        <div className="mt-2 space-y-1">
                                            <div className="flex items-center gap-1.5">
                                                <FlagIcon teamName={biggestBust.team} />
                                                <span className="font-black text-sm sm:text-base text-white">{biggestBust.team}</span>
                                            </div>
                                            <p className="text-[11px] text-slate-300 font-semibold leading-snug">
                                                Selected by <strong className="text-sky-400">{biggestBust.drafter}</strong> at pick #{biggestBust.pickNumber}. Expected {biggestBust.expectedPoints.toFixed(1)} PTS, generated <strong className="text-rose-400">{biggestBust.actualPoints} PTS</strong> (<span className="text-rose-400 font-bold">{biggestBust.roi.toFixed(1)}% ROI</span>).
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-400 mt-2 font-mono">Calculating...</p>
                                    )}
                                </div>

                                <div className="bg-gradient-to-br from-sky-500/20 via-black/80 to-indigo-500/10 border border-sky-500/30 rounded-xl p-4 shadow-xl">
                                    <span className="text-2xl mb-1.5 block">🎓</span>
                                    <h4 className="text-[10px] font-mono font-black text-sky-400 uppercase tracking-widest">Draft Mastermind</h4>
                                    {bestManager ? (
                                        <div className="mt-2 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <ManagerAvatar name={bestManager.name} size="sm" />
                                                <span className="font-black text-sm sm:text-base text-white">{bestManager.name}</span>
                                            </div>
                                            <p className="text-[11px] text-slate-300 font-semibold leading-snug">
                                                Master of the draft board with an average of <strong className="text-emerald-400">+{bestManager.avgRoi.toFixed(1)}% ROI</strong> across all {bestManager.picksCount} picks.
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-400 mt-2 font-mono">Calculating...</p>
                                    )}
                                </div>
                            </div>

                            {/* Side-by-Side Top 10 Best / Worst Picks */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                {/* Top 10 Best */}
                                <div className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl">
                                    <div className="bg-emerald-950/40 border-b border-white/10 px-3 sm:px-4 py-2 flex justify-between items-center">
                                        <h3 className="text-[10px] sm:text-xs font-mono font-black text-emerald-400 uppercase tracking-widest">🔥 Top 10 Best Picks (Underpriced)</h3>
                                        <span className="text-[8px] font-mono text-slate-400">Highest ROI</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-[9px] sm:text-xs border-collapse min-w-[340px]">
                                            <thead>
                                            <tr className="border-b border-white/5 text-slate-300 text-[8px] sm:text-[9px] uppercase font-mono bg-black/60 tracking-widest font-black">
                                                <th className="py-2 pl-3">Pick</th>
                                                <th className="py-2">Team</th>
                                                <th className="py-2">Manager</th>
                                                <th className="py-2 text-center">PTS</th>
                                                <th className="py-2 text-right pr-3">ROI</th>
                                            </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                            {sortedBestPicks.slice(0, 10).map((row) => (
                                                <tr key={row.team} className={`hover:bg-emerald-500/5 transition ${row.eliminated ? 'opacity-40' : ''}`}>
                                                    <td className="py-2 pl-3 font-mono font-black text-slate-400">#{row.pickNumber}</td>
                                                    <td className="py-2 font-black text-white"><FlagIcon teamName={row.team} />{row.team}</td>
                                                    <td className="py-2 font-bold text-slate-300">{row.drafter}</td>
                                                    <td className="py-2 text-center font-black text-emerald-400">{row.actualPoints}</td>
                                                    <td className="py-2 text-right pr-3 font-black text-emerald-400">+{row.roi.toFixed(1)}%</td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Top 10 Worst */}
                                <div className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl">
                                    <div className="bg-rose-950/40 border-b border-white/10 px-3 sm:px-4 py-2 flex justify-between items-center">
                                        <h3 className="text-[10px] sm:text-xs font-mono font-black text-rose-400 uppercase tracking-widest">📉 Top 10 Worst Picks (Overpriced)</h3>
                                        <span className="text-[8px] font-mono text-slate-400">Lowest ROI</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-[9px] sm:text-xs border-collapse min-w-[340px]">
                                            <thead>
                                            <tr className="border-b border-white/5 text-slate-300 text-[8px] sm:text-[9px] uppercase font-mono bg-black/60 tracking-widest font-black">
                                                <th className="py-2 pl-3">Pick</th>
                                                <th className="py-2">Team</th>
                                                <th className="py-2">Manager</th>
                                                <th className="py-2 text-center">PTS</th>
                                                <th className="py-2 text-right pr-3">ROI</th>
                                            </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                            {sortedWorstPicks.slice(0, 10).map((row) => (
                                                <tr key={row.team} className={`hover:bg-rose-500/5 transition ${row.eliminated ? 'opacity-40' : ''}`}>
                                                    <td className="py-2 pl-3 font-mono font-black text-slate-400">#{row.pickNumber}</td>
                                                    <td className="py-2 font-black text-white"><FlagIcon teamName={row.team} />{row.team}</td>
                                                    <td className="py-2 font-bold text-slate-300">{row.drafter}</td>
                                                    <td className="py-2 text-center font-black text-rose-400">{row.actualPoints}</td>
                                                    <td className="py-2 text-right pr-3 font-black text-rose-400">{row.roi.toFixed(1)}%</td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Manager Draft Portfolio Analysis */}
                            <div className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl p-4 sm:p-5 shadow-2xl space-y-4">
                                <div className="border-b border-white/10 pb-2 flex justify-between items-center">
                                    <h3 className="text-[10px] sm:text-xs font-mono font-black text-slate-300 uppercase tracking-widest">💼 Manager Portfolios Report Card</h3>
                                    <span className="text-[8px] font-mono text-slate-400 uppercase tracking-wider">Ordered by overall surplus points generated</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {managerRoiStats.map((mgr) => {
                                        const totalSurplus = mgr.totalActual - mgr.totalExpected;
                                        const surplusClass = totalSurplus >= 0 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-rose-400 bg-rose-500/10 border-rose-500/30';

                                        return (
                                            <div key={mgr.name} className="bg-black/60 border border-white/10 rounded-xl p-4 shadow-lg flex flex-col justify-between space-y-3">
                                                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                                    <div className="flex items-center gap-2">
                                                        <ManagerAvatar name={mgr.name} size="sm" />
                                                        <span className="font-black text-xs sm:text-sm text-white uppercase tracking-wider">{mgr.name}</span>
                                                    </div>
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${surplusClass}`}>
                                                        {totalSurplus >= 0 ? `+${totalSurplus.toFixed(1)}` : `${totalSurplus.toFixed(1)}`} PTS
                                                    </span>
                                                </div>

                                                <div className="space-y-1.5 flex-grow">
                                                    {mgr.picks.map((p) => (
                                                        <div key={p.team} className="flex justify-between items-center text-[10px] font-semibold text-slate-200">
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <FlagIcon teamName={p.team} />
                                                                <span className={`truncate ${p.eliminated ? 'line-through text-slate-500 font-bold' : ''}`}>{p.team}</span>
                                                                <span className="text-[8px] font-mono text-slate-400">#{p.pickNumber}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <span className="font-mono text-slate-300 font-black">{p.actualPoints} PTS</span>
                                                                <span className={`text-[9px] font-black ${p.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                    ({p.roi >= 0 ? `+${p.roi.toFixed(0)}%` : `${p.roi.toFixed(0)}%`})
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="border-t border-white/5 pt-2 flex justify-between items-center text-[10px] font-mono uppercase tracking-widest font-black">
                                                    <span className="text-slate-400">Portfolio Return:</span>
                                                    <span className={mgr.avgRoi >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                                        {mgr.avgRoi >= 0 ? `+${mgr.avgRoi.toFixed(1)}%` : `${mgr.avgRoi.toFixed(1)}%`} ROI
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>

            <div className="hidden">
                <img src="/draft.png" alt="" />
                <img src="/scores.png" alt="" />
                <img src="/schedule.png" alt="" />
                <img src="/rules.png" alt="" />
                <img src="/leaderboard.png" alt="" />
                <img src="/awards.png" alt="" />
            </div>
        </div>
    );
}