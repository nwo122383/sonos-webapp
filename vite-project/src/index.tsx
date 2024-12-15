import React from 'react';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import { Swipeable } from 'react-swipeable';
import VolumeControlPage from './VolumeControlPage';
import FavoritesPage from './FavoritesPage';
import NowPlayingPage from './NowPlayingPage';
import './index.css';

const SwipeWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const navigate = useNavigate();

    const handleSwipe = (eventData: any) => {
        if (eventData.dir === 'Left') {
            navigate('/favorites');
        } else if (eventData.dir === 'Right') {
            navigate('/now-playing');
        }
    };

    return <Swipeable onSwiped={handleSwipe}>{children}</Swipeable>;
};

const App: React.FC = () => {
    return (
        <Router>
            <SwipeWrapper>
                <Routes>
                    <Route path="/" element={<VolumeControlPage />} />
                    <Route path="/favorites" element={<FavoritesPage />} />
                    <Route path="/now-playing" element={<NowPlayingPage />} />
                </Routes>
            </SwipeWrapper>
        </Router>
    );
};

export default App;
