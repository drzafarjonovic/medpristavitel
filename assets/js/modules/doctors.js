/**
 * MedPred CRM — Shifokorlar moduli (DR-0001 auto ID, ko'p muassasa, biriktirish tarixi)
 */
(async function () {
  const user = await window.Auth.initPage("doctors", "Shifokorlar");
  if (!user) return;

  const canCreate = ["SUPERADMIN", "MANAGER", "MEDPRED"].includes(user.role);
  const canReassign = ["SUPERADMIN", "DIRECTOR", "MANAGER"].includes(user.role);
  const canEditRate = ["SUPERADMIN", "MANAGER"].includes(user.role);
  const canSeeRate = ["SUPERADMIN", "DIRECTOR", "MANAGER", "ACCOUNTANT"].includes(user.role);

  const state = {
    doctors: [],
    medpreds: [],
    specialties: [],
    territories: [],
    organizations: [],
    workplaces: [],
    defaultRate: 10.0,
    page: 1,
    pageSize: 15
  };

  const els = {
    tbody: document.getElementById("doc-tbody"),
    footer: document.getElementById("doc-footer"),
    q: document.getElementById("filter-q"),
    medpred: document.getElementById("filter-medpred"),
    territory: document.getElementById("filter-territory"),
    status: document.getElementById("filter-status"),
    btnAdd: document.getElementById("btn-add-doctor")
  };

  if (canCreate) els.btnAdd.classList.remove("hidden");
  if (user.role === "MEDPRED") els.medpred.classList.add("hidden");

  async function loadData() {
    const [dRes, mRes, spRes, tRes, oRes, wpRes, sRes] = await Promise.all([
      window.sb.from("doctors")
        .select("*, specialties(name), territories(name), medpreds(id, full_name, medpred_code)")
        .order("created_at", { ascending: false }),
      window.sb.from("medpreds").select("id, full_name, medpred_code, status").order("full_name"),
      window.sb.from("specialties").select("id, name").eq("is_active", true).order("name"),
      window.sb.from("territories").select("id, name").eq("is_active", true).order("name"),
      window.sb.from("organizations").select("id, name, org_type").eq("status", "active").order("name"),
      window.sb.from("doctor_workplaces").select("id, doctor_id, organization_id, position, is_primary, organizations(name)").eq("is_active", true),
      window.sb.from("system_settings").select("value").eq("key", "default_doctor_pct").maybeSingle()
    ]);

    if (dRes.error) {
      window.CRM.toast("Shifokorlarni yuklashda xato: " + dRes.error.message, "error");
      return;
    }

    state.doctors = dRes.data || [];
    state.medpreds = mRes.data || [];
    state.specialties = spRes.data || [];
    state.territories = tRes.data || [];
    state.organizations = oRes.data || [];
    state.workplaces = wpRes.data || [];
    if (sRes.data?.value != null) state.defaultRate = Number(sRes.data.value) || 10.0;

    const curM = els.medpred.value;
    els.medpred.innerHTML = `<option value="">Barcha medpredlar</option>` +
      state.medpreds.map((m) => `<option value="${m.id}">${window.CRM.esc(m.full_name)}</option>`).join("");
    els.medpred.value = curM;

    const curT = els.territory.value;
    els.territory.innerHTML = `<option value="">Barcha hududlar</option>` +
      state.territories.map((t) => `<option value="${t.id}">${window.CRM.esc(t.name)}</option>`).join("");
    els.territory.value = curT;

    renderTable();
  }

  function docWorkplaces(docId) {
    return state.workplaces.filter((w) => w.doctor_id === docId);
  }

  function getFiltered() {
    let q = els.q.value.trim().toLowerCase();
    const mpId = els.medpred.value;
    const tId = els.territory.value;
    const st = els.status.value;
    const normCodeQ = /^\d{1,5}$/.test(q) ? "dr-" + q.padStart(4, "0") : "";

    return state.doctors.filter((d) => {
      if (mpId && d.current_medpred_id !== mpId) return false;
      if (tId && d.territory_id !== tId) return false;
      if (st && d.status !== st) return false;
      if (q) {
        const wps = docWorkplaces(d.id).map((w) => w.organizations?.name || "").join(" ");
        const hay = [d.doctor_code, d.full_name, d.phone, d.specialties?.name, d.medpreds?.full_name, wps].join(" ").toLowerCase();
        if (!hay.includes(q) && (!normCodeQ || !d.doctor_code.toLowerCase().includes(normCodeQ))) return false;
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
      els.tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><strong>Shifokorlar topilmadi</strong></td></tr>`;
    } else {
      els.tbody.innerHTML = slice.map((d) => {
        const wps = docWorkplaces(d.id);
        const wpText = wps.length
          ? wps.map((w) => window.CRM.esc(w.organizations?.name || "") + (w.is_primary ? " ★" : "")).join(", ")
          : `<span class="text-muted">Ko'rsatilmagan</span>`;
        return `<tr>
          <td class="mono"><span class="badge badge-primary">${window.CRM.esc(d.doctor_code)}</span></td>
          <td>
            <strong>${window.CRM.esc(d.full_name)}</strong>
            <div class="text-muted" style="font-size:12.5px;">${window.CRM.esc(d.specialties?.name || "Mutaxassislik ko'rsatilmagan")}</div>
          </td>
          <td style="max-width:220px;font-size:13px;">${wpText}</td>
          <td>${window.CRM.esc(d.medpreds?.full_name || "—")}</td>
          <td class="mono">${window.CRM.esc(d.phone || "—")}</td>
          <td class="text-right mono">${canSeeRate ? Number(d.temp_rate_pct || 0) + "%" : "—"}</td>
          <td>${d.status === "active" ? `<span class="badge badge-success">Faol</span>` : `<span class="badge badge-neutral">Nofaol</span>`}</td>
          <td class="text-right" style="white-space:nowrap;">
            <button type="button" class="btn btn-sm" data-view="${d.id}">Batafsil</button>
            ${canCreate ? `<button type="button" class="btn btn-sm" data-edit="${d.id}">Tahrir</button>` : ""}
          </td>
        </tr>`;
      }).join("");
    }

    els.footer.innerHTML = `
      <span>Jami: <strong>${list.length}</strong> ta shifokor</span>
      <div class="pagination">
        <button type="button" class="btn btn-sm" id="pg-prev" ${state.page <= 1 ? "disabled" : ""}>Oldingi</button>
        <span>${state.page} / ${totalPages}</span>
        <button type="button" class="btn btn-sm" id="pg-next" ${state.page >= totalPages ? "disabled" : ""}>Keyingi</button>
      </div>`;

    document.getElementById("pg-prev")?.addEventListener("click", () => { state.page--; renderTable(); });
    document.getElementById("pg-next")?.addEventListener("click", () => { state.page++; renderTable(); });
    els.tbody.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.view)));
    els.tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
  }

  async function openDetail(id) {
    const d = state.doctors.find((x) => x.id === id);
    if (!d) return;

    const [assignRes, visitRes] = await Promise.all([
      window.sb.from("doctor_assignments")
        .select("id, assigned_from, assigned_to, is_current, note, medpreds(full_name, medpred_code)")
        .eq("doctor_id", id)
        .order("assigned_from", { ascending: false }),
      window.sb.from("visits")
        .select("id, visit_code, visit_date, total_amount, status, medpred_name_snapshot")
        .eq("doctor_id", id)
        .order("visit_date", { ascending: false })
        .limit(10)
    ]);

    const assigns = assignRes.data || [];
    const visits = visitRes.data || [];
    const wps = docWorkplaces(id);

    const assignHtml = assigns.length
      ? `<table class="data-table"><thead><tr><th>Medpred</th><th>Dan</th><th>Gacha</th><th>Holat</th><th>Izoh</th></tr></thead><tbody>` +
        assigns.map((a) => `<tr>
          <td><strong>${window.CRM.esc(a.medpreds?.full_name || "—")}</strong></td>
          <td class="mono">${window.CRM.fmtDate(a.assigned_from)}</td>
          <td class="mono">${a.assigned_to ? window.CRM.fmtDate(a.assigned_to) : "Hozirgacha"}</td>
          <td>${a.is_current ? `<span class="badge badge-success">Joriy</span>` : `<span class="badge badge-neutral">Tarixiy</span>`}</td>
          <td>${window.CRM.esc(a.note || "—")}</td>
        </tr>`).join("") + `</tbody></table>`
      : `<p class="text-muted">Biriktirish tarixi mavjud emas.</p>`;

    const wpHtml = wps.length
      ? wps.map((w) => `<span class="badge badge-info" style="margin:0 6px 6px 0;">${window.CRM.esc(w.organizations?.name || "")}${w.is_primary ? " (Asosiy)" : ""}</span>`).join("")
      : `<span class="text-muted">Muassasa biriktirilmagan</span>`;

    window.CRM.openModal(
      `${d.full_name} — ${d.doctor_code}`,
      `<div style="display:grid;gap:14px;">
        <div class="card" style="padding:14px;">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div>
              <div><strong>Mutaxassislik:</strong> ${window.CRM.esc(d.specialties?.name || "—")}</div>
              <div><strong>Telefon:</strong> ${window.CRM.esc(d.phone || "—")} · <strong>Hudud:</strong> ${window.CRM.esc(d.territories?.name || "—")}</div>
              <div><strong>Joriy medpred:</strong> ${window.CRM.esc(d.medpreds?.full_name || "—")}</div>
            </div>
            ${canReassign ? `<button type="button" class="btn btn-sm btn-primary" id="btn-reassign-doc">Medpredni o'zgartirish</button>` : ""}
          </div>
          <div style="margin-top:10px;"><strong>Ish joylari:</strong><div style="margin-top:6px;">${wpHtml}</div></div>
        </div>

        <div>
          <h4 style="margin:0 0 8px;">Medpred biriktirish tarixi</h4>
          <div class="table-wrap">${assignHtml}</div>
        </div>

        <div>
          <h4 style="margin:0 0 8px;">Oxirgi tashriflar (${visits.length})</h4>
          ${visits.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Kod</th><th>Sana</th><th>Tarixiy medpred</th><th class="text-right">Summa</th><th>Holat</th></tr></thead><tbody>` +
            visits.map((v) => `<tr>
              <td class="mono">${window.CRM.esc(v.visit_code)}</td>
              <td class="mono">${window.CRM.fmtDate(v.visit_date)}</td>
              <td>${window.CRM.esc(v.medpred_name_snapshot || "—")}</td>
              <td class="text-right mono">${window.CRM.fmtSom(v.total_amount)}</td>
              <td>${v.status === "completed" ? `<span class="badge badge-success">Bajarildi</span>` : `<span class="badge badge-danger">Bekor</span>`}</td>
            </tr>`).join("") + `</tbody></table></div>` : `<p class="text-muted">Hali tashrif yo'q.</p>`}
        </div>
      </div>`,
      `<button type="button" class="btn btn-primary" onclick="window.CRM.closeModal()">Yopish</button>`,
      true
    );

    document.getElementById("btn-reassign-doc")?.addEventListener("click", () => openReassignModal(d));
  }

  function openReassignModal(doc) {
    window.CRM.openModal(
      `Medpredni o'zgartirish — ${doc.full_name}`,
      `<div class="alert alert-info">
        <i data-lucide="history"></i>
        <div>Eski tashriflar avvalgi medpred hisobida saqlanib qoladi. Yangi biriktirish <code>doctor_assignments</code> jadvalida tarix sifatida yoziladi.</div>
      </div>
      <form id="reassign-form" class="form-grid">
        <div class="form-group full">
          <label>Yangi medpredstavitel *</label>
          <select class="select" name="medpred_id" required>
            <option value="">Tanlang...</option>
            ${state.medpreds.filter((m) => m.status === "active").map((m) => `<option value="${m.id}" ${m.id === doc.current_medpred_id ? "selected" : ""}>${window.CRM.esc(m.full_name)} (${window.CRM.esc(m.medpred_code)})</option>`).join("")}
          </select>
        </div>
        <div class="form-group full">
          <label>Sabab / izoh</label>
          <input class="input" name="note" placeholder="Hudud o'zgarishi, qayta taqsimlash...">
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="reassign-form" class="btn btn-primary">Biriktirishni saqlash</button>`
    );

    document.getElementById("reassign-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await window.CRM.rpc("rpc_assign_doctor_medpred", {
          p_doctor_id: doc.id,
          p_new_medpred_id: fd.get("medpred_id"),
          p_note: String(fd.get("note") || "").trim()
        });
        window.CRM.closeModal();
        window.CRM.toast("Shifokor yangi medpredga biriktirildi", "success");
        await loadData();
      } catch (err) {
        window.CRM.toast("Xato: " + err.message, "error");
      }
    });
  }

  function openForm(id = null) {
    const d = id ? state.doctors.find((x) => x.id === id) : null;
    const linkedOrgIds = d ? docWorkplaces(d.id).map((w) => w.organization_id) : [];
    const lockedMedpredId = user.role === "MEDPRED" ? user.medpred?.id : null;

    if (user.role === "MEDPRED" && !lockedMedpredId) {
      window.CRM.toast("Profilingiz medpred yozuviga bog'lanmagan. Administratorga murojaat qiling.", "error");
      return;
    }

    window.CRM.openModal(
      d ? `Shifokorni tahrirlash (${d.doctor_code})` : "Yangi shifokor (DR-kod avtomatik beriladi)",
      `<form id="doc-form" class="form-grid">
        <div class="form-group full">
          <label>F.I.Sh. *</label>
          <input class="input" name="full_name" required value="${window.CRM.esc(d?.full_name || "")}">
        </div>
        <div class="form-group">
          <label>Mutaxassisligi</label>
          <select class="select" name="specialty_id">
            <option value="">Tanlanmagan</option>
            ${state.specialties.map((s) => `<option value="${s.id}" ${d?.specialty_id === s.id ? "selected" : ""}>${window.CRM.esc(s.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Telefon</label>
          <input class="input" name="phone" placeholder="+998 90 123 45 67" value="${window.CRM.esc(d?.phone || "")}">
        </div>
        <div class="form-group">
          <label>Hudud</label>
          <select class="select" name="territory_id">
            <option value="">Tanlanmagan</option>
            ${state.territories.map((t) => `<option value="${t.id}" ${d?.territory_id === t.id ? "selected" : ""}>${window.CRM.esc(t.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Biriktirilgan medpred *</label>
          ${lockedMedpredId
            ? `<input class="input" disabled value="${window.CRM.esc(user.medpred.full_name)}"><input type="hidden" name="current_medpred_id" value="${lockedMedpredId}">`
            : `<select class="select" name="current_medpred_id" ${d ? "disabled" : "required"}>
                <option value="">Tanlang...</option>
                ${state.medpreds.map((m) => `<option value="${m.id}" ${d?.current_medpred_id === m.id ? "selected" : ""}>${window.CRM.esc(m.full_name)}</option>`).join("")}
              </select>${d ? `<span class="form-hint">Medpredni o'zgartirish uchun «Batafsil → Medpredni o'zgartirish» dan foydalaning.</span>` : ""}`
          }
        </div>
        ${canEditRate ? `
        <div class="form-group">
          <label>Vaqtinchalik ulush % (prototip)</label>
          <input class="input" name="temp_rate_pct" type="number" step="0.1" min="0" max="100" value="${window.CRM.esc(d?.temp_rate_pct ?? state.defaultRate)}">
        </div>` : ""}
        <div class="form-group">
          <label>Holati</label>
          <select class="select" name="status">
            <option value="active" ${(!d || d.status === "active") ? "selected" : ""}>Faol</option>
            <option value="inactive" ${d?.status === "inactive" ? "selected" : ""}>Nofaol</option>
          </select>
        </div>
        <div class="form-group full">
          <label>Ish joylari (bir nechta muassasa tanlash mumkin)</label>
          <div style="max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:9px;padding:10px;display:grid;gap:6px;">
            ${state.organizations.length
              ? state.organizations.map((o) => `<label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;">
                  <input type="checkbox" name="org_ids" value="${o.id}" ${linkedOrgIds.includes(o.id) ? "checked" : ""}>
                  <span>${window.CRM.esc(o.name)}</span>
                </label>`).join("")
              : `<span class="text-muted">Avval «Muassasalar» bo'limida muassasa qo'shing.</span>`}
          </div>
        </div>
        <div class="form-group full">
          <label>Izoh</label>
          <textarea class="textarea" name="notes">${window.CRM.esc(d?.notes || "")}</textarea>
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="doc-form" class="btn btn-primary">Saqlash</button>`,
      true
    );

    document.getElementById("doc-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const selectedOrgs = fd.getAll("org_ids");
      const payload = {
        full_name: String(fd.get("full_name") || "").trim(),
        specialty_id: fd.get("specialty_id") || null,
        phone: String(fd.get("phone") || "").trim(),
        territory_id: fd.get("territory_id") || null,
        status: fd.get("status") || "active",
        notes: String(fd.get("notes") || "").trim()
      };
      if (canEditRate && fd.get("temp_rate_pct") !== null) {
        payload.temp_rate_pct = Number(fd.get("temp_rate_pct") || 0);
      }
      if (!d) {
        payload.current_medpred_id = lockedMedpredId || fd.get("current_medpred_id") || null;
        payload.created_by = user.id;
      }

      const res = d
        ? await window.sb.from("doctors").update(payload).eq("id", d.id).select().single()
        : await window.sb.from("doctors").insert(payload).select().single();

      if (res.error) {
        window.CRM.toast("Saqlashda xato: " + res.error.message, "error");
        return;
      }

      const savedDoc = res.data;
      // Ko'p muassasa bog'lanishlarini sinxronlash
      await window.sb.from("doctor_workplaces").delete().eq("doctor_id", savedDoc.id);
      if (selectedOrgs.length) {
        const wpRows = selectedOrgs.map((orgId, idx) => ({
          doctor_id: savedDoc.id,
          organization_id: orgId,
          is_primary: idx === 0,
          is_active: true
        }));
        await window.sb.from("doctor_workplaces").insert(wpRows);
      }

      window.CRM.closeModal();
      window.CRM.toast(
        d ? "Shifokor yangilandi" : `Shifokor qo'shildi! Unikal ID: ${savedDoc.doctor_code}`,
        "success"
      );
      await loadData();
    });
  }

  els.q.addEventListener("input", () => { state.page = 1; renderTable(); });
  els.medpred.addEventListener("change", () => { state.page = 1; renderTable(); });
  els.territory.addEventListener("change", () => { state.page = 1; renderTable(); });
  els.status.addEventListener("change", () => { state.page = 1; renderTable(); });
  els.btnAdd.addEventListener("click", () => openForm(null));

  await loadData();
})();
