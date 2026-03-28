import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { Buffer } from 'buffer';
import App from './src/App';

// Polyfill Buffer for the browser environment
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
}

registerRootComponent(App);
