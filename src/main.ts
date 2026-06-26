import './style.css';
import { mountApp } from './ui/app';
import { mountInstallBanner } from './ui/installBanner';
import { initTypst } from './typst/compile';
import { registerSW } from 'virtual:pwa-register';

// Register the service worker (autoUpdate). Caches app shell + wasm + fonts.
registerSW({ immediate: true });

const root = document.querySelector<HTMLDivElement>('#app')!;
mountApp(root);

// Show an install banner with browser-specific instructions (dismissible).
mountInstallBanner(root);

// Warm up the Typst engine in the background so the first preview is quick.
void initTypst();

