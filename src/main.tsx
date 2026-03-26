import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Buffer } from 'buffer';
import { AppRegistry } from 'react-native';
import App from './App.tsx';
import './index.css';

// Polyfill Buffer for the browser environment
window.Buffer = Buffer;

console.log('Main.tsx loading...');

// Register the app
AppRegistry.registerComponent('App', () => App);

console.log('App registered');

// Get the application root component
const { element } = (AppRegistry as any).getApplication('App');

console.log('App element retrieved');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {element}
  </StrictMode>,
);

console.log('App rendered');
