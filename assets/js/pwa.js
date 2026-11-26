/**
 * MedPred CRM — PWA Service Worker ro'yxatdan o'tkazish, O'rnatish (Install) va Offline indikatori
 */
(function () {
  const inPages = window.location.pathname.includes("/pages/");
  const swPath = inPages ? "../sw.js" : "./sw.js";
  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIOS = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  // 1. Service Worker registratsiyasi (HTTPS / GitHub Pages / localhost da ishlaydi)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(swPath).catch((err) => {
        console.warn("SW registratsiya xatosi:", err);
      });
    });
  }

  // 2. Chrome/Edge/Android install promptini ushlash
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.PWA.updateInstallButtons();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.PWA.updateInstallButtons();
    if (window.CRM?.toast) window.CRM.toast("MedPred CRM ilova sifatida o'rnatildi!", "success");
  });

  // 3. Offline / Online banner
  function updateOnlineBanner() {
    let bar = document.getElementById("pwa-offline-bar");
    if (!navigator.onLine) {
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "pwa-offline-bar";
        bar.className = "pwa-offline-bar";
        bar.textContent = "Internet aloqasi yo'q — oflayn rejimdasiz, ma'lumotlar saqlanmaydi.";
        document.body.prepend(bar);
      }
    } else if (bar) {
      bar.remove();
    }
  }
  window.addEventListener("online", updateOnlineBanner);
  window.addEventListener("offline", updateOnlineBanner);
  document.addEventListener("DOMContentLoaded", updateOnlineBanner);

  window.PWA = {
    canShowInstall() {
      if (isStandalone()) return false;
      return Boolean(deferredPrompt) || isIOS();
    },

    updateInstallButtons() {
      document.querySelectorAll("[data-pwa-install]").forEach((btn) => {
        btn.classList.toggle("hidden", !this.canShowInstall());
      });
    },

    async triggerInstall() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        this.updateInstallButtons();
        return;
      }
      if (isIOS() && window.CRM?.openModal) {
        window.CRM.openModal(
          "iPhone / iPad ga o'rnatish",
          `<ol style="padding-left:18px;display:grid;gap:10px;margin:0;font-size:14.5px;">
            <li>Safari brauzerining pastki panelidagi <strong>Ulashish (Share ⎋)</strong> tugmasini bosing.</li>
            <li>Pastga tushib <strong>«Asosiy ekranga qo'shish» (Add to Home Screen)</strong> bandini tanlang.</li>
            <li>Yuqori o'ng burchakdagi <strong>«Qo'shish» (Add)</strong> tugmasini bosing — MedPred CRM alohida ilova sifatida ochiladi.</li>
          </ol>`,
          `<button type="button" class="btn btn-primary" onclick="window.CRM.closeModal()">Tushunarli</button>`
        );
      }
    }
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pwa-install]");
    if (btn) window.PWA.triggerInstall();
  });
})();
