/**
 * MedPred CRM — Rollar, ruxsatlar va menyu navigatsiyasi
 * Eslatma: UI ruxsatlari qulaylik uchun; asosiy xavfsizlik Supabase RLS orqali ta'minlanadi.
 */
window.RBAC = {
  ROLE_LABELS: {
    SUPERADMIN: "Superadmin",
    DIRECTOR:   "Direktor",
    MANAGER:    "Menejer",
    MEDPRED:    "Medpredstavitel",
    RECEPTION:  "Qabulxona",
    ACCOUNTANT: "Buxgalter"
  },

  ROLE_BADGE: {
    SUPERADMIN: "badge-danger",
    DIRECTOR:   "badge-primary",
    MANAGER:    "badge-info",
    MEDPRED:    "badge-success",
    RECEPTION:  "badge-warning",
    ACCOUNTANT: "badge-neutral"
  },

  // Har bir sahifa uchun ruxsat etilgan rollar
  PAGE_ROLES: {
    dashboard:     ["SUPERADMIN", "DIRECTOR", "MANAGER", "MEDPRED", "ACCOUNTANT"],
    reception:     ["SUPERADMIN", "DIRECTOR", "RECEPTION"],
    medpreds:      ["SUPERADMIN", "DIRECTOR", "MANAGER", "MEDPRED", "ACCOUNTANT"],
    doctors:       ["SUPERADMIN", "DIRECTOR", "MANAGER", "MEDPRED", "RECEPTION", "ACCOUNTANT"],
    organizations: ["SUPERADMIN", "DIRECTOR", "MANAGER", "MEDPRED", "RECEPTION"],
    patients:      ["SUPERADMIN", "DIRECTOR", "MANAGER", "RECEPTION", "ACCOUNTANT"],
    visits:        ["SUPERADMIN", "DIRECTOR", "MANAGER", "MEDPRED", "RECEPTION", "ACCOUNTANT"],
    services:      ["SUPERADMIN", "DIRECTOR", "MANAGER", "RECEPTION", "ACCOUNTANT"],
    payments:      ["SUPERADMIN", "DIRECTOR", "ACCOUNTANT", "MEDPRED"],
    reports:       ["SUPERADMIN", "DIRECTOR", "MANAGER", "ACCOUNTANT"],
    imports:       ["SUPERADMIN", "DIRECTOR", "MANAGER"],
    users:         ["SUPERADMIN", "DIRECTOR"],
    settings:      ["SUPERADMIN", "DIRECTOR"]
  },

  NAV_ITEMS: [
    { key: "dashboard",     label: "Dashboard",             icon: "layout-dashboard", href: "dashboard.html" },
    { key: "reception",     label: "Qabulxona (Tezkor)",    icon: "user-plus",        href: "pages/reception.html" },
    { divider: true },
    { key: "medpreds",      label: "Medpredlar",            icon: "briefcase",        href: "pages/medpreds.html" },
    { key: "doctors",       label: "Shifokorlar",           icon: "stethoscope",      href: "pages/doctors.html" },
    { key: "organizations", label: "Muassasalar",           icon: "building-2",       href: "pages/organizations.html" },
    { key: "patients",      label: "Bemorlar",              icon: "users",            href: "pages/patients.html" },
    { key: "visits",        label: "Tashriflar",            icon: "clipboard-list",   href: "pages/visits.html" },
    { key: "services",      label: "Xizmatlar",             icon: "list-checks",      href: "pages/services.html" },
    { divider: true },
    { key: "payments",      label: "To'lovlar",             icon: "wallet",           href: "pages/payments.html" },
    { key: "reports",       label: "Hisobotlar",            icon: "bar-chart-3",      href: "pages/reports.html" },
    { key: "imports",       label: "Excel import/export",   icon: "file-spreadsheet", href: "pages/imports.html" },
    { divider: true },
    { key: "users",         label: "Foydalanuvchilar",      icon: "shield-check",     href: "pages/users.html" },
    { key: "settings",      label: "Sozlamalar",            icon: "settings",         href: "pages/settings.html" }
  ],

  canAccessPage(roleCode, pageKey) {
    const allowed = this.PAGE_ROLES[pageKey];
    if (!allowed) return false;
    return allowed.includes(roleCode);
  },

  getDefaultHome(roleCode, inPagesDir = false) {
    const prefix = inPagesDir ? "../" : "";
    if (roleCode === "RECEPTION") {
      return inPagesDir ? "reception.html" : "pages/reception.html";
    }
    return prefix + "dashboard.html";
  },

  hasPerm(permCode) {
    const u = window.CURRENT_USER;
    if (!u) return false;
    if (u.role === "SUPERADMIN") return true;
    return Array.isArray(u.permissions) && u.permissions.includes(permCode);
  }
};
