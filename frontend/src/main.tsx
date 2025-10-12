import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
// Debug: confirm the entry module loads in the browser
console.log('main.tsx loaded');

try {
  const root = document.getElementById('root');
  if (!root) {
    console.error('Root element #root not found');
  } else {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    console.log('App rendered to #root');
  }
} catch (err) {
  console.error('Error during render:', err);
}
