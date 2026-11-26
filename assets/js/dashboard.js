/**
 * MedPred CRM — Dashboard statistikasi va Chart.js grafiklari
 */
(async function () {
  const user = await window.Auth.initPage("dashboard", "Dashboard");
  if (!user) return;

  const charts = {};
  const els = {
    period: document.getElementById("dash-period"),
    from: document.getElementById("dash-from"),
    to: document.getElementById("dash-to"),
    lbl: document.getElementById("dash-period-lbl"),
    kpis: document.getElementById("dash-kpis"),
    topDocs: document.getElementById("top-docs-tbody"),
    topSrvs: document.getElementById("top-srvs-tbody")
  };

  const cache = { medpreds: [], doctors: [], patients: [], visits: [], visitServices: [] };

  function isoDate(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function getRange() {
    const now = new Date();
    const today = isoDate(now);
    const p = els.period.value;

    if (p === "today") return { from: today, to: today, label: `Bugun (${today})` };
    if (p === "yesterday") {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const ys = isoDate(y);
      return { from: ys, to: ys, label: `Kecha (${ys})` };
    }
    if (p === "7d") {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      return { from: isoDate(s), to: today, label: `Oxirgi 7 kun (${isoDate(s)} — ${today})` };
    }
    if (p === "prev_month") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: isoDate(first), to: isoDate(last), label: `O'tgan oy (${isoDate(first)} — ${isoDate(last)})` };
    }
    if (p === "year") {
      const first = new Date(now.getFullYear(), 0, 1);
      return { from: isoDate(first), to: today, label: `Joriy yil (${isoDate(first)} — ${today})` };
    }
    if (p === "custom") {
      const f = els.from.value || today.slice(0, 8) + "01";
      const t = els.to.value || today;
      return { from: f, to: t, label: `${f} — ${t}` };
    }
    // month (default)
    const first = today.slice(0, 8) + "01";
    return { from: first, to: today, label: `Joriy oy (${first} — ${today})` };
  }

  async function loadAll() {
    const [mRes, dRes, pRes, vRes, vsRes] = await Promise.all([
      window.sb.from("medpreds").select("id, full_name, status"),
      window.sb.from("doctors").select("id, doctor_code, full_name, status"),
      window.sb.from("patients").select("id, created_at"),
      window.sb.from("visits").select("id, visit_date, patient_id, doctor_id, doctor_code_snapshot, doctor_name_snapshot, medpred_id, medpred_name_snapshot, total_amount, paid_amount, doctor_bonus_amount, medpred_bonus_amount, clinic_net_amount, status").eq("status", "completed"),
      window.sb.from("visit_services").select("visit_id, service_name_snapshot, quantity, line_total")
    ]);

    cache.medpreds = mRes.data || [];
    cache.doctors = dRes.data || [];
    cache.patients = pRes.data || [];
    cache.visits = vRes.data || [];
    cache.visitServices = vsRes.data || [];

    renderDashboard();
  }

  function destroyChart(key) {
    if (charts[key]) { charts[key].destroy(); delete charts[key]; }
  }

  function renderDashboard() {
    const rng = getRange();
    els.lbl.textContent = rng.label;
    const todayStr = isoDate(new Date());

    const visits = cache.visits.filter((v) => {
      const d = (v.visit_date || "").slice(0, 10);
      return d >= rng.from && d <= rng.to;
    });
    const visitIdSet = new Set(visits.map((v) => v.id));
    const vSrvs = cache.visitServices.filter((s) => visitIdSet.has(s.visit_id));

    const todayVisits = cache.visits.filter((v) => (v.visit_date || "").slice(0, 10) === todayStr);
    const todayRev = todayVisits.reduce((s, v) => s + Number(v.total_amount || 0), 0);

    const periodRev = visits.reduce((s, v) => s + Number(v.total_amount || 0), 0);
    const periodClinicNet = visits.reduce((s, v) => s + Number(v.clinic_net_amount || 0), 0);
    const periodPatients = new Set(visits.map((v) => v.patient_id)).size;

    const activeMp = cache.medpreds.filter((m) => m.status === "active").length;
    const activeDoc = cache.doctors.filter((d) => d.status === "active").length;

    els.kpis.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Davr tushumi</div>
        <div class="kpi-value" style="font-size:20px;color:var(--primary-ink);">${window.CRM.fmtSom(periodRev)}</div>
        <div class="kpi-sub">Bugun: ${window.CRM.fmtSom(todayRev)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Tashriflar / Bemorlar</div>
        <div class="kpi-value">${visits.length} / ${periodPatients}</div>
        <div class="kpi-sub">Jami baza: ${cache.patients.length} bemor</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Shifokorlar (Faol / Jami)</div>
        <div class="kpi-value">${activeDoc} / ${cache.doctors.length}</div>
        <div class="kpi-sub">Medpredlar: ${activeMp} / ${cache.medpreds.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Klinika qoldig'i (prot.)</div>
        <div class="kpi-value" style="font-size:20px;">${window.CRM.fmtSom(periodClinicNet)}</div>
        <div class="kpi-sub">Vaqtinchalik hisob-kitobdan keyin</div>
      </div>`;

    // 1 & 2. Kunlik/Oylik tushum va bemorlar dinamikasi
    const byDay = {};
    const patByDay = {};
    const groupMonthly = els.period.value === "year";
    visits.forEach((v) => {
      const key = groupMonthly ? (v.visit_date || "").slice(0, 7) : (v.visit_date || "").slice(0, 10);
      byDay[key] = (byDay[key] || 0) + Number(v.total_amount || 0);
      if (!patByDay[key]) patByDay[key] = new Set();
      patByDay[key].add(v.patient_id);
    });
    const labels = Object.keys(byDay).sort();

    destroyChart("rev");
    charts.rev = new Chart(document.getElementById("ch-revenue"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Tushum (so'm)",
          data: labels.map((k) => byDay[k]),
          backgroundColor: "#0c6f78",
          borderRadius: 6
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    destroyChart("pat");
    charts.pat = new Chart(document.getElementById("ch-patients"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Unikal bemorlar",
          data: labels.map((k) => patByDay[k]?.size || 0),
          borderColor: "#d95d39",
          backgroundColor: "rgba(217, 93, 57, 0.14)",
          fill: true,
          tension: 0.3
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // 3. Eng faol medpredlar
    const mpAgg = {};
    visits.forEach((v) => {
      const name = v.medpred_name_snapshot || "Biriktirilmagan";
      mpAgg[name] = (mpAgg[name] || 0) + Number(v.total_amount || 0);
    });
    const topMps = Object.entries(mpAgg).sort((a, b) => b[1] - a[1]).slice(0, 8);
    destroyChart("mp");
    charts.mp = new Chart(document.getElementById("ch-medpreds"), {
      type: "bar",
      data: {
        labels: topMps.map((x) => x[0]),
        datasets: [{ label: "Tushum", data: topMps.map((x) => x[1]), backgroundColor: "#2b547e", borderRadius: 6 }]
      },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // 4. Xizmatlar bo'yicha tushum
    const srvAgg = {};
    vSrvs.forEach((s) => {
      const n = s.service_name_snapshot || "Boshqa";
      if (!srvAgg[n]) srvAgg[n] = { qty: 0, sum: 0 };
      srvAgg[n].qty += Number(s.quantity || 1);
      srvAgg[n].sum += Number(s.line_total || 0);
    });
    const topSrvs = Object.entries(srvAgg).sort((a, b) => b[1].sum - a[1].sum).slice(0, 8);
    destroyChart("srv");
    charts.srv = new Chart(document.getElementById("ch-services"), {
      type: "bar",
      data: {
        labels: topSrvs.map((x) => x[0]),
        datasets: [{ label: "Tushum", data: topSrvs.map((x) => x[1].sum), backgroundColor: "#16794c", borderRadius: 6 }]
      },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // Top shifokorlar jadvali
    const docAgg = {};
    visits.forEach((v) => {
      const k = v.doctor_id;
      if (!docAgg[k]) docAgg[k] = { name: v.doctor_name_snapshot, code: v.doctor_code_snapshot, n: 0, sum: 0 };
      docAgg[k].n++;
      docAgg[k].sum += Number(v.total_amount || 0);
    });
    const topDocs = Object.values(docAgg).sort((a, b) => b.sum - a.sum).slice(0, 10);
    els.topDocs.innerHTML = topDocs.length
      ? topDocs.map((d) => `<tr>
          <td><strong>${window.CRM.esc(d.name)}</strong></td>
          <td class="mono"><span class="badge badge-primary">${window.CRM.esc(d.code)}</span></td>
          <td class="text-right mono">${d.n}</td>
          <td class="text-right mono"><strong>${window.CRM.fmtSom(d.sum)}</strong></td>
        </tr>`).join("")
      : `<tr><td colspan="4" class="empty-state">Bu davrda ma'lumot yo'q.</td></tr>`;

    // Top xizmatlar jadvali
    const topSrvRows = Object.entries(srvAgg).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
    els.topSrvs.innerHTML = topSrvRows.length
      ? topSrvRows.map(([name, val]) => `<tr>
          <td><strong>${window.CRM.esc(name)}</strong></td>
          <td class="text-right mono">${val.qty}</td>
          <td class="text-right mono"><strong>${window.CRM.fmtSom(val.sum)}</strong></td>
        </tr>`).join("")
      : `<tr><td colspan="3" class="empty-state">Bu davrda ma'lumot yo'q.</td></tr>`;
  }

  els.period.addEventListener("change", () => {
    const isCustom = els.period.value === "custom";
    els.from.classList.toggle("hidden", !isCustom);
    els.to.classList.toggle("hidden", !isCustom);
    renderDashboard();
  });
  els.from.addEventListener("change", renderDashboard);
  els.to.addEventListener("change", renderDashboard);

  await loadAll();
})();
