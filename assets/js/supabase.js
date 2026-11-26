/**
 * MedPred CRM — Supabase Client va umumiy yordamchi funksiyalar
 */
(function () {
  const cfg = window.APP_CONFIG || {};

  function createClientSafe() {
    if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      return null;
    }
    try {
      return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    } catch (e) {
      console.error("Supabase ulanish xatosi:", e);
      return null;
    }
  }

  window.sb = createClientSafe();

  window.CRM = {
    isConfigured() {
      return Boolean(window.sb);
    },

    saveConnection(url, anonKey) {
      localStorage.setItem("medpred_supabase_url", (url || "").trim());
      localStorage.setItem("medpred_supabase_anon_key", (anonKey || "").trim());
      window.location.reload();
    },

    esc(v) {
      return String(v ?? "").replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[ch]));
    },

    fmtNum(n) {
      const val = Number(n || 0);
      return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    },

    fmtSom(n) {
      return this.fmtNum(n) + (cfg.CURRENCY_SUFFIX || " so'm");
    },

    fmtDate(iso) {
      if (!iso) return "—";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
      return d.toLocaleDateString("uz-UZ", { year: "numeric", month: "2-digit", day: "2-digit" });
    },

    fmtDateTime(iso) {
      if (!iso) return "—";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString("uz-UZ", {
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
      });
    },

    toast(message, type = "default") {
      let box = document.querySelector(".toast-container");
      if (!box) {
        box = document.createElement("div");
        box.className = "toast-container";
        document.body.appendChild(box);
      }
      const el = document.createElement("div");
      el.className = "toast" + (type !== "default" ? " toast-" + type : "");
      el.textContent = message;
      box.appendChild(el);
      setTimeout(() => el.remove(), 3600);
    },

    openModal(title, bodyHtml, footerHtml = "", large = false) {
      let bd = document.getElementById("crm-modal");
      if (!bd) {
        bd = document.createElement("div");
        bd.id = "crm-modal";
        bd.className = "modal-backdrop";
        bd.addEventListener("click", (e) => {
          if (e.target === bd) this.closeModal();
        });
        document.body.appendChild(bd);
      }
      bd.innerHTML = `
        <div class="modal-box ${large ? "modal-lg" : ""}" role="dialog" aria-modal="true">
          <div class="modal-head">
            <h3>${this.esc(title)}</h3>
            <button type="button" class="icon-btn" id="crm-modal-close" aria-label="Yopish">
              <i data-lucide="x"></i>
            </button>
          </div>
          <div class="modal-body">${bodyHtml}</div>
          ${footerHtml ? `<div class="modal-foot">${footerHtml}</div>` : ""}
        </div>`;
      bd.classList.add("open");
      document.getElementById("crm-modal-close")?.addEventListener("click", () => this.closeModal());
      if (window.lucide) window.lucide.createIcons();
    },

    closeModal() {
      const bd = document.getElementById("crm-modal");
      if (bd) {
        bd.classList.remove("open");
        bd.innerHTML = "";
      }
    },

    async rpc(fnName, params = {}) {
      if (!window.sb) throw new Error("Supabase ulanmagan");
      const { data, error } = await window.sb.rpc(fnName, params);
      if (error) throw new Error(error.message || "Server xatosi");
      return data;
    }
  };

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.CRM.closeModal();
  });
})();
