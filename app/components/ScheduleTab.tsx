"use client";
import { useState, useEffect } from 'react';
import * as Flags from 'country-flag-icons/react/3x2';
import { Oswald } from 'next/font/google';

const oswald = Oswald({ subsets: ['latin'], weight: ['400', '700'] });

const FlagIcon = ({ teamName }: { teamName: string }) => {
    if (!teamName || teamName === 'TBD') return <span className="w-8 h-6 inline-block bg-white/10 rounded-sm shadow-sm shrink-0" />;

    if (teamName === 'Scotland') return <span className="inline-block text-2xl leading-none shrink-0 drop-shadow-md">🏴󠁧󠁢󠁳󠁣󠁴󠁿</span>;
    if (teamName === 'England') return <span className="inline-block text-2xl leading-none shrink-0 drop-shadow-md">🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>;
    if (teamName === 'Wales') return <span className="inline-block text-2xl leading-none shrink-0 drop-shadow-md">🏴󠁧󠁢󠁷󠁬󠁳󠁿</span>;

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
    return FlagComponent ? <FlagComponent className="w-8 h-6 rounded-sm shadow-lg object-cover shrink-0 drop-shadow-md" /> : <span className="w-8 h-6 inline-block bg-white/10 rounded-sm shadow-sm shrink-0" />;
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

    const getSurroundingDays = (centerDateStr: string) => {
        const baseDate = new Date(centerDateStr + 'T12:00:00Z');
        const days = [];
        for (let i = -3; i <= 3; i++) {
            const d = new Date(baseDate);
            d.setDate(baseDate.getDate() + i);
            days.push(d.toISOString().split('T')[0]);
        }
        return days;
    };

    const formatDayLabel = (dateStr: string) => {
        const d = new Date(dateStr + 'T12:00:00Z');
        return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    };

    const surroundingDays = getSurroundingDays(selectedDate);

    return (
        <div className="flex flex-col space-y-6 w-full max-w-4xl mx-auto p-2 sm:p-4 text-white">

            <div className="flex flex-col items-center bg-gradient-to-r from-black/40 via-black/80 to-black/40 backdrop-blur-md border-y border-white/20 py-4 sm:py-5 shadow-2xl relative">

                <div className="flex w-full justify-between items-center gap-1.5 sm:gap-2 mb-4 overflow-x-auto no-scrollbar px-2 sm:px-4">
                    {surroundingDays.map((dayStr) => (
                        <button
                            key={dayStr}
                            onClick={() => setSelectedDate(dayStr)}
                            className={`flex flex-col items-center justify-center min-w-[55px] sm:min-w-[75px] py-2 sm:py-2.5 rounded-xl border transition-all duration-300 ${
                                dayStr === selectedDate
                                    ? 'bg-sky-500 border-sky-400 text-white shadow-[0_0_15px_rgba(14,165,233,0.6)] scale-110'
                                    : 'bg-black/60 border-white/10 text-slate-400 hover:bg-black/90 hover:text-white hover:border-white/30'
                            }`}
                        >
                            <span className={`text-[10px] sm:text-xs font-mono uppercase tracking-widest ${dayStr === selectedDate ? 'font-bold' : 'font-semibold'}`}>
                                {formatDayLabel(dayStr).split(' ')[0]}
                            </span>
                            <span className={`text-xl sm:text-3xl font-black mt-0.5 ${dayStr === selectedDate ? 'drop-shadow-md' : ''} ${oswald.className}`}>
                                {formatDayLabel(dayStr).split(' ')[1]}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2 sm:gap-3 bg-black/50 px-4 py-2 rounded-full border border-white/10">
                    <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-slate-300 font-bold">Jump to:</span>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent text-sky-400 font-mono uppercase tracking-widest text-xs sm:text-sm font-black focus:outline-none cursor-pointer"
                    />
                </div>
            </div>

            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />

            {isLoading ? (
                <div className="text-center text-sky-400 font-bold mt-2 animate-pulse bg-black/70 backdrop-blur-xl border border-white/10 py-8 rounded-xl shadow-2xl text-sm sm:text-base">
                    Scanning Schedule...
                </div>
            ) : games.length === 0 ? (
                <div className="text-center text-slate-200 mt-2 bg-black/70 backdrop-blur-xl border border-dashed border-white/30 py-8 rounded-xl font-mono text-sm sm:text-base uppercase tracking-widest shadow-2xl font-bold">
                    No games scheduled for this date.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {games.map((game, index) => (
                        <div key={index} className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl p-4 sm:p-5 flex flex-col items-center shadow-2xl hover:bg-black/80 hover:border-white/40 transition duration-300">

                            <div className="text-xs sm:text-sm text-emerald-400 mb-4 font-mono uppercase tracking-widest drop-shadow-md font-black bg-black/80 px-4 py-1.5 rounded-full border border-white/10 shadow-inner [-webkit-text-stroke:0.5px_black]">
                                {game.status === 'FINISHED' ? 'Final' : new Date(game.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>

                            <div className="flex justify-between items-center w-full px-1 sm:px-2">
                                <div className="flex flex-col items-center flex-1 text-center min-w-0">
                                    <div className="mb-2 drop-shadow-xl scale-110 shrink-0"><FlagIcon teamName={game.homeTeam} /></div>
                                    <span className="font-black text-sm sm:text-base md:text-lg text-white truncate w-full drop-shadow-xl [text-shadow:0_1px_3px_black] block">{game.homeTeam}</span>
                                </div>

                                <div className="flex items-center justify-center gap-2 bg-black/90 backdrop-blur-md px-3 sm:px-4 py-2 rounded-xl border border-white/20 mx-2 shadow-inner shrink-0">
                                    <span className={`text-2xl sm:text-3xl font-black text-[#fbbf24] w-6 text-center drop-shadow-2xl [-webkit-text-stroke:1px_black] ${oswald.className}`}>{game.homeGoals ?? '-'}</span>
                                    <span className="text-slate-400 text-base font-black drop-shadow-md">:</span>
                                    <span className={`text-2xl sm:text-3xl font-black text-[#fbbf24] w-6 text-center drop-shadow-2xl [-webkit-text-stroke:1px_black] ${oswald.className}`}>{game.awayGoals ?? '-'}</span>
                                </div>

                                <div className="flex flex-col items-center flex-1 text-center min-w-0">
                                    <div className="mb-2 drop-shadow-xl scale-110 shrink-0"><FlagIcon teamName={game.awayTeam} /></div>
                                    <span className="font-black text-sm sm:text-base md:text-lg text-white truncate w-full drop-shadow-xl [text-shadow:0_1px_3px_black] block">{game.awayTeam}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}