/**
 * MedPred CRM — Foydalanuvchilar, rollar va ruxsatlar moduli
 * Yangi foydalanuvchini Supabase Dashboardga kirmasdan, to'g'ridan-to'g'ri ilovadan yaratadi.
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

  function generatePassword() {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function openCreateUserModal() {
    const assignableRoles = state.roles.filter((r) =>
      currentUser.role === "SUPERADMIN" || r.code !== "SUPERADMIN"
    );

    window.CRM.openModal(
      "Yangi xodim qo'shish",
      `<form id="create-user-form" class="form-grid">
        <div class="form-group full">
          <label>F.I.Sh. *</label>
          <input class="input" name="full_name" required placeholder="Karimov Azizbek">
        </div>
        <div class="form-group">
          <label>Email (kirish logini) *</label>
          <input class="input" name="email" type="email" required placeholder="aziz@klinika.uz">
        </div>
        <div class="form-group">
          <label style="display:flex;justify-content:space-between;">
            <span>Parol (kamida 6 belgi) *</span>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-gen-pass" style="height:20px;padding:0 6px;">Avto parol</button>
          </label>
          <input class="input mono" name="password" id="new-user-pass" type="text" minlength="6" required placeholder="Kamida 6 ta belgi">
        </div>
        <div class="form-group">
          <label>Telefon raqami</label>
          <input class="input" name="phone" placeholder="+998 90 123 45 67">
        </div>
        <div class="form-group">
          <label>Rol *</label>
          <select class="select" name="role_id" required>
            ${assignableRoles.map((r) => `<option value="${r.id}">${window.CRM.esc(r.name_uz)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group full">
          <label>Filial</label>
          <select class="select" name="branch_id">
            <option value="">Asosiy / Tanlanmagan</option>
            ${state.branches.map((b) => `<option value="${b.id}">${window.CRM.esc(b.name)}</option>`).join("")}
          </select>
          <span class="form-hint">Agar rol <strong>Medpredstavitel</strong> bo'lsa, u avtomatik Medpredlar ro'yxatiga ham ulanadi.</span>
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="create-user-form" class="btn btn-primary" id="btn-create-submit">Xodimni yaratish</button>`
    );

    document.getElementById("btn-gen-pass")?.addEventListener("click", () => {
      document.getElementById("new-user-pass").value = generatePassword();
    });

    document.getElementById("create-user-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-create-submit");
      btn.disabled = true;

      try {
        const fd = new FormData(e.target);
        const fullName = String(fd.get("full_name") || "").trim();
        const email = String(fd.get("email") || "").trim().toLowerCase();
        const password = String(fd.get("password") || "");
        const phone = String(fd.get("phone") || "").trim();
        const roleId = fd.get("role_id");
        const branchId = fd.get("branch_id") || null;

        // Joriy Superadmin sessiyasini buzmaslik uchun vaqtinchalik (persistSession: false) client
        const cfg = window.APP_CONFIG;
        const tempSb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });

        const { data: signData, error: signErr } = await tempSb.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } }
        });

        if (signErr) {
          throw new Error(signErr.message || "Hisob yaratib bo'lmadi");
        }
        const newUser = signData?.user;
        if (!newUser?.id || (Array.isArray(newUser.identities) && newUser.identities.length === 0)) {
          throw new Error("Bu email allaqachon ro'yxatdan o'tgan");
        }

        // Server RPC orqali emailni tasdiqlash, profil yaratish va MEDPRED bo'lsa avtomatik ulash
        await window.CRM.rpc("rpc_admin_finalize_user", {
          p_user_id: newUser.id,
          p_full_name: fullName,
          p_email: email,
          p_phone: phone,
          p_role_id: roleId,
          p_branch_id: branchId
        });

        window.CRM.closeModal();
        window.CRM.toast(`Xodim yaratildi! Login: ${email}`, "success");
        await loadData();
      } catch (err) {
        window.CRM.toast("Xato: " + (err.message || "Yaratib bo'lmadi"), "error");
        btn.disabled = false;
      }
    });
  }

  els.q.addEventListener("input", () => { state.page = 1; renderUsers(); });
  els.role.addEventListener("change", () => { state.page = 1; renderUsers(); });
  els.status.addEventListener("change", () => { state.page = 1; renderUsers(); });
  els.btnAdd.addEventListener("click", openCreateUserModal);

  await loadData();
})();
