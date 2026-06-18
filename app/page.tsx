"use client";
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { ref, onValue } from 'firebase/database';
import * as Flags from 'country-flag-icons/react/3x2';
import { Oswald } from 'next/font/google';

// IMPORTANT: Importing your new Schedule Tab component
import ScheduleTab from './components/ScheduleTab';

// Load aggressive sports font for numbers and main headers
const oswald = Oswald({ subsets: ['latin'], weight: ['400', '700'] });

// ----------------------------------------------------------------------
// HELPER: Flag Mapper (with UK Native Emoji Bypasses & Larger Sizes)
// ----------------------------------------------------------------------
const FlagIcon = ({ teamName }: { teamName: string }) => {
    if (!teamName || teamName === 'TBD') return <span className="w-[22px] h-[15px] inline-block mr-1.5 bg-white/10 rounded-sm shadow-sm shrink-0" />;

    if (teamName === 'Scotland') return <span className="inline-block mr-1.5 text-[16px] leading-none shrink-0">🏴󠁧󠁢󠁳󠁣󠁴󠁿</span>;
    if (teamName === 'England') return <span className="inline-block mr-1.5 text-[16px] leading-none shrink-0">🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>;
    if (teamName === 'Wales') return <span className="inline-block mr-1.5 text-[16px] leading-none shrink-0">🏴󠁧󠁢󠁷󠁬󠁳󠁿</span>;

    const map: { [key: string]: string } = {
        'USA': 'US', 'Argentina': 'AR', 'France': 'FR', 'Brazil': 'BR', 'Germany': 'DE',
        'Spain': 'ES', 'Mexico': 'MX', 'Japan': 'JP', 'Portugal': 'PT', 'Belgium': 'BE',
        'Netherlands': 'NL', 'Italy': 'IT', 'Canada': 'CA', 'Uruguay': 'UY', 'Croatia': 'HR',
        'Morocco': 'MA', 'Switzerland': 'CH', 'Colombia': 'CO', 'Senegal': 'SN', 'Denmark': 'DK',
        'South Korea': 'KR', 'Australia': 'AU', 'Poland': 'PL', 'Sweden': 'SE', 'Serbia': 'RS',
        'Ecuador': 'EC', 'Peru': 'PE', 'Iran': 'IR', 'Saudi Arabia': 'SA', 'Qatar': 'QA',
        'Tunisia': 'TN', 'Cameroon': 'CM', 'Ghana': 'GH', 'South Africa': 'ZA', 'Algeria': 'DZ',
        'Egypt': 'EG', 'Ivory Coast': 'CI', 'Nigeria': 'NG', 'Mali': 'ML', 'DR Congo': 'CD',
        'Turkey': 'TR', 'Norway': 'NO', 'Czechia': 'CZ', 'Austria': 'AT', 'Cape Verde': 'CV',
        'Haiti': 'HT', 'Uzbekistan': 'UZ', 'Iraq': 'IQ', 'Jordan': 'JO', 'Bosnia & Herz.': 'BA',
        'Paraguay': 'PY', 'Panama': 'PA', 'Curaçao': 'CW', 'New Zealand': 'NZ'
    };

    const code = map[teamName];
    if (!code) return <span className="w-[22px] h-[15px] inline-block mr-1.5 bg-white/10 rounded-sm shadow-sm shrink-0" />;
    const FlagComponent = (Flags as any)[code];
    return FlagComponent ? <FlagComponent className="w-[22px] h-[15px] inline mr-1.5 rounded-sm shadow-sm object-cover shrink-0" /> : <span className="w-[22px] h-[15px] inline-block mr-1.5 bg-white/10 rounded-sm shadow-sm shrink-0" />;
};

// ----------------------------------------------------------------------
// MAIN DASHBOARD COMPONENT
// ----------------------------------------------------------------------
export default function AutomatedDashboard() {
    const [picks, setPicks] = useState<any[]>([]);
    const [drafters, setDrafters] = useState<string[]>([]);
    const [matches, setMatches] = useState<any[]>([]);

    const [activeTab, setActiveTab] = useState<'draft' | 'matches' | 'schedule' | 'standings' | 'awards'>('standings');

    const [draftSearch, setDraftSearch] = useState<string>('');
    const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
    const [selectedManager, setSelectedManager] = useState<any | null>(null);

    // 1. Pull data
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
            } catch (err) {
                console.error("Live sync error:", err);
            }
        };
        fetchLiveScores();
        const interval = setInterval(fetchLiveScores, 60000);
        return () => clearInterval(interval);
    }, []);

    // Helper logic
    const teamsMatch = (nameA: string, nameB: string): boolean => {
        if (!nameA || !nameB) return false;
        const norm = (str: string) => {
            const u = str.toUpperCase().trim();
            if (u === 'USA' || u === 'UNITED STATES' || u === 'UNITED STATES OF AMERICA') return 'USA';
            if (u === 'CAPE VERDE ISLANDS') return 'CAPE VERDE';
            return u;
        };
        const cleanA = norm(nameA);
        const cleanB = norm(nameB);
        return cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
    };

    const getDrafterForTeam = (teamName: string) => {
        const pick = picks.find(p => teamsMatch(p.team, teamName));
        return pick ? pick.drafter : null;
    };

    // 2. Engine: Compute Fantasy Points & Breakdowns
    const standings = drafters.map(name => {
        let totalPoints = 0, totalGoals = 0, totalCleanSheets = 0, wins = 0, draws = 0, losses = 0;
        const myTeams = picks.filter(p => p.drafter === name).map(p => p.team);

        const matchLogs: any[] = [];
        const goalsByTeam: Record<string, number> = {};
        const csByTeam: Record<string, number> = {};

        myTeams.forEach(teamId => {
            goalsByTeam[teamId] = 0;
            csByTeam[teamId] = 0;
            let advancedFromGroup = false;

            matches.forEach(m => {
                const isHome = m.homeTeam && teamsMatch(m.homeTeam, teamId);
                const isAway = m.awayTeam && teamsMatch(m.awayTeam, teamId);
                if (!isHome && !isAway) return;

                let matchPts = 0;
                let logDetails: string[] = [];

                const isWin = (isHome && m.winner === m.homeTeam) || (isAway && m.winner === m.awayTeam);
                const isDraw = m.winner === 'DRAW';
                const isLoss = m.winner && !isWin && !isDraw;

                if (isWin) wins++; else if (isDraw) draws++; else if (isLoss) losses++;

                const matchGoals = isHome ? (m.homeGoals || 0) : (m.awayGoals || 0);
                const matchCleanSheet = (isHome && m.homeCleanSheet) || (isAway && m.awayCleanSheet) ? 1 : 0;

                totalGoals += matchGoals;
                goalsByTeam[teamId] += matchGoals;

                totalCleanSheets += matchCleanSheet;
                csByTeam[teamId] += matchCleanSheet;

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
                    matchPts += 4;
                    logDetails.push(`+4 (Win)`);
                    const stageBonus: any = { R32: 10, R16: 12, QF: 15, SF: 20, '3rdPlace': 10, Final: 30 };
                    if (stageBonus[m.stage]) {
                        matchPts += stageBonus[m.stage];
                        logDetails.push(`+${stageBonus[m.stage]} (${m.stage} Bonus)`);
                    }
                } else if (isDraw && m.stage === 'Group') {
                    matchPts += 2;
                    logDetails.push(`+2 (Draw)`);
                }

                totalPoints += matchPts;

                matchLogs.push({
                    matchId: m.id,
                    stage: m.group && m.stage === 'Group' ? m.group : m.stage,
                    team: teamId,
                    opponent: isHome ? m.awayTeam : m.homeTeam,
                    score: isHome ? `${m.homeGoals ?? '-'} : ${m.awayGoals ?? '-'}` : `${m.awayGoals ?? '-'} : ${m.homeGoals ?? '-'}`,
                    result: isWin ? 'W' : isDraw ? 'D' : isLoss ? 'L' : '-',
                    points: matchPts,
                    details: logDetails
                });
            });
        });

        return { name, teams: myTeams, totalPoints, totalGoals, totalCleanSheets, wins, draws, losses, matchLogs, goalsByTeam, csByTeam };
    });

    const overallLeaders = [...standings].sort((a, b) => b.totalPoints - a.totalPoints);
    const bootLeaders = [...standings].sort((a, b) => b.totalGoals - a.totalGoals);
    const gloveLeaders = [...standings].sort((a, b) => b.totalCleanSheets - a.totalCleanSheets);

    // 3. Compute Real FIFA Group Standings
    const getRealGroupStandings = (groupMatches: any[]) => {
        const table: Record<string, any> = {};
        groupMatches.forEach(m => {
            if (m.homeTeam !== 'TBD' && !table[m.homeTeam]) table[m.homeTeam] = { name: m.homeTeam, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
            if (m.awayTeam !== 'TBD' && !table[m.awayTeam]) table[m.awayTeam] = { name: m.awayTeam, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
        });

        groupMatches.forEach(m => {
            if (m.status === 'FINISHED' || m.status === 'IN_PLAY' || m.status === 'AWARDED') {
                const hG = m.homeGoals || 0;
                const aG = m.awayGoals || 0;

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
        return Object.values(table).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
    };

    const groupNames = Array.from(new Set(matches.map(m => m.group).filter(Boolean))).sort() as string[];
    const filteredGroupNames = selectedGroupFilter === 'ALL' ? groupNames : groupNames.filter(g => g === selectedGroupFilter);

    // Draft Board Data
    const teamToGroup = new Map<string, string>();
    matches.forEach(m => {
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

    return (
        <div className="relative min-h-screen font-sans text-slate-200 overflow-x-hidden">

            <style jsx global>{`
                @keyframes bgReveal {
                    0% { opacity: 0; transform: scale(1.05); }
                    100% { opacity: 1; transform: scale(1); }
                }
                @keyframes contentPop {
                    0% { opacity: 0; transform: translateY(20px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .bg-animate { animation: bgReveal 1.5s ease-out forwards; }
                .content-animate { animation: contentPop 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.8s both; }
            `}</style>

            {/* DYNAMIC SOCCER BACKGROUND IMAGE */}
            <div
                key={`bg-${activeTab}`}
                className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat bg-animate"
                style={{
                    backgroundImage:
                        activeTab === 'draft' ? "url('/draft.png')" :
                            activeTab === 'matches' ? "url('/scores.png')" :
                                activeTab === 'schedule' ? "url('/schedule.png')" :
                                    activeTab === 'standings' ? "url('/leaderboard.png')" :
                                        "url('/awards.png')"
                }}
            />

            {/* BARELY-THERE OVERLAY - Lets the image pop brightly */}
            <div className="fixed inset-0 z-0 bg-black/10" />

            {/* MAIN CONTENT WRAPPER */}
            <div className="relative z-10 p-3 sm:p-5">

                {/* MANAGER BREAKDOWN MODAL */}
                {selectedManager && (
                    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto backdrop-blur-sm" onClick={() => setSelectedManager(null)}>
                        <div className="bg-black/90 backdrop-blur-3xl border border-white/20 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>

                            <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-white/5 rounded-t-xl shrink-0">
                                <div>
                                    <h2 className={`text-xl font-black text-[#fbbf24] uppercase tracking-wider ${oswald.className}`}>{selectedManager.name}'S DASHBOARD</h2>
                                    <p className="text-slate-400 font-mono text-xs mt-1 tracking-widest uppercase">
                                        Total Points: <span className="text-white font-bold ml-1">{selectedManager.totalPoints} PTS</span>
                                    </p>
                                </div>
                                <button onClick={() => setSelectedManager(null)} className="w-full sm:w-auto text-center text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 p-2 rounded-md transition text-xs font-mono uppercase tracking-widest px-4">Close</button>
                            </div>

                            <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
                                {selectedManager.teams.map((team: string) => {
                                    const logs = selectedManager.matchLogs.filter((l: any) => l.team === team);
                                    const teamTotal = logs.reduce((sum: number, l: any) => sum + l.points, 0);

                                    return (
                                        <div key={team} className="bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden shadow-sm">
                                            <div className="bg-black/80 px-4 py-3 border-b border-white/10 flex justify-between items-center">
                                                <h3 className="font-bold text-sm flex items-center text-white uppercase tracking-widest"><FlagIcon teamName={team} /> {team}</h3>
                                                <span className={`text-[#fbbf24] font-black text-sm sm:text-base ${oswald.className}`}>{teamTotal} PTS</span>
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                                                    <thead>
                                                    <tr className="border-b border-white/5 text-slate-500 text-[10px] uppercase font-mono bg-black/40 tracking-widest">
                                                        <th className="py-2 pl-4">Stage</th>
                                                        <th className="py-2">Opponent</th>
                                                        <th className="py-2 text-center">Score</th>
                                                        <th className="py-2">Points Breakdown</th>
                                                        <th className="py-2 text-right pr-4">Match PTS</th>
                                                    </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/5">
                                                    {logs.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} className="py-5 text-center text-slate-500 italic text-xs">No matches played yet.</td>
                                                        </tr>
                                                    ) : (
                                                        logs.map((log: any, i: number) => (
                                                            <tr key={i} className="hover:bg-white/5 transition">
                                                                <td className="py-3 pl-4 font-mono text-slate-400 text-xs uppercase">{log.stage}</td>
                                                                <td className="py-3 font-bold text-slate-200 flex items-center">
                                                                    <FlagIcon teamName={log.opponent} /> {log.opponent}
                                                                </td>
                                                                <td className="py-3 text-center">
                                                                        <span className={`font-mono ${log.result === 'W' ? 'text-emerald-400' : log.result === 'D' ? 'text-slate-300' : log.result === 'L' ? 'text-rose-400' : 'text-slate-500'}`}>
                                                                            {log.score} <span className="text-[10px] ml-1">({log.result})</span>
                                                                        </span>
                                                                </td>
                                                                <td className="py-3 font-mono text-[#fbbf24]/80 text-xs break-words whitespace-normal leading-tight" title={log.details.join(', ')}>
                                                                    {log.details.join(', ')}
                                                                </td>
                                                                <td className="py-3 text-right pr-4">
                                                                    {log.points > 0 ? (
                                                                        <span className={`font-black text-emerald-400 text-[13px] sm:text-[15px] bg-black/60 border border-white/5 px-2.5 py-1 rounded shadow-inner ${oswald.className}`}>+{log.points}</span>
                                                                    ) : (
                                                                        <span className="font-mono text-slate-600">0</span>
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

                {/* HEADER NAVIGATION */}
                <header className="border-b border-white/10 pb-4 mb-5 max-w-7xl mx-auto content-animate">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-3 sm:gap-4">
                        <div className="text-center md:text-left">
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase flex items-center gap-2 justify-center md:justify-start">
                                <span className="text-2xl sm:text-3xl drop-shadow-md">🏆</span>
                                <span className={`text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-fuchsia-500 to-rose-500 drop-shadow-lg ${oswald.className}`}>League World Cup</span>
                            </h1>
                        </div>
                        <div className="flex overflow-x-auto no-scrollbar bg-black/75 backdrop-blur-xl p-1.5 rounded-lg border border-white/20 w-full md:w-auto shadow-2xl">
                            {['draft', 'matches', 'schedule', 'standings', 'awards'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab as any)}
                                    className={`flex-1 md:flex-none whitespace-nowrap px-4 py-2 sm:py-1.5 rounded text-[11px] sm:text-xs uppercase tracking-wider font-bold transition-all duration-300 ${activeTab === tab ? 'bg-white/20 text-white shadow-sm border border-white/20' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
                                >
                                    {tab === 'draft' ? 'Draft' : tab === 'matches' ? 'Scores' : tab === 'schedule' ? 'Schedule' : tab === 'standings' ? 'Leaderboard' : 'Awards'}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                {/* DYNAMIC CONTENT CONTAINER */}
                <div key={`content-${activeTab}`} className="content-animate">

                    {/* TAB: DRAFT BOARD */}
                    {activeTab === 'draft' && (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 max-w-7xl mx-auto">
                            {/* Drafters Column */}
                            <div className="bg-black/75 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden flex flex-col h-[60vh] lg:h-[80vh] shadow-2xl">
                                <div className="p-3.5 border-b border-white/20 bg-black/80">
                                    <h2 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-widest">Drafters & Picks</h2>
                                </div>
                                <div className="overflow-y-auto p-3.5 space-y-4">
                                    {drafters.map((drafter, idx) => (
                                        <div key={drafter}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-slate-500 font-mono text-xs">{idx + 1}</span>
                                                <h3 className="font-bold text-slate-100 text-sm">{drafter}</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 pl-4">
                                                {picks.filter(p => p.drafter === drafter).map((pick, pIdx) => (
                                                    <div key={pIdx} className="bg-white/10 border border-white/10 rounded px-2 py-1.5 flex items-center text-[11px] sm:text-xs shadow-sm min-w-0">
                                                        <FlagIcon teamName={pick.team} />
                                                        <span className="break-words whitespace-normal leading-tight text-white">{pick.team}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Groups Column */}
                            <div className="lg:col-span-2 bg-black/75 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden flex flex-col h-[70vh] lg:h-[80vh] shadow-2xl">
                                <div className="p-3.5 border-b border-white/20 bg-black/80 flex justify-between items-center gap-2">
                                    <h2 className="text-[11px] sm:text-xs font-mono font-bold text-slate-300 uppercase tracking-widest truncate">Tournament Field</h2>
                                    <input type="text" placeholder="Search..." value={draftSearch} onChange={(e) => setDraftSearch(e.target.value)} className="bg-black/80 border border-white/20 text-white rounded px-2.5 py-1 text-[11px] sm:text-xs focus:outline-none focus:border-emerald-400 w-24 sm:w-40 transition" />
                                </div>
                                <div className="overflow-y-auto p-3 sm:p-4 space-y-5">
                                    {Object.keys(groupedTeams).sort().map(group => {
                                        const groupTeams = groupedTeams[group].filter(t => t.toLowerCase().includes(draftSearch.toLowerCase()));
                                        if (groupTeams.length === 0) return null;
                                        return (
                                            <div key={group}>
                                                <h3 className="text-[10px] font-mono font-bold text-slate-400 mb-2 uppercase tracking-widest">{group}</h3>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                                                    {groupTeams.sort().map(team => {
                                                        const drafter = getDrafterForTeam(team);
                                                        return (
                                                            <div key={team} className={`border rounded p-2 sm:p-3 flex flex-col justify-center items-center text-center transition-all min-w-0 ${drafter ? 'bg-black/50 border-white/10 opacity-70' : 'bg-white/10 border-white/20 shadow-sm hover:border-white/40 hover:bg-white/20'}`}>
                                                                <div className="mb-1 sm:mb-1.5"><FlagIcon teamName={team} /></div>
                                                                <span className={`text-[11px] sm:text-xs break-words whitespace-normal leading-tight ${drafter ? 'line-through text-slate-400' : 'font-bold text-white'}`}>{team}</span>
                                                                <span className="text-[9px] sm:text-[10px] text-[#fbbf24] font-mono mt-1 h-3">{drafter || ''}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Pick Log Column */}
                            <div className="bg-black/75 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden flex flex-col h-[50vh] lg:h-[80vh] shadow-2xl">
                                <div className="p-3.5 border-b border-white/20 bg-black/80">
                                    <h2 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-widest">Pick Log</h2>
                                </div>
                                <div className="overflow-y-auto p-3.5 space-y-2">
                                    {[...picks].reverse().map((pick, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-white/10 border border-white/10 p-2 sm:p-2.5 rounded min-w-0 hover:bg-white/20 transition">
                                            <div className="flex items-center gap-2 min-w-0 pr-2">
                                                <span className={`text-xs font-mono text-slate-400 shrink-0 w-5 ${oswald.className}`}>#{picks.length - idx}</span>
                                                <div className="flex items-center text-[11px] sm:text-sm font-bold text-white min-w-0">
                                                    <FlagIcon teamName={pick.team} />
                                                    <span className="break-words whitespace-normal leading-tight">{pick.team}</span>
                                                </div>
                                            </div>
                                            <span className="text-[9px] sm:text-[10px] text-slate-300 shrink-0">{pick.drafter}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: MATCHES LIST */}
                    {activeTab === 'matches' && (
                        <div className="max-w-7xl mx-auto space-y-5">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 mb-5">
                                <div>
                                    <h2 className={`text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-md ${oswald.className}`}>ALL SCORES</h2>
                                </div>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <label htmlFor="groupFilter" className="text-[10px] sm:text-xs font-mono text-slate-300 uppercase tracking-widest shrink-0">Filter:</label>
                                    <select
                                        id="groupFilter"
                                        value={selectedGroupFilter}
                                        onChange={(e) => setSelectedGroupFilter(e.target.value)}
                                        className="bg-black/80 backdrop-blur-md border border-white/20 text-white rounded px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-400 transition shadow-lg w-full sm:w-auto"
                                    >
                                        <option value="ALL">All Groups</option>
                                        {groupNames.map(grp => (
                                            <option key={grp} value={grp}>{grp}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {filteredGroupNames.length === 0 ? (
                                <div className="text-center py-8 text-slate-300 bg-black/75 backdrop-blur-xl border border-dashed border-white/30 rounded-xl text-xs">
                                    <p>No matches found for the selected filter.</p>
                                </div>
                            ) : (
                                filteredGroupNames.map(group => {
                                    const groupMatches = matches.filter(m => m.group === group);
                                    const groupTable = getRealGroupStandings(groupMatches);

                                    return (
                                        <div key={group} className="bg-black/75 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl">
                                            <div className="bg-black/80 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/20 flex justify-between items-center">
                                                <h3 className={`font-black text-[#fbbf24] text-xs sm:text-sm uppercase tracking-widest ${oswald.className}`}>{group}</h3>
                                                <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono uppercase tracking-widest">Top 2 advance</span>
                                            </div>

                                            <div className="flex flex-col lg:flex-row">
                                                {/* Left: FIFA Standings Table */}
                                                <div className="w-full lg:w-[35%] xl:w-[30%] border-b lg:border-b-0 lg:border-r border-white/20 overflow-x-auto flex bg-black/40">
                                                    <table className="w-full text-left text-[11px] sm:text-[12px] min-w-[320px]">
                                                        <thead>
                                                        <tr className="border-b border-white/10 text-slate-300 text-[9px] sm:text-[10px] uppercase font-mono bg-white/5">
                                                            <th className="py-2.5 pl-3 sm:pl-4">Team</th>
                                                            <th className="py-2.5 text-center w-6">MP</th>
                                                            <th className="py-2.5 text-center w-6">W</th>
                                                            <th className="py-2.5 text-center w-6">D</th>
                                                            <th className="py-2.5 text-center w-6">L</th>
                                                            <th className="py-2.5 text-center w-6">GF</th>
                                                            <th className="py-2.5 text-center w-6">GA</th>
                                                            <th className="py-2.5 text-center w-8 pr-3 sm:pr-4">PTS</th>
                                                        </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white/10">
                                                        {groupTable.map((teamRow) => (
                                                            <tr key={teamRow.name} className="hover:bg-white/10 transition">
                                                                <td className="py-3 sm:py-5 lg:py-6 pl-3 sm:pl-4 font-bold text-white">
                                                                    <div className="flex items-center whitespace-nowrap min-w-0">
                                                                        <FlagIcon teamName={teamRow.name} />
                                                                        <span className="break-words whitespace-normal leading-tight">{teamRow.name}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-3 sm:py-5 lg:py-6 text-center text-slate-200 font-mono">{teamRow.mp}</td>
                                                                <td className="py-3 sm:py-5 lg:py-6 text-center text-slate-200 font-mono">{teamRow.w}</td>
                                                                <td className="py-3 sm:py-5 lg:py-6 text-center text-slate-200 font-mono">{teamRow.d}</td>
                                                                <td className="py-3 sm:py-5 lg:py-6 text-center text-slate-200 font-mono">{teamRow.l}</td>
                                                                <td className="py-3 sm:py-5 lg:py-6 text-center text-slate-200 font-mono">{teamRow.gf}</td>
                                                                <td className="py-3 sm:py-5 lg:py-6 text-center text-slate-200 font-mono">{teamRow.ga}</td>
                                                                <td className={`py-3 sm:py-5 lg:py-6 text-center font-black text-[#fbbf24] pr-3 sm:pr-4 text-[13px] sm:text-[15px] ${oswald.className}`}>{teamRow.pts}</td>
                                                            </tr>
                                                        ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* Right: Matches List */}
                                                <div className="w-full lg:w-[65%] xl:w-[70%] p-2 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4 content-start bg-transparent">
                                                    {groupMatches.map(m => {
                                                        const homeDrafter = getDrafterForTeam(m.homeTeam);
                                                        const awayDrafter = getDrafterForTeam(m.awayTeam);

                                                        const isHomeWin = m.winner === m.homeTeam;
                                                        const isAwayWin = m.winner === m.awayTeam;

                                                        const homeNameColor = isHomeWin ? 'font-black text-emerald-400' : isAwayWin ? 'font-medium text-rose-400' : 'font-bold text-white';
                                                        const awayNameColor = isAwayWin ? 'font-black text-emerald-400' : isHomeWin ? 'font-medium text-rose-400' : 'font-bold text-white';

                                                        const homeScoreColor = isHomeWin ? 'text-emerald-400' : isAwayWin ? 'text-rose-400' : 'text-white';
                                                        const awayScoreColor = isAwayWin ? 'text-emerald-400' : isHomeWin ? 'text-rose-400' : 'text-white';

                                                        return (
                                                            <div key={m.id} className="flex items-center justify-between p-2 sm:p-3 bg-white/10 border border-white/10 rounded-lg hover:bg-white/20 transition shadow-sm h-full">
                                                                {/* Home Side */}
                                                                <div className="flex-1 flex flex-col items-end text-right min-w-0">
                                                                    <div className="flex items-center gap-1.5 sm:gap-2 w-full justify-end min-w-0">
                                                                        <span className={`text-[11px] sm:text-[13px] break-words whitespace-normal leading-tight ${homeNameColor}`}>{m.homeTeam}</span>
                                                                        <FlagIcon teamName={m.homeTeam} />
                                                                    </div>
                                                                    {homeDrafter && <span className="text-[8px] sm:text-[9px] text-slate-300 font-mono mt-1 shrink-0 truncate max-w-full">{homeDrafter}</span>}
                                                                </div>

                                                                {/* Score Block */}
                                                                <div className="mx-2 sm:mx-4 flex flex-col items-center shrink-0 min-w-[55px] sm:min-w-[65px]">
                                                                    <div className="flex items-center justify-center gap-1 sm:gap-1.5 bg-black/80 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded border border-white/10 w-full shadow-inner mb-0.5 sm:mb-1">
                                                                        <span className={`font-black text-xs sm:text-[17px] w-3 sm:w-5 text-center leading-none ${homeScoreColor} ${oswald.className}`}>{m.homeGoals !== null ? m.homeGoals : '-'}</span>
                                                                        <span className="text-slate-400 text-[10px] sm:text-[12px] leading-none">:</span>
                                                                        <span className={`font-black text-xs sm:text-[17px] w-3 sm:w-5 text-center leading-none ${awayScoreColor} ${oswald.className}`}>{m.awayGoals !== null ? m.awayGoals : '-'}</span>
                                                                    </div>
                                                                    {m.status === 'IN_PLAY' && <span className="text-[9px] sm:text-[11px] font-black tracking-widest text-red-500 animate-pulse">{m.minute ? `${m.minute}'` : 'LIVE'}</span>}
                                                                    {m.status === 'PAUSED' && <span className="text-[9px] sm:text-[11px] font-black tracking-widest text-amber-500">HT</span>}
                                                                    {m.status === 'FINISHED' && <span className="text-[9px] sm:text-[11px] font-black tracking-widest text-emerald-500">FT</span>}
                                                                </div>

                                                                {/* Away Side */}
                                                                <div className="flex-1 flex flex-col items-start text-left min-w-0">
                                                                    <div className="flex items-center gap-1.5 sm:gap-2 w-full justify-start min-w-0">
                                                                        <FlagIcon teamName={m.awayTeam} />
                                                                        <span className={`text-[11px] sm:text-[13px] break-words whitespace-normal leading-tight ${awayNameColor}`}>{m.awayTeam}</span>
                                                                    </div>
                                                                    {awayDrafter && <span className="text-[8px] sm:text-[9px] text-slate-300 font-mono mt-1 shrink-0 truncate max-w-full">{awayDrafter}</span>}
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

                    {/* TAB: SCHEDULE */}
                    {activeTab === 'schedule' && (
                        <div className="max-w-7xl mx-auto space-y-5">
                            <h2 className={`text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-md ${oswald.className}`}>MATCH SCHEDULE</h2>
                            <ScheduleTab />
                        </div>
                    )}

                    {/* TAB: LEADERBOARD */}
                    {activeTab === 'standings' && (
                        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
                            <h2 className={`text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-md ${oswald.className}`}>LEADERBOARD</h2>

                            {/* SCORING LEGEND */}
                            <div className="bg-black/75 backdrop-blur-xl border border-white/20 rounded-xl p-3 sm:p-5 shadow-2xl hidden md:block">
                                <h3 className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-widest mb-3">Point System</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-y-2 gap-x-4 text-[11px] sm:text-[12px]">
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2"><span className={`text-[#fbbf24] font-black w-6 text-right text-sm ${oswald.className}`}>+4</span> <span className="text-white">Win Match</span></div>
                                        <div className="flex items-center gap-2"><span className={`text-[#fbbf24] font-black w-6 text-right text-sm ${oswald.className}`}>+8</span> <span className="text-white">Advance</span></div>
                                        <div className="flex items-center gap-2"><span className={`text-[#fbbf24] font-black w-6 text-right text-sm ${oswald.className}`}>+20</span> <span className="text-white">Win SF</span></div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2"><span className={`text-[#fbbf24] font-black w-6 text-right text-sm ${oswald.className}`}>+2</span> <span className="text-white">Group Draw</span></div>
                                        <div className="flex items-center gap-2"><span className={`text-[#fbbf24] font-black w-6 text-right text-sm ${oswald.className}`}>+10</span> <span className="text-white">Win R32</span></div>
                                        <div className="flex items-center gap-2"><span className={`text-[#fbbf24] font-black w-6 text-right text-sm ${oswald.className}`}>+10</span> <span className="text-white">Win 3rd</span></div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2"><span className={`text-[#fbbf24] font-black w-6 text-right text-sm ${oswald.className}`}>+1</span> <span className="text-white">Goal Scored</span></div>
                                        <div className="flex items-center gap-2"><span className={`text-[#fbbf24] font-black w-6 text-right text-sm ${oswald.className}`}>+12</span> <span className="text-white">Win R16</span></div>
                                        <div className="flex items-center gap-2"><span className={`text-[#fbbf24] font-black w-6 text-right text-sm ${oswald.className}`}>+30</span> <span className="text-white">Win Final</span></div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2"><span className={`text-[#fbbf24] font-black w-6 text-right text-sm ${oswald.className}`}>+2</span> <span className="text-white">Clean Sheet</span></div>
                                        <div className="flex items-center gap-2"><span className={`text-[#fbbf24] font-black w-6 text-right text-sm ${oswald.className}`}>+15</span> <span className="text-white">Win QF</span></div>
                                    </div>
                                </div>
                            </div>

                            {/* TOP 3 PODIUM */}
                            <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6">
                                {overallLeaders.slice(0, 3).map((leader, i) => (
                                    <div key={leader.name} className={`backdrop-blur-xl rounded-xl flex flex-col items-center justify-center p-2 sm:p-6 text-center transition-all duration-300 ${
                                        i === 0 ? 'bg-amber-500/40 border border-amber-400/50 shadow-[0_0_30px_rgba(251,191,36,0.5)]' :
                                            i === 1 ? 'bg-slate-300/30 border border-slate-300/30 shadow-[0_0_30px_rgba(203,213,225,0.3)]' :
                                                'bg-orange-700/40 border border-orange-700/40 shadow-[0_0_30px_rgba(194,65,12,0.4)]'
                                    }`}>
                                        <span className="text-2xl sm:text-4xl md:text-5xl mb-1 sm:mb-3 drop-shadow-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                                        <h3 className="text-[12px] sm:text-[18px] md:text-[22px] font-black text-white mb-0.5 sm:mb-2 tracking-wide truncate w-full px-1">{leader.name}</h3>
                                        <div className={`text-[24px] sm:text-[36px] md:text-[42px] font-black text-[#fbbf24] leading-none mb-1 sm:mb-1.5 drop-shadow-md ${oswald.className}`}>{leader.totalPoints}</div>
                                        <span className="text-[8px] sm:text-[10px] text-slate-100 font-mono mb-2 sm:mb-4 uppercase tracking-widest hidden sm:block">Points</span>
                                        <div className="flex flex-wrap justify-center gap-1 sm:gap-1.5 px-1">
                                            {leader.teams.map(t => <div key={t} title={t}><FlagIcon teamName={t} /></div>)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* FULL STANDINGS TABLE */}
                            <div className="bg-black/75 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl overflow-x-auto">
                                <table className="w-full text-left text-[12px] sm:text-[14px] border-collapse min-w-[600px] sm:min-w-[700px]">
                                    <thead>
                                    <tr className="border-b border-white/20 text-slate-300 text-[9px] sm:text-[10px] uppercase font-mono bg-black/80 tracking-widest">
                                        <th className="py-3 sm:py-4 pl-4 sm:pl-6 w-10 sm:w-12">#</th>
                                        <th className="py-3 sm:py-4 w-32 sm:w-48">Drafter</th>
                                        <th className="py-3 sm:py-4 w-16 sm:w-24">PTS</th>
                                        <th className="py-3 sm:py-4">Teams</th>
                                        <th className="py-3 sm:py-4 text-center w-12 sm:w-16">W</th>
                                        <th className="py-3 sm:py-4 text-center w-12 sm:w-16">D</th>
                                        <th className="py-3 sm:py-4 text-center w-12 sm:w-16">L</th>
                                        <th className="py-3 sm:py-4 text-center w-12 sm:w-16">GF</th>
                                        <th className="py-3 sm:py-4 text-center pr-4 sm:pr-6 w-12 sm:w-16">CS</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10">
                                    {overallLeaders.map((row, index) => (
                                        <tr key={row.name} className="hover:bg-white/10 transition">
                                            <td className={`py-3 sm:py-4 pl-4 sm:pl-6 font-bold text-slate-300 text-[13px] sm:text-[15px] ${oswald.className}`}>{index + 1}</td>
                                            <td className="py-3 sm:py-4">
                                                <button
                                                    onClick={() => setSelectedManager(row)}
                                                    className="font-bold text-[12px] sm:text-[14px] text-white hover:text-[#fbbf24] transition text-left truncate max-w-[120px] sm:max-w-full"
                                                >
                                                    {row.name}
                                                </button>
                                            </td>
                                            <td className={`py-3 sm:py-4 font-black text-[#fbbf24] text-[15px] sm:text-[18px] drop-shadow-sm ${oswald.className}`}>{row.totalPoints}</td>
                                            <td className="py-3 sm:py-4">
                                                <div className="flex gap-1 sm:gap-1.5 flex-wrap">
                                                    {row.teams.map(t => <div key={t} title={t}><FlagIcon teamName={t} /></div>)}
                                                </div>
                                            </td>
                                            <td className={`py-3 sm:py-4 text-center font-bold text-emerald-400 text-[13px] sm:text-[15px] ${oswald.className}`}>{row.wins}</td>
                                            <td className={`py-3 sm:py-4 text-center font-bold text-slate-200 text-[13px] sm:text-[15px] ${oswald.className}`}>{row.draws}</td>
                                            <td className={`py-3 sm:py-4 text-center font-bold text-rose-400 text-[13px] sm:text-[15px] ${oswald.className}`}>{row.losses}</td>
                                            <td className={`py-3 sm:py-4 text-center font-bold text-white text-[13px] sm:text-[15px] ${oswald.className}`}>{row.totalGoals}</td>
                                            <td className={`py-3 sm:py-4 text-center font-bold text-blue-400 pr-4 sm:pr-6 text-[13px] sm:text-[15px] ${oswald.className}`}>{row.totalCleanSheets}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB: AWARDS */}
                    {activeTab === 'awards' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 max-w-7xl mx-auto">

                            {/* Golden Boot Card */}
                            <div className="bg-gradient-to-br from-amber-500/60 to-orange-600/60 p-[1.5px] rounded-xl shadow-2xl h-full">
                                <div className="bg-black/75 backdrop-blur-xl p-4 sm:p-7 rounded-xl h-full flex flex-col">
                                    <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6 border-b border-white/20 pb-3 sm:pb-4">
                                        <div className="bg-black/80 p-2 sm:p-3 rounded-lg border border-amber-500/40 shadow-inner">
                                            <span className="text-2xl sm:text-4xl block leading-none">⚽</span>
                                        </div>
                                        <div>
                                            <h2 className={`text-xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 uppercase tracking-widest drop-shadow-md ${oswald.className}`}>Golden Boot</h2>
                                            <p className="text-amber-400 text-[9px] sm:text-xs font-mono font-bold tracking-widest uppercase mt-0.5 sm:mt-1">15% Pot • Most Goals</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2 sm:space-y-3 flex-1">
                                        {bootLeaders.slice(0, 5).map((row, idx) => {
                                            const breakdownText = Object.entries(row.goalsByTeam)
                                                .filter(([_, goals]) => (goals as number) > 0)
                                                .sort((a, b) => (b[1] as number) - (a[1] as number))
                                                .map(([team, goals]) => `${team} (${goals})`)
                                                .join(', ');

                                            return (
                                                <div key={row.name} className={`flex justify-between items-center p-2.5 sm:p-4 rounded-lg border transition-all ${idx === 0 ? 'bg-amber-500/30 border-amber-400/60 shadow-md scale-[1.02]' : 'bg-white/10 border-white/20 hover:border-white/40'}`}>
                                                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                                                        <span className={`font-black text-lg sm:text-2xl w-5 sm:w-6 shrink-0 text-center ${idx === 0 ? 'text-amber-400' : 'text-slate-300'}`}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`}</span>
                                                        <div className="flex flex-col min-w-0 pr-2">
                                                            <span className={`font-bold text-[13px] sm:text-[16px] leading-tight break-words whitespace-normal ${idx === 0 ? 'text-white' : 'text-slate-200'}`}>{row.name}</span>
                                                            <span className="text-[9px] sm:text-[11px] text-slate-300 mt-0.5 sm:mt-1 max-w-[120px] sm:max-w-[240px] truncate" title={breakdownText}>
                                                                {breakdownText || "No goals yet"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end shrink-0">
                                                        <span className={`font-black text-2xl sm:text-4xl leading-none ${idx === 0 ? 'text-amber-400 drop-shadow-md' : 'text-white'} ${oswald.className}`}>{row.totalGoals}</span>
                                                        <span className="text-[8px] sm:text-[10px] text-slate-300 font-mono uppercase tracking-widest mt-0.5 sm:mt-1">Goals</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Golden Glove Card */}
                            <div className="bg-gradient-to-br from-blue-400/60 to-blue-700/60 p-[1.5px] rounded-xl shadow-2xl h-full">
                                <div className="bg-black/75 backdrop-blur-xl p-4 sm:p-7 rounded-xl h-full flex flex-col">
                                    <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6 border-b border-white/20 pb-3 sm:pb-4">
                                        <div className="bg-black/80 p-2 sm:p-3 rounded-lg border border-blue-500/40 shadow-inner">
                                            <span className="text-2xl sm:text-4xl block leading-none">🧤</span>
                                        </div>
                                        <div>
                                            <h2 className={`text-xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-blue-500 uppercase tracking-widest drop-shadow-md ${oswald.className}`}>Golden Glove</h2>
                                            <p className="text-blue-400 text-[9px] sm:text-xs font-mono font-bold tracking-widest uppercase mt-0.5 sm:mt-1">10% Pot • Clean Sheets</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2 sm:space-y-3 flex-1">
                                        {gloveLeaders.slice(0, 5).map((row, idx) => {
                                            const breakdownText = Object.entries(row.csByTeam)
                                                .filter(([_, cs]) => (cs as number) > 0)
                                                .sort((a, b) => (b[1] as number) - (a[1] as number))
                                                .map(([team, cs]) => `${team} (${cs})`)
                                                .join(', ');

                                            return (
                                                <div key={row.name} className={`flex justify-between items-center p-2.5 sm:p-4 rounded-lg border transition-all ${idx === 0 ? 'bg-blue-500/30 border-blue-400/60 shadow-md scale-[1.02]' : 'bg-white/10 border-white/20 hover:border-white/40'}`}>
                                                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                                                        <span className={`font-black text-lg sm:text-2xl w-5 sm:w-6 shrink-0 text-center ${idx === 0 ? 'text-blue-400' : 'text-slate-300'}`}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`}</span>
                                                        <div className="flex flex-col min-w-0 pr-2">
                                                            <span className={`font-bold text-[13px] sm:text-[16px] leading-tight break-words whitespace-normal ${idx === 0 ? 'text-white' : 'text-slate-200'}`}>{row.name}</span>
                                                            <span className="text-[9px] sm:text-[11px] text-slate-300 mt-0.5 sm:mt-1 max-w-[120px] sm:max-w-[240px] truncate" title={breakdownText}>
                                                                {breakdownText || "No clean sheets yet"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end shrink-0">
                                                        <span className={`font-black text-2xl sm:text-4xl leading-none ${idx === 0 ? 'text-blue-400 drop-shadow-md' : 'text-white'} ${oswald.className}`}>{row.totalCleanSheets}</span>
                                                        <span className="text-[8px] sm:text-[10px] text-slate-300 font-mono uppercase tracking-widest mt-0.5 sm:mt-1">Sheets</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}