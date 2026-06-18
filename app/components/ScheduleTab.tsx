"use client";
import { useState, useEffect } from 'react';
import * as Flags from 'country-flag-icons/react/3x2';
import { Oswald } from 'next/font/google';

const oswald = Oswald({ subsets: ['latin'], weight: ['400', '700'] });

// Brought in your exact flag mapper so it renders natively without external image URLs
const FlagIcon = ({ teamName }: { teamName: string }) => {
    if (!teamName || teamName === 'TBD') return <span className="w-8 h-6 inline-block bg-white/10 rounded-sm shadow-sm shrink-0" />;

    if (teamName === 'Scotland') return <span className="inline-block text-2xl leading-none shrink-0">🏴󠁧󠁢󠁳󠁣󠁴󠁿</span>;
    if (teamName === 'England') return <span className="inline-block text-2xl leading-none shrink-0">🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>;
    if (teamName === 'Wales') return <span className="inline-block text-2xl leading-none shrink-0">🏴󠁧󠁢󠁷󠁬󠁳󠁿</span>;

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
    if (!code) return <span className="w-8 h-6 inline-block bg-white/10 rounded-sm shadow-sm shrink-0" />;
    const FlagComponent = (Flags as any)[code];
    return FlagComponent ? <FlagComponent className="w-8 h-6 rounded-sm shadow-md object-cover shrink-0" /> : <span className="w-8 h-6 inline-block bg-white/10 rounded-sm shadow-sm shrink-0" />;
};

export default function ScheduleTab() {
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [games, setGames] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        async function fetchGames() {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/schedule?date=${selectedDate}`);
                const data = await res.json();

                if (data.success && data.matches) {
                    setGames(data.matches);
                } else {
                    setGames([]);
                }
            } catch (error) {
                console.error("Error fetching schedule:", error);
            }
            setIsLoading(false);
        }

        fetchGames();
    }, [selectedDate]);

    return (
        <div className="flex flex-col space-y-6 w-full max-w-4xl mx-auto p-4 text-white">

            {/* Date Selector - Glass effect */}
            <div className="flex justify-center">
                <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-black/30 backdrop-blur-md border border-white/20 text-white rounded-lg px-4 py-2 font-mono uppercase tracking-widest text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition cursor-pointer shadow-lg hover:bg-black/40 drop-shadow-md"
                />
            </div>

            {/* Game Board */}
            {isLoading ? (
                <div className="text-center text-slate-100 font-bold mt-10 animate-pulse bg-black/30 backdrop-blur-md border border-white/20 py-8 rounded-xl shadow-lg drop-shadow-md">
                    Scanning Schedule...
                </div>
            ) : games.length === 0 ? (
                <div className="text-center text-slate-200 mt-10 bg-black/30 backdrop-blur-md border border-dashed border-white/30 py-8 rounded-xl font-mono text-sm uppercase tracking-widest shadow-lg drop-shadow-md">
                    No games scheduled for this date.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {games.map((game, index) => (
                        // Match Card Bubble - Using bg-black/30 and backdrop-blur-md for frosted glass
                        <div key={index} className="bg-black/30 backdrop-blur-md border border-white/10 rounded-xl p-5 flex flex-col items-center shadow-xl hover:bg-black/40 transition duration-300">

                            {/* Match Time / Status */}
                            <div className="text-[11px] text-slate-200 mb-5 font-mono uppercase tracking-widest drop-shadow-md font-bold">
                                {game.status === 'FINISHED' ? 'Final' : new Date(game.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>

                            {/* Scoreboard / Matchup */}
                            <div className="flex justify-between items-center w-full px-2">
                                <div className="flex flex-col items-center flex-1 text-center min-w-0">
                                    <div className="mb-2 drop-shadow-lg"><FlagIcon teamName={game.homeTeam} /></div>
                                    <span className="font-bold text-sm text-white truncate w-full drop-shadow-md">{game.homeTeam}</span>
                                </div>

                                {/* Inner Score Pill - slightly darker glass */}
                                <div className="flex items-center justify-center gap-2 bg-black/40 backdrop-blur-lg px-4 py-2 rounded-lg border border-white/10 mx-4 shadow-inner">
                                    <span className={`text-2xl font-black text-[#fbbf24] w-4 text-center drop-shadow-lg ${oswald.className}`}>{game.homeGoals ?? '-'}</span>
                                    <span className="text-slate-300 text-sm drop-shadow-md">:</span>
                                    <span className={`text-2xl font-black text-[#fbbf24] w-4 text-center drop-shadow-lg ${oswald.className}`}>{game.awayGoals ?? '-'}</span>
                                </div>

                                <div className="flex flex-col items-center flex-1 text-center min-w-0">
                                    <div className="mb-2 drop-shadow-lg"><FlagIcon teamName={game.awayTeam} /></div>
                                    <span className="font-bold text-sm text-white truncate w-full drop-shadow-md">{game.awayTeam}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}