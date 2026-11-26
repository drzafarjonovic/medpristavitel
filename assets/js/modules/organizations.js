/**
 * MedPred CRM — Muassasalar moduli
 */
(async function () {
  const user = await window.Auth.initPage("organizations", "Muassasalar");
  if (!user) return;

  const canManage = ["SUPERADMIN", "DIRECTOR", "MANAGER"].includes(user.role);
  const ORG_TYPES = {
    state_polyclinic: "Davlat poliklinikasi",
    private_clinic: "Xususiy klinika",
    diagnostic_center: "Diagnostika markazi",
    independent_doctor: "Mustaqil shifokor",
    other: "Boshqa"
  };

  const state = {
    orgs: [],
    territories: [],
    workplaces: [],
    page: 1,
    pageSize: 15
  };

  const els = {
    tbody: document.getElementById("org-tbody"),
    footer: document.getElementById("org-footer"),
    q: document.getElementById("filter-q"),
    type: document.getElementById("filter-type"),
    territory: document.getElementById("filter-territory"),
    btnAdd: document.getElementById("btn-add-org")
  };

  if (canManage) els.btnAdd.classList.remove("hidden");

  async function loadData() {
    const [oRes, tRes, wpRes] = await Promise.all([
      window.sb.from("organizations").select("*, territories(name)").order("name"),
      window.sb.from("territories").select("id, name").eq("is_active", true).order("name"),
      window.sb.from("doctor_workplaces").select("organization_id, doctor_id").eq("is_active", true)
    ]);

    if (oRes.error) {
      window.CRM.toast("Muassasalarni yuklashda xato: " + oRes.error.message, "error");
      return;
    }

    state.orgs = oRes.data || [];
    state.territories = tRes.data || [];
    state.workplaces = wpRes.data || [];

    const curT = els.territory.value;
    els.territory.innerHTML = `<option value="">Barcha hududlar</option>` +
      state.territories.map((t) => `<option value="${t.id}">${window.CRM.esc(t.name)}</option>`).join("");
    els.territory.value = curT;

    renderTable();
  }

  function getFiltered() {
    const q = els.q.value.trim().toLowerCase();
    const tp = els.type.value;
    const tid = els.territory.value;
    return state.orgs.filter((o) => {
      if (tp && o.org_type !== tp) return false;
      if (tid && o.territory_id !== tid) return false;
      if (q) {
        const hay = [o.name, o.address, o.phone, o.contact_person, o.territories?.name].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderTable() {
    const list = getFiltered();
    const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const slice = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    if (!slice.length) {
      els.tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><strong>Muassasalar topilmadi</strong></td></tr>`;
    } else {
      els.tbody.innerHTML = slice.map((o) => {
        const docCount = state.workplaces.filter((w) => w.organization_id === o.id).length;
        return `<tr>
          <td><strong>${window.CRM.esc(o.name)}</strong></td>
          <td><span class="badge badge-neutral">${window.CRM.esc(ORG_TYPES[o.org_type] || o.org_type)}</span></td>
          <td>
            <div>${window.CRM.esc(o.territories?.name || "—")}</div>
            <div class="text-muted" style="font-size:12.5px;">${window.CRM.esc(o.address || "")}</div>
          </td>
          <td>
            <div class="mono">${window.CRM.esc(o.phone || "—")}</div>
            <div class="text-muted" style="font-size:12.5px;">${window.CRM.esc(o.contact_person || "")}</div>
          </td>
          <td class="text-right mono">${docCount}</td>
          <td>${o.status === "active" ? `<span class="badge badge-success">Faol</span>` : `<span class="badge badge-neutral">Nofaol</span>`}</td>
          <td class="text-right">
            ${canManage ? `<button type="button" class="btn btn-sm" data-edit="${o.id}">Tahrirlash</button>` : `<span class="text-muted">—</span>`}
          </td>
        </tr>`;
      }).join("");
    }

    els.footer.innerHTML = `
      <span>Jami: <strong>${list.length}</strong> ta muassasa</span>
      <div class="pagination">
        <button type="button" class="btn btn-sm" id="pg-prev" ${state.page <= 1 ? "disabled" : ""}>Oldingi</button>
        <span>${state.page} / ${totalPages}</span>
        <button type="button" class="btn btn-sm" id="pg-next" ${state.page >= totalPages ? "disabled" : ""}>Keyingi</button>
      </div>`;

    document.getElementById("pg-prev")?.addEventListener("click", () => { state.page--; renderTable(); });
    document.getElementById("pg-next")?.addEventListener("click", () => { state.page++; renderTable(); });
    els.tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
  }

  function openForm(id = null) {
    const o = id ? state.orgs.find((x) => x.id === id) : null;
    window.CRM.openModal(
      o ? "Muassasani tahrirlash" : "Yangi muassasa",
      `<form id="org-form" class="form-grid">
        <div class="form-group full">
          <label>Muassasa nomi *</label>
          <input class="input" name="name" required value="${window.CRM.esc(o?.name || "")}" placeholder="3-oilaviy poliklinika">
        </div>
        <div class="form-group">
          <label>Muassasa turi *</label>
          <select class="select" name="org_type" required>
            ${Object.entries(ORG_TYPES).map(([k, v]) => `<option value="${k}" ${o?.org_type === k ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Hudud</label>
          <select class="select" name="territory_id">
            <option value="">Tanlanmagan</option>
            ${state.territories.map((t) => `<option value="${t.id}" ${o?.territory_id === t.id ? "selected" : ""}>${window.CRM.esc(t.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Telefon</label>
          <input class="input" name="phone" value="${window.CRM.esc(o?.phone || "")}">
        </div>
        <div class="form-group">
          <label>Mas'ul shaxs</label>
          <input class="input" name="contact_person" value="${window.CRM.esc(o?.contact_person || "")}">
        </div>
        <div class="form-group full">
          <label>Manzil</label>
          <input class="input" name="address" value="${window.CRM.esc(o?.address || "")}">
        </div>
        <div class="form-group">
          <label>Holati</label>
          <select class="select" name="status">
            <option value="active" ${(!o || o.status === "active") ? "selected" : ""}>Faol</option>
            <option value="inactive" ${o?.status === "inactive" ? "selected" : ""}>Nofaol</option>
          </select>
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="org-form" class="btn btn-primary">Saqlash</button>`
    );

    document.getElementById("org-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        name: String(fd.get("name") || "").trim(),
        org_type: fd.get("org_type") || "other",
        territory_id: fd.get("territory_id") || null,
        phone: String(fd.get("phone") || "").trim(),
        contact_person: String(fd.get("contact_person") || "").trim(),
        address: String(fd.get("address") || "").trim(),
        status: fd.get("status") || "active"
      };
      const res = o
        ? await window.sb.from("organizations").update(payload).eq("id", o.id)
        : await window.sb.from("organizations").insert(payload);

      if (res.error) {
        window.CRM.toast("Saqlashda xato: " + res.error.message, "error");
        return;
      }
      window.CRM.closeModal();
      window.CRM.toast(o ? "Muassasa yangilandi" : "Yangi muassasa qo'shildi", "success");
      await loadData();
    });
  }

  els.q.addEventListener("input", () => { state.page = 1; renderTable(); });
  els.type.addEventListener("change", () => { state.page = 1; renderTable(); });
  els.territory.addEventListener("change", () => { state.page = 1; renderTable(); });
  els.btnAdd.addEventListener("click", () => openForm(null));

  await loadData();
})();
