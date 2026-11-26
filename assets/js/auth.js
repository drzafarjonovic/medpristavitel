/**
 * MedPred CRM — Autentifikatsiya, profil yuklash, Sidebar/Topbar va Mobil PWA Bottom Nav
 */
window.Auth = {
  inPagesDir() {
    return window.location.pathname.includes("/pages/");
  },

  resolveHref(href) {
    if (this.inPagesDir()) {
      return href.startsWith("pages/") ? href.slice(6) : "../" + href;
    }
    return href;
  },

  loginUrl() {
    return this.inPagesDir() ? "../login.html" : "login.html";
  },

  async loadCurrentUser() {
    if (!window.CRM.isConfigured()) return null;

    const { data: sessionData, error: sessErr } = await window.sb.auth.getSession();
    if (sessErr || !sessionData?.session) return null;

    const uid = sessionData.session.user.id;
    const { data: profile, error: profErr } = await window.sb
      .from("profiles")
      .select("id, full_name, phone, email, is_active, branch_id, role_id, roles(code, name_uz), branches(name)")
      .eq("id", uid)
      .single();

    if (profErr || !profile || !profile.is_active) {
      return null;
    }

    const roleCode = profile.roles?.code || "";
    const { data: rperms } = await window.sb
      .from("role_permissions")
      .select("permissions(code)")
      .eq("role_id", profile.role_id);

    const permissions = (rperms || []).map((x) => x.permissions?.code).filter(Boolean);

    let medpred = null;
    if (roleCode === "MEDPRED") {
      const { data: mp } = await window.sb
        .from("medpreds")
        .select("id, medpred_code, full_name, temp_rate_pct, status")
        .eq("profile_id", uid)
        .maybeSingle();
      medpred = mp || null;
    }

    const userObj = {
      id: profile.id,
      full_name: profile.full_name,
      phone: profile.phone,
      email: profile.email || sessionData.session.user.email || "",
      branch_id: profile.branch_id,
      branch_name: profile.branches?.name || "",
      role_id: profile.role_id,
      role: roleCode,
      role_label: profile.roles?.name_uz || window.RBAC.ROLE_LABELS[roleCode] || roleCode,
      permissions,
      medpred
    };
    window.CURRENT_USER = userObj;
    return userObj;
  },

  async logout() {
    if (window.sb) {
      await window.sb.auth.signOut();
    }
    window.CURRENT_USER = null;
    window.location.href = this.loginUrl();
  },

  getBottomNavItems(role) {
    if (role === "RECEPTION") {
      return [
        { key: "reception", label: "Qabulxona", icon: "user-plus", href: "pages/reception.html" },
        { key: "patients",  label: "Bemorlar",  icon: "users",     href: "pages/patients.html" },
        { key: "visits",    label: "Tashriflar",icon: "clipboard-list", href: "pages/visits.html" }
      ];
    }
    if (role === "MEDPRED") {
      return [
        { key: "dashboard", label: "Asosiy",    icon: "layout-dashboard", href: "dashboard.html" },
        { key: "doctors",   label: "Shifokorlar",icon: "stethoscope",     href: "pages/doctors.html" },
        { key: "payments",  label: "Balansim",  icon: "wallet",           href: "pages/payments.html" }
      ];
    }
    if (role === "ACCOUNTANT") {
      return [
        { key: "dashboard", label: "Asosiy",    icon: "layout-dashboard", href: "dashboard.html" },
        { key: "payments",  label: "To'lovlar", icon: "wallet",           href: "pages/payments.html" },
        { key: "reports",   label: "Hisobotlar",icon: "bar-chart-3",      href: "pages/reports.html" }
      ];
    }
    if (role === "MANAGER") {
      return [
        { key: "dashboard", label: "Asosiy",    icon: "layout-dashboard", href: "dashboard.html" },
        { key: "medpreds",  label: "Medpredlar",icon: "briefcase",        href: "pages/medpreds.html" },
        { key: "doctors",   label: "Shifokorlar",icon: "stethoscope",     href: "pages/doctors.html" }
      ];
    }
    // SUPERADMIN & DIRECTOR
    return [
      { key: "dashboard", label: "Dashboard", icon: "layout-dashboard", href: "dashboard.html" },
      { key: "reception", label: "Qabulxona", icon: "user-plus",        href: "pages/reception.html" },
      { key: "visits",    label: "Tashriflar",icon: "clipboard-list",   href: "pages/visits.html" }
    ];
  },

  renderShell(pageKey, pageTitle) {
    const user = window.CURRENT_USER;
    const role = user.role;
    const initials = (user.full_name || "U")
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() || "")
      .join("");

    const navHtml = window.RBAC.NAV_ITEMS.map((item) => {
      if (item.divider) return `<div class="nav-divider"></div>`;
      if (!window.RBAC.canAccessPage(role, item.key)) return "";
      const active = item.key === pageKey ? " active" : "";
      return `<a class="nav-link${active}" href="${this.resolveHref(item.href)}">
        <i data-lucide="${item.icon}"></i>
        <span>${window.CRM.esc(item.label)}</span>
      </a>`;
    }).join("");

    const sidebarEl = document.getElementById("app-sidebar");
    if (sidebarEl) {
      sidebarEl.innerHTML = `
        <div class="sidebar-brand">
          <div class="brand-mark">M</div>
          <div class="brand-text">
            <strong>${window.CRM.esc(window.APP_CONFIG.APP_NAME)}</strong>
            <span>Klinika yo'llanma CRM</span>
          </div>
        </div>
        <nav class="sidebar-nav">${navHtml}</nav>
        <div class="sidebar-footer">
          ${window.CRM.esc(user.branch_name || "Asosiy filial")} · v${window.CRM.esc(window.APP_CONFIG.APP_VERSION)}
        </div>`;
    }

    const topbarEl = document.getElementById("app-topbar");
    if (topbarEl) {
      topbarEl.innerHTML = `
        <div class="topbar-left">
          <button type="button" class="menu-toggle" id="btn-menu-toggle" aria-label="Menyu">
            <i data-lucide="menu"></i>
          </button>
          <h1 class="page-title">${window.CRM.esc(pageTitle)}</h1>
        </div>
        <div class="topbar-right">
          <button type="button" class="btn btn-sm btn-primary hidden" data-pwa-install title="Ilovani o'rnatish">
            <i data-lucide="download"></i>
            <span>O'rnatish</span>
          </button>
          <div class="topbar-search">
            <i data-lucide="search"></i>
            <input type="search" id="global-search" placeholder="Tezkor qidiruv..." autocomplete="off">
          </div>
          <button type="button" class="icon-btn" id="btn-notifications" title="Bildirishnomalar">
            <i data-lucide="bell"></i>
          </button>
          <div class="user-chip">
            <div class="user-avatar">${window.CRM.esc(initials)}</div>
            <div class="user-meta">
              <strong>${window.CRM.esc(user.full_name)}</strong>
              <span>${window.CRM.esc(user.role_label)}</span>
            </div>
          </div>
          <button type="button" class="icon-btn" id="btn-logout" title="Chiqish">
            <i data-lucide="log-out"></i>
          </button>
        </div>`;
    }

    // Mobil PWA pastki navigatsiya paneli
    let bottomNav = document.getElementById("mobile-bottom-nav");
    if (!bottomNav) {
      bottomNav = document.createElement("nav");
      bottomNav.id = "mobile-bottom-nav";
      bottomNav.className = "mobile-bottom-nav";
      bottomNav.setAttribute("aria-label", "Tezkor mobil menyu");
      document.body.appendChild(bottomNav);
    }
    const bItems = this.getBottomNavItems(role);
    bottomNav.innerHTML = bItems.map((it) => `
      <a class="bottom-nav-item${it.key === pageKey ? " active" : ""}" href="${this.resolveHref(it.href)}">
        <i data-lucide="${it.icon}"></i>
        <span>${window.CRM.esc(it.label)}</span>
      </a>`).join("") + `
      <button type="button" class="bottom-nav-item" id="btn-bottom-menu">
        <i data-lucide="layout-grid"></i>
        <span>Menyu</span>
      </button>`;

    const toggleBtn = document.getElementById("btn-menu-toggle");
    const bottomMenuBtn = document.getElementById("btn-bottom-menu");
    const backdrop = document.getElementById("sidebar-backdrop");
    const toggleDrawer = () => {
      sidebarEl?.classList.toggle("open");
      backdrop?.classList.toggle("open");
    };
    const closeDrawer = () => {
      sidebarEl?.classList.remove("open");
      backdrop?.classList.remove("open");
    };
    toggleBtn?.addEventListener("click", toggleDrawer);
    bottomMenuBtn?.addEventListener("click", toggleDrawer);
    backdrop?.addEventListener("click", closeDrawer);

    document.getElementById("btn-logout")?.addEventListener("click", () => this.logout());
    document.getElementById("btn-notifications")?.addEventListener("click", () => {
      window.CRM.toast("Yangi tizim bildirishnomalari yo'q.");
    });

    if (window.lucide) window.lucide.createIcons();
    if (window.PWA) window.PWA.updateInstallButtons();
  },

  renderAccessDenied(pageTitle) {
    const content = document.getElementById("page-content");
    const home = window.RBAC.getDefaultHome(window.CURRENT_USER.role, this.inPagesDir());
    if (content) {
      content.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <strong>Kirish taqiqlangan (403)</strong>
            <p class="text-muted">Sizning <b>${window.CRM.esc(window.CURRENT_USER.role_label)}</b> rolingiz «${window.CRM.esc(pageTitle)}» bo'limiga kirish huquqiga ega emas.</p>
            <a class="btn btn-primary" href="${home}">Asosiy sahifaga qaytish</a>
          </div>
        </div>`;
    }
  },

  async initPage(pageKey, pageTitle) {
    if (!window.CRM.isConfigured()) {
      window.location.href = this.loginUrl();
      return null;
    }

    const user = await this.loadCurrentUser();
    if (!user) {
      window.location.href = this.loginUrl();
      return null;
    }

    this.renderShell(pageKey, pageTitle);

    if (!window.RBAC.canAccessPage(user.role, pageKey)) {
      this.renderAccessDenied(pageTitle);
      return null;
    }

    return user;
  }
};
