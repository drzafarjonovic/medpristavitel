/**
 * MedPred CRM — To'lovlar, Refundlar va Vaqtinchalik referal balanslari moduli
 */
(async function () {
  const user = await window.Auth.initPage("payments", "To'lovlar");
  if (!user) return;

  const canPayout = ["SUPERADMIN", "ACCOUNTANT"].includes(user.role);
  const KIND_UZ = {
    visit_payment: "Bemor tashrif to'lovi",
    doctor_payout: "Shifokorga to'lov (prot.)",
    medpred_payout: "Medpredga to'lov (prot.)"
  };
  const METHOD_UZ = { cash: "Naqd", card: "Karta", transfer: "O'tkazma", other: "Boshqa" };

  const state = {
    doctors: [],
    medpreds: [],
    txs: [],
    payments: [],
    refunds: [],
    activeTab: user.role === "MEDPRED" ? "tab-reps" : "tab-docs"
  };

  const els = {
    kpis: document.getElementById("pay-kpis"),
    docsBody: document.getElementById("bal-docs-tbody"),
    repsBody: document.getElementById("bal-reps-tbody"),
    allBody: document.getElementById("all-pay-tbody"),
    refBody: document.getElementById("refunds-tbody"),
    kind: document.getElementById("filter-kind"),
    method: document.getElementById("filter-method"),
    from: document.getElementById("filter-from"),
    to: document.getElementById("filter-to")
  };

  // Medpred faqat o'z balansini ko'radi
  if (user.role === "MEDPRED") {
    document.querySelector('[data-tab="tab-docs"]')?.classList.add("hidden");
    document.querySelector('[data-tab="tab-refunds"]')?.classList.add("hidden");
    switchTab("tab-reps");
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
    ["tab-docs", "tab-reps", "tab-all", "tab-refunds"].forEach((id) => {
      document.getElementById(id)?.classList.toggle("hidden", id !== tabId);
    });
  }

  document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  async function loadData() {
    const [dRes, mRes, txRes, pRes, rRes] = await Promise.all([
      window.sb.from("doctors").select("id, doctor_code, full_name"),
      window.sb.from("medpreds").select("id, medpred_code, full_name"),
      window.sb.from("bonus_transactions").select("*"),
      window.sb.from("payments").select("*, visits(visit_code), doctors(full_name, doctor_code), medpreds(full_name, medpred_code)").order("paid_at", { ascending: false }).limit(500),
      window.sb.from("refunds").select("*, visits(visit_code)").order("refunded_at", { ascending: false }).limit(300)
    ]);

    state.doctors = dRes.data || [];
    state.medpreds = mRes.data || [];
    state.txs = txRes.data || [];
    state.payments = pRes.data || [];
    state.refunds = rRes.data || [];

    renderAll();
  }

  function computeBalances(type) {
    const list = type === "doctor" ? state.doctors : state.medpreds;
    const idKey = type === "doctor" ? "doctor_id" : "medpred_id";
    return list.map((entity) => {
      const rows = state.txs.filter((t) => t.recipient_type === type && t[idKey] === entity.id);
      const accrued = rows.filter((t) => t.tx_type === "accrual").reduce((s, t) => s + Number(t.amount || 0), 0);
      const reversed = rows.filter((t) => t.tx_type === "reversal").reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
      const paid = rows.filter((t) => t.tx_type === "payout").reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
      const balance = accrued - reversed - paid;
      return {
        id: entity.id,
        name: entity.full_name,
        code: type === "doctor" ? entity.doctor_code : entity.medpred_code,
        accrued, reversed, paid, balance
      };
    }).filter((r) => r.accrued > 0 || r.paid > 0 || r.reversed > 0).sort((a, b) => b.balance - a.balance);
  }

  function renderAll() {
    const docBals = computeBalances("doctor");
    const repBals = computeBalances("medpred");

    const visitPaidSum = state.payments.filter((p) => p.payment_kind === "visit_payment").reduce((s, p) => s + Number(p.amount || 0), 0);
    const refundSum = state.refunds.reduce((s, r) => s + Number(r.amount || 0), 0);
    const docDue = docBals.reduce((s, x) => s + Math.max(0, x.balance), 0);
    const repDue = repBals.reduce((s, x) => s + Math.max(0, x.balance), 0);

    els.kpis.innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Tashrif to'lovlari</div><div class="kpi-value" style="font-size:20px;">${window.CRM.fmtSom(visitPaidSum)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Qaytarilgan (Refund)</div><div class="kpi-value" style="font-size:20px;">${window.CRM.fmtSom(refundSum)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Shifokorlar qoldig'i (prot.)</div><div class="kpi-value" style="font-size:20px;">${window.CRM.fmtSom(docDue)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Medpredlar qoldig'i (prot.)</div><div class="kpi-value" style="font-size:20px;">${window.CRM.fmtSom(repDue)}</div></div>`;

    renderBalanceTable(els.docsBody, docBals, "doctor");
    renderBalanceTable(els.repsBody, repBals, "medpred");
    renderPaymentsTable();
    renderRefundsTable();
  }

  function renderBalanceTable(tbody, rows, type) {
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Hisoblangan vaqtinchalik ulushlar hali mavjud emas.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => `<tr>
      <td><strong>${window.CRM.esc(r.name)}</strong></td>
      <td class="mono"><span class="badge badge-primary">${window.CRM.esc(r.code)}</span></td>
      <td class="text-right mono">${window.CRM.fmtSom(r.accrued)}</td>
      <td class="text-right mono">${window.CRM.fmtSom(r.reversed)}</td>
      <td class="text-right mono">${window.CRM.fmtSom(r.paid)}</td>
      <td class="text-right mono"><strong>${window.CRM.fmtSom(r.balance)}</strong></td>
      <td class="text-right">
        ${canPayout && r.balance > 0 ? `<button type="button" class="btn btn-sm btn-primary" data-payout-type="${type}" data-payout-id="${r.id}" data-payout-name="${window.CRM.esc(r.name)}" data-payout-bal="${Math.round(r.balance)}">To'lov qayd etish</button>` : `<span class="text-muted">—</span>`}
      </td>
    </tr>`).join("");

    tbody.querySelectorAll("[data-payout-id]").forEach((btn) => {
      btn.addEventListener("click", () => openPayoutModal(
        btn.dataset.payoutType, btn.dataset.payoutId, btn.dataset.payoutName, Number(btn.dataset.payoutBal)
      ));
    });
  }

  function openPayoutModal(type, id, name, bal) {
    window.CRM.openModal(
      `To'lovni qayd etish — ${name}`,
      `<div class="alert alert-info">
        <i data-lucide="info"></i>
        <div>Bu amal to'lovni <code>payments</code> va <code>bonus_transactions</code> jurnallariga qo'shadi hamda audit logda saqlanadi.</div>
      </div>
      <form id="payout-form" class="form-grid">
        <div class="form-group">
          <label>Summa (qoldiq: ${window.CRM.fmtSom(bal)}) *</label>
          <input class="input mono" name="amount" type="number" min="1" required value="${bal}">
        </div>
        <div class="form-group">
          <label>Usul</label>
          <select class="select" name="method">
            <option value="cash">Naqd</option>
            <option value="card">Plastik karta</option>
            <option value="transfer">O'tkazma</option>
            <option value="other">Boshqa</option>
          </select>
        </div>
        <div class="form-group full">
          <label>Izoh</label>
          <input class="input" name="note" placeholder="Oy yakuni bo'yicha hisob-kitob...">
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="payout-form" class="btn btn-primary">Tasdiqlash</button>`
    );

    document.getElementById("payout-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await window.CRM.rpc("rpc_record_bonus_payout", {
          p_recipient_type: type,
          p_recipient_id: id,
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

  function filteredPayments() {
    const k = els.kind.value;
    const m = els.method.value;
    const f = els.from.value;
    const t = els.to.value;
    return state.payments.filter((p) => {
      const d = (p.paid_at || "").slice(0, 10);
      if (k && p.payment_kind !== k) return false;
      if (m && p.payment_method !== m) return false;
      if (f && d < f) return false;
      if (t && d > t) return false;
      return true;
    });
  }

  function renderPaymentsTable() {
    const list = filteredPayments();
    if (!list.length) {
      els.allBody.innerHTML = `<tr><td colspan="6" class="empty-state">To'lovlar topilmadi.</td></tr>`;
      return;
    }
    els.allBody.innerHTML = list.map((p) => {
      const target = p.payment_kind === "visit_payment"
        ? `Tashrif ${p.visits?.visit_code || "—"}`
        : p.payment_kind === "doctor_payout"
          ? `${p.doctors?.full_name || "—"} (${p.doctors?.doctor_code || ""})`
          : `${p.medpreds?.full_name || "—"} (${p.medpreds?.medpred_code || ""})`;
      return `<tr>
        <td class="mono">${window.CRM.fmtDateTime(p.paid_at)}</td>
        <td><span class="badge badge-neutral">${window.CRM.esc(KIND_UZ[p.payment_kind] || p.payment_kind)}</span></td>
        <td>${window.CRM.esc(target)}</td>
        <td>${window.CRM.esc(METHOD_UZ[p.payment_method] || p.payment_method)}</td>
        <td class="text-right mono"><strong>${window.CRM.fmtSom(p.amount)}</strong></td>
        <td>${window.CRM.esc(p.note || "—")}</td>
      </tr>`;
    }).join("");
  }

  function renderRefundsTable() {
    if (!state.refunds.length) {
      els.refBody.innerHTML = `<tr><td colspan="5" class="empty-state">Qaytarilgan mablag'lar mavjud emas.</td></tr>`;
      return;
    }
    els.refBody.innerHTML = state.refunds.map((r) => `<tr>
      <td class="mono">${window.CRM.fmtDateTime(r.refunded_at)}</td>
      <td class="mono">${window.CRM.esc(r.visits?.visit_code || "—")}</td>
      <td>${window.CRM.esc(METHOD_UZ[r.refund_method] || r.refund_method)}</td>
      <td class="text-right mono" style="color:var(--danger);"><strong>${window.CRM.fmtSom(r.amount)}</strong></td>
      <td>${window.CRM.esc(r.reason)}</td>
    </tr>`).join("");
  }

  document.getElementById("btn-export-pay")?.addEventListener("click", () => {
    if (state.activeTab === "tab-docs" || state.activeTab === "tab-reps") {
      const type = state.activeTab === "tab-docs" ? "doctor" : "medpred";
      const rows = computeBalances(type);
      window.ExcelEngine.exportData(rows, [
        { key: "code", label: "ID kod" },
        { key: "name", label: "F.I.Sh." },
        { key: "accrued", label: "Hisoblangan", type: "currency", sum: true },
        { key: "reversed", label: "Bekor qilingan", type: "currency", sum: true },
        { key: "paid", label: "To'langan", type: "currency", sum: true },
        { key: "balance", label: "Vaqtinchalik qoldiq", type: "currency", sum: true }
      ], `balans_${type}`, "xlsx");
    } else {
      const rows = filteredPayments().map((p) => ({
        date: (p.paid_at || "").slice(0, 10),
        kind: KIND_UZ[p.payment_kind] || p.payment_kind,
        method: METHOD_UZ[p.payment_method] || p.payment_method,
        amount: p.amount,
        note: p.note
      }));
      window.ExcelEngine.exportData(rows, [
        { key: "date", label: "Sana" },
        { key: "kind", label: "Turi" },
        { key: "method", label: "Usul" },
        { key: "amount", label: "Summa", type: "currency", sum: true },
        { key: "note", label: "Izoh" }
      ], "tolovlar", "xlsx");
    }
  });

  [els.kind, els.method, els.from, els.to].forEach((el) => el.addEventListener("change", renderPaymentsTable));

  await loadData();
})();
