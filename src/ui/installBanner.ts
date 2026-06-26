import { h } from './dom';

/**
 * In-app PWA install banner.
 *
 * - On Chrome/Edge: captures `beforeinstallprompt` and shows a native install button.
 * - On Firefox/Brave/Safari: shows manual instructions since these browsers
 *   lack the WebAPK system needed for true PWA installs.
 * - Hidden entirely when the app is already running in standalone mode (installed).
 *
 * The banner is dismissible and remembers the dismissal for 14 days.
 */

const DISMISS_KEY = 'faktura.installBannerDismissed';
const DISMISS_DAYS = 14;

/** True when the app is already running as an installed PWA. */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isDismissed(): boolean {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    const elapsed = Date.now() - Number(ts);
    return elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function dismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* non-fatal */
  }
}

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/** Detect browser engine for tailored instructions. */
function detectBrowser(): 'chrome' | 'firefox' | 'brave' | 'safari' | 'other' {
  const ua = navigator.userAgent;
  // Brave self-identifies via navigator.brave
  if ((navigator as unknown as { brave?: { isBrave?: () => Promise<boolean> } }).brave) return 'brave';
  if (/Firefox\//i.test(ua)) return 'firefox';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'safari';
  if (/Chrome\//i.test(ua)) return 'chrome';
  return 'other';
}

function buildManualInstructions(browser: ReturnType<typeof detectBrowser>): HTMLElement {
  const steps: string[] = [];

  switch (browser) {
    case 'firefox':
      steps.push(
        'Otevřete menu (⋮) vpravo nahoře',
        'Zvolte „Instalovat" nebo „Přidat na domovskou obrazovku"',
        'Aplikace poběží offline a otevře se jako samostatné okno',
      );
      break;
    case 'brave':
      steps.push(
        'Otevřete menu (⋮) vpravo nahoře',
        'Zvolte „Instalovat aplikaci" nebo „Přidat na domovskou obrazovku"',
        'Poznámka: Brave vytvoří zástupce — pro plný PWA zážitek použijte Chrome',
      );
      break;
    case 'safari':
      steps.push(
        'Klepněte na ikonu sdílení (⬆)',
        'Zvolte „Přidat na plochu"',
        'Aplikace poběží offline jako samostatná aplikace',
      );
      break;
    default:
      steps.push(
        'Otevřete menu prohlížeče',
        'Zvolte „Instalovat" nebo „Přidat na domovskou obrazovku"',
      );
  }

  const ol = h('ol', { class: 'install-steps' });
  for (const s of steps) ol.append(h('li', {}, [s]));
  return ol;
}

/**
 * Mount the install banner into the given container. Safe to call multiple times;
 * only the first invocation takes effect.
 */
export function mountInstallBanner(container: HTMLElement): void {
  // Already installed or recently dismissed — do nothing.
  if (isStandalone() || isDismissed()) return;

  const browser = detectBrowser();

  const banner = h('div', { class: 'install-banner', id: 'install-banner' });
  const content = h('div', { class: 'install-banner-content' });
  const title = h('strong', {}, ['📲 Nainstalujte si Fakturu']);
  const subtitle = h('p', { class: 'install-banner-sub' }, [
    'Aplikace funguje offline — stačí ji přidat na domovskou obrazovku.',
  ]);
  const closeBtn = h('button', {
    class: 'install-banner-close',
    'aria-label': 'Zavřít',
    onClick: () => {
      dismiss();
      banner.remove();
    },
  }, ['✕']) as HTMLButtonElement;

  content.append(title, subtitle);

  // Chrome / Edge: we can use the native install prompt
  if (browser === 'chrome' || browser === 'other') {
    const installBtn = h('button', {
      class: 'btn btn-primary install-banner-btn',
      onClick: async () => {
        if (deferredPrompt) {
          await deferredPrompt.prompt();
          const result = await deferredPrompt.userChoice;
          if (result.outcome === 'accepted') {
            dismiss();
            banner.remove();
          }
          deferredPrompt = null;
        }
      },
    }, ['Nainstalovat']) as HTMLButtonElement;
    installBtn.disabled = true; // enabled once beforeinstallprompt fires
    content.append(installBtn);

    // Listen for the native prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      installBtn.disabled = false;
    });

    // If already installed mid-session
    window.addEventListener('appinstalled', () => {
      dismiss();
      banner.remove();
    });

    // Show the banner immediately — the button will be disabled until the prompt fires
    banner.append(content, closeBtn);
    container.prepend(banner);
  } else {
    // Firefox, Brave, Safari — show manual instructions
    content.append(buildManualInstructions(browser));
    banner.append(content, closeBtn);
    container.prepend(banner);
  }
}
