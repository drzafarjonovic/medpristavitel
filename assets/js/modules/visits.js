/**
 * MedPred CRM — Tashriflar jurnali (tarixiy snapshotlar, qisman to'lov, bekor qilish + refund)
 */
(async function () {
  const user = await window.Auth.initPage("visits", "Tashriflar");
  if (!user) return;

  const canAdd = ["SUPERADMIN", "DIRECTOR", "RECEPTION"].includes(user.role);
  const canPay = ["SUPERADMIN", "DIRECTOR", "RECEPTION", "ACCOUNTANT"].includes(user.role);
  const canCancel = ["SUPERADMIN", "DIRECTOR", "RECEPTION", "ACCOUNTANT"].includes(user.role);
  const canSeeBonus = ["SUPERADMIN", "DIRECTOR", "ACCOUNTANT", "MEDPRED"].includes(user.role);

  if (canAdd) document.getElementById("btn-go-reception")?.classList.remove("hidden");

  const state = {
    visits: [],
    page: 1,
    pageSize: 20
  };

  const els = {
    tbody: document.getElementById("vis-tbody"),
    footer: document.getElementById("vis-footer"),
    q: document.getElementById("filter-q"),
    from: document.getElementById("filter-from"),
    to: document.getElementById("filter-to"),
    pay: document.getElementById("filter-pay"),
    status: document.getElementById("filter-status")
  };

  async function loadData() {
    const { data, error } = await window.sb
      .from("visits")
      .select("*, patients(patient_code, full_name, phone)")
      .order("visit_date", { ascending: false })
      .limit(1000);

    if (error) {
      window.CRM.toast("Tashriflarni yuklashda xato: " + error.message, "error");
      return;
    }
    state.visits = data || [];
    renderTable();
  }

  function getFiltered() {
    const q = els.q.value.trim().toLowerCase();
    const from = els.from.value;
    const to = els.to.value;
    const pay = els.pay.value;
    const st = els.status.value;

    return state.visits.filter((v) => {
      const d = (v.visit_date || "").slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (pay && v.payment_status !== pay) return false;
      if (st && v.status !== st) return false;
      if (q) {
        const hay = [
          v.visit_code, v.doctor_code_snapshot, v.doctor_name_snapshot,
          v.medpred_name_snapshot, v.patients?.full_name, v.patients?.phone, v.patients?.patient_code
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function payBadge(v) {
    if (v.status === "cancelled") return `<span class="badge badge-danger">Bekor qilingan</span>`;
    const map = {
      paid: `<span class="badge badge-success">To'langan</span>`,
      partial: `<span class="badge badge-warning">Qisman</span>`,
      unpaid: `<span class="badge badge-danger">To'lanmagan</span>`,
      refunded: `<span class="badge badge-neutral">Qaytarilgan</span>`
    };
    return map[v.payment_status] || v.payment_status;
  }

  function renderTable() {
    const list = getFiltered();
    const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const slice = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    if (!slice.length) {
      els.tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><strong>Tashriflar topilmadi</strong></td></tr>`;
    } else {
      els.tbody.innerHTML = slice.map((v) => `<tr>
        <td>
          <strong class="mono">${window.CRM.esc(v.visit_code)}</strong>
          <div class="text-muted mono" style="font-size:12px;">${window.CRM.fmtDateTime(v.visit_date)}</div>
        </td>
        <td>
          <strong>${window.CRM.esc(v.patients?.full_name || "—")}</strong>
          <div class="text-muted mono" style="font-size:12px;">${window.CRM.esc(v.patients?.phone || v.patients?.patient_code || "")}</div>
        </td>
        <td>
          <span class="badge badge-primary mono">${window.CRM.esc(v.doctor_code_snapshot)}</span>
          <div style="font-size:13px;margin-top:2px;">${window.CRM.esc(v.doctor_name_snapshot)}</div>
        </td>
        <td>${window.CRM.esc(v.medpred_name_snapshot || "—")}</td>
        <td class="text-right mono"><strong>${window.CRM.fmtSom(v.total_amount)}</strong></td>
        <td class="text-right mono">${window.CRM.fmtSom(v.paid_amount)}</td>
        <td>${payBadge(v)}</td>
        <td class="text-right" style="white-space:nowrap;">
          <button type="button" class="btn btn-sm" data-view="${v.id}">Batafsil</button>
        </td>
      </tr>`).join("");
    }

    const totalSum = list.filter((x) => x.status === "completed").reduce((s, x) => s + Number(x.total_amount || 0), 0);
    els.footer.innerHTML = `
      <span>Jami: <strong>${list.length}</strong> ta tashrif · Faol summa: <strong class="mono">${window.CRM.fmtSom(totalSum)}</strong></span>
      <div class="pagination">
        <button type="button" class="btn btn-sm" id="pg-prev" ${state.page <= 1 ? "disabled" : ""}>Oldingi</button>
        <span>${state.page} / ${totalPages}</span>
        <button type="button" class="btn btn-sm" id="pg-next" ${state.page >= totalPages ? "disabled" : ""}>Keyingi</button>
      </div>`;

    document.getElementById("pg-prev")?.addEventListener("click", () => { state.page--; renderTable(); });
    document.getElementById("pg-next")?.addEventListener("click", () => { state.page++; renderTable(); });
    els.tbody.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.view)));
  }

  async function openDetail(visitId) {
    const v = state.visits.find((x) => x.id === visitId);
    if (!v) return;

    const [vsRes, payRes, refRes] = await Promise.all([
      window.sb.from("visit_services").select("*").eq("visit_id", visitId),
      window.sb.from("payments").select("*").eq("visit_id", visitId).order("paid_at", { ascending: false }),
      window.sb.from("refunds").select("*").eq("visit_id", visitId).order("refunded_at", { ascending: false })
    ]);

    const items = vsRes.data || [];
    const pays = payRes.data || [];
    const refs = refRes.data || [];
    const rem = Math.max(0, Number(v.total_amount || 0) - Number(v.paid_amount || 0));

    const footerBtns = [];
    if (v.status === "completed" && canPay && rem > 0) {
      footerBtns.push(`<button type="button" class="btn btn-primary" id="btn-det-pay">Qisman to'lov (${window.CRM.fmtSom(rem)})</button>`);
    }
    if (v.status === "completed" && canCancel) {
      footerBtns.push(`<button type="button" class="btn btn-danger" id="btn-det-cancel">Tashrifni bekor qilish</button>`);
    }
    footerBtns.push(`<button type="button" class="btn" onclick="window.CRM.closeModal()">Yopish</button>`);

    window.CRM.openModal(
      `Tashrif ${v.visit_code}`,
      `<div style="display:grid;gap:14px;">
        <div class="card" style="padding:14px;background:var(--surface-2);">
          <div><strong>Bemor:</strong> ${window.CRM.esc(v.patients?.full_name || "—")} (${window.CRM.esc(v.patients?.patient_code || "")}) · ${window.CRM.esc(v.patients?.phone || "")}</div>
          <div><strong>Shifokor (snapshot):</strong> ${window.CRM.esc(v.doctor_name_snapshot)} (${window.CRM.esc(v.doctor_code_snapshot)})</div>
          <div><strong>Medpred (snapshot):</strong> ${window.CRM.esc(v.medpred_name_snapshot || "—")} · <strong>Sana:</strong> ${window.CRM.fmtDateTime(v.visit_date)}</div>
          ${v.status === "cancelled" ? `<div style="color:var(--danger);margin-top:6px;"><strong>Bekor qilish sababi:</strong> ${window.CRM.esc(v.cancel_reason)}</div>` : ""}
        </div>

        <div>
          <h4 style="margin:0 0 8px;">Xizmatlar (tarixiy narxlar bilan)</h4>
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>Xizmat</th><th>Kategoriya</th><th class="text-right">Narx (snapshot)</th><th class="text-right">Soni</th><th class="text-right">Jami</th></tr></thead>
            <tbody>${items.map((it) => `<tr>
              <td><strong>${window.CRM.esc(it.service_name_snapshot)}</strong></td>
              <td>${window.CRM.esc(it.category_snapshot || "—")}</td>
              <td class="text-right mono">${window.CRM.fmtSom(it.unit_price)}</td>
              <td class="text-right mono">${it.quantity}</td>
              <td class="text-right mono"><strong>${window.CRM.fmtSom(it.line_total)}</strong></td>
            </tr>`).join("")}</tbody>
          </table></div>
        </div>

        <div class="kpi-grid" style="margin-bottom:0;">
          <div class="kpi-card"><div class="kpi-label">Yakuniy summa</div><div class="kpi-value" style="font-size:18px;">${window.CRM.fmtSom(v.total_amount)}</div><div class="kpi-sub">Chegirma: ${window.CRM.fmtSom(v.discount_amount)}</div></div>
          <div class="kpi-card"><div class="kpi-label">To'langan / Qoldiq</div><div class="kpi-value" style="font-size:18px;">${window.CRM.fmtSom(v.paid_amount)}</div><div class="kpi-sub">Qoldiq: ${window.CRM.fmtSom(rem)}</div></div>
          ${canSeeBonus ? `<div class="kpi-card"><div class="kpi-label">Prototip hisob-kitob</div><div class="kpi-sub">Shifokor (${v.doctor_pct_snapshot}%): <strong>${window.CRM.fmtSom(v.doctor_bonus_amount)}</strong><br>Medpred (${v.medpred_pct_snapshot}%): <strong>${window.CRM.fmtSom(v.medpred_bonus_amount)}</strong></div></div>` : ""}
        </div>

        ${pays.length ? `<div><h4 style="margin:0 0 6px;">To'lovlar tarixi</h4>
          <div class="table-wrap"><table class="data-table"><thead><tr><th>Sana</th><th>Usul</th><th class="text-right">Summa</th><th>Izoh</th></tr></thead>
          <tbody>${pays.map((p) => `<tr><td class="mono">${window.CRM.fmtDateTime(p.paid_at)}</td><td>${window.CRM.esc(p.payment_method)}</td><td class="text-right mono">${window.CRM.fmtSom(p.amount)}</td><td>${window.CRM.esc(p.note || "—")}</td></tr>`).join("")}</tbody></table></div></div>` : ""}

        ${refs.length ? `<div><h4 style="margin:0 0 6px;color:var(--danger);">Qaytarilgan mablag'lar (Refund)</h4>
          <div class="table-wrap"><table class="data-table"><thead><tr><th>Sana</th><th class="text-right">Summa</th><th>Sabab</th></tr></thead>
          <tbody>${refs.map((r) => `<tr><td class="mono">${window.CRM.fmtDateTime(r.refunded_at)}</td><td class="text-right mono">${window.CRM.fmtSom(r.amount)}</td><td>${window.CRM.esc(r.reason)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
      </div>`,
      footerBtns.join(""),
      true
    );

    document.getElementById("btn-det-pay")?.addEventListener("click", () => openPayModal(v, rem));
    document.getElementById("btn-det-cancel")?.addEventListener("click", () => openCancelModal(v));
  }

  function openPayModal(v, rem) {
    window.CRM.openModal(
      `To'lov qo'shish — ${v.visit_code}`,
      `<form id="vis-pay-form" class="form-grid">
        <div class="form-group">
          <label>Summa (maks: ${window.CRM.fmtSom(rem)}) *</label>
          <input class="input mono" name="amount" type="number" min="1" max="${rem}" required value="${Math.round(rem)}">
        </div>
        <div class="form-group">
          <label>To'lov usuli</label>
          <select class="select" name="method">
            <option value="cash">Naqd</option>
            <option value="card">Plastik karta</option>
            <option value="transfer">O'tkazma</option>
            <option value="other">Boshqa</option>
          </select>
        </div>
        <div class="form-group full">
          <label>Izoh</label>
          <input class="input" name="note" placeholder="Qisman to'lov...">
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="vis-pay-form" class="btn btn-primary">Saqlash</button>`
    );

    document.getElementById("vis-pay-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await window.CRM.rpc("rpc_record_visit_payment", {
          p_visit_id: v.id,
          p_amount: Number(fd.get("amount")),
          p_payment_method: fd.get("method"),
          p_note: String(fd.get("note") || "").trim()
        });
        window.CRM.closeModal();
        window.CRM.toast("To'lov qayd etildi", "success");
        await loadData();
      } catch (err) {
        window.CRM.toast("Xato: " + err.message, "error");
      }
    });
  }

  function openCancelModal(v) {
    window.CRM.openModal(
      `Tashrifni bekor qilish — ${v.visit_code}`,
      `<div class="alert alert-warning">
        <i data-lucide="alert-triangle"></i>
        <div>Tashrif bazadan o'chirilmaydi — <strong>bekor qilingan</strong> holatga o'tadi, prototip bonuslari teskari yozuv (reversal) bilan yopiladi va barcha o'zgarish audit jurnaliga yoziladi.</div>
      </div>
      <form id="vis-cancel-form" class="form-grid">
        <div class="form-group full">
          <label>Bekor qilish sababi *</label>
          <input class="input" name="reason" required placeholder="Bemor fikridan qaytdi / xato kiritildi...">
        </div>
        <div class="form-group">
          <label>Qaytariladigan summa (maks: ${window.CRM.fmtSom(v.paid_amount)})</label>
          <input class="input mono" name="refund_amount" type="number" min="0" max="${Number(v.paid_amount || 0)}" value="${Math.round(Number(v.paid_amount || 0))}">
        </div>
        <div class="form-group">
          <label>Qaytarish usuli</label>
          <select class="select" name="refund_method">
            <option value="cash">Naqd</option>
            <option value="card">Plastik karta</option>
            <option value="transfer">O'tkazma</option>
            <option value="other">Boshqa</option>
          </select>
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Orqaga</button>
       <button type="submit" form="vis-cancel-form" class="btn btn-danger">Bekor qilishni tasdiqlash</button>`
    );

    document.getElementById("vis-cancel-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await window.CRM.rpc("rpc_cancel_visit", {
          p_visit_id: v.id,
          p_reason: String(fd.get("reason") || "").trim(),
          p_refund_amount: Number(fd.get("refund_amount") || 0),
          p_refund_method: fd.get("refund_method")
        });
        window.CRM.closeModal();
        window.CRM.toast("Tashrif bekor qilindi va audit jurnaliga yozildi", "success");
        await loadData();
      } catch (err) {
        window.CRM.toast("Xato: " + err.message, "error");
      }
    });
  }

  [els.q, els.from, els.to, els.pay, els.status].forEach((el) => {
    el.addEventListener("input", () => { state.page = 1; renderTable(); });
    el.addEventListener("change", () => { state.page = 1; renderTable(); });
  });

  await loadData();
})();
