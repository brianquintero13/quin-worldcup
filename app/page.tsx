"use client";
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { ref, onValue } from 'firebase/database';
import * as Flags from 'country-flag-icons/react/3x2';
import { Oswald } from 'next/font/google';

import ScheduleTab from './components/ScheduleTab';

const oswald = Oswald({ subsets: ['latin'], weight: ['400', '700'] });

const FlagIcon = ({ teamName }: { teamName: string }) => {
    if (!teamName || teamName === 'TBD') return <span className="w-[22px] h-[15px] inline-block mr-1 bg-white/10 rounded-sm shadow-sm shrink-0" />;

    if (teamName === 'Scotland') return <span className="inline-block mr-1 text-[16px] leading-none shrink-0 drop-shadow-md">🏴󠁧󠁢󠁳󠁣󠁴󠁿</span>;
    if (teamName === 'England') return <span className="inline-block mr-1 text-[16px] leading-none shrink-0 drop-shadow-md">🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>;
    if (teamName === 'Wales') return <span className="inline-block mr-1 text-[16px] leading-none shrink-0 drop-shadow-md">🏴󠁧󠁢󠁷󠁬󠁳󠁿</span>;

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
    if (!code) return <span className="w-[22px] h-[15px] inline-block mr-1 bg-white/10 rounded-sm shadow-sm shrink-0" />;
    const FlagComponent = (Flags as any)[code];
    return FlagComponent ? <FlagComponent className="w-[22px] h-[15px] inline mr-1 rounded-sm shadow-md object-cover shrink-0 drop-shadow-md" /> : <span className="w-[22px] h-[15px] inline-block mr-1 bg-white/10 rounded-sm shadow-sm shrink-0" />;
};

export default function AutomatedDashboard() {
    const [picks, setPicks] = useState<any[]>([]);
    const [drafters, setDrafters] = useState<string[]>([]);
    const [matches, setMatches] = useState<any[]>([]);

    const [activeTab, setActiveTab] = useState<'draft' | 'matches' | 'schedule' | 'standings' | 'awards' | 'rules'>('standings');

    const [draftSearch, setDraftSearch] = useState<string>('');
    const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
    const [selectedManager, setSelectedManager] = useState<any | null>(null);

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
                .bg-animate { animation: bgReveal 1.5s ease-out forwards; }
                .content-animate { animation: contentPop 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.8s both; }
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

            <div className="relative z-10 p-4 sm:p-5">

                {selectedManager && (
                    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-md" onClick={() => setSelectedManager(null)}>
                        <div className="bg-black/90 backdrop-blur-xl border border-white/20 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-black/60 rounded-t-xl shrink-0">
                                <div>
                                    <h2 className={`text-lg sm:text-xl font-black text-sky-400 uppercase tracking-wider drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>{selectedManager.name}'S DASHBOARD</h2>
                                    <p className="text-slate-300 font-mono text-[10px] sm:text-xs mt-0.5 tracking-widest uppercase font-bold drop-shadow-md">
                                        Total Points: <span className="text-[#fbbf24] font-black ml-1 [-webkit-text-stroke:0.5px_black]">{selectedManager.totalPoints} PTS</span>
                                    </p>
                                </div>
                                <button onClick={() => setSelectedManager(null)} className="w-full sm:w-auto text-center text-white hover:text-sky-400 bg-white/10 hover:bg-white/20 border border-white/20 py-1.5 px-3 rounded-md transition text-[10px] font-mono uppercase tracking-widest shadow-md font-bold">Close</button>
                            </div>

                            <div className="p-3 sm:p-4 overflow-y-auto space-y-3">
                                {selectedManager.teams.map((team: string) => {
                                    const logs = selectedManager.matchLogs.filter((l: any) => l.team === team);
                                    const teamTotal = logs.reduce((sum: number, l: any) => sum + l.points, 0);

                                    return (
                                        <div key={team} className="bg-black/70 backdrop-blur-md border border-white/20 rounded-lg overflow-hidden shadow-xl">
                                            <div className="bg-black/90 px-3 py-2 border-b border-white/10 flex justify-between items-center">
                                                <h3 className="font-black text-xs sm:text-sm flex items-center text-slate-100 uppercase tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,1)]"><FlagIcon teamName={team} /> {team}</h3>
                                                <span className={`text-[#fbbf24] font-black text-base sm:text-lg drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>{teamTotal} PTS</span>
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left text-[10px] sm:text-xs border-collapse min-w-[500px]">
                                                    <thead>
                                                    <tr className="border-b border-white/10 text-slate-300 text-[9px] sm:text-[10px] uppercase font-mono bg-black/60 tracking-widest font-black">
                                                        <th className="py-2 pl-3 drop-shadow-md">Stage</th>
                                                        <th className="py-2 drop-shadow-md">Opponent</th>
                                                        <th className="py-2 text-center drop-shadow-md">Score</th>
                                                        <th className="py-2 drop-shadow-md">Points Breakdown</th>
                                                        <th className="py-2 text-right pr-3 drop-shadow-md">Match PTS</th>
                                                    </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/10">
                                                    {logs.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} className="py-3 text-center text-slate-400 font-bold italic text-[10px] sm:text-xs">No matches played yet.</td>
                                                        </tr>
                                                    ) : (
                                                        logs.map((log: any, i: number) => (
                                                            <tr key={i} className="hover:bg-black/40 transition">
                                                                <td className="py-2 pl-3 font-mono text-slate-100 text-[10px] sm:text-xs uppercase drop-shadow-md font-bold">{log.stage}</td>
                                                                <td className="py-2 font-black text-slate-100 flex items-center drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
                                                                    <FlagIcon teamName={log.opponent} /> {log.opponent}
                                                                </td>
                                                                <td className="py-2 text-center">
                                                                        <span className={`font-mono font-black drop-shadow-md text-xs sm:text-sm ${log.result === 'W' ? 'text-emerald-400' : log.result === 'D' ? 'text-white' : log.result === 'L' ? 'text-rose-400' : 'text-slate-400'}`}>
                                                                            {log.score} <span className="text-[9px] ml-1">({log.result})</span>
                                                                        </span>
                                                                </td>
                                                                <td className="py-2 font-mono text-[#fbbf24] text-[10px] sm:text-xs break-words whitespace-normal leading-tight font-black drop-shadow-md" title={log.details.join(', ')}>
                                                                    {log.details.join(', ')}
                                                                </td>
                                                                <td className="py-2 text-right pr-3">
                                                                    {log.points > 0 ? (
                                                                        <span className={`font-black text-emerald-400 text-xs sm:text-sm bg-black/80 border border-white/10 px-2 py-0.5 rounded shadow-sm drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+{log.points}</span>
                                                                    ) : (
                                                                        <span className="font-mono text-slate-300 font-bold drop-shadow-md text-[10px]">0</span>
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

                <header className="border-b border-white/20 pb-4 mb-5 max-w-7xl mx-auto content-animate">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-3">
                        <div className="text-center md:text-left">
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase flex items-center gap-2 justify-center md:justify-start">
                                <span className="text-2xl sm:text-3xl drop-shadow-lg">🏆</span>
                                <span className={`text-slate-50 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] [-webkit-text-stroke:1px_black] ${oswald.className}`}>League World Cup</span>
                            </h1>
                        </div>
                        <div className="flex overflow-x-auto no-scrollbar bg-black/70 backdrop-blur-xl p-1.5 rounded-lg border border-white/20 w-full md:w-auto shadow-2xl">
                            {['draft', 'matches', 'schedule', 'standings', 'awards', 'rules'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab as any)}
                                    className={`flex-1 md:flex-none whitespace-nowrap px-3 py-1.5 sm:py-1.5 rounded-md text-[10px] sm:text-xs uppercase tracking-wider font-black transition-all duration-300 drop-shadow-md ${activeTab === tab ? 'bg-sky-500/20 text-sky-400 shadow-md border border-sky-400/50 scale-105' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
                                >
                                    {tab === 'draft' ? 'Draft' : tab === 'matches' ? 'Scores' : tab === 'schedule' ? 'Schedule' : tab === 'standings' ? 'Leaderboard' : tab === 'awards' ? 'Awards' : 'Rules'}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                <div key={`content-${activeTab}`} className="content-animate">

                    {activeTab === 'draft' && (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-5 max-w-7xl mx-auto">
                            <div className="bg-black/70 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden flex flex-col h-auto max-h-[80vh] shadow-2xl">
                                <div className="p-3 border-b border-white/20 bg-black/80">
                                    <h2 className="text-[10px] sm:text-xs font-mono font-black text-slate-200 uppercase tracking-widest drop-shadow-md">Drafters & Picks</h2>
                                </div>
                                <div className="overflow-y-auto p-3 space-y-3">
                                    {drafters.map((drafter, idx) => (
                                        <div key={drafter}>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="text-slate-400 font-mono text-[10px] font-black drop-shadow-md">{idx + 1}</span>
                                                <h3 className="font-black text-sky-400 text-xs sm:text-sm drop-shadow-md [text-shadow:0_1px_2px_black]">{drafter}</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-1.5 pl-2">
                                                {picks.filter(p => p.drafter === drafter).map((pick, pIdx) => (
                                                    <div key={pIdx} className="bg-black/60 border border-white/20 rounded-md px-2 py-1.5 flex items-center text-[10px] sm:text-xs shadow-md min-w-0">
                                                        <FlagIcon teamName={pick.team}/>
                                                        <span className="truncate block whitespace-nowrap text-slate-100 font-black drop-shadow-[0_2px_2px_rgba(0,0,0,1)] w-full">{pick.team}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="lg:col-span-2 bg-black/70 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden flex flex-col h-auto max-h-[80vh] shadow-2xl">
                                <div className="p-3 border-b border-white/20 bg-black/80 flex justify-between items-center gap-2">
                                    <h2 className="text-[10px] sm:text-xs font-mono font-black text-slate-200 uppercase tracking-widest truncate drop-shadow-md">Tournament Field</h2>
                                    <input type="text" placeholder="Search..." value={draftSearch} onChange={(e) => setDraftSearch(e.target.value)} className="bg-black/60 border border-white/30 text-white rounded-md px-2.5 py-1 text-[10px] sm:text-xs focus:outline-none focus:border-sky-400 w-24 sm:w-40 transition shadow-inner font-bold placeholder-slate-400" />
                                </div>
                                <div className="overflow-y-auto p-3 sm:p-5 space-y-5">
                                    {Object.keys(groupedTeams).sort().map(group => {
                                        const groupTeams = groupedTeams[group].filter(t => t.toLowerCase().includes(draftSearch.toLowerCase()));
                                        if (groupTeams.length === 0) return null;
                                        return (
                                            <div key={group}>
                                                <h3 className="text-[10px] sm:text-xs font-mono font-black text-slate-300 mb-2 uppercase tracking-widest drop-shadow-md">{group}</h3>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                                                    {groupTeams.sort().map(team => {
                                                        const drafter = getDrafterForTeam(team);
                                                        return (
                                                            <div key={team} className={`border rounded-lg p-2 flex flex-col justify-center items-center text-center transition-all min-w-0 shadow-lg ${drafter ? 'bg-black/90 border-white/5 opacity-70' : 'bg-black/60 border-white/30 hover:border-white/50 hover:bg-black/80'}`}>
                                                                <div className="mb-1"><FlagIcon teamName={team}/></div>
                                                                <span className={`text-[10px] sm:text-xs truncate block w-full drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${drafter ? 'line-through text-slate-400 font-bold' : 'font-black text-slate-100'}`}>{team}</span>
                                                                <span className="text-[8px] sm:text-[9px] text-sky-400 font-mono mt-1 h-2 drop-shadow-md font-black">{drafter || ''}</span>
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
                                <div className="p-3 border-b border-white/20 bg-black/80">
                                    <h2 className="text-[10px] sm:text-xs font-mono font-black text-slate-200 uppercase tracking-widest drop-shadow-md">Pick Log</h2>
                                </div>
                                <div className="overflow-y-auto p-3 space-y-2">
                                    {[...picks].reverse().map((pick, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-black/60 border border-white/10 p-2 rounded-md min-w-0 hover:bg-black/90 transition shadow-md">
                                            <div className="flex items-center gap-2 min-w-0 pr-2">
                                                <span className={`text-[10px] sm:text-xs font-mono text-slate-300 font-black shrink-0 w-5 drop-shadow-md ${oswald.className}`}>#{picks.length - idx}</span>
                                                <div className="flex items-center text-[10px] sm:text-xs font-black text-slate-100 min-w-0 drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
                                                    <FlagIcon teamName={pick.team}/>
                                                    <span className="truncate block whitespace-nowrap">{pick.team}</span>
                                                </div>
                                            </div>
                                            <span className="text-[8px] sm:text-[9px] text-sky-400 font-black shrink-0 drop-shadow-md">{pick.drafter}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'matches' && (
                        <div className="max-w-7xl mx-auto space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 mb-3">
                                <div>
                                    <h2 className={`text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-xl [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>ALL SCORES</h2>
                                </div>
                                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                                    <label htmlFor="groupFilter" className="text-[9px] sm:text-[10px] font-mono text-white font-black uppercase tracking-widest shrink-0 drop-shadow-md">Filter:</label>
                                    <select
                                        id="groupFilter"
                                        value={selectedGroupFilter}
                                        onChange={(e) => setSelectedGroupFilter(e.target.value)}
                                        className="bg-black/80 backdrop-blur-xl border border-white/30 text-white font-bold rounded-md px-3 py-1 text-[10px] sm:text-xs focus:outline-none focus:border-emerald-400 transition shadow-lg w-full sm:w-auto"
                                    >
                                        <option value="ALL">All Groups</option>
                                        {groupNames.map(grp => (
                                            <option key={grp} value={grp}>{grp}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {filteredGroupNames.length === 0 ? (
                                <div className="text-center py-6 text-white font-bold bg-black/70 backdrop-blur-xl border border-dashed border-white/30 rounded-xl text-[10px] sm:text-xs shadow-2xl drop-shadow-md">
                                    <p>No matches found for the selected filter.</p>
                                </div>
                            ) : (
                                filteredGroupNames.map(group => {
                                    const groupMatches = matches.filter(m => m.group === group);
                                    const groupTable = getRealGroupStandings(groupMatches);

                                    return (
                                        <div key={group} className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl">
                                            <div className="bg-black/80 px-3 sm:px-4 py-2 border-b border-white/20 flex justify-between items-center">
                                                <h3 className={`font-black text-[#fbbf24] text-xs sm:text-sm uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>{group}</h3>
                                                <span className="text-[8px] sm:text-[9px] text-slate-300 font-bold font-mono uppercase tracking-widest drop-shadow-md">Top 2 advance</span>
                                            </div>

                                            <div className="flex flex-col lg:flex-row">
                                                <div className="w-full lg:w-[35%] xl:w-[30%] border-b lg:border-b-0 lg:border-r border-white/20 overflow-x-auto flex bg-black/60">
                                                    <table className="w-full text-left text-[10px] sm:text-[11px] min-w-[280px]">
                                                        <thead>
                                                        <tr className="border-b border-white/10 text-slate-300 text-[8px] sm:text-[9px] uppercase font-mono bg-black/80 font-black">
                                                            <th className="py-2 px-3 drop-shadow-md">Team</th>
                                                            <th className="py-2 text-center w-5 drop-shadow-md">MP</th>
                                                            <th className="py-2 text-center w-5 drop-shadow-md">W</th>
                                                            <th className="py-2 text-center w-5 drop-shadow-md">D</th>
                                                            <th className="py-2 text-center w-5 drop-shadow-md">L</th>
                                                            <th className="py-2 text-center w-5 drop-shadow-md">GF</th>
                                                            <th className="py-2 text-center w-5 drop-shadow-md">GA</th>
                                                            <th className="py-2 text-center w-7 pr-3 drop-shadow-md">PTS</th>
                                                        </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white/10">
                                                        {groupTable.map((teamRow) => (
                                                            <tr key={teamRow.name} className="hover:bg-black/50 transition">
                                                                <td className="py-2 px-3 font-black text-slate-100 drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
                                                                    <div className="flex items-center whitespace-nowrap min-w-0">
                                                                        <FlagIcon teamName={teamRow.name}/>
                                                                        <span className="truncate block whitespace-nowrap">{teamRow.name}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-2 text-center text-white font-bold font-mono drop-shadow-md">{teamRow.mp}</td>
                                                                <td className="py-2 text-center text-white font-bold font-mono drop-shadow-md">{teamRow.w}</td>
                                                                <td className="py-2 text-center text-white font-bold font-mono drop-shadow-md">{teamRow.d}</td>
                                                                <td className="py-2 text-center text-white font-bold font-mono drop-shadow-md">{teamRow.l}</td>
                                                                <td className="py-2 text-center text-white font-bold font-mono drop-shadow-md">{teamRow.gf}</td>
                                                                <td className="py-2 text-center text-white font-bold font-mono drop-shadow-md">{teamRow.ga}</td>
                                                                <td className={`py-2 text-center font-black text-[#fbbf24] pr-3 text-sm sm:text-base drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>{teamRow.pts}</td>
                                                            </tr>
                                                        ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                <div className="w-full lg:w-[65%] xl:w-[70%] p-2.5 sm:p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5 content-start bg-transparent">
                                                    {groupMatches.map(m => {
                                                        const homeDrafter = getDrafterForTeam(m.homeTeam);
                                                        const awayDrafter = getDrafterForTeam(m.awayTeam);

                                                        const isHomeWin = m.winner === m.homeTeam;
                                                        const isAwayWin = m.winner === m.awayTeam;

                                                        const homeNameColor = isHomeWin ? 'font-black text-emerald-400' : isAwayWin ? 'font-bold text-rose-400' : 'font-black text-slate-100';
                                                        const awayNameColor = isAwayWin ? 'font-black text-emerald-400' : isHomeWin ? 'font-bold text-rose-400' : 'font-black text-slate-100';

                                                        const homeScoreColor = isHomeWin ? 'text-emerald-400' : isAwayWin ? 'text-rose-400' : 'text-[#fbbf24]';
                                                        const awayScoreColor = isAwayWin ? 'text-emerald-400' : isHomeWin ? 'text-rose-400' : 'text-[#fbbf24]';

                                                        return (
                                                            <div key={m.id} className="flex items-center justify-between p-2.5 bg-black/60 border border-white/20 rounded-lg hover:bg-black/80 hover:border-white/30 transition shadow-xl h-full">
                                                                <div className="flex-1 flex flex-col items-end text-right min-w-0">
                                                                    <div className="flex items-center gap-1.5 w-full justify-end min-w-0">
                                                                        <span className={`text-[10px] sm:text-xs truncate drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${homeNameColor}`}>{m.homeTeam}</span>
                                                                        <div className="shrink-0"><FlagIcon teamName={m.homeTeam} /></div>
                                                                    </div>
                                                                    {homeDrafter && <span className="text-[8px] sm:text-[9px] text-sky-400 font-black font-mono mt-1 shrink-0 truncate max-w-full drop-shadow-md">{homeDrafter}</span>}
                                                                </div>

                                                                <div className="mx-2 flex flex-col items-center shrink-0 min-w-[55px] sm:min-w-[65px]">
                                                                    <div className="flex items-center justify-center gap-1.5 bg-black/80 px-2 py-1 rounded-md border border-white/20 w-full shadow-inner mb-1">
                                                                        <span className={`font-black text-lg sm:text-xl w-4 text-center leading-none drop-shadow-xl [-webkit-text-stroke:0.5px_black] ${homeScoreColor} ${oswald.className}`}>{m.homeGoals !== null ? m.homeGoals : '-'}</span>
                                                                        <span className="text-slate-400 font-black text-[9px] sm:text-[10px] leading-none drop-shadow-md">:</span>
                                                                        <span className={`font-black text-lg sm:text-xl w-4 text-center leading-none drop-shadow-xl [-webkit-text-stroke:0.5px_black] ${awayScoreColor} ${oswald.className}`}>{m.awayGoals !== null ? m.awayGoals : '-'}</span>
                                                                    </div>
                                                                    {m.status === 'IN_PLAY' && <span className="text-[8px] sm:text-[9px] font-black tracking-widest text-red-500 animate-pulse drop-shadow-md">{m.minute ? `${m.minute}'` : 'LIVE'}</span>}
                                                                    {m.status === 'PAUSED' && <span className="text-[8px] sm:text-[9px] font-black tracking-widest text-[#fbbf24] drop-shadow-md">HT</span>}
                                                                    {m.status === 'FINISHED' && <span className="text-[8px] sm:text-[9px] font-black tracking-widest text-emerald-400 drop-shadow-md">FT</span>}
                                                                </div>

                                                                <div className="flex-1 flex flex-col items-start text-left min-w-0">
                                                                    <div className="flex items-center gap-1.5 w-full justify-start min-w-0">
                                                                        <div className="shrink-0"><FlagIcon teamName={m.awayTeam} /></div>
                                                                        <span className={`text-[10px] sm:text-xs truncate drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${awayNameColor}`}>{m.awayTeam}</span>
                                                                    </div>
                                                                    {awayDrafter && <span className="text-[8px] sm:text-[9px] text-sky-400 font-black font-mono mt-1 shrink-0 truncate max-w-full drop-shadow-md">{awayDrafter}</span>}
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

                    {activeTab === 'schedule' && (
                        <div className="max-w-7xl mx-auto space-y-4">
                            <h2 className={`text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-xl [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>MATCH SCHEDULE</h2>
                            <ScheduleTab/>
                        </div>
                    )}

                    {activeTab === 'standings' && (
                        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
                            <h2 className={`text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-xl [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>LEADERBOARD</h2>

                            <div className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl p-3 sm:p-4 shadow-2xl hidden md:block">
                                <h3 className="text-[10px] sm:text-xs font-mono font-black text-slate-300 uppercase tracking-widest mb-2 drop-shadow-md">Point System</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-y-1 gap-x-3 text-[10px] sm:text-xs">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5"><span className={`text-[#fbbf24] font-black w-5 text-right drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+4</span> <span className="text-white font-bold drop-shadow-md">Win Match</span></div>
                                        <div className="flex items-center gap-1.5"><span className={`text-[#fbbf24] font-black w-5 text-right drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+8</span> <span className="text-white font-bold drop-shadow-md">Advance</span></div>
                                        <div className="flex items-center gap-1.5"><span className={`text-[#fbbf24] font-black w-5 text-right drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+20</span> <span className="text-white font-bold drop-shadow-md">Win SF</span></div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5"><span className={`text-[#fbbf24] font-black w-5 text-right drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+2</span> <span className="text-white font-bold drop-shadow-md">Group Draw</span></div>
                                        <div className="flex items-center gap-1.5"><span className={`text-[#fbbf24] font-black w-5 text-right drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+10</span> <span className="text-white font-bold drop-shadow-md">Win R32</span></div>
                                        <div className="flex items-center gap-1.5"><span className={`text-[#fbbf24] font-black w-5 text-right drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+10</span> <span className="text-white font-bold drop-shadow-md">Win 3rd</span></div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5"><span className={`text-[#fbbf24] font-black w-5 text-right drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+1</span> <span className="text-white font-bold drop-shadow-md">Goal Scored</span></div>
                                        <div className="flex items-center gap-1.5"><span className={`text-[#fbbf24] font-black w-5 text-right drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+12</span> <span className="text-white font-bold drop-shadow-md">Win R16</span></div>
                                        <div className="flex items-center gap-1.5"><span className={`text-[#fbbf24] font-black w-5 text-right drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+30</span> <span className="text-white font-bold drop-shadow-md">Win Final</span></div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5"><span className={`text-[#fbbf24] font-black w-5 text-right drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+2</span> <span className="text-white font-bold drop-shadow-md">Clean Sheet</span></div>
                                        <div className="flex items-center gap-1.5"><span className={`text-[#fbbf24] font-black w-5 text-right drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>+15</span> <span className="text-white font-bold drop-shadow-md">Win QF</span></div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3 sm:gap-4">
                                {overallLeaders.slice(0, 3).map((leader, i) => (
                                    <div key={leader.name} className={`backdrop-blur-xl rounded-xl flex flex-col items-center justify-center p-3 sm:p-5 text-center transition-all duration-300 ${
                                        i === 0 ? 'bg-gradient-to-b from-amber-500/80 to-yellow-800/90 border border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.6)]' :
                                            i === 1 ? 'bg-gradient-to-b from-slate-400/80 to-slate-700/90 border border-slate-300 shadow-[0_0_30px_rgba(203,213,225,0.5)]' :
                                                'bg-gradient-to-b from-orange-600/80 to-amber-900/90 border border-orange-500 shadow-[0_0_30px_rgba(194,65,12,0.6)]'
                                    }`}>
                                        <span className="text-3xl sm:text-4xl mb-1.5 drop-shadow-xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                                        <h3 className="text-sm sm:text-base font-black text-white mb-1 tracking-wide truncate w-full px-1 drop-shadow-md [text-shadow:0_1px_2px_black]">{leader.name}</h3>
                                        <div className={`text-3xl sm:text-5xl font-black text-white leading-none mb-1.5 drop-shadow-2xl [-webkit-text-stroke:1px_black] ${oswald.className}`}>{leader.totalPoints}</div>
                                        <span className="text-[9px] sm:text-[10px] text-white font-bold font-mono mb-2 uppercase tracking-widest hidden sm:block drop-shadow-md [text-shadow:0_1px_2px_black]">Points</span>
                                        <div className="flex flex-wrap justify-center gap-1.5 px-1 scale-110">
                                            {leader.teams.map(t => <div key={t} title={t}><FlagIcon teamName={t} /></div>)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl overflow-x-auto">
                                <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[600px] sm:min-w-[800px]">
                                    <thead>
                                    <tr className="border-b border-white/20 text-slate-300 text-[9px] sm:text-[10px] uppercase font-mono bg-black/80 tracking-widest font-black">
                                        <th className="py-2.5 sm:py-3 pl-4 w-10 sm:w-12 drop-shadow-md">#</th>
                                        <th className="py-2.5 sm:py-3 w-32 sm:w-40 drop-shadow-md">Drafter</th>
                                        <th className="py-2.5 sm:py-3 w-16 sm:w-20 drop-shadow-md">PTS</th>
                                        <th className="py-2.5 sm:py-3 drop-shadow-md">Teams</th>
                                        <th className="py-2.5 sm:py-3 text-center w-10 sm:w-12 drop-shadow-md">W</th>
                                        <th className="py-2.5 sm:py-3 text-center w-10 sm:w-12 drop-shadow-md">D</th>
                                        <th className="py-2.5 sm:py-3 text-center w-10 sm:w-12 drop-shadow-md">L</th>
                                        <th className="py-2.5 sm:py-3 text-center w-10 sm:w-12 drop-shadow-md">GF</th>
                                        <th className="py-2.5 sm:py-3 text-center pr-4 w-10 sm:w-12 drop-shadow-md">CS</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10">
                                    {overallLeaders.map((row, index) => (
                                        <tr key={row.name} className="hover:bg-black/50 transition">
                                            <td className={`py-2 sm:py-2.5 pl-4 font-black text-slate-100 text-sm sm:text-base drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${oswald.className}`}>{index + 1}</td>
                                            <td className="py-2 sm:py-2.5">
                                                <button
                                                    onClick={() => setSelectedManager(row)}
                                                    className="font-black text-xs sm:text-sm text-sky-400 hover:text-[#fbbf24] transition text-left truncate max-w-[100px] sm:max-w-[150px] drop-shadow-md [text-shadow:0_1px_2px_black]"
                                                >
                                                    {row.name}
                                                </button>
                                            </td>
                                            <td className={`py-2 sm:py-2.5 font-black text-[#fbbf24] text-base sm:text-lg drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>{row.totalPoints}</td>
                                            <td className="py-2 sm:py-2.5">
                                                <div className="flex gap-1 sm:gap-1.5 flex-wrap">
                                                    {row.teams.map(t => <div key={t} title={t}><FlagIcon teamName={t} /></div>)}
                                                </div>
                                            </td>
                                            <td className={`py-2 sm:py-2.5 text-center font-black text-emerald-400 text-xs sm:text-sm drop-shadow-md ${oswald.className}`}>{row.wins}</td>
                                            <td className={`py-2 sm:py-2.5 text-center font-black text-slate-100 text-xs sm:text-sm drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${oswald.className}`}>{row.draws}</td>
                                            <td className={`py-2 sm:py-2.5 text-center font-black text-rose-400 text-xs sm:text-sm drop-shadow-md ${oswald.className}`}>{row.losses}</td>
                                            <td className={`py-2 sm:py-2.5 text-center font-black text-slate-100 text-xs sm:text-sm drop-shadow-[0_2px_2px_rgba(0,0,0,1)] ${oswald.className}`}>{row.totalGoals}</td>
                                            <td className={`py-2 sm:py-2.5 text-center font-black text-blue-400 pr-4 text-xs sm:text-sm drop-shadow-md ${oswald.className}`}>{row.totalCleanSheets}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'awards' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 max-w-7xl mx-auto">
                            <div className="bg-gradient-to-br from-amber-500/30 to-orange-600/30 p-[1px] rounded-xl shadow-2xl h-full drop-shadow-lg">
                                <div className="bg-black/70 backdrop-blur-xl p-4 sm:p-6 rounded-xl h-full flex flex-col">
                                    <div className="flex items-center gap-3 sm:gap-4 mb-4 border-b border-white/20 pb-3">
                                        <div className="bg-black/80 p-2.5 rounded-xl border border-amber-400/50 shadow-inner">
                                            <span className="text-3xl sm:text-4xl block leading-none drop-shadow-md">⚽</span>
                                        </div>
                                        <div>
                                            <h2 className={`text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>Golden Boot</h2>
                                            <p className="text-[#fbbf24] text-[9px] sm:text-[10px] font-mono font-black tracking-widest uppercase mt-1 drop-shadow-md [text-shadow:0_1px_2px_black]">15% Pot • Most Goals</p>
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
                                                <div key={row.name} className={`flex justify-between items-center p-3 sm:p-4 rounded-xl border transition-all ${idx === 0 ? 'bg-black/80 border-amber-400/50 shadow-xl scale-[1.02]' : 'bg-black/50 border-white/20 hover:border-white/40 hover:bg-black/70 shadow-lg'}`}>
                                                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                                        <span className={`font-black text-xl sm:text-2xl w-6 sm:w-8 shrink-0 text-center drop-shadow-lg ${idx === 0 ? 'text-[#fbbf24]' : 'text-white'}`}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`}</span>
                                                        <div className="flex flex-col min-w-0 pr-2">
                                                            <span className={`font-black text-sm sm:text-base md:text-lg leading-tight break-words whitespace-normal text-sky-400 drop-shadow-md [text-shadow:0_1px_2px_black]`}>{row.name}</span>
                                                            <span className="text-[9px] sm:text-[10px] text-slate-300 font-bold mt-0.5 max-w-[140px] sm:max-w-[220px] truncate drop-shadow-md" title={breakdownText}>
                                                                {breakdownText || "No goals yet"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end shrink-0">
                                                        <span className={`font-black text-3xl sm:text-4xl md:text-5xl leading-none drop-shadow-xl [-webkit-text-stroke:1px_black] ${idx === 0 ? 'text-[#fbbf24]' : 'text-slate-100'} ${oswald.className}`}>{row.totalGoals}</span>
                                                        <span className="text-[8px] sm:text-[9px] text-slate-400 font-mono font-bold uppercase tracking-widest mt-1 drop-shadow-md">Goals</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-blue-400/30 to-blue-700/30 p-[1px] rounded-xl shadow-2xl h-full drop-shadow-lg">
                                <div className="bg-black/70 backdrop-blur-xl p-6 sm:p-8 rounded-xl h-full flex flex-col">
                                    <div className="flex items-center gap-3 sm:gap-4 mb-4 border-b border-white/20 pb-3">
                                        <div className="bg-black/80 p-2.5 rounded-xl border border-blue-400/50 shadow-inner">
                                            <span className="text-3xl sm:text-4xl block leading-none drop-shadow-md">🧤</span>
                                        </div>
                                        <div>
                                            <h2 className={`text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-blue-500 uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>Golden Glove</h2>
                                            <p className="text-blue-300 text-[9px] sm:text-[10px] font-mono font-black tracking-widest uppercase mt-1 drop-shadow-md [text-shadow:0_1px_2px_black]">10% Pot • Clean Sheets</p>
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
                                                <div key={row.name} className={`flex justify-between items-center p-3 sm:p-4 rounded-xl border transition-all ${idx === 0 ? 'bg-black/80 border-blue-400/50 shadow-xl scale-[1.02]' : 'bg-black/50 border-white/20 hover:border-white/40 hover:bg-black/70 shadow-lg'}`}>
                                                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                                        <span className={`font-black text-xl sm:text-2xl w-6 sm:w-8 shrink-0 text-center drop-shadow-lg ${idx === 0 ? 'text-blue-400' : 'text-white'}`}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}.`}</span>
                                                        <div className="flex flex-col min-w-0 pr-2">
                                                            <span className={`font-black text-sm sm:text-base md:text-lg leading-tight break-words whitespace-normal text-sky-400 drop-shadow-md [text-shadow:0_1px_2px_black]`}>{row.name}</span>
                                                            <span className="text-[9px] sm:text-[10px] text-slate-300 font-bold mt-0.5 max-w-[140px] sm:max-w-[220px] truncate drop-shadow-md" title={breakdownText}>
                                                                {breakdownText || "No clean sheets yet"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end shrink-0">
                                                        <span className={`font-black text-3xl sm:text-4xl md:text-5xl leading-none drop-shadow-xl [-webkit-text-stroke:1px_black] ${idx === 0 ? 'text-blue-400' : 'text-slate-100'} ${oswald.className}`}>{row.totalCleanSheets}</span>
                                                        <span className="text-[8px] sm:text-[9px] text-slate-400 font-mono font-bold uppercase tracking-widest mt-1 drop-shadow-md">Sheets</span>
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
                        <div className="max-w-7xl mx-auto space-y-6">
                            <h2 className={`text-2xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] to-orange-500 uppercase tracking-widest drop-shadow-xl [-webkit-text-stroke:1px_black] ${oswald.className}`}>LEAGUE RULES & PAYOUTS</h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">

                                <div className="bg-gradient-to-br from-emerald-500/30 to-teal-600/30 p-[1px] rounded-xl shadow-2xl h-full drop-shadow-lg">
                                    <div className="bg-black/70 backdrop-blur-xl p-6 sm:p-8 rounded-xl h-full flex flex-col">
                                        <div className="flex items-center gap-4 sm:gap-5 mb-6 border-b border-white/20 pb-5">
                                            <div className="bg-black/80 p-3 sm:p-4 rounded-xl border border-emerald-400/50 shadow-inner">
                                                <span className="text-4xl sm:text-5xl block leading-none drop-shadow-md">💰</span>
                                            </div>
                                            <div>
                                                <h2 className={`text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 to-emerald-500 uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>Prize Pool</h2>
                                                <p className="text-emerald-300 text-xs sm:text-sm font-mono font-black tracking-widest uppercase mt-1.5 drop-shadow-md [text-shadow:0_2px_4px_black]">Entry & Payout Structure</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center bg-black/60 border border-white/10 p-4 rounded-xl shadow-md">
                                                <span className="text-slate-200 font-black text-lg sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black]">1st Place (Overall)</span>
                                                <span className={`text-emerald-400 font-black text-2xl sm:text-3xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>50%</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-black/60 border border-white/10 p-4 rounded-xl shadow-md">
                                                <span className="text-slate-200 font-black text-lg sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black]">2nd Place (Overall)</span>
                                                <span className={`text-emerald-400 font-black text-2xl sm:text-3xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>25%</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-black/60 border border-white/10 p-4 rounded-xl shadow-md">
                                                <span className="text-slate-200 font-black text-lg sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black]">Golden Boot</span>
                                                <span className={`text-amber-400 font-black text-2xl sm:text-3xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>15%</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-black/60 border border-white/10 p-4 rounded-xl shadow-md">
                                                <span className="text-slate-200 font-black text-lg sm:text-xl drop-shadow-md [-webkit-text-stroke:0.5px_black]">Golden Glove</span>
                                                <span className={`text-blue-400 font-black text-2xl sm:text-3xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>10%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-amber-500/30 to-orange-600/30 p-[1px] rounded-xl shadow-2xl h-full drop-shadow-lg">
                                    <div className="bg-black/70 backdrop-blur-xl p-6 sm:p-8 rounded-xl h-full flex flex-col">
                                        <div className="flex items-center gap-4 sm:gap-5 mb-6 border-b border-white/20 pb-5">
                                            <div className="bg-black/80 p-3 sm:p-4 rounded-xl border border-amber-400/50 shadow-inner">
                                                <span className="text-4xl sm:text-5xl block leading-none drop-shadow-md">📊</span>
                                            </div>
                                            <div>
                                                <h2 className={`text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>Scoring System</h2>
                                                <p className="text-[#fbbf24] text-xs sm:text-sm font-mono font-black tracking-widest uppercase mt-1.5 drop-shadow-md [text-shadow:0_2px_4px_black]">How To Earn Points</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="bg-black/60 border border-white/10 p-4 rounded-xl shadow-md flex items-center gap-3">
                                                <span className={`text-[#fbbf24] font-black text-2xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+4</span>
                                                <span className="text-white font-black text-sm uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win Match</span>
                                            </div>
                                            <div className="bg-black/60 border border-white/10 p-4 rounded-xl shadow-md flex items-center gap-3">
                                                <span className={`text-[#fbbf24] font-black text-2xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+2</span>
                                                <span className="text-white font-black text-sm uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black]">Group Draw</span>
                                            </div>
                                            <div className="bg-black/60 border border-white/10 p-4 rounded-xl shadow-md flex items-center gap-3">
                                                <span className={`text-[#fbbf24] font-black text-2xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+1</span>
                                                <span className="text-white font-black text-sm uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black]">Goal Scored</span>
                                            </div>
                                            <div className="bg-black/60 border border-white/10 p-4 rounded-xl shadow-md flex items-center gap-3">
                                                <span className={`text-[#fbbf24] font-black text-2xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+2</span>
                                                <span className="text-white font-black text-sm uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black]">Clean Sheet</span>
                                            </div>
                                            <div className="bg-black/60 border border-white/10 p-4 rounded-xl shadow-md flex items-center gap-3 sm:col-span-2">
                                                <span className={`text-[#fbbf24] font-black text-2xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+8</span>
                                                <span className="text-white font-black text-sm uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black]">Advance out of Group</span>
                                            </div>

                                            <div className="col-span-1 sm:col-span-2 mt-2">
                                                <h3 className="text-slate-300 font-mono text-xs uppercase tracking-widest font-black mb-3 border-b border-white/10 pb-2 drop-shadow-md">Knockout Stage Bonuses</h3>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="flex justify-between items-center text-sm font-black">
                                                        <span className="text-white drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win R32</span>
                                                        <span className={`text-[#fbbf24] text-xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+10</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm font-black">
                                                        <span className="text-white drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win R16</span>
                                                        <span className={`text-[#fbbf24] text-xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+12</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm font-black">
                                                        <span className="text-white drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win QF</span>
                                                        <span className={`text-[#fbbf24] text-xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+15</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm font-black">
                                                        <span className="text-white drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win SF</span>
                                                        <span className={`text-[#fbbf24] text-xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+20</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm font-black">
                                                        <span className="text-white drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win 3rd</span>
                                                        <span className={`text-[#fbbf24] text-xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+10</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm font-black">
                                                        <span className="text-white drop-shadow-md [-webkit-text-stroke:0.5px_black]">Win Final</span>
                                                        <span className={`text-[#fbbf24] text-xl drop-shadow-md [-webkit-text-stroke:1px_black] ${oswald.className}`}>+30</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* LEAGUE FORMAT SUMMARY */}
                            <div className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl mt-8">
                                <div className="bg-black/80 px-6 py-4 border-b border-white/20 flex justify-between items-center">
                                    <h3 className={`font-black text-white text-xl sm:text-2xl uppercase tracking-widest drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>Format & Guidelines</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 sm:p-8">

                                    <div>
                                        <h4 className="text-sky-400 font-black uppercase tracking-widest text-sm mb-4 flex items-center gap-2 border-b border-white/10 pb-2 drop-shadow-md"><span className="text-xl">👥</span> Draft & Teams</h4>
                                        <ul className="space-y-3 text-sm text-slate-200 font-semibold drop-shadow-md leading-relaxed">
                                            <li><span className="text-sky-400 mr-2">■</span> Exactly 12 players participate.</li>
                                            <li><span className="text-sky-400 mr-2">■</span> Each player drafts 4 national teams via a snake draft format.</li>
                                            <li><span className="text-sky-400 mr-2">■</span> All 48 tournament teams are drafted, meaning every match affects the standings.</li>
                                            <li><span className="text-sky-400 mr-2">■</span> Drafts are locked before the June 11, 2026 kickoff.</li>
                                            <li><span className="text-sky-400 mr-2">■</span> No trades are allowed after the draft closes.</li>
                                        </ul>
                                    </div>

                                    <div>
                                        <h4 className="text-sky-400 font-black uppercase tracking-widest text-sm mb-4 flex items-center gap-2 border-b border-white/10 pb-2 drop-shadow-md"><span className="text-xl">⚖️</span> Tie-Breakers & Rules</h4>
                                        <ul className="space-y-3 text-sm text-slate-200 font-semibold drop-shadow-md leading-relaxed">
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

                </div>
            </div>
        </div>
    );
}