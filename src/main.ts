import './style.css';
import { mountApp } from './ui/app';
import { initTypst } from './typst/compile';
import { registerSW } from 'virtual:pwa-register';

// Register the service worker (autoUpdate). Caches app shell + wasm + fonts.
registerSW({ immediate: true });

const root = document.querySelector<HTMLDivElement>('#app')!;
mountApp(root);

// Warm up the Typst engine in the background so the first preview is quick.
void initTypst();
