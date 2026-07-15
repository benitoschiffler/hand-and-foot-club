import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export function InstallHelp() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    function handleInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }
    function handleInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed) {
    return <div className="installed-note">✓ Saved to this device</div>;
  }

  async function install() {
    if (!installPrompt) {
      setShowGuide(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  return (
    <>
      <button className="install-button" onClick={() => void install()}>
        Save to Phone
      </button>
      {showGuide && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="install-title">
          <div className="dialog install-dialog">
            <button className="dialog-close" aria-label="Close" onClick={() => setShowGuide(false)}>×</button>
            <div className="install-icon" aria-hidden="true">↗</div>
            <h2 id="install-title">Save Hand &amp; Foot</h2>
            <ol className="install-steps">
              <li>Tap the <strong>Share</strong> button in your browser.</li>
              <li>Choose <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong>. The game will appear like an app.</li>
            </ol>
            <button className="btn" onClick={() => setShowGuide(false)}>Got it</button>
          </div>
        </div>
      )}
    </>
  );
}
