/**
 * MedPred CRM — Medpredstavitellar moduli
 */
(async function () {
  const user = await window.Auth.initPage("medpreds", "Medpredlar");
  if (!user) return;

  const canManage = ["SUPERADMIN", "MANAGER"].includes(user.role);
  const canSeeRate = ["SUPERADMIN", "DIRECTOR", "ACCOUNTANT", "MANAGER", "MEDPRED"].includes(user.role);

  const state = {
    medpreds: [],
    territories: [],
    doctors: [],
    visits: [],
    bonusTx: [],
    defaultRate: 3.0,
    page: 1,
    pageSize: 15
  };

  const els = {
    kpis: document.getElementById("mp-kpis"),
    tbody: document.getElementById("mp-tbody"),
    footer: document.getElementById("mp-footer"),
    q: document.getElementById("filter-q"),
    territory: document.getElementById("filter-territory"),
    status: document.getElementById("filter-status"),
    btnAdd: document.getElementById("btn-add-medpred"),
    btnTerr: document.getElementById("btn-territories")
  };

  if (canManage) {
    els.btnAdd.classList.remove("hidden");
    els.btnTerr.classList.remove("hidden");
  }

  async function loadData() {
    const [mRes, tRes, dRes, vRes, bRes, sRes] = await Promise.all([
      window.sb.from("medpreds").select("*, territories(name)").order("created_at", { ascending: false }),
      window.sb.from("territories").select("*").order("name"),
      window.sb.from("doctors").select("id, doctor_code, full_name, current_medpred_id, status"),
      window.sb.from("visits").select("id, medpred_id, patient_id, total_amount, medpred_bonus_amount, status").eq("status", "completed"),
      window.sb.from("bonus_transactions").select("medpred_id, tx_type, amount").eq("recipient_type", "medpred"),
      window.sb.from("system_settings").select("key, value").eq("key", "default_medpred_pct").maybeSingle()
    ]);

    if (mRes.error) {
      window.CRM.toast("Medpredlarni yuklashda xato: " + mRes.error.message, "error");
      return;
    }

    state.medpreds = mRes.data || [];
    state.territories = tRes.data || [];
    state.doctors = dRes.data || [];
    state.visits = vRes.data || [];
    state.bonusTx = bRes.data || [];
    if (sRes.data?.value != null) state.defaultRate = Number(sRes.data.value) || 3.0;

    const curT = els.territory.value;
    els.territory.innerHTML = `<option value="">Barcha hududlar</option>` +
      state.territories.map((t) => `<option value="${t.id}">${window.CRM.esc(t.name)}</option>`).join("");
    els.territory.value = curT;

    renderKpis();
    renderTable();
  }

  function calcMetrics(mpId) {
    const docs = state.doctors.filter((d) => d.current_medpred_id === mpId);
    const vs = state.visits.filter((v) => v.medpred_id === mpId);
    const patients = new Set(vs.map((v) => v.patient_id));
    const revenue = vs.reduce((s, v) => s + Number(v.total_amount || 0), 0);
    const txs = state.bonusTx.filter((t) => t.medpred_id === mpId);
    const earned = txs.filter((t) => t.tx_type !== "payout").reduce((s, t) => s + Number(t.amount || 0), 0);
    const paid = txs.filter((t) => t.tx_type === "payout").reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
    return {
      docCount: docs.length,
      docs,
      visitCount: vs.length,
      patientCount: patients.size,
      revenue,
      earned,
      paid,
      balance: earned - paid
    };
  }

  function renderKpis() {
    const activeCount = state.medpreds.filter((m) => m.status === "active").length;
    const totalRev = state.visits.reduce((s, v) => s + Number(v.total_amount || 0), 0);
    els.kpis.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Jami medpredlar</div>
        <div class="kpi-value">${state.medpreds.length}</div>
        <div class="kpi-sub">Faol: ${activeCount} ta</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Biriktirilgan shifokorlar</div>
        <div class="kpi-value">${state.doctors.length}</div>
        <div class="kpi-sub">Barcha hududlar bo'yicha</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Yakunlangan tashriflar</div>
        <div class="kpi-value">${state.visits.length}</div>
        <div class="kpi-sub">Yo'llanmalar orqali</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Umumiy tushum</div>
        <div class="kpi-value">${window.CRM.fmtSom(totalRev)}</div>
        <div class="kpi-sub">Tasdiqlangan tashriflar</div>
      </div>`;
  }

  function getFiltered() {
    const q = els.q.value.trim().toLowerCase();
    const tid = els.territory.value;
    const st = els.status.value;
    return state.medpreds.filter((m) => {
      if (tid && m.territory_id !== tid) return false;
      if (st && m.status !== st) return false;
      if (q) {
        const hay = [m.medpred_code, m.full_name, m.phone, m.address, m.territories?.name].join(" ").toLowerCase();
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
      els.tbody.innerHTML = `<tr><td colspan="10" class="empty-state"><strong>Medpredstavitellar topilmadi</strong></td></tr>`;
    } else {
      els.tbody.innerHTML = slice.map((m) => {
        const met = calcMetrics(m.id);
        return `<tr>
          <td class="mono"><strong>${window.CRM.esc(m.medpred_code)}</strong></td>
          <td>
            <strong>${window.CRM.esc(m.full_name)}</strong>
            <div class="text-muted" style="font-size:12.5px;">${window.CRM.esc(m.phone || "—")}</div>
          </td>
          <td>${window.CRM.esc(m.territories?.name || "—")}</td>
          <td class="mono">${window.CRM.fmtDate(m.hire_date)}</td>
          <td class="text-right mono">${met.docCount}</td>
          <td class="text-right mono">${met.visitCount}</td>
          <td class="text-right mono">${window.CRM.fmtSom(met.revenue)}</td>
          <td class="text-right mono">${canSeeRate ? Number(m.temp_rate_pct || 0) + "%" : "—"}</td>
          <td>${m.status === "active" ? `<span class="badge badge-success">Faol</span>` : `<span class="badge badge-neutral">Nofaol</span>`}</td>
          <td class="text-right" style="white-space:nowrap;">
            <button type="button" class="btn btn-sm" data-view="${m.id}">Profil</button>
            ${canManage ? `<button type="button" class="btn btn-sm" data-edit="${m.id}">Tahrir</button>` : ""}
          </td>
        </tr>`;
      }).join("");
    }

    els.footer.innerHTML = `
      <span>Jami: <strong>${list.length}</strong> ta medpred</span>
      <div class="pagination">
        <button type="button" class="btn btn-sm" id="pg-prev" ${state.page <= 1 ? "disabled" : ""}>Oldingi</button>
        <span>${state.page} / ${totalPages}</span>
        <button type="button" class="btn btn-sm" id="pg-next" ${state.page >= totalPages ? "disabled" : ""}>Keyingi</button>
      </div>`;

    document.getElementById("pg-prev")?.addEventListener("click", () => { state.page--; renderTable(); });
    document.getElementById("pg-next")?.addEventListener("click", () => { state.page++; renderTable(); });
    els.tbody.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => openProfile(b.dataset.view)));
    els.tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
  }

  function openProfile(id) {
    const m = state.medpreds.find((x) => x.id === id);
    if (!m) return;
    const met = calcMetrics(id);

    const docListHtml = met.docs.length
      ? `<table class="data-table"><thead><tr><th>ID kod</th><th>Shifokor</th><th>Holat</th></tr></thead><tbody>` +
        met.docs.map((d) => `<tr>
          <td class="mono"><strong>${window.CRM.esc(d.doctor_code)}</strong></td>
          <td>${window.CRM.esc(d.full_name)}</td>
          <td>${d.status === "active" ? `<span class="badge badge-success">Faol</span>` : `<span class="badge badge-neutral">Nofaol</span>`}</td>
        </tr>`).join("") + `</tbody></table>`
      : `<div class="empty-state">Hali shifokor biriktirilmagan.</div>`;

    window.CRM.openModal(
      `${m.full_name} (${m.medpred_code})`,
      `<div class="alert alert-info">
        <i data-lucide="info"></i>
        <div>Vaqtinchalik hisob-kitoblar (prototip): stavka <strong>${Number(m.temp_rate_pct || 0)}%</strong>. Bu ko'rsatkichlar shartnoma tasdiqlangunga qadar faqat nazorat uchundir.</div>
      </div>
      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-label">Shifokorlar</div><div class="kpi-value">${met.docCount}</div></div>
        <div class="kpi-card"><div class="kpi-label">Bemorlar / Tashrif</div><div class="kpi-value">${met.patientCount} / ${met.visitCount}</div></div>
        <div class="kpi-card"><div class="kpi-label">Umumiy tushum</div><div class="kpi-value" style="font-size:18px;">${window.CRM.fmtSom(met.revenue)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Vaqtinchalik balans</div><div class="kpi-value" style="font-size:18px;">${window.CRM.fmtSom(met.balance)}</div><div class="kpi-sub">Hisob: ${window.CRM.fmtSom(met.earned)} · To'lov: ${window.CRM.fmtSom(met.paid)}</div></div>
      </div>
      <p class="text-muted" style="font-size:13.5px;margin-bottom:14px;">
        <strong>Telefon:</strong> ${window.CRM.esc(m.phone || "—")} ·
        <strong>Hudud:</strong> ${window.CRM.esc(m.territories?.name || "—")} ·
        <strong>Manzil:</strong> ${window.CRM.esc(m.address || "—")}<br>
        <strong>Izoh:</strong> ${window.CRM.esc(m.notes || "—")}
      </p>
      <h4 style="margin:0 0 8px;">Biriktirilgan shifokorlar (${met.docCount})</h4>
      <div class="table-wrap">${docListHtml}</div>`,
      `<button type="button" class="btn btn-primary" onclick="window.CRM.closeModal()">Yopish</button>`,
      true
    );
  }

  function openForm(id = null) {
    const m = id ? state.medpreds.find((x) => x.id === id) : null;
    window.CRM.openModal(
      m ? "Medpredstavitelni tahrirlash" : "Yangi medpredstavitel",
      `<form id="mp-form" class="form-grid">
        <div class="form-group full">
          <label>F.I.Sh. *</label>
          <input class="input" name="full_name" required value="${window.CRM.esc(m?.full_name || "")}">
        </div>
        <div class="form-group">
          <label>Telefon raqami</label>
          <input class="input" name="phone" placeholder="+998 90 123 45 67" value="${window.CRM.esc(m?.phone || "")}">
        </div>
        <div class="form-group">
          <label>Hudud</label>
          <select class="select" name="territory_id">
            <option value="">Tanlanmagan</option>
            ${state.territories.map((t) => `<option value="${t.id}" ${m?.territory_id === t.id ? "selected" : ""}>${window.CRM.esc(t.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Ish boshlagan sana</label>
          <input class="input" name="hire_date" type="date" value="${window.CRM.esc(m?.hire_date || new Date().toISOString().slice(0, 10))}">
        </div>
        <div class="form-group">
          <label>Holati</label>
          <select class="select" name="status">
            <option value="active" ${(!m || m.status === "active") ? "selected" : ""}>Faol</option>
            <option value="inactive" ${m?.status === "inactive" ? "selected" : ""}>Nofaol</option>
          </select>
        </div>
        <div class="form-group">
          <label>Vaqtinchalik foiz stavkasi, % (prototip)</label>
          <input class="input" name="temp_rate_pct" type="number" step="0.1" min="0" max="100" value="${window.CRM.esc(m?.temp_rate_pct ?? state.defaultRate)}">
        </div>
        <div class="form-group">
          <label>Manzil</label>
          <input class="input" name="address" value="${window.CRM.esc(m?.address || "")}">
        </div>
        <div class="form-group full">
          <label>Izoh</label>
          <textarea class="textarea" name="notes">${window.CRM.esc(m?.notes || "")}</textarea>
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="mp-form" class="btn btn-primary">Saqlash</button>`
    );

    document.getElementById("mp-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        full_name: String(fd.get("full_name") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        territory_id: fd.get("territory_id") || null,
        hire_date: fd.get("hire_date") || new Date().toISOString().slice(0, 10),
        status: fd.get("status") || "active",
        temp_rate_pct: Number(fd.get("temp_rate_pct") || 0),
        address: String(fd.get("address") || "").trim(),
        notes: String(fd.get("notes") || "").trim()
      };

      const res = m
        ? await window.sb.from("medpreds").update(payload).eq("id", m.id)
        : await window.sb.from("medpreds").insert(payload);

      if (res.error) {
        window.CRM.toast("Saqlashda xato: " + res.error.message, "error");
        return;
      }
      window.CRM.closeModal();
      window.CRM.toast(m ? "Medpred yangilandi" : "Yangi medpred qo'shildi", "success");
      await loadData();
    });
  }

  function openTerritoriesModal() {
    window.CRM.openModal(
      "Hududlarni boshqarish",
      `<form id="terr-form" class="toolbar" style="margin-bottom:16px;">
        <input class="input grow" name="name" required placeholder="Yangi hudud nomi (masalan: Chilonzor)">
        <input class="input" name="region" style="width:160px;" placeholder="Viloyat/Shahar">
        <button type="submit" class="btn btn-primary">Qo'shish</button>
      </form>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Hudud</th><th>Viloyat</th><th>Holat</th></tr></thead>
          <tbody>
            ${state.territories.map((t) => `<tr><td><strong>${window.CRM.esc(t.name)}</strong></td><td>${window.CRM.esc(t.region || "—")}</td><td><span class="badge badge-success">Faol</span></td></tr>`).join("")}
          </tbody>
        </table>
      </div>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Yopish</button>`
    );

    document.getElementById("terr-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const { error } = await window.sb.from("territories").insert({
        name: String(fd.get("name") || "").trim(),
        region: String(fd.get("region") || "").trim()
      });
      if (error) {
        window.CRM.toast("Xato: " + error.message, "error");
        return;
      }
      window.CRM.toast("Hudud qo'shildi", "success");
      await loadData();
      openTerritoriesModal();
    });
  }

  els.q.addEventListener("input", () => { state.page = 1; renderTable(); });
  els.territory.addEventListener("change", () => { state.page = 1; renderTable(); });
  els.status.addEventListener("change", () => { state.page = 1; renderTable(); });
  els.btnAdd.addEventListener("click", () => openForm(null));
  els.btnTerr.addEventListener("click", openTerritoriesModal);

  await loadData();
})();
