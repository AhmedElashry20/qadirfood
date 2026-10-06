// نقطة البداية — React + RTL
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('العنصر #root غير موجود في index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
