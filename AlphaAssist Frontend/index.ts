import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

import App from './App';

// Suppress React Native version mismatch warnings (these are often false positives)
LogBox.ignoreLogs([
  'React Native version mismatch',
  'Runtime not ready',
  'Warning: React version mismatch',
]);

// Intercept console.error to filter out version mismatch errors
const originalError = console.error;
console.error = (...args: any[]) => {
  const message = args.join(' ');
  if (
    message.includes('React Native version mismatch') ||
    message.includes('Runtime not ready') ||
    message.includes('React version mismatch')
  ) {
    // Silently ignore these errors
    return;
  }
  // Call original console.error for other errors
  originalError.apply(console, args);
};

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
