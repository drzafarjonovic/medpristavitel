/**
 * MedPred CRM — 10 turdagi hisobotlar va Excel/CSV eksport moduli
 */
(async function () {
  const user = await window.Auth.initPage("reports", "Hisobotlar");
  if (!user) return;

  const els = {
    type: document.getElementById("rep-type"),
    from: document.getElementById("rep-from"),
    to: document.getElementById("rep-to"),
    title: document.getElementById("rep-title"),
    count: document.getElementById("rep-count"),
    thead: document.getElementById("rep-thead"),
    tbody: document.getElementById("rep-tbody")
  };

  // Joriy oy sukut bo'yicha
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  els.from.value = today.slice(0, 8) + "01";
  els.to.value = today;

  const raw = { visits: [], visitServices: [], payments: [], bonusTx: [], doctors: [], medpreds: [] };
  let currentReport = { title: "", cols: [], rows: [] };

  async function loadData() {
    const [vRes, vsRes, pRes, bRes, dRes, mRes] = await Promise.all([
      window.sb.from("visits").select("*, patients(full_name, phone)").order("visit_date", { ascending: false }),
      window.sb.from("visit_services").select("*"),
      window.sb.from("payments").select("*").order("paid_at", { ascending: false }),
      window.sb.from("bonus_transactions").select("*"),
      window.sb.from("doctors").select("id, doctor_code, full_name"),
      window.sb.from("medpreds").select("id, medpred_code, full_name")
    ]);
    raw.visits = vRes.data || [];
    raw.visitServices = vsRes.data || [];
    raw.payments = pRes.data || [];
    raw.bonusTx = bRes.data || [];
    raw.doctors = dRes.data || [];
    raw.medpreds = mRes.data || [];
    buildReport();
  }

  function inRange(iso) {
    const d = (iso || "").slice(0, 10);
    return (!els.from.value || d >= els.from.value) && (!els.to.value || d <= els.to.value);
  }

  function buildReport() {
    const t = els.type.value;
    const vs = raw.visits.filter((v) => v.status === "completed" && inRange(v.visit_date));
    const vIds = new Set(vs.map((v) => v.id));
    let cols = [], rows = [], title = els.type.options[els.type.selectedIndex].text;

    if (t === "daily_visits") {
      const m = {};
      vs.forEach((v) => {
        const d = (v.visit_date || "").slice(0, 10);
        if (!m[d]) m[d] = { date: d, visits: 0, patients: new Set(), total: 0, paid: 0 };
        m[d].visits++; m[d].patients.add(v.patient_id);
        m[d].total += Number(v.total_amount || 0); m[d].paid += Number(v.paid_amount || 0);
      });
      cols = [
        { key: "date", label: "Sana" }, { key: "visits", label: "Tashriflar", type: "number", sum: true },
        { key: "patients", label: "Bemorlar", type: "number", sum: true },
        { key: "total", label: "Jami summa", type: "currency", sum: true },
        { key: "paid", label: "To'langan", type: "currency", sum: true }
      ];
      rows = Object.values(m).sort((a, b) => b.date.localeCompare(a.date)).map((x) => ({ ...x, patients: x.patients.size }));
    } else if (t === "monthly_visits") {
      const m = {};
      raw.visits.filter((v) => v.status === "completed").forEach((v) => {
        const ym = (v.visit_date || "").slice(0, 7);
        if (!m[ym]) m[ym] = { month: ym, visits: 0, total: 0, paid: 0, clinic: 0 };
        m[ym].visits++; m[ym].total += Number(v.total_amount || 0);
        m[ym].paid += Number(v.paid_amount || 0); m[ym].clinic += Number(v.clinic_net_amount || 0);
      });
      cols = [
        { key: "month", label: "Oy" }, { key: "visits", label: "Tashriflar", type: "number", sum: true },
        { key: "total", label: "Tushum", type: "currency", sum: true },
        { key: "paid", label: "To'langan", type: "currency", sum: true },
        { key: "clinic", label: "Klinika qoldig'i (prot.)", type: "currency", sum: true }
      ];
      rows = Object.values(m).sort((a, b) => b.month.localeCompare(a.month));
    } else if (t === "range_visits") {
      cols = [
        { key: "code", label: "Kod" }, { key: "date", label: "Sana" }, { key: "patient", label: "Bemor" },
        { key: "doctor", label: "Shifokor" }, { key: "medpred", label: "Medpred" },
        { key: "total", label: "Summa", type: "currency", sum: true },
        { key: "paid", label: "To'langan", type: "currency", sum: true },
        { key: "pay_status", label: "Holat" }
      ];
      rows = vs.map((v) => ({
        code: v.visit_code, date: (v.visit_date || "").slice(0, 10),
        patient: v.patients?.full_name || "—",
        doctor: `${v.doctor_name_snapshot} (${v.doctor_code_snapshot})`,
        medpred: v.medpred_name_snapshot || "—",
        total: Number(v.total_amount || 0), paid: Number(v.paid_amount || 0), pay_status: v.payment_status
      }));
    } else if (t === "by_doctors") {
      const m = {};
      vs.forEach((v) => {
        const k = v.doctor_id;
        if (!m[k]) m[k] = { code: v.doctor_code_snapshot, name: v.doctor_name_snapshot, medpred: v.medpred_name_snapshot || "—", visits: 0, patients: new Set(), total: 0, bonus: 0 };
        m[k].visits++; m[k].patients.add(v.patient_id);
        m[k].total += Number(v.total_amount || 0); m[k].bonus += Number(v.doctor_bonus_amount || 0);
      });
      cols = [
        { key: "code", label: "ID kod" }, { key: "name", label: "Shifokor" }, { key: "medpred", label: "Medpred" },
        { key: "patients", label: "Bemorlar", type: "number", sum: true }, { key: "visits", label: "Tashriflar", type: "number", sum: true },
        { key: "total", label: "Tushum", type: "currency", sum: true }, { key: "bonus", label: "Shifokor ulushi (prot.)", type: "currency", sum: true }
      ];
      rows = Object.values(m).map((x) => ({ ...x, patients: x.patients.size })).sort((a, b) => b.total - a.total);
    } else if (t === "by_medpreds") {
      const m = {};
      vs.forEach((v) => {
        const k = v.medpred_id || "none";
        if (!m[k]) m[k] = { name: v.medpred_name_snapshot || "Biriktirilmagan", doctors: new Set(), patients: new Set(), visits: 0, total: 0, bonus: 0 };
        m[k].doctors.add(v.doctor_id); m[k].patients.add(v.patient_id);
        m[k].visits++; m[k].total += Number(v.total_amount || 0); m[k].bonus += Number(v.medpred_bonus_amount || 0);
      });
      cols = [
        { key: "name", label: "Medpredstavitel" }, { key: "doctors", label: "Faol shifokor", type: "number" },
        { key: "patients", label: "Bemorlar", type: "number", sum: true }, { key: "visits", label: "Tashriflar", type: "number", sum: true },
        { key: "total", label: "Tushum", type: "currency", sum: true }, { key: "bonus", label: "Medpred ulushi (prot.)", type: "currency", sum: true }
      ];
      rows = Object.values(m).map((x) => ({ ...x, doctors: x.doctors.size, patients: x.patients.size })).sort((a, b) => b.total - a.total);
    } else if (t === "by_services") {
      const m = {};
      raw.visitServices.filter((s) => vIds.has(s.visit_id)).forEach((s) => {
        const k = s.service_name_snapshot;
        if (!m[k]) m[k] = { name: k, category: s.category_snapshot || "—", qty: 0, total: 0 };
        m[k].qty += Number(s.quantity || 1); m[k].total += Number(s.line_total || 0);
      });
      cols = [
        { key: "name", label: "Xizmat" }, { key: "category", label: "Kategoriya" },
        { key: "qty", label: "Soni", type: "number", sum: true }, { key: "total", label: "Tushum", type: "currency", sum: true }
      ];
      rows = Object.values(m).sort((a, b) => b.total - a.total);
    } else if (t === "payment_statuses") {
      const m = {};
      raw.visits.filter((v) => inRange(v.visit_date)).forEach((v) => {
        const k = v.status === "cancelled" ? "cancelled" : v.payment_status;
        if (!m[k]) m[k] = { status: k, count: 0, total: 0, paid: 0 };
        m[k].count++; m[k].total += Number(v.total_amount || 0); m[k].paid += Number(v.paid_amount || 0);
      });
      cols = [
        { key: "status", label: "Holat" }, { key: "count", label: "Tashriflar", type: "number", sum: true },
        { key: "total", label: "Jami summa", type: "currency", sum: true }, { key: "paid", label: "To'langan", type: "currency", sum: true }
      ];
      rows = Object.values(m);
    } else if (t === "temp_bonuses") {
      cols = [
        { key: "code", label: "Tashrif" }, { key: "date", label: "Sana" }, { key: "doctor", label: "Shifokor" },
        { key: "base", label: "Hisob bazasi", type: "currency", sum: true },
        { key: "doc_pct", label: "Shif. %", type: "number" }, { key: "doc_b", label: "Shif. ulushi", type: "currency", sum: true },
        { key: "rep_pct", label: "MP %", type: "number" }, { key: "rep_b", label: "MP ulushi", type: "currency", sum: true },
        { key: "clinic", label: "Klinika qoldig'i", type: "currency", sum: true }
      ];
      rows = vs.map((v) => ({
        code: v.visit_code, date: (v.visit_date || "").slice(0, 10), doctor: v.doctor_name_snapshot,
        base: Number(v.calc_base_amount || 0), doc_pct: Number(v.doctor_pct_snapshot || 0),
        doc_b: Number(v.doctor_bonus_amount || 0), rep_pct: Number(v.medpred_pct_snapshot || 0),
        rep_b: Number(v.medpred_bonus_amount || 0), clinic: Number(v.clinic_net_amount || 0)
      }));
    } else if (t === "payments_list") {
      cols = [
        { key: "date", label: "Sana" }, { key: "kind", label: "Turi" },
        { key: "method", label: "Usul" }, { key: "amount", label: "Summa", type: "currency", sum: true }, { key: "note", label: "Izoh" }
      ];
      rows = raw.payments.filter((p) => inRange(p.paid_at)).map((p) => ({
        date: (p.paid_at || "").slice(0, 10), kind: p.payment_kind, method: p.payment_method,
        amount: Number(p.amount || 0), note: p.note || ""
      }));
    } else if (t === "balances") {
      const agg = (type, list, idKey) => list.map((x) => {
        const txs = raw.bonusTx.filter((b) => b.recipient_type === type && b[idKey] === x.id);
        const accrued = txs.filter((b) => b.tx_type === "accrual").reduce((s, b) => s + Number(b.amount || 0), 0);
        const rev = txs.filter((b) => b.tx_type === "reversal").reduce((s, b) => s + Math.abs(Number(b.amount || 0)), 0);
        const paid = txs.filter((b) => b.tx_type === "payout").reduce((s, b) => s + Math.abs(Number(b.amount || 0)), 0);
        return { role: type === "doctor" ? "Shifokor" : "Medpred", code: x.doctor_code || x.medpred_code, name: x.full_name, accrued, rev, paid, due: accrued - rev - paid };
      }).filter((r) => r.accrued || r.paid);

      cols = [
        { key: "role", label: "Tur" }, { key: "code", label: "Kod" }, { key: "name", label: "F.I.Sh." },
        { key: "accrued", label: "Hisoblangan", type: "currency", sum: true },
        { key: "rev", label: "Bekor", type: "currency", sum: true },
        { key: "paid", label: "To'langan", type: "currency", sum: true },
        { key: "due", label: "Qoldiq (prot.)", type: "currency", sum: true }
      ];
      rows = [...agg("doctor", raw.doctors, "doctor_id"), ...agg("medpred", raw.medpreds, "medpred_id")].sort((a, b) => b.due - a.due);
    }

    currentReport = { title, cols, rows, key: t };
    els.title.textContent = title;
    els.count.textContent = `${rows.length} qator`;
    els.thead.innerHTML = `<tr>${cols.map((c) => `<th class="${c.type ? "text-right" : ""}">${window.CRM.esc(c.label)}</th>`).join("")}</tr>`;
    if (!rows.length) {
      els.tbody.innerHTML = `<tr><td colspan="${cols.length}" class="empty-state">Tanlangan davrda ma'lumot topilmadi.</td></tr>`;
      return;
    }
    els.tbody.innerHTML = rows.map((r) => `<tr>${cols.map((c) => {
      const v = r[c.key];
      const txt = c.type === "currency" ? window.CRM.fmtSom(v) : c.type === "number" ? window.CRM.fmtNum(v) : window.CRM.esc(v ?? "");
      return `<td class="${c.type ? "text-right mono" : ""}">${txt}</td>`;
    }).join("")}</tr>`).join("");
  }

  document.getElementById("btn-export-xlsx")?.addEventListener("click", () => {
    window.ExcelEngine.exportData(currentReport.rows, currentReport.cols, `hisobot_${currentReport.key}`, "xlsx");
  });
  document.getElementById("btn-export-csv")?.addEventListener("click", () => {
    window.ExcelEngine.exportData(currentReport.rows, currentReport.cols, `hisobot_${currentReport.key}`, "csv");
  });

  [els.type, els.from, els.to].forEach((el) => el.addEventListener("change", buildReport));
  await loadData();
})();
