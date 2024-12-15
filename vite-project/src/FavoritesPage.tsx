import React, { useEffect, useState } from 'react';

const FavoritesPage: React.FC = () => {
    const [favorites, setFavorites] = useState<string[]>([]);

    useEffect(() => {
        // Fetch the list of favorites
        setFavorites(['Favorite 1', 'Favorite 2', 'Favorite 3']);
    }, []);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-800 text-white p-4">
            <h1 className="text-4xl font-bold mb-6">Favorites</h1>
            <ul className="w-full max-w-md bg-gray-700 rounded-lg p-6 shadow-lg space-y-4">
                {favorites.map((favorite, index) => (
                    <li key={index}>
                        <button className="w-full py-3 px-6 bg-blue-600 rounded-lg hover:bg-blue-500 transition duration-300">
                            {favorite}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default FavoritesPage;
