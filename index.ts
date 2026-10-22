import { registerRootComponent } from 'expo';
import App from './App';

// Global error boundary to prevent native process termination on Android
const g = globalThis as any;
if (g && typeof g.ErrorUtils !== 'undefined') {
  const defaultHandler = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    console.error('[Waky Global Error Caught]:', error, isFatal);
    if (!isFatal && defaultHandler) {
      defaultHandler(error, false);
    }
  });
}

registerRootComponent(App);
