import React from 'react';
import VolumeControl from './VolumeControl';
import './VolumeControl.css';

const VolumeControlPage: React.FC = () => {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-800 text-white p-4">
            <h1 className="text-4xl font-bold mb-6">Volume Control</h1>
            <VolumeControl />
        </div>
    );
};

export default VolumeControlPage;
