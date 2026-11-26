/**
 * MedPred CRM — Foydalanuvchilar, rollar va ruxsatlar moduli
 */
(async function () {
  const currentUser = await window.Auth.initPage("users", "Foydalanuvchilar");
  if (!currentUser) return;

  const state = {
    users: [],
    roles: [],
    branches: [],
    rolePerms: [],
    page: 1,
    pageSize: 15
  };

  const els = {
    tbody: document.getElementById("users-tbody"),
    footer: document.getElementById("users-footer"),
    rolesTbody: document.getElementById("roles-tbody"),
    q: document.getElementById("filter-q"),
    role: document.getElementById("filter-role"),
    status: document.getElementById("filter-status"),
    btnAdd: document.getElementById("btn-add-user")
  };

  // Tab almashtirish
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.tab;
      document.getElementById("users-tab").classList.toggle("hidden", target !== "users-tab");
      document.getElementById("roles-tab").classList.toggle("hidden", target !== "roles-tab");
    });
  });

  async function loadData() {
    const [uRes, rRes, bRes, rpRes] = await Promise.all([
      window.sb
        .from("profiles")
        .select("id, full_name, phone, email, is_active, created_at, role_id, branch_id, roles(code, name_uz), branches(name)")
        .order("created_at", { ascending: false }),
      window.sb.from("roles").select("id, code, name_uz, description").order("code"),
      window.sb.from("branches").select("id, name").eq("is_active", true).order("name"),
      window.sb.from("role_permissions").select("role_id, permissions(code)")
    ]);

    if (uRes.error) {
      window.CRM.toast("Foydalanuvchilarni yuklashda xato: " + uRes.error.message, "error");
      return;
    }

    state.users = uRes.data || [];
    state.roles = rRes.data || [];
    state.branches = bRes.data || [];
    state.rolePerms = rpRes.data || [];

    // Rol filtrini to'ldirish
    const curRoleVal = els.role.value;
    els.role.innerHTML = `<option value="">Barcha rollar</option>` +
      state.roles.map((r) => `<option value="${r.id}">${window.CRM.esc(r.name_uz)}</option>`).join("");
    els.role.value = curRoleVal;

    renderUsers();
    renderRolesMatrix();
  }

  function filteredUsers() {
    const q = els.q.value.trim().toLowerCase();
    const roleId = els.role.value;
    const status = els.status.value;
    return state.users.filter((u) => {
      if (roleId && u.role_id !== roleId) return false;
      if (status === "active" && !u.is_active) return false;
      if (status === "inactive" && u.is_active) return false;
      if (q) {
        const hay = [u.full_name, u.email, u.phone, u.roles?.name_uz].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderUsers() {
    const list = filteredUsers();
    const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const slice = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    if (!slice.length) {
      els.tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><strong>Foydalanuvchilar topilmadi</strong></td></tr>`;
    } else {
      els.tbody.innerHTML = slice.map((u) => {
        const roleCode = u.roles?.code || "";
        const badgeCls = window.RBAC.ROLE_BADGE[roleCode] || "badge-neutral";
        const canEdit = currentUser.role === "SUPERADMIN" ||
          (currentUser.role === "DIRECTOR" && roleCode !== "SUPERADMIN" && u.id !== currentUser.id);
        return `<tr>
          <td><strong>${window.CRM.esc(u.full_name)}</strong></td>
          <td>
            <div>${window.CRM.esc(u.email || "—")}</div>
            <div class="text-muted" style="font-size:12.5px;">${window.CRM.esc(u.phone || "")}</div>
          </td>
          <td><span class="badge ${badgeCls}">${window.CRM.esc(u.roles?.name_uz || roleCode)}</span></td>
          <td>${window.CRM.esc(u.branches?.name || "—")}</td>
          <td>${u.is_active ? `<span class="badge badge-success">Faol</span>` : `<span class="badge badge-danger">Nofaol</span>`}</td>
          <td class="mono">${window.CRM.fmtDate(u.created_at)}</td>
          <td class="text-right">
            ${canEdit ? `<button type="button" class="btn btn-sm" data-edit="${u.id}">Tahrirlash</button>` : `<span class="text-muted">—</span>`}
          </td>
        </tr>`;
      }).join("");
    }

    els.footer.innerHTML = `
      <span>Jami: <strong>${list.length}</strong> ta foydalanuvchi</span>
      <div class="pagination">
        <button type="button" class="btn btn-sm" id="pg-prev" ${state.page <= 1 ? "disabled" : ""}>Oldingi</button>
        <span>${state.page} / ${totalPages}</span>
        <button type="button" class="btn btn-sm" id="pg-next" ${state.page >= totalPages ? "disabled" : ""}>Keyingi</button>
      </div>`;

    document.getElementById("pg-prev")?.addEventListener("click", () => { state.page--; renderUsers(); });
    document.getElementById("pg-next")?.addEventListener("click", () => { state.page++; renderUsers(); });
    els.tbody.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openEditModal(btn.dataset.edit));
    });
  }

  function renderRolesMatrix() {
    els.rolesTbody.innerHTML = state.roles.map((r) => {
      const perms = state.rolePerms
        .filter((rp) => rp.role_id === r.id)
        .map((rp) => rp.permissions?.code)
        .filter(Boolean);
      const badgeCls = window.RBAC.ROLE_BADGE[r.code] || "badge-neutral";
      return `<tr>
        <td><span class="badge ${badgeCls}">${window.CRM.esc(r.name_uz)}</span></td>
        <td>${window.CRM.esc(r.description)}</td>
        <td class="mono">${perms.length} ta</td>
        <td style="max-width:440px;font-size:12px;color:var(--muted);">${perms.map((p) => `<code>${window.CRM.esc(p)}</code>`).join(" · ")}</td>
      </tr>`;
    }).join("");
  }

  function openEditModal(userId) {
    const u = state.users.find((x) => x.id === userId);
    if (!u) return;

    const assignableRoles = state.roles.filter((r) =>
      currentUser.role === "SUPERADMIN" || r.code !== "SUPERADMIN"
    );

    window.CRM.openModal(
      "Foydalanuvchini tahrirlash",
      `<form id="edit-user-form" class="form-grid">
        <div class="form-group full">
          <label>F.I.Sh.</label>
          <input class="input" name="full_name" required value="${window.CRM.esc(u.full_name)}">
        </div>
        <div class="form-group">
          <label>Telefon</label>
          <input class="input" name="phone" value="${window.CRM.esc(u.phone || "")}">
        </div>
        <div class="form-group">
          <label>Rol</label>
          <select class="select" name="role_id" required>
            ${assignableRoles.map((r) => `<option value="${r.id}" ${r.id === u.role_id ? "selected" : ""}>${window.CRM.esc(r.name_uz)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Filial</label>
          <select class="select" name="branch_id">
            <option value="">Tanlanmagan</option>
            ${state.branches.map((b) => `<option value="${b.id}" ${b.id === u.branch_id ? "selected" : ""}>${window.CRM.esc(b.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Holat</label>
          <select class="select" name="is_active">
            <option value="true" ${u.is_active ? "selected" : ""}>Faol</option>
            <option value="false" ${!u.is_active ? "selected" : ""}>Nofaol (bloklangan)</option>
          </select>
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="edit-user-form" class="btn btn-primary">Saqlash</button>`
    );

    document.getElementById("edit-user-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        full_name: String(fd.get("full_name") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        role_id: fd.get("role_id"),
        branch_id: fd.get("branch_id") || null,
        is_active: fd.get("is_active") === "true"
      };
      const { error } = await window.sb.from("profiles").update(payload).eq("id", u.id);
      if (error) {
        window.CRM.toast("Saqlashda xato: " + error.message, "error");
        return;
      }
      window.CRM.closeModal();
      window.CRM.toast("Foydalanuvchi ma'lumotlari yangilandi", "success");
      await loadData();
    });
  }

  function openNewUserGuideModal() {
    const assignableRoles = state.roles.filter((r) =>
      currentUser.role === "SUPERADMIN" || r.code !== "SUPERADMIN"
    );
    window.CRM.openModal(
      "Yangi foydalanuvchi profilini biriktirish",
      `<div class="alert alert-info">
        <i data-lucide="shield-alert"></i>
        <div>
          Xavfsizlik sababli frontendda <code>service_role</code> kaliti ishlatilmaydi. Avval <strong>Supabase Dashboard → Authentication → Users → Add User</strong> orqali yangi xodim yarating va uning <code>User UID</code> qiymatini quyida kiriting (yoki kelgusida Supabase Edge Function orqali avtomatlashtiriladi).
        </div>
      </div>
      <form id="new-profile-form" class="form-grid">
        <div class="form-group full">
          <label>Supabase Auth User UID</label>
          <input class="input mono" name="id" required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
        </div>
        <div class="form-group">
          <label>F.I.Sh.</label>
          <input class="input" name="full_name" required placeholder="Karimov Aziz">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input class="input" name="email" type="email" required placeholder="aziz@klinika.uz">
        </div>
        <div class="form-group">
          <label>Telefon</label>
          <input class="input" name="phone" placeholder="+998 90 123 45 67">
        </div>
        <div class="form-group">
          <label>Rol</label>
          <select class="select" name="role_id" required>
            ${assignableRoles.map((r) => `<option value="${r.id}">${window.CRM.esc(r.name_uz)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group full">
          <label>Filial</label>
          <select class="select" name="branch_id">
            <option value="">Tanlanmagan</option>
            ${state.branches.map((b) => `<option value="${b.id}">${window.CRM.esc(b.name)}</option>`).join("")}
          </select>
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="new-profile-form" class="btn btn-primary">Profil yaratish</button>`
    );

    document.getElementById("new-profile-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        id: String(fd.get("id") || "").trim(),
        full_name: String(fd.get("full_name") || "").trim(),
        email: String(fd.get("email") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        role_id: fd.get("role_id"),
        branch_id: fd.get("branch_id") || null,
        is_active: true
      };
      const { error } = await window.sb.from("profiles").insert(payload);
      if (error) {
        window.CRM.toast("Xato: " + error.message, "error");
        return;
      }
      window.CRM.closeModal();
      window.CRM.toast("Yangi foydalanuvchi profili yaratildi", "success");
      await loadData();
    });
  }

  els.q.addEventListener("input", () => { state.page = 1; renderUsers(); });
  els.role.addEventListener("change", () => { state.page = 1; renderUsers(); });
  els.status.addEventListener("change", () => { state.page = 1; renderUsers(); });
  els.btnAdd.addEventListener("click", openNewUserGuideModal);

  await loadData();
})();
