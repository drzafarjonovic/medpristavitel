/**
 * MedPred CRM — Bemorlar moduli (telefon/ID qidiruv, takroriy nazorat, tashrif tarixi)
 */
(async function () {
  const user = await window.Auth.initPage("patients", "Bemorlar");
  if (!user) return;

  const canManage = ["SUPERADMIN", "DIRECTOR", "RECEPTION"].includes(user.role);
  const canUseReception = ["SUPERADMIN", "DIRECTOR", "RECEPTION"].includes(user.role);
  const GENDER_UZ = { male: "Erkak", female: "Ayol", other: "Boshqa" };

  const state = {
    patients: [],
    page: 1,
    pageSize: 20
  };

  const els = {
    tbody: document.getElementById("pat-tbody"),
    footer: document.getElementById("pat-footer"),
    q: document.getElementById("filter-q"),
    gender: document.getElementById("filter-gender"),
    btnAdd: document.getElementById("btn-add-patient")
  };

  if (canManage) els.btnAdd.classList.remove("hidden");

  async function loadData() {
    const { data, error } = await window.sb
      .from("patients")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      window.CRM.toast("Bemorlarni yuklashda xato: " + error.message, "error");
      return;
    }
    state.patients = data || [];
    renderTable();
  }

  function getFiltered() {
    const q = els.q.value.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const g = els.gender.value;

    return state.patients.filter((p) => {
      if (g && p.gender !== g) return false;
      if (q) {
        const hay = [p.patient_code, p.full_name, p.phone, p.notes].join(" ").toLowerCase();
        const phoneHit = digits.length >= 4 && (p.phone_normalized || "").includes(digits);
        if (!hay.includes(q) && !phoneHit) return false;
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
      els.tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><strong>Bemorlar topilmadi</strong></td></tr>`;
    } else {
      els.tbody.innerHTML = slice.map((p) => `<tr>
        <td class="mono"><span class="badge badge-info">${window.CRM.esc(p.patient_code)}</span></td>
        <td>
          <strong>${window.CRM.esc(p.full_name)}</strong>
          ${p.notes ? `<div class="text-muted" style="font-size:12px;">${window.CRM.esc(p.notes.slice(0, 60))}</div>` : ""}
        </td>
        <td class="mono">${p.phone ? window.CRM.esc(p.phone) : `<span class="text-muted">Telefonsiz</span>`}</td>
        <td class="mono">${p.birth_date ? window.CRM.fmtDate(p.birth_date) : "—"}</td>
        <td>${window.CRM.esc(GENDER_UZ[p.gender] || "—")}</td>
        <td class="mono">${window.CRM.fmtDate(p.created_at)}</td>
        <td class="text-right" style="white-space:nowrap;">
          <button type="button" class="btn btn-sm" data-view="${p.id}">Tarix</button>
          ${canUseReception ? `<a class="btn btn-sm btn-primary" href="reception.html?patient_id=${encodeURIComponent(p.id)}">+ Tashrif</a>` : ""}
          ${canManage ? `<button type="button" class="btn btn-sm" data-edit="${p.id}">Tahrir</button>` : ""}
        </td>
      </tr>`).join("");
    }

    els.footer.innerHTML = `
      <span>Jami: <strong>${list.length}</strong> ta bemor</span>
      <div class="pagination">
        <button type="button" class="btn btn-sm" id="pg-prev" ${state.page <= 1 ? "disabled" : ""}>Oldingi</button>
        <span>${state.page} / ${totalPages}</span>
        <button type="button" class="btn btn-sm" id="pg-next" ${state.page >= totalPages ? "disabled" : ""}>Keyingi</button>
      </div>`;

    document.getElementById("pg-prev")?.addEventListener("click", () => { state.page--; renderTable(); });
    document.getElementById("pg-next")?.addEventListener("click", () => { state.page++; renderTable(); });
    els.tbody.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => openHistory(b.dataset.view)));
    els.tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
  }

  async function openHistory(patientId) {
    const p = state.patients.find((x) => x.id === patientId);
    if (!p) return;

    const { data: visits } = await window.sb
      .from("visits")
      .select("id, visit_code, visit_date, doctor_code_snapshot, doctor_name_snapshot, total_amount, paid_amount, payment_status, status")
      .eq("patient_id", patientId)
      .order("visit_date", { ascending: false });

    const vs = visits || [];
    window.CRM.openModal(
      `${p.full_name} (${p.patient_code})`,
      `<p class="text-muted" style="margin-top:0;">
        <strong>Telefon:</strong> ${window.CRM.esc(p.phone || "Telefonsiz")} ·
        <strong>Tug'ilgan sana:</strong> ${p.birth_date ? window.CRM.fmtDate(p.birth_date) : "—"} ·
        <strong>Jinsi:</strong> ${window.CRM.esc(GENDER_UZ[p.gender] || "—")}
      </p>
      <h4 style="margin:12px 0 8px;">Tashriflar tarixi (${vs.length})</h4>
      ${vs.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Kod</th><th>Sana</th><th>Shifokor</th><th class="text-right">Summa</th><th class="text-right">To'langan</th><th>Holat</th></tr></thead>
        <tbody>${vs.map((v) => `<tr>
          <td class="mono">${window.CRM.esc(v.visit_code)}</td>
          <td class="mono">${window.CRM.fmtDateTime(v.visit_date)}</td>
          <td>${window.CRM.esc(v.doctor_name_snapshot)} <span class="mono text-muted">(${window.CRM.esc(v.doctor_code_snapshot)})</span></td>
          <td class="text-right mono">${window.CRM.fmtSom(v.total_amount)}</td>
          <td class="text-right mono">${window.CRM.fmtSom(v.paid_amount)}</td>
          <td>${v.status === "cancelled" ? `<span class="badge badge-danger">Bekor</span>` : `<span class="badge badge-success">${window.CRM.esc(v.payment_status)}</span>`}</td>
        </tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">Hali tashriflar mavjud emas.</div>`}`,
      `${canUseReception ? `<a class="btn btn-primary" href="reception.html?patient_id=${encodeURIComponent(p.id)}">Yangi tashrif qo'shish</a>` : ""}
       <button type="button" class="btn" onclick="window.CRM.closeModal()">Yopish</button>`,
      true
    );
  }

  function openForm(id = null) {
    const p = id ? state.patients.find((x) => x.id === id) : null;
    window.CRM.openModal(
      p ? `Bemorni tahrirlash (${p.patient_code})` : "Yangi bemor qo'shish",
      `<form id="pat-form" class="form-grid">
        <div class="form-group full">
          <label>F.I.Sh. *</label>
          <input class="input" name="full_name" required value="${window.CRM.esc(p?.full_name || "")}" placeholder="Aliyev Vali">
        </div>
        <div class="form-group">
          <label>Telefon raqami (ixtiyoriy)</label>
          <input class="input" name="phone" id="pat-phone-input" placeholder="+998 90 123 45 67" value="${window.CRM.esc(p?.phone || "")}">
          <span class="form-hint" id="pat-dup-hint">Telefonsiz bemorlar uchun PT-ID avtomatik beriladi.</span>
        </div>
        <div class="form-group">
          <label>Tug'ilgan sana (ixtiyoriy)</label>
          <input class="input" name="birth_date" type="date" value="${window.CRM.esc(p?.birth_date || "")}">
        </div>
        <div class="form-group">
          <label>Jinsi (ixtiyoriy)</label>
          <select class="select" name="gender">
            <option value="">Ko'rsatilmagan</option>
            <option value="male" ${p?.gender === "male" ? "selected" : ""}>Erkak</option>
            <option value="female" ${p?.gender === "female" ? "selected" : ""}>Ayol</option>
          </select>
        </div>
        <div class="form-group full">
          <label>Izoh</label>
          <textarea class="textarea" name="notes">${window.CRM.esc(p?.notes || "")}</textarea>
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="pat-form" class="btn btn-primary">Saqlash</button>`
    );

    // Takroriy telefon ogohlantirishi
    document.getElementById("pat-phone-input")?.addEventListener("input", (ev) => {
      const digits = ev.target.value.replace(/\D/g, "");
      const hint = document.getElementById("pat-dup-hint");
      if (digits.length >= 9) {
        const dup = state.patients.find((x) => x.id !== p?.id && (x.phone_normalized || "").endsWith(digits.slice(-9)));
        if (dup) {
          hint.innerHTML = `<span style="color:var(--danger);font-weight:600;">Diqqat: bu raqam bazada bor — ${window.CRM.esc(dup.full_name)} (${dup.patient_code}).</span>`;
          return;
        }
      }
      hint.textContent = "Telefonsiz bemorlar uchun PT-ID avtomatik beriladi.";
    });

    document.getElementById("pat-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        full_name: String(fd.get("full_name") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        birth_date: fd.get("birth_date") || null,
        gender: fd.get("gender") || null,
        notes: String(fd.get("notes") || "").trim()
      };
      if (!p) payload.created_by = user.id;

      const res = p
        ? await window.sb.from("patients").update(payload).eq("id", p.id).select().single()
        : await window.sb.from("patients").insert(payload).select().single();

      if (res.error) {
        window.CRM.toast("Saqlashda xato: " + res.error.message, "error");
        return;
      }
      window.CRM.closeModal();
      window.CRM.toast(p ? "Bemor yangilandi" : `Bemor yaratildi: ${res.data.patient_code}`, "success");
      await loadData();
    });
  }

  els.q.addEventListener("input", () => { state.page = 1; renderTable(); });
  els.gender.addEventListener("change", () => { state.page = 1; renderTable(); });
  els.btnAdd.addEventListener("click", () => openForm(null));

  await loadData();
})();
