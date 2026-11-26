/**
 * MedPred CRM — Sozlamalar, Filiallar va Audit jurnali moduli
 */
(async function () {
  const user = await window.Auth.initPage("settings", "Sozlamalar");
  if (!user) return;

  const isSuper = user.role === "SUPERADMIN";
  const form = document.getElementById("settings-form");
  const saveBtn = document.getElementById("btn-save-settings");
  const branchForm = document.getElementById("branch-form");

  if (isSuper) {
    saveBtn.classList.remove("hidden");
    branchForm.classList.remove("hidden");
  } else {
    form.querySelectorAll("input, select").forEach((el) => { el.disabled = true; });
  }

  let auditRows = [];

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      ["tab-general", "tab-branches", "tab-audit"].forEach((id) => {
        document.getElementById(id).classList.toggle("hidden", id !== btn.dataset.tab);
      });
      if (btn.dataset.tab === "tab-audit") loadAudit();
    });
  });

  async function loadSettings() {
    const { data, error } = await window.sb.from("system_settings").select("key, value");
    if (error) return window.CRM.toast("Sozlamalarni yuklashda xato: " + error.message, "error");
    const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    document.getElementById("set-clinic-name").value = map.clinic_name ?? "MedPred Klinika CRM";
    document.getElementById("set-bonus-enabled").value = String(map.referral_calc_enabled ?? true);
    document.getElementById("set-calc-base").value = map.calc_base_mode ?? "after_discount";
    document.getElementById("set-doc-pct").value = Number(map.default_doctor_pct ?? 10);
    document.getElementById("set-rep-pct").value = Number(map.default_medpred_pct ?? 3);
    document.getElementById("set-allow-disc").value = String(map.allow_reception_discount ?? true);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isSuper) return;
    const fd = new FormData(form);
    const updates = [
      { key: "clinic_name", value: String(fd.get("clinic_name") || "").trim(), updated_by: user.id },
      { key: "referral_calc_enabled", value: fd.get("referral_calc_enabled") === "true", updated_by: user.id },
      { key: "calc_base_mode", value: String(fd.get("calc_base_mode") || "after_discount"), updated_by: user.id },
      { key: "default_doctor_pct", value: Number(fd.get("default_doctor_pct") || 0), updated_by: user.id },
      { key: "default_medpred_pct", value: Number(fd.get("default_medpred_pct") || 0), updated_by: user.id },
      { key: "allow_reception_discount", value: fd.get("allow_reception_discount") === "true", updated_by: user.id }
    ];

    const { error } = await window.sb.from("system_settings").upsert(updates, { onConflict: "key" });
    if (error) return window.CRM.toast("Saqlashda xato: " + error.message, "error");
    window.CRM.toast("Sozlamalar saqlandi va audit jurnaliga yozildi", "success");
  });

  async function loadBranches() {
    const { data } = await window.sb.from("branches").select("*").order("code");
    const tbody = document.getElementById("branches-tbody");
    tbody.innerHTML = (data || []).map((b) => `<tr>
      <td class="mono"><strong>${window.CRM.esc(b.code)}</strong></td>
      <td>${window.CRM.esc(b.name)}</td>
      <td>${window.CRM.esc(b.address || "—")}</td>
      <td>${b.is_active ? `<span class="badge badge-success">Faol</span>` : `<span class="badge badge-neutral">Nofaol</span>`}</td>
    </tr>`).join("");
  }

  branchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(branchForm);
    const { error } = await window.sb.from("branches").insert({
      code: String(fd.get("code") || "").trim().toUpperCase(),
      name: String(fd.get("name") || "").trim(),
      address: String(fd.get("address") || "").trim()
    });
    if (error) return window.CRM.toast("Xato: " + error.message, "error");
    branchForm.reset();
    window.CRM.toast("Filial qo'shildi", "success");
    await loadBranches();
  });

  async function loadAudit() {
    let q = window.sb.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(150);
    const tbl = document.getElementById("audit-table").value;
    const act = document.getElementById("audit-action").value;
    if (tbl) q = q.eq("table_name", tbl);
    if (act) q = q.eq("action", act);
    const { data, error } = await q;
    if (error) return window.CRM.toast("Audit jurnalini yuklashda xato: " + error.message, "error");
    auditRows = data || [];
    const tbody = document.getElementById("audit-tbody");
    if (!auditRows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Audit yozuvlari topilmadi.</td></tr>`;
      return;
    }
    tbody.innerHTML = auditRows.map((a, idx) => `<tr>
      <td class="mono">${window.CRM.fmtDateTime(a.created_at)}</td>
      <td><span class="badge badge-neutral">${window.CRM.esc(a.actor_role)}</span></td>
      <td class="mono">${window.CRM.esc(a.table_name)}</td>
      <td><span class="badge ${a.action === "DELETE" ? "badge-danger" : a.action === "UPDATE" ? "badge-warning" : "badge-success"}">${window.CRM.esc(a.action)}</span></td>
      <td class="mono" style="font-size:12px;">${window.CRM.esc((a.record_id || "").slice(0, 18))}</td>
      <td class="text-right"><button type="button" class="btn btn-sm" data-audit-idx="${idx}">JSON</button></td>
    </tr>`).join("");

    tbody.querySelectorAll("[data-audit-idx]").forEach((b) => {
      b.addEventListener("click", () => {
        const row = auditRows[Number(b.dataset.auditIdx)];
        window.CRM.openModal(
          `Audit: ${row.table_name} (${row.action})`,
          `<div class="form-grid">
            <div class="form-group">
              <label>Oldingi holat (old_data)</label>
              <pre class="mono" style="background:var(--surface-2);padding:10px;border-radius:8px;overflow:auto;max-height:320px;font-size:12px;">${window.CRM.esc(JSON.stringify(row.old_data, null, 2))}</pre>
            </div>
            <div class="form-group">
              <label>Yangi holat (new_data)</label>
              <pre class="mono" style="background:var(--surface-2);padding:10px;border-radius:8px;overflow:auto;max-height:320px;font-size:12px;">${window.CRM.esc(JSON.stringify(row.new_data, null, 2))}</pre>
            </div>
          </div>`,
          `<button type="button" class="btn btn-primary" onclick="window.CRM.closeModal()">Yopish</button>`,
          true
        );
      });
    });
  }

  document.getElementById("audit-table").addEventListener("change", loadAudit);
  document.getElementById("audit-action").addEventListener("change", loadAudit);
  document.getElementById("btn-refresh-audit").addEventListener("click", loadAudit);

  await Promise.all([loadSettings(), loadBranches()]);
})();
