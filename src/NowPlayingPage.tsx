import React, { useEffect, useState } from 'react';

const NowPlayingPage: React.FC = () => {
    const [nowPlaying, setNowPlaying] = useState<string | null>(null);

    useEffect(() => {
        // Fetch the current playing track
        setNowPlaying('Now playing track: Track A by Artist B');
    }, []);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-800 text-white p-4">
            <h1 className="text-4xl font-bold mb-6">Now Playing</h1>
            <div className="w-full max-w-md bg-gray-700 rounded-lg p-6 shadow-lg text-center">
                {nowPlaying ? (
                    <p className="text-2xl">{nowPlaying}</p>
                ) : (
                    <p className="text-xl text-gray-400">Nothing is currently playing.</p>
                )}
            </div>
        </div>
    );
};

export default NowPlayingPage;
