import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';


// Create root element and render App
const root = ReactDOM.createRoot(document.getElementById('app') as HTMLElement);
root.render(<App />);