import React from 'react';
import ReactDOM from 'react-dom/client';
import { MedicalFieldApp } from './App';
import './style.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><MedicalFieldApp mode="web" /></React.StrictMode>);
