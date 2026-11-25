import React from 'react';
import ReactDOM from 'react-dom/client';
import { MedicalFieldApp } from './App';
import './style.css';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/mobile/sw.js', { scope: '/mobile/' }).catch(console.warn));
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><MedicalFieldApp mode="mobile" /></React.StrictMode>);
