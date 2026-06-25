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

    // Extract the first name, convert to lowercase, and strip special characters
    // "Brian Quintero" -> "brian" -> "/managers/brian.png"
    const firstWord = name.trim().split(/\s+/)[0];
    let fileName = firstWord.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Automated override: maps 'angelo' directly to your new file 'anuzzil.png'
    if (fileName === 'angelo') {
        fileName = 'anuzzil';
    }

    const src = `/managers/${fileName}.png`;

    const sizeClasses = {
        sm: "w-6 h-6 sm:w-8 sm:h-8 rounded-full border border-white/20 object-cover bg-white/10 shrink-0",
        md: "w-12 h-12 sm:w-16 sm:h-16 rounded-full border border-white/20 object-cover bg-white/10 shrink-0",
        lg: "w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-sky-400 object-cover bg-white/10 shrink-0",
        xl: "w-24 h-24 sm:w-32 sm:h-32 rounded-2xl border-2 border-sky-400 object-cover bg-white/10 shrink-0"
    }[size];

    return (
        <img
            src={src}
            alt={name}
            onError={(e) => {
                // Safe UI Fallback: generates initials avatar if file isn't uploaded yet
                (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=0ea5e9&textColor=ffffff`;
            }}
            className={sizeClasses}
        />
    );
};

// Helper to filter out duplicate matches before scoring runs
const getUniqueMatches = (matchesList: any[]) => {
    const seen = new Set();
    return matchesList.filter(m => {
        if (!m) return false;
        const key = m.id || `${m.utcDate}_${m.homeTeam}_${m.awayTeam}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

export default function AutomatedDashboard() {
    const [picks, setPicks] = useState<any[]>([]);
    const [drafters, setDrafters] = useState<string[]>([]);
    const [matches, setMatches] = useState<any[]>([]);

    const [activeTab, setActiveTab] = useState<'draft' | 'matches' | 'schedule' | 'standings' | 'awards' | 'rules'>('standings');

    const [draftSearch, setDraftSearch] = useState<string>('');
    const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
    const [selectedManager, setSelectedManager] = useState<any | null>(null);

    // Toggle state for live standings projections
    const [showProjected, setShowProjected] = useState<boolean>(false);

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

    const uniqueMatches = getUniqueMatches(matches);

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

            uniqueMatches.forEach(m => {
                const isHome = m.homeTeam && teamsMatch(m.homeTeam, teamId);
                const isAway = m.awayTeam && teamsMatch(m.awayTeam, teamId);
                if (!isHome && !isAway) return;

                const isFinished = m.status === 'FINISHED' || m.status === 'AWARDED';
                const isLive = m.status === 'IN_PLAY' || m.status === 'PAUSED';

                // Skip scheduled matches
                if (!isFinished && !isLive) return;

                // Exclude live updates if projections are toggled off
                if (isLive && !showProjected) return;

                let matchPts = 0;
                let logDetails: string[] = [];

                // Formulate projected winner using current goals scored for live games
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
                    details: logDetails,
                    isLive: isLive
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

    // Generate dynamic broadcast headlines based on live calculations
    const getTickerHeadlines = () => {
        const headlines: string[] = [];

        if (overallLeaders.length >= 2) {
            headlines.push(`🏆 CURRENT STANDINGS: ${overallLeaders[0].name} leads the league with ${overallLeaders[0].totalPoints} PTS!`);
            headlines.push(`🥈 CHASE IN PROGRESS: ${overallLeaders[1].name} trails the top spot by ${overallLeaders[0].totalPoints - overallLeaders[1].totalPoints} points.`);
        }

        const liveGames = uniqueMatches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
        if (liveGames.length > 0) {
            liveGames.forEach(m => {
                headlines.push(`📺 LIVE NOW: ${m.homeTeam} ${m.homeGoals ?? 0} - ${m.awayGoals ?? 0} ${m.awayTeam} (${m.minute ? `${m.minute}'` : 'HT'})`);
            });
        }

        if (bootLeaders.length > 0 && bootLeaders[0].totalGoals > 0) {
            headlines.push(`⚽ GOLDEN BOOT: ${bootLeaders[0].name} dominates the goal race with ${bootLeaders[0].totalGoals} total goals.`);
        }

        if (gloveLeaders.length > 0 && gloveLeaders[0].totalCleanSheets > 0) {
            headlines.push(`🧤 GOLDEN GLOVE: ${gloveLeaders[0].name} holds the defensive line with ${gloveLeaders[0].totalCleanSheets} clean sheets.`);
        }

        if (headlines.length === 0) {
            headlines.push("📅 Welcome to the League World Cup Dashboard. Complete matchday trackers are live.");
        }

        return headlines;
    };

    const tickerHeadlines = getTickerHeadlines();

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

                /* Horizontal ticker marquee */
                .animate-marquee {
                    display: flex;
                    width: max-content;
                    animation: marquee 50s linear infinite;
                }
                .animate-marquee:hover {
                    animation-play-state: paused;
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
                            {/* Premium profile card header displaying full-size avatar and complete stats reference */}
                            <div className="p-4 sm:p-5 border-b border-white/10 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-black/60 rounded-t-xl shrink-0">
                                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 w-full">
                                    {/* Large Profile Photo */}
                                    <div className="relative shrink-0">
                                        <ManagerAvatar name={selectedManager.name} size="xl" />
                                    </div>

                                    <div className="flex-1 text-center sm:text-left">
                                        <h2 className={`text-xl sm:text-2xl font-black text-sky-400 uppercase tracking-wider drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>
                                            {selectedManager.name}'S DASHBOARD
                                        </h2>

                                        {/* Dashboard Stats Badges Grid */}
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

                                    return (
                                        <div key={team} className="bg-black/70 backdrop-blur-md border border-white/20 rounded-lg overflow-hidden shadow-xl">
                                            <div className="bg-black/90 px-2.5 sm:px-3 py-2 border-b border-white/10 flex justify-between items-center">
                                                <h3 className="font-black text-[10px] sm:text-sm flex items-center text-slate-100 uppercase tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,1)]"><FlagIcon teamName={team} /> {team}</h3>
                                                <span className={`text-[#fbbf24] font-black text-base sm:text-lg drop-shadow-md [-webkit-text-stroke:0.5px_black] ${oswald.className}`}>{teamTotal} PTS</span>
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left text-[9px] sm:text-xs border-collapse min-w-[450px] sm:min-w-[500px]">
                                                    <thead>
                                                    <tr className="border-