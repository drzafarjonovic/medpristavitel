/**
 * MedPred CRM — Xizmatlar va narxlar katalogi moduli (narx tarixi bilan)
 */
(async function () {
  const user = await window.Auth.initPage("services", "Xizmatlar");
  if (!user) return;

  const canManage = ["SUPERADMIN", "DIRECTOR"].includes(user.role);
  const canSeeHistory = ["SUPERADMIN", "DIRECTOR", "MANAGER", "ACCOUNTANT"].includes(user.role);

  const state = {
    services: [],
    categories: [],
    branches: [],
    page: 1,
    pageSize: 20
  };

  const els = {
    tbody: document.getElementById("srv-tbody"),
    footer: document.getElementById("srv-footer"),
    q: document.getElementById("filter-q"),
    cat: document.getElementById("filter-cat"),
    status: document.getElementById("filter-status"),
    btnAdd: document.getElementById("btn-add-srv"),
    btnCats: document.getElementById("btn-cats"),
    btnImport: document.getElementById("btn-import-srv"),
    btnExport: document.getElementById("btn-export-srv")
  };

  if (canManage) {
    els.btnAdd.classList.remove("hidden");
    els.btnCats.classList.remove("hidden");
    els.btnImport.classList.remove("hidden");
  }

  async function loadData() {
    const [sRes, cRes, bRes] = await Promise.all([
      window.sb.from("services").select("*, service_categories(name), branches(name)").order("name"),
      window.sb.from("service_categories").select("*").order("sort_order"),
      window.sb.from("branches").select("id, name").eq("is_active", true).order("name")
    ]);

    if (sRes.error) {
      window.CRM.toast("Xizmatlarni yuklashda xato: " + sRes.error.message, "error");
      return;
    }

    state.services = sRes.data || [];
    state.categories = cRes.data || [];
    state.branches = bRes.data || [];

    const curC = els.cat.value;
    els.cat.innerHTML = `<option value="">Barcha kategoriyalar</option>` +
      state.categories.map((c) => `<option value="${c.id}">${window.CRM.esc(c.name)}</option>`).join("");
    els.cat.value = curC;

    renderTable();
  }

  function getFiltered() {
    const q = els.q.value.trim().toLowerCase();
    const cid = els.cat.value;
    const st = els.status.value;
    return state.services.filter((s) => {
      if (cid && s.category_id !== cid) return false;
      if (st === "active" && !s.is_active) return false;
      if (st === "inactive" && s.is_active) return false;
      if (q && ![s.service_code, s.name, s.service_categories?.name].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderTable() {
    const list = getFiltered();
    const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const slice = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    if (!slice.length) {
      els.tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><strong>Xizmatlar topilmadi</strong></td></tr>`;
    } else {
      els.tbody.innerHTML = slice.map((s) => `<tr>
        <td class="mono">${window.CRM.esc(s.service_code)}</td>
        <td><strong>${window.CRM.esc(s.name)}</strong></td>
        <td>${window.CRM.esc(s.service_categories?.name || "—")}</td>
        <td>${window.CRM.esc(s.branches?.name || "Barcha filiallar")}</td>
        <td class="text-right mono"><strong>${window.CRM.fmtSom(s.price)}</strong></td>
        <td>${s.is_active ? `<span class="badge badge-success">Faol</span>` : `<span class="badge badge-neutral">Nofaol</span>`}</td>
        <td class="mono">${window.CRM.fmtDate(s.updated_at)}</td>
        <td class="text-right" style="white-space:nowrap;">
          ${canSeeHistory ? `<button type="button" class="btn btn-sm" data-hist="${s.id}">Narx tarixi</button>` : ""}
          ${canManage ? `<button type="button" class="btn btn-sm" data-edit="${s.id}">Tahrir</button>` : ""}
        </td>
      </tr>`).join("");
    }

    els.footer.innerHTML = `
      <span>Jami: <strong>${list.length}</strong> ta xizmat</span>
      <div class="pagination">
        <button type="button" class="btn btn-sm" id="pg-prev" ${state.page <= 1 ? "disabled" : ""}>Oldingi</button>
        <span>${state.page} / ${totalPages}</span>
        <button type="button" class="btn btn-sm" id="pg-next" ${state.page >= totalPages ? "disabled" : ""}>Keyingi</button>
      </div>`;

    document.getElementById("pg-prev")?.addEventListener("click", () => { state.page--; renderTable(); });
    document.getElementById("pg-next")?.addEventListener("click", () => { state.page++; renderTable(); });
    els.tbody.querySelectorAll("[data-hist]").forEach((b) => b.addEventListener("click", () => openHistory(b.dataset.hist)));
    els.tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
  }

  async function openHistory(srvId) {
    const s = state.services.find((x) => x.id === srvId);
    if (!s) return;

    const { data } = await window.sb
      .from("service_price_history")
      .select("old_price, new_price, source, created_at")
      .eq("service_id", srvId)
      .order("created_at", { ascending: false });

    const rows = data || [];
    window.CRM.openModal(
      `Narx tarixi — ${s.name}`,
      `<p class="text-muted" style="margin-top:0;">Joriy narx: <strong class="mono">${window.CRM.fmtSom(s.price)}</strong></p>
      ${rows.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Sana</th><th class="text-right">Eski narx</th><th class="text-right">Yangi narx</th><th>Manba</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td class="mono">${window.CRM.fmtDateTime(r.created_at)}</td>
          <td class="text-right mono">${window.CRM.fmtSom(r.old_price)}</td>
          <td class="text-right mono"><strong>${window.CRM.fmtSom(r.new_price)}</strong></td>
          <td><span class="badge badge-neutral">${r.source === "excel_import" ? "Excel import" : "Qo'lda"}</span></td>
        </tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">Narx o'zgarishlari hali qayd etilmagan.</div>`}`,
      `<button type="button" class="btn btn-primary" onclick="window.CRM.closeModal()">Yopish</button>`
    );
  }

  function openForm(id = null) {
    const s = id ? state.services.find((x) => x.id === id) : null;
    window.CRM.openModal(
      s ? `Xizmatni tahrirlash (${s.service_code})` : "Yangi xizmat qo'shish",
      `<form id="srv-form" class="form-grid">
        <div class="form-group full">
          <label>Xizmat nomi *</label>
          <input class="input" name="name" required value="${window.CRM.esc(s?.name || "")}" placeholder="Umumiy qon tahlili">
        </div>
        <div class="form-group">
          <label>Kategoriya</label>
          <select class="select" name="category_id">
            <option value="">Tanlanmagan</option>
            ${state.categories.map((c) => `<option value="${c.id}" ${s?.category_id === c.id ? "selected" : ""}>${window.CRM.esc(c.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Narxi (so'm) *</label>
          <input class="input mono" name="price" type="number" min="0" step="1000" required value="${window.CRM.esc(s?.price ?? 0)}">
        </div>
        <div class="form-group">
          <label>Filial</label>
          <select class="select" name="branch_id">
            <option value="">Barcha filiallar</option>
            ${state.branches.map((b) => `<option value="${b.id}" ${s?.branch_id === b.id ? "selected" : ""}>${window.CRM.esc(b.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Holati</label>
          <select class="select" name="is_active">
            <option value="true" ${(!s || s.is_active) ? "selected" : ""}>Faol</option>
            <option value="false" ${s && !s.is_active ? "selected" : ""}>Nofaol</option>
          </select>
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="srv-form" class="btn btn-primary">Saqlash</button>`
    );

    document.getElementById("srv-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        name: String(fd.get("name") || "").trim(),
        category_id: fd.get("category_id") || null,
        branch_id: fd.get("branch_id") || null,
        price: Number(fd.get("price") || 0),
        is_active: fd.get("is_active") === "true"
      };
      const res = s
        ? await window.sb.from("services").update(payload).eq("id", s.id)
        : await window.sb.from("services").insert(payload);

      if (res.error) {
        window.CRM.toast("Saqlashda xato: " + res.error.message, "error");
        return;
      }
      window.CRM.closeModal();
      window.CRM.toast(s ? "Xizmat yangilandi (narx o'zgargan bo'lsa tarix saqlandi)" : "Yangi xizmat qo'shildi", "success");
      await loadData();
    });
  }

  function openCatsModal() {
    window.CRM.openModal(
      "Xizmat kategoriyalari",
      `<form id="cat-form" class="toolbar" style="margin-bottom:14px;">
        <input class="input grow" name="name" required placeholder="Yangi kategoriya nomi">
        <button type="submit" class="btn btn-primary">Qo'shish</button>
      </form>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Kategoriya</th><th>Tartib</th></tr></thead>
      <tbody>${state.categories.map((c) => `<tr><td><strong>${window.CRM.esc(c.name)}</strong></td><td class="mono">${c.sort_order}</td></tr>`).join("")}</tbody></table></div>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Yopish</button>`
    );

    document.getElementById("cat-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const { error } = await window.sb.from("service_categories").insert({
        name: String(fd.get("name") || "").trim(),
        sort_order: state.categories.length + 1
      });
      if (error) return window.CRM.toast("Xato: " + error.message, "error");
      window.CRM.toast("Kategoriya qo'shildi", "success");
      await loadData();
      openCatsModal();
    });
  }

  els.btnExport.addEventListener("click", () => {
    const rows = getFiltered().map((s) => ({
      code: s.service_code,
      name: s.name,
      category: s.service_categories?.name || "",
      branch: s.branches?.name || "Barcha filiallar",
      price: Number(s.price || 0),
      status: s.is_active ? "Faol" : "Nofaol",
      updated: (s.updated_at || "").slice(0, 10)
    }));
    window.ExcelEngine.exportData(rows, [
      { key: "code", label: "Xizmat kodi" },
      { key: "name", label: "Xizmat nomi" },
      { key: "category", label: "Kategoriya" },
      { key: "branch", label: "Filial" },
      { key: "price", label: "Narxi (so'm)", type: "currency" },
      { key: "status", label: "Holati" },
      { key: "updated", label: "Yangilangan sana" }
    ], "xizmatlar_katalogi", "xlsx");
  });

  els.q.addEventListener("input", () => { state.page = 1; renderTable(); });
  els.cat.addEventListener("change", () => { state.page = 1; renderTable(); });
  els.status.addEventListener("change", () => { state.page = 1; renderTable(); });
  els.btnAdd.addEventListener("click", () => openForm(null));
  els.btnCats.addEventListener("click", openCatsModal);

  await loadData();
})();
