"use client";
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Oswald } from 'next/font/google';

import ScheduleTab from './components/ScheduleTab';
import FlagIcon from './components/FlagIcon';

const oswald = Oswald({ subsets: ['latin'], weight: ['400', '700'] });

// Dynamic Manager Avatar lookup with safe Initials fallback using first names only
const ManagerAvatar = ({ name, size = 'sm' }: { name: string, size?: 'sm' | 'md' | 'lg' | 'xl' }) => {
    if (!name) return null;
    const firstWord = name.trim().split(/\s+/)[0];
    let fileName = firstWord.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (fileName === 'angelo') fileName = 'anuzzil';
    const src = `/managers/${fileName}.png`;
    const sizeClasses = {
        sm: "w-6 h-6 sm:w-8 sm:h-8 rounded-full border border-white/20 object-cover avatar-img-custom bg-white/10 shrink-0",
        md: "w-12 h-12 sm:w-16 sm:h-16 rounded-full border border-white/20 object-cover avatar-img-custom bg-white/10 shrink-0",
        lg: "w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-sky-400 object-cover avatar-img-custom bg-white/10 shrink-0",
        xl: "w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border-2 border-sky-400 object-cover avatar-img-custom bg-white/10 shrink-0"
    }[size];
    return (
        <img src={src} alt={name} className={sizeClasses} onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=0ea5e9&textColor=ffffff`;
        }} />
    );
};

// Helper to filter out duplicate matches before scoring runs
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

// Helper to dynamically calculate if a country is eliminated from the tournament
const isTeamEliminated = (teamName: string, matchesList: any[]): boolean => {
    if (!teamName || teamName === 'TBD') return false;
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
    let groupName = '';
    matchesList.forEach(m => {
        if (m.stage === 'Group' && ((m.homeTeam && m.homeTeam.toUpperCase() === teamName.toUpperCase()) || (m.awayTeam && m.awayTeam.toUpperCase() === teamName.toUpperCase()))) {
            groupName = m.group;
        }
    });
    if (groupName) {
        const groupMatches = matchesList.filter(m => m.group === groupName);
        if (groupMatches.length > 0 && groupMatches.every(m => m.status === 'FINISHED')) {
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
            if (rank === 3) return true;
            const allGroupMatches = matchesList.filter(m => m.stage === 'Group');
            if (allGroupMatches.length > 0 && allGroupMatches.every(m => m.status === 'FINISHED') && rank === 2) {
                const playedR32 = matchesList.some(m => m.stage === 'R32' && ((m.homeTeam && m.homeTeam.toUpperCase() === teamName.toUpperCase()) || (m.awayTeam && m.awayTeam.toUpperCase() === teamName.toUpperCase())));
                if (!playedR32) return true;
            }
        }
    }
    return false;
};

export default function AutomatedDashboard() {
    const [picks, setPicks] = useState<any[]>([]);
    const [drafters, setDrafters] = useState<string[]>([]);
    const [matches, setMatches] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'draft' | 'matches' | 'schedule' | 'standings' | 'awards' | 'rules'>('standings');
    const [draftSearch, setDraftSearch] = useState<string>('');
    const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
    const [selectedManager, setSelectedManager] = useState<any | null>(null);
    const [showProjected, setShowProjected] = useState<boolean>(false);
    const [standingsView, setStandingsView] = useState<'grid' | 'table'>('grid');
    const [matchesSubTab, setMatchesSubTab] = useState<'groups' | 'bracket'>('groups');

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

    const getDrafterForTeam = (teamName: string) => {
        const pick = picks.find(p => teamsMatch(p.team, teamName));
        return pick ? pick.drafter : null;
    };

    const uniqueMatches = getUniqueMatches(matches);

    const standings = drafters.map(name => {
        let totalPoints = 0, totalGoals = 0, totalCleanSheets = 0, wins = 0, draws = 0, losses = 0;
        const myTeams = picks.filter(p => p.drafter === name).map(p => p.team);
        const matchLogs: any[] = [];
        const goalsByTeam: Record<string, number> = {};
        const csByTeam: Record<string, number> = {};

        myTeams.forEach(teamId => {
            goalsByTeam[teamId] = 0; csByTeam[teamId] = 0;
            let advancedFromGroup = false;

            uniqueMatches.forEach(m => {
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

                totalGoals += matchGoals; goalsByTeam[teamId] += matchGoals;
                totalCleanSheets += matchCleanSheet; csByTeam[teamId] += matchCleanSheet;

                if (matchGoals > 0) {
                    matchPts += (matchGoals * 1);
                    logDetails.push(`+${matchGoals * 1} (${matchGoals} Goal${matchGoals > 1 ? 's' : ''})`);
                }
                if (matchCleanSheet) {
                    matchPts += 2;
                    logDetails.push(`+2 (CS)`);
                }
                if (m.stage !== 'Group' && !advancedFromGroup) {
                    advancedFromGroup = true;
                    matchPts += 8;
                    logDetails.push(`+8 (Advance)`);
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

                totalPoints += matchPts;
                matchLogs.push({
                    matchId: m.id, stage: m.group && m.stage === 'Group' ? m.group : m.stage, team: teamId, opponent: isHome ? m.awayTeam : m.homeTeam,
                    score: isHome ? `${m.homeGoals ?? '-'} : ${m.awayGoals ?? '-'}` : `${m.awayGoals ?? '-'} : ${m.homeGoals ?? '-'}`,
                    result: isWin ? 'W' : isDraw ? 'D' : isLoss ? 'L' : '-', points: matchPts, details: logDetails, isLive: isLive
                });
            });
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

    const groupNames = Array.from(new Set(uniqueMatches.map(m => m.group).filter(Boolean))).sort() as string[];
    const filteredGroupNames = selectedGroupFilter === 'ALL' ? groupNames : groupNames.filter(g => g === selectedGroupFilter);

    const teamToGroup = new Map<string, string>();
    uniqueMatches.forEach(m => {
        if (m.stage === 'Group' && m.group) {
            teamToGroup.set(m.homeTeam, m.group);
            teamToGroup.set(m.awayTeam, m.group);
        }
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
        if (overallLeaders.length >= 2) {
            headlines.push(`🏆 STANDINGS: ${overallLeaders[0].name} leads the league with ${overallLeaders[0].totalPoints} PTS!`);
            headlines.push(`🥈 CHASE IN PROGRESS: ${overallLeaders[1].name} trails the lead by only ${overallLeaders[0].totalPoints - overallLeaders[1].totalPoints} points.`);
        }
        const liveGames = uniqueMatches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
        if (liveGames.length > 0) {
            liveGames.forEach(m => {
                headlines.push(`📺 LIVE NOW: ${m.homeTeam} ${m.homeGoals ?? 0} - ${m.awayGoals ?? 0} ${m.awayTeam} (${m.minute ? `${m.minute}'` : 'HT'})`);
            });
        }

        // Sarcastic, "no holds barred" dynamic roasts for the ticker tape
        if (overallLeaders.length > 0) {
            const lastPlace = overallLeaders[overallLeaders.length - 1];
            const leader = overallLeaders[0];
            headlines.push(`🚨 STAT EMERGENCY: Send thoughts and prayers to ${lastPlace.name} (only ${lastPlace.totalPoints} PTS). The tactical setup is in absolute ruins.`);
            headlines.push(`📈 MARKET UPDATE: Stocks in ${leader.name}'s draft choices are soaring. The rest of the league is mathematically down bad.`);
            if (bootLeaders.length > 0 && bootLeaders[0].totalGoals > 0) {
                const bootLeader = bootLeaders[0];
                const lowestBoot = bootLeaders[bootLeaders.length - 1];
                headlines.push(`⚽ GOLDEN BOOT: ${bootLeader.name}'s strikers are firing absolute heat-seeking missiles (${bootLeader.totalGoals} goals).`);
                if (lowestBoot.totalGoals === 0) {
                    headlines.push(`💨 MISSED TARGET: ${lowestBoot.name} is currently shooting blanks. Zero goals. Someone check their boots.`);
                }
            }
            if (gloveLeaders.length > 0 && gloveLeaders[0].totalCleanSheets > 0) {
                headlines.push(`🧱 PARK THE BUS: ${gloveLeaders[0].name} has parked the bus so hard they are violating local zoning laws.`);
            }
            headlines.push(`🤔 RUMOR MILL: Reports suggest ${lastPlace.name} is consulting an actual astrologer to fix their remaining fixture outcomes.`);
        }
        return headlines;
    };

    const tickerHeadlines = getTickerHeadlines();

    // Compile the complete set of eliminated country names dynamically
    const eliminatedTeamsSet = new Set<string>();
    uniqueMatches.forEach(m => {
        if (m.homeTeam && m.homeTeam !== 'TBD' && isTeamEliminated(m.homeTeam, uniqueMatches)) {
            eliminatedTeamsSet.add(m.homeTeam.toUpperCase());
        }
        if (m.awayTeam && m.awayTeam !== 'TBD' && isTeamEliminated(m.awayTeam, uniqueMatches)) {
            eliminatedTeamsSet.add(m.awayTeam.toUpperCase());
        }
    });

    // Dynamically generates the no-holds-barred Matchday Savage Report
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
                    {/* LEADER PANEL */}
                    <div className="bg-black/60 border border-emerald-500/20 p-3 rounded-lg flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <ManagerAvatar name={king.name} size="sm" />
                                <span className="font-black text-emerald-400 uppercase tracking-wide">🏆 THE LEAGUE KING: {king.name}</span>
                            </div>
                            <p className="text-slate-300 font-semibold leading-relaxed">
                                {king.name} is sitting comfortably at the top with <strong className="text-emerald-400 font-bold">{king.totalPoints} PTS</strong>.
                                Their draft choices are running wild, leaving the rest of the managers in complete shambles.
                                {chaseGap <= 12
                                    ? ` However, ${runnerUp.name} is lurking only ${chaseGap} points behind. Don't pop the champagne just yet.`
                                    : ` They have a comfortable ${chaseGap}-point cushion. Absolute tactical mastery.`}
                            </p>
                        </div>
                    </div>

                    {/* LAST PLACE PANEL */}
                    <div className="bg-black/60 border border-red-500/20 p-3 rounded-lg flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <ManagerAvatar name={clown.name} size="sm" />
                                <span className="font-black text-red-400 uppercase tracking-wide">🤡 THE TAIL-ENDER: {clown.name}</span>
                            </div>
                            <p className="text-slate-300 font-semibold leading-relaxed">
                                Down in the trenches, we find {clown.name} with a tragic <strong className="text-red-400 font-bold">{clown.totalPoints} PTS</strong>.
                                They are currently trailing the lead by a massive <strong className="text-red-400 font-bold">{pointGap} PTS</strong>.
                                Their teams are moving slower than a line of parked cars on a highway.
                                Time to fire the coaching staff, rebuild the roster, or start praying for a miracle.
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
        const homeEliminated = isTeamEliminated(m.homeTeam, uniqueMatches);
        const awayEliminated = isTeamEliminated(m.awayTeam, uniqueMatches);

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
                        <span className={`font-black text-xs sm:text-sm w-4 text-center ${oswald.className}`}>{m.homeGoals !== null ? m.homeGoals : '-'}</span>
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
                        <span className={`font-black text-xs sm:text-sm w-4 text-center ${oswald.className}`}>{m.awayGoals !== null ? m.awayGoals : '-'}</span>
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
                .animate-marquee {
                    display: flex;
                    width: max-content;
                    animation: marquee 50s linear infinite;
                }
                .animate-marquee:hover {
                    animation-play-state: paused;
                }
                .avatar-img-custom {
                    object-fit: cover;
                    object-position: center 25%;
                }
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
                                    const eliminated = isTeamEliminated(team, uniqueMatches);

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
                            {['draft', 'matches', 'schedule', 'standings', 'awards', 'rules'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab as any)}
                                    className={`flex-1 md:flex-none whitespace-nowrap px-2.5 sm:px-3 py-1.5 rounded-md text-[9px] sm:text-xs uppercase tracking-wider font-black transition-all duration-300 drop-shadow-md ${activeTab === tab ? 'bg-sky-500/20 text-sky-400 shadow-md border border-sky-400/50 scale-105' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
                                >
                                    {tab === 'draft' ? 'Draft' : tab === 'matches' ? 'Scores' : tab === 'schedule' ? 'Schedule' : tab === 'standings' ? 'Leaderboard' : tab === 'awards' ? 'Awards' : 'Rules'}
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
                            {/* Render duplicated array contents side-by-side to construct an endless loop */}
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
                                                    const eliminated = isTeamEliminated(pick.team, uniqueMatches);
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
                                                        const eliminated = isTeamEliminated(team, uniqueMatches);
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
                                                <div className={`flex items-center text-[9px] sm:text-[10px] font-black text-slate-100 min-w-0 drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${isTeamEliminated(pick.team, uniqueMatches) ? 'opacity-35 grayscale line-through text-slate-500' : ''}`}>
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
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2 sm:gap-3 mb-2 sm:mb-3">
                                <div className="flex flex-col gap-2.5 w-full sm:w-auto">
                                    <h2 className={`text-lg sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-xl [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>ALL SCORES</h2>

                                    {/* Matches view formatting selector */}
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

                            {/* Render Group list display */}
                            {matchesSubTab === 'groups' && (
                                <div className="space-y-4">
                                    {filteredGroupNames.length === 0 ? (
                                        <div className="text-center py-4 sm:py-6 text-white font-bold bg-black/70 backdrop-blur-xl border border-dashed border-white/30 rounded-xl text-[9px] sm:text-xs shadow-2xl drop-shadow-md">
                                            <p>No matches found for the selected filter.</p>
                                        </div>
                                    ) : (
                                        filteredGroupNames.map(group => {
                                            const groupMatches = uniqueMatches.filter(m => m.group === group);
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
                                                                    const teamEliminated = isTeamEliminated(teamRow.name, uniqueMatches);
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
                                                                const homeEliminated = isTeamEliminated(m.homeTeam, uniqueMatches);
                                                                const awayEliminated = isTeamEliminated(m.awayTeam, uniqueMatches);

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
                                                                                <span className={`text-[9px] sm:text-xs truncate drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${homeNameColor}`}>{m.homeTeam}</span>
                                                                                <div className="shrink-0"><FlagIcon teamName={m.homeTeam} /></div>
                                                                            </div>
                                                                            {homeDrafter && <span className="text-[7px] sm:text-[8px] text-sky-400 font-black font-mono mt-0.5 sm:mt-1 shrink-0 truncate max-w-full drop-shadow-md">{homeDrafter}</span>}
                                                                        </div>

                                                                        <div className="mx-1.5 sm:mx-2 flex flex-col items-center shrink-0 min-w-[50px] sm:min-w-[65px]">
                                                                            <div className="flex items-center justify-center gap-1 sm:gap-1.5 bg-black/80 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md border border-white/20 w-full shadow-inner mb-0.5 sm:mb-1">
                                                                                <span className={`font-black text-sm sm:text-lg w-3 sm:w-4 text-center leading-none drop-shadow-xl [-webkit-text-stroke:0.5px_black] ${homeScoreColor} ${oswald.className}`}>{m.homeGoals !== null ? m.homeGoals : '-'}</span>
                                                                                <span className="text-slate-400 font-black text-[8px] sm:text-[9px] leading-none drop-shadow-md">:</span>
                                                                                <span className={`font-black text-sm sm:text-lg w-3 sm:w-4 text-center leading-none drop-shadow-xl [-webkit-text-stroke:0.5px_black] ${awayScoreColor} ${oswald.className}`}>{m.awayGoals !== null ? m.awayGoals : '-'}</span>
                                                                            </div>
                                                                            {m.status === 'IN_PLAY' && <span className="text-[7px] sm:text-[8px] font-black tracking-widest text-red-500 animate-pulse drop-shadow-md">{m.minute ? `${m.minute}'` : 'LIVE'}</span>}
                                                                            {m.status === 'PAUSED' && <span className="text-[7px] sm:text-[8px] font-black tracking-widest text-[#fbbf24] drop-shadow-md">HT</span>}
                                                                            {m.status === 'FINISHED' && <span className="text-[7px] sm:text-[8px] font-black tracking-widest text-emerald-400 drop-shadow-md">FT</span>}
                                                                        </div>

                                                                        <div className={`flex-1 flex flex-col items-start text-left min-w-0 ${awayEliminated ? 'opacity-35 grayscale' : ''}`}>
                                                                            <div className="flex items-center gap-1 sm:gap-1.5 w-full justify-start min-w-0">
                                                                                <div className="shrink-0"><FlagIcon teamName={m.awayTeam} /></div>
                                                                                <span className={`text-[9px] sm:text-xs truncate drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${awayNameColor}`}>{m.awayTeam}</span>
                                                                            </div>
                                                                            {awayDrafter && <span className="text-[7px] sm:text-[8px] text-sky-400 font-black font-mono mt-0.5 sm:mt-1 shrink-0 truncate max-w-full drop-shadow-md">{awayDrafter}</span>}
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

                            {/* Render interactive horizontal scrolling Tournament Bracket Board */}
                            {matchesSubTab === 'bracket' && (
                                <div className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl p-4 sm:p-5 shadow-2xl overflow-x-auto no-scrollbar content-animate">
                                    <div className="flex gap-6 sm:gap-8 min-w-[1250px] items-start pb-2 h-[720px]">

                                        {/* Column 1: Round of 32 */}
                                        <div className="flex flex-col justify-around h-full w-[240px] shrink-0 border-r border-white/5 pr-4">
                                            <h4 className="text-[9px] font-mono text-slate-300 font-black tracking-widest uppercase border-b border-white/10 pb-1.5 mb-2 text-center shrink-0">Round of 32</h4>
                                            <div className="flex flex-col justify-around flex-grow py-2">
                                                {uniqueMatches.filter(m => m.stage === 'R32').length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic text-center w-[230px]">No Round of 32 matches populated.</p>
                                                ) : (
                                                    uniqueMatches.filter(m => m.stage === 'R32').map(m => renderBracketMatch(m))
                                                )}
                                            </div>
                                        </div>

                                        {/* Column 2: Round of 16 */}
                                        <div className="flex flex-col justify-around h-full w-[240px] shrink-0 border-r border-white/5 pr-4">
                                            <h4 className="text-[9px] font-mono text-slate-300 font-black tracking-widest uppercase border-b border-white/10 pb-1.5 mb-2 text-center shrink-0">Round of 16</h4>
                                            <div className="flex flex-col justify-around flex-grow py-2">
                                                {uniqueMatches.filter(m => m.stage === 'R16').length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic text-center w-[230px]">Matches pending group play.</p>
                                                ) : (
                                                    uniqueMatches.filter(m => m.stage === 'R16').map(m => renderBracketMatch(m))
                                                )}
                                            </div>
                                        </div>

                                        {/* Column 3: Quarterfinals */}
                                        <div className="flex flex-col justify-around h-full w-[240px] shrink-0 border-r border-white/5 pr-4">
                                            <h4 className="text-[9px] font-mono text-slate-300 font-black tracking-widest uppercase border-b border-white/10 pb-1.5 mb-2 text-center shrink-0">Quarterfinals</h4>
                                            <div className="flex flex-col justify-around flex-grow py-2">
                                                {uniqueMatches.filter(m => m.stage === 'QF').length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic text-center w-[230px]">QF matches pending.</p>
                                                ) : (
                                                    uniqueMatches.filter(m => m.stage === 'QF').map(m => renderBracketMatch(m))
                                                )}
                                            </div>
                                        </div>

                                        {/* Column 4: Semifinals */}
                                        <div className="flex flex-col justify-around h-full w-[240px] shrink-0 border-r border-white/5 pr-4">
                                            <h4 className="text-[9px] font-mono text-slate-300 font-black tracking-widest uppercase border-b border-white/10 pb-1.5 mb-2 text-center shrink-0">Semifinals</h4>
                                            <div className="flex flex-col justify-around flex-grow py-2">
                                                {uniqueMatches.filter(m => m.stage === 'SF').length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic text-center w-[230px]">SF matches pending.</p>
                                                ) : (
                                                    uniqueMatches.filter(m => m.stage === 'SF').map(m => renderBracketMatch(m))
                                                )}
                                            </div>
                                        </div>

                                        {/* Column 5: Finals & 3rd Place */}
                                        <div className="flex flex-col justify-around h-full w-[240px] shrink-0">
                                            <h4 className="text-[9px] font-mono text-slate-300 font-black tracking-widest uppercase border-b border-white/10 pb-1.5 mb-2 text-center shrink-0">Finals</h4>
                                            <div className="flex flex-col justify-around flex-grow py-2">
                                                {uniqueMatches.filter(m => m.stage === 'Final' || m.stage === '3rdPlace').length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic text-center w-[230px]">Final matches pending.</p>
                                                ) : (
                                                    uniqueMatches.filter(m => m.stage === 'Final' || m.stage === '3rdPlace').map(m => renderBracketMatch(m))
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
                            <ScheduleTab eliminatedTeams={eliminatedTeamsSet} />
                        </div>
                    )}

                    {activeTab === 'standings' && (
                        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <h2 className={`text-xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-xl sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>
                                    LEADERBOARD
                                </h2>

                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Grid / Table Toggle Layout format selection */}
                                    <div className="flex bg-black/60 border border-white/10 p-0.5 rounded-lg shadow-md">
                                        <button
                                            onClick={() => setStandingsView('grid')}
                                            className={`px-3 py-1 rounded-md text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                                                standingsView === 'grid'
                                                    ? 'bg-sky-500/20 text-sky-400 border border-sky-400/30'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            Grid
                                        </button>
                                        <button
                                            onClick={() => setStandingsView('table')}
                                            className={`px-3 py-1 rounded-md text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                                                standingsView === 'table'
                                                    ? 'bg-sky-500/20 text-sky-400 border border-sky-400/30'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            Table
                                        </button>
                                    </div>

                                    {/* Projected Standings Toggle button */}
                                    <button
                                        onClick={() => setShowProjected(!showProjected)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-300 shadow-md ${
                                            showProjected
                                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                                                : 'bg-black/60 border-white/10 text-slate-400 hover:text-white hover:border-white/30'
                                        }`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${showProjected ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
                                        {showProjected ? 'Live Projections On' : 'Show Live Projections'}
                                    </button>
                                </div>
                            </div>

                            {/* Render visual layouts when standingsView is in Grid format */}
                            {standingsView === 'grid' && (
                                <div className="space-y-4 sm:space-y-6">
                                    {/* 2x6 Position Grid Section - Doubled Image Size */}
                                    <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-2xl">
                                        <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-3">
                                            <h3 className="text-[9px] sm:text-[10px] font-mono font-black text-slate-300 uppercase tracking-widest drop-shadow-md">Current Standings Grid</h3>
                                            <span className="text-[8px] font-mono text-slate-400">Ordered 1st to 12th</span>
                                        </div>
                                        {/* Responsive grid layout: 3 columns on mobile (4 rows), 6 columns on tablet/desktop (2 rows) */}
                                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
                                            {overallLeaders.map((leader, index) => {
                                                const rankColor =
                                                    index === 0 ? 'bg-amber-500 text-black' :
                                                        index === 1 ? 'bg-slate-300 text-black' :
                                                            index === 2 ? 'bg-orange-600 text-white' :
                                                                'bg-black/80 text-slate-300 border border-white/20';

                                                return (
                                                    <div
                                                        key={leader.name}
                                                        onClick={() => setSelectedManager(leader)}
                                                        className="bg-black/60 border border-white/10 rounded-xl p-2.5 flex flex-col items-center justify-center relative cursor-pointer hover:bg-black/90 hover:border-sky-400/50 transition-all duration-300 group shadow-md"
                                                    >
                                                        {/* Overlaid Position Badge */}
                                                        <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-black font-mono shadow-md ${rankColor}`}>
                                                            #{index + 1}
                                                        </div>

                                                        {/* Large Avatar */}
                                                        <div className="mb-2">
                                                            <ManagerAvatar name={leader.name} size="lg" />
                                                        </div>

                                                        {/* Name and points */}
                                                        <div className="text-center w-full min-w-0">
                                                            <span className="block font-black text-[10px] sm:text-xs text-white truncate drop-shadow-md group-hover:text-sky-400 transition-colors">
                                                                {leader.name}
                                                            </span>
                                                            <span className={`block text-[11px] sm:text-xs font-black text-[#fbbf24] mt-0.5 ${oswald.className}`}>
                                                                {leader.totalPoints} PTS
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Dynamically Generated Savage Report */}
                                    {getSavageReport()}

                                    {/* Top 3 Podium Displays */}
                                    <div className="grid grid-cols-3 gap-2 sm:gap-5">
                                        {overallLeaders.slice(0, 3).map((leader, i) => (
                                            <div
                                                key={leader.name}
                                                onClick={() => setSelectedManager(leader)}
                                                className={`backdrop-blur-xl rounded-xl flex flex-col items-center justify-center p-3 sm:p-5 text-center transition-all duration-300 cursor-pointer hover:bg-black/40 ${
                                                    i === 0 ? 'bg-gradient-to-b from-amber-500/80 to-yellow-800/90 border border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.5)] sm:shadow-[0_0_30px_rgba(251,191,36,0.6)]' :
                                                        i === 1 ? 'bg-gradient-to-b from-slate-400/80 to-slate-700/90 border border-slate-300 shadow-[0_0_15px_rgba(203,213,225,0.4)] sm:shadow-[0_0_30px_rgba(203,213,225,0.5)]' :
                                                            'bg-gradient-to-b from-orange-600/80 to-amber-900/90 border border-orange-500 shadow-[0_0_15px_rgba(194,65,12,0.4)] sm:shadow-[0_0_30px_rgba(194,65,12,0.6)]'
                                                }`}>
                                                <div className="relative mb-2.5">
                                                    <ManagerAvatar name={leader.name} size="md" />
                                                    <span className="absolute -bottom-1 -right-1 text-xl sm:text-2xl drop-shadow-md">
                                                        {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                                                    </span>
                                                </div>
                                                <h3 className="text-[11px] sm:text-xl md:text-2xl font-black text-white mb-0.5 sm:mb-1.5 tracking-wide truncate w-full px-1 sm:px-2 drop-shadow-md [-webkit-text-stroke:0.5px_black] sm:[-webkit-text-stroke:1px_black]">{leader.name}</h3>
                                                <div className={`text-2xl sm:text-5xl md:text-6xl font-black text-white leading-none mb-1 sm:mb-2.5 drop-shadow-2xl [-webkit-text-stroke:1px_black] sm:[-webkit-text-stroke:1.5px_black] ${oswald.className}`}>{leader.totalPoints}</div>
                                                <span className="text-[7px] sm:text-[11px] text-white font-bold font-mono mb-1.5 sm:mb-3 uppercase tracking-widest hidden sm:block drop-shadow-md [text-shadow:0_1px_2px_black]">Points</span>
                                                <div className="flex flex-wrap justify-center gap-0.5 sm:gap-1.5 px-1 sm:scale-110">
                                                    {leader.teams.map(t => {
                                                        const eliminated = eliminatedTeamsSet.has(t.toUpperCase());
                                                        return (
                                                            <div key={t} title={t} className={eliminated ? 'opacity-35 grayscale' : ''}>
                                                                <FlagIcon teamName={t} />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Render tabular statistical listings when standingsView is in Table format */}
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
                                                        <button
                                                            onClick={() => setSelectedManager(row)}
                                                            className="font-black text-[10px] sm:text-sm text-sky-400 hover:text-[#fbbf24] transition text-left truncate max-w-[90px] sm:max-w-[150px] drop-shadow-md [text-shadow:0_1px_2px_black]"
                                                        >
                                                            {row.name}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className={`py-1.5 sm:py-3.5 font-black text-[#fbbf24] text-[13px] sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>{row.totalPoints}</td>
                                                <td className="py-1.5 sm:py-3.5">
                                                    <div className="flex gap-0.5 sm:gap-1.5 flex-wrap">
                                                        {row.teams.map(t => {
                                                            const eliminated = eliminatedTeamsSet.has(t.toUpperCase());
                                                            return (
                                                                <div key={t} title={t} className={eliminated ? 'opacity-35 grayscale' : ''}>
                                                                    <FlagIcon teamName={t} />
                                                                </div>
                                                            );
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

                            {/* Redesigned structured point system badge strip placed cleanly at the very bottom */}
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
                            {/* Golden Boot Compact Matte Card - Resized slightly larger but elegant */}
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
                                            const breakdownText = Object.entries(row.goalsByTeam)
                                                .filter(([_, goals]) => (goals as number) > 0)
                                                .sort((a, b) => (b[1] as number) - (a[1] as number))
                                                .map(([team, goals]) => `${team} (${goals})`)
                                                .join(', ');

                                            return (
                                                <div
                                                    key={row.name}
                                                    onClick={() => setSelectedManager(row)}
                                                    className={`flex justify-between items-center py-2.5 px-4 rounded-lg border transition-all cursor-pointer ${idx === 0 ? 'bg-amber-500/10 border-amber-400/30 shadow-md scale-[1.01]' : 'bg-black/40 border-white/5 hover:border-white/15 hover:bg-black/60'}`}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <span className="font-mono font-black text-xs text-slate-300 w-4 text-center">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}</span>
                                                        <ManagerAvatar name={row.name} size="sm" />
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="font-black text-xs sm:text-lg leading-tight break-words text-sky-400 drop-shadow-md">{row.name}</span>
                                                            <span className="text-[9px] sm:text-[10px] text-slate-300 font-bold max-w-[120px] sm:max-w-[220px] truncate" title={breakdownText}>
                                                                {breakdownText || "No goals yet"}
                                                            </span>
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

                            {/* Golden Glove Compact Matte Card - Resized slightly larger but elegant */}
                            <div className="bg-gradient-to-br from-blue-500/20 via-black/40 to-slate-800/10 border border-blue-500/30 p-[1px] rounded-xl shadow-2xl h-full drop-shadow-lg">
                                <div className="bg-black/70 backdrop-blur-xl p-3.5 sm:p-4 rounded-xl h-full flex flex-col">
                                    <div className="flex items-center gap-3 mb-4 border-b border-white/20 pb-3">
                                        <div className="bg-black/80 p-1.5 rounded-lg border border-blue-400/50 shadow-inner">
                                            <span className="text-xl sm:text-2xl block leading-none drop-shadow-md">🧤</span>
                                        </div>
                                        <div>
                                            <h3 className={`text-sm sm:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-blue-500 uppercase tracking-widest ${oswald.className}`}>Golden Glove</h3>
                                            <p className="text-blue-300 text-[8px] sm:text-xs font-mono font-black tracking-widest uppercase mt-0.5">10% Pot • Clean Sheets</p>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5 flex-1">
                                        {gloveLeaders.slice(0, 5).map((row, idx) => {
                                            const breakdownText = Object.entries(row.csByTeam)
                                                .filter(([_, cs]) => (cs as number) > 0)
                                                .sort((a, b) => (b[1] as number) - (a[1] as number))
                                                .map(([team, cs]) => `${team} (${cs})`)
                                                .join(', ');

                                            return (
                                                <div
                                                    key={row.name}
                                                    onClick={() => setSelectedManager(row)}
                                                    className={`flex justify-between items-center py-2.5 px-4 rounded-lg border transition-all cursor-pointer ${idx === 0 ? 'bg-blue-500/10 border-blue-400/30 shadow-md scale-[1.01]' : 'bg-black/40 border-white/5 hover:border-white/15 hover:bg-black/60'}`}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <span className="font-mono font-black text-xs text-slate-300 w-4 text-center">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}</span>
                                                        <ManagerAvatar name={row.name} size="sm" />
                                                        <div className="flex flex-col min-w-0">
                                                            <span className={`font-black text-base sm:text-lg md:text-xl leading-tight break-words text-sky-400 drop-shadow-md`}>{row.name}</span>
                                                            <span className="text-[10px] sm:text-xs text-slate-300 font-bold max-w-[120px] sm:max-w-[250px] truncate" title={breakdownText}>
                                                                {breakdownText || "No clean sheets yet"}
                                                            </span>
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
                            <h2 className={`text-xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-xl sm:[-webkit-text-stroke:1px_black] ${oswald.className}`}>LEAGUE RULES & PAYOUTS</h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                <div className="bg-gradient-to-br from-emerald-500/30 to-teal-600/30 p-[1px] rounded-xl shadow-2xl h-full drop-shadow-lg card-fut-premium">
                                    <div className="bg-black/70 backdrop-blur-xl p-3.5 sm:p-5 rounded-xl h-full flex flex-col">
                                        <div className="flex items-center gap-3 sm:gap-4 mb-4 border-b border-white/20 pb-3">
                                            <div className="bg-black/80 p-2 rounded-lg border border-emerald-400/50 shadow-inner">
                                                <span className="text-xl sm:text-3xl block leading-none drop-shadow-md">💰</span>
                                            </div>
                                            <div>
                                                <h2 className={`text-lg sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 to-emerald-500 uppercase tracking-widest drop-shadow-md ${oswald.className}`}>Prize Pool</h2>
                                                <p className="text-emerald-300 text-[8px] sm:text-xs font-mono font-black tracking-widest uppercase mt-0.5">Entry & Payout Structure</p>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center bg-black/60 border border-white/10 p-2.5 sm:p-3 rounded-lg shadow-md">
                                                <span className="text-slate-200 font-black text-xs sm:text-base">1st Place (Overall)</span>
                                                <span className={`text-emerald-400 font-black text-lg sm:text-2xl ${oswald.className}`}>50%</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-black/60 border border-white/10 p-2.5 sm:p-3 rounded-lg shadow-md">
                                                <span className="text-slate-200 font-black text-xs sm:text-base">2nd Place (Overall)</span>
                                                <span className={`text-emerald-400 font-black text-lg sm:text-2xl ${oswald.className}`}>25%</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-black/60 border border-white/10 p-2.5 sm:p-3 rounded-lg shadow-md">
                                                <span className="text-slate-200 font-black text-xs sm:text-base">Golden Boot</span>
                                                <span className={`text-amber-400 font-black text-lg sm:text-2xl ${oswald.className}`}>15%</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-black/60 border border-white/10 p-3 sm:p-4 rounded-xl shadow-md">
                                                <span className="text-slate-200 font-black text-sm sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black]">Golden Glove</span>
                                                <span className={`text-blue-400 font-black text-xl sm:text-3xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>10%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-amber-500/30 to-orange-600/30 p-[1px] rounded-xl shadow-2xl h-full drop-shadow-lg">
                                    <div className="bg-black/70 backdrop-blur-xl p-3.5 sm:p-5 rounded-xl h-full flex flex-col">
                                        <div className="flex items-center gap-3 sm:gap-4 mb-4 border-b border-white/20 pb-3">
                                            <div className="bg-black/80 p-2 rounded-lg border border-amber-400/50 shadow-inner">
                                                <span className="text-xl sm:text-3xl block leading-none drop-shadow-md">📊</span>
                                            </div>
                                            <div>
                                                <h2 className={`text-lg sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 uppercase tracking-widest ${oswald.className}`}>Scoring System</h2>
                                                <p className="text-[#fbbf24] text-[8px] sm:text-xs font-mono font-black tracking-widest uppercase mt-0.5">How To Earn Points</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <div className="bg-black/60 border border-white/10 p-2.5 sm:p-3 rounded-lg shadow-md flex items-center gap-3">
                                                <span className={`text-[#fbbf24] font-black text-base sm:text-xl ${oswald.className}`}>+4</span>
                                                <span className="text-white font-black text-[9px] sm:text-xs uppercase tracking-widest">Win Match</span>
                                            </div>
                                            <div className="bg-black/60 border border-white/10 p-2.5 sm:p-3 rounded-lg shadow-md flex items-center gap-2.5 sm:p-3">
                                                <span className={`text-[#fbbf24] font-black text-base sm:text-xl ${oswald.className}`}>+2</span>
                                                <span className="text-white font-black text-[9px] sm:text-xs uppercase tracking-widest">Group Draw</span>
                                            </div>
                                            <div className="bg-black/60 border border-white/10 p-2.5 sm:p-3 rounded-lg shadow-md flex items-center gap-2.5 sm:p-3">
                                                <span className={`text-[#fbbf24] font-black text-base sm:text-xl ${oswald.className}`}>+1</span>
                                                <span className="text-white font-black text-[9px] sm:text-xs uppercase tracking-widest">Goal Scored</span>
                                            </div>
                                            <div className="bg-black/60 border border-white/10 p-2.5 sm:p-3 rounded-lg shadow-md flex items-center gap-2.5 sm:p-3">
                                                <span className={`text-[#fbbf24] font-black text-base sm:text-xl ${oswald.className}`}>+2</span>
                                                <span className="text-white font-black text-[9px] sm:text-xs uppercase tracking-widest">Clean Sheet</span>
                                            </div>
                                            <div className="bg-black/60 border border-white/10 p-2.5 sm:p-3 rounded-lg shadow-md flex items-center gap-2.5 sm:p-3 sm:col-span-2">
                                                <span className={`text-[#fbbf24] font-black text-base sm:text-xl ${oswald.className}`}>+8</span>
                                                <span className="text-white font-black text-[9px] sm:text-xs uppercase tracking-widest">Advance out of Group</span>
                                            </div>

                                            <div className="col-span-1 sm:col-span-2 mt-1">
                                                <h3 className="text-slate-300 font-mono text-[8px] sm:text-[10px] uppercase tracking-widest font-black mb-2 border-b border-white/10 pb-1.5 drop-shadow-md">Knockout Stage Bonuses</h3>
                                                <div className="grid grid-cols-2 gap-2 text-[11px] sm:text-xs">
                                                    <div className="flex justify-between items-center font-black">
                                                        <span className="text-white">Win R32</span>
                                                        <span className={`text-[#fbbf24] text-sm sm:text-lg ${oswald.className}`}>+10</span>
                                                    </div>
                                                    <div className="flex justify-between items-center font-black">
                                                        <span className="text-white">Win R16</span>
                                                        <span className={`text-[#fbbf24] text-sm sm:text-lg ${oswald.className}`}>+12</span>
                                                    </div>
                                                    <div className="flex justify-between items-center font-black">
                                                        <span className="text-white">Win QF</span>
                                                        <span className={`text-[#fbbf24] text-sm sm:text-lg ${oswald.className}`}>+15</span>
                                                    </div>
                                                    <div className="flex justify-between items-center font-black">
                                                        <span className="text-white">Win SF</span>
                                                        <span className={`text-[#fbbf24] text-sm sm:text-lg ${oswald.className}`}>+20</span>
                                                    </div>
                                                    <div className="flex justify-between items-center font-black">
                                                        <span className="text-white">Win 3rd</span>
                                                        <span className={`text-[#fbbf24] text-sm sm:text-lg ${oswald.className}`}>+10</span>
                                                    </div>
                                                    <div className="flex justify-between items-center font-black">
                                                        <span className="text-white">Win Final</span>
                                                        <span className={`text-[#fbbf24] text-sm sm:text-lg ${oswald.className}`}>+30</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl mt-4">
                                <div className="bg-black/80 px-4 sm:px-6 py-2.5 sm:py-3 border-b border-white/20 flex justify-between items-center">
                                    <h3 className={`font-black text-white text-base sm:text-xl uppercase tracking-widest ${oswald.className}`}>Format & Guidelines</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 sm:p-6">

                                    <div>
                                        <h4 className="text-sky-400 font-black uppercase tracking-widest text-[10px] sm:text-xs mb-2 sm:mb-3 flex items-center gap-2 border-b border-white/10 pb-1.5"><span className="text-base sm:text-lg">👥</span> Draft & Teams</h4>
                                        <ul className="space-y-1.5 sm:space-y-2 text-[10px] sm:text-xs text-slate-200 font-semibold leading-relaxed">
                                            <li><span className="text-sky-400 mr-1.5">■</span> Exactly 12 players participate.</li>
                                            <li><span className="text-sky-400 mr-1.5">■</span> Each player drafts 4 national teams via a snake draft format.</li>
                                            <li><span className="text-sky-400 mr-1.5">■</span> All 48 tournament teams are drafted, meaning every match affects the standings.</li>
                                            <li><span className="text-sky-400 mr-1.5">■</span> Drafts are locked before the June 11, 2026 kickoff.</li>
                                            <li><span className="text-sky-400 mr-1.5">■</span> No trades are allowed after the draft closes.</li>
                                        </ul>
                                    </div>

                                    <div>
                                        <h4 className="text-sky-400 font-black uppercase tracking-widest text-[10px] sm:text-xs mb-2 sm:mb-3 flex items-center gap-2 border-b border-white/10 pb-1.5"><span className="text-base sm:text-lg">⚖️</span> Tie-Breakers & Rules</h4>
                                        <ul className="space-y-1.5 sm:space-y-2 text-[10px] sm:text-xs text-slate-200 font-semibold leading-relaxed">
                                            <li><span className="text-sky-400 mr-1.5">■</span> <strong>Stacking Points:</strong> Advancement and win bonuses stack on a single match result. (e.g., A quarterfinal win earns 19 points: 4 for the win + 15 for advancing).</li>
                                            <li><span className="text-sky-400 mr-1.5">■</span> <strong>Penalties:</strong> Goals scored during penalty shootouts do not count toward your total.</li>
                                            <li><span className="text-sky-400 mr-1.5">■</span> <strong>Clean Sheets:</strong> Clean sheets are judged at the 90-minute mark only, excluding shootouts.</li>
                                            <li><span className="text-sky-400 mr-1.5">■</span> <strong>Tie-Breakers:</strong> In the event of a tie for the Golden Boot or Golden Glove, the prize is split equally between the tied players.</li>
                                            <li><span className="text-sky-400 mr-1.5">■</span> <strong>Strategy:</strong> Drafting four teams that make deep runs will typically outscore drafting one tournament champion and three group-stage exits.</li>
                                        </ul>
                                    </div>

                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* Hidden Preloader for Background Images to Prevent Flickering on Tab Switch */}
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