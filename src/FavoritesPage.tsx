import React from 'react';
import './FavoritesPage.css';

const FavoritesPage: React.FC = () => {
  return (
    <div className="favorites-page w-screen h-screen flex flex-col items-center justify-center bg-gray-800 text-white">
      <h1 className="text-4xl mb-6">Favorites Page</h1>
      {/* Add list of favorites here */}
    </div>
  );
};

export default FavoritesPage;
