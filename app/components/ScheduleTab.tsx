import { useState, useEffect } from 'react';

export default function ScheduleTab() {
    // Defaults to today's date in YYYY-MM-DD format
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [games, setGames] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        async function fetchGames() {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/schedule?date=${selectedDate}`);
                const data = await res.json();

                // Adjust ".response" depending on your exact RapidAPI JSON structure
                setGames(data.response || []);
            } catch (error) {
                console.error("Error fetching schedule:", error);
            }
            setIsLoading(false);
        }

        fetchGames();
    }, [selectedDate]); // Automatically re-runs every time the user picks a new date

    return (
        <div className="flex flex-col space-y-6 w-full max-w-4xl mx-auto p-4 text-white">

            {/* Date Selector */}
            <div className="flex justify-center">
                <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-md p-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* Game Board */}
            {isLoading ? (
                <div className="text-center text-gray-400 font-bold mt-10">Loading games...</div>
            ) : games.length === 0 ? (
                <div className="text-center text-gray-400 mt-10">No games scheduled for this date.</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {games.map((game, index) => (
                        <div key={index} className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex flex-col items-center shadow-lg">

                            {/* Match Time */}
                            <div className="text-sm text-gray-400 mb-4 font-semibold tracking-widest">
                                {new Date(game.fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>

                            {/* Scoreboard / Matchup */}
                            <div className="flex justify-between items-center w-full">
                                <div className="flex flex-col items-center flex-1 text-center">
                                    <img src={game.teams.home.logo} alt="Home" className="w-12 h-12 mb-2 object-contain" />
                                    <span className="font-bold text-sm">{game.teams.home.name}</span>
                                </div>

                                <div className="text-3xl font-black px-6 text-yellow-500">
                                    {game.goals.home ?? '-'} : {game.goals.away ?? '-'}
                                </div>

                                <div className="flex flex-col items-center flex-1 text-center">
                                    <img src={game.teams.away.logo} alt="Away" className="w-12 h-12 mb-2 object-contain" />
                                    <span className="font-bold text-sm">{game.teams.away.name}</span>
                                </div>
                            </div>

                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}