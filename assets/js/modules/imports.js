/**
 * MedPred CRM — Excel Import/Export markazi (Mapping, Preview, INSERT/UPDATE/SKIP, Error Export)
 */
(async function () {
  const user = await window.Auth.initPage("imports", "Excel Import / Export");
  if (!user) return;

  const SCHEMAS = {
    services: {
      label: "Xizmatlar",
      fields: [
        { key: "name", label: "Xizmat nomi", required: true, aliases: ["nomi", "xizmat", "service", "name", "услуга"] },
        { key: "category", label: "Kategoriya", required: false, aliases: ["kategoriya", "category", "bolim", "категория"] },
        { key: "price", label: "Narxi", required: true, type: "number", aliases: ["narx", "narxi", "summa", "price", "цена"] }
      ]
    },
    doctors: {
      label: "Shifokorlar",
      fields: [
        { key: "full_name", label: "F.I.Sh.", required: true, aliases: ["fish", "shifokor", "ism", "full_name", "фио", "врач"] },
        { key: "phone", label: "Telefon", required: false, aliases: ["telefon", "tel", "phone", "телефон"] },
        { key: "specialty", label: "Mutaxassislik", required: false, aliases: ["mutaxassislik", "specialty", "специальность"] },
        { key: "medpred_code", label: "Medpred kodi", required: false, aliases: ["medpred", "medpred_code", "mp"] },
        { key: "temp_rate_pct", label: "Ulush %", required: false, type: "number", aliases: ["foiz", "ulush", "pct", "rate"] }
      ]
    },
    medpreds: {
      label: "Medpredlar",
      fields: [
        { key: "full_name", label: "F.I.Sh.", required: true, aliases: ["fish", "ism", "medpred", "full_name", "фио"] },
        { key: "phone", label: "Telefon", required: false, aliases: ["telefon", "tel", "phone", "телефон"] },
        { key: "address", label: "Manzil", required: false, aliases: ["manzil", "address", "адрес"] },
        { key: "temp_rate_pct", label: "Ulush %", required: false, type: "number", aliases: ["foiz", "ulush", "pct"] }
      ]
    },
    organizations: {
      label: "Muassasalar",
      fields: [
        { key: "name", label: "Muassasa nomi", required: true, aliases: ["nomi", "muassasa", "name"] },
        { key: "org_type", label: "Turi", required: false, aliases: ["turi", "type"] },
        { key: "phone", label: "Telefon", required: false, aliases: ["telefon", "phone"] },
        { key: "address", label: "Manzil", required: false, aliases: ["manzil", "address"] }
      ]
    },
    patients: {
      label: "Bemorlar",
      fields: [
        { key: "full_name", label: "F.I.Sh.", required: true, aliases: ["fish", "bemor", "ism", "full_name"] },
        { key: "phone", label: "Telefon", required: false, aliases: ["telefon", "tel", "phone"] },
        { key: "birth_date", label: "Tug'ilgan sana", required: false, aliases: ["tugilgan", "birth_date"] }
      ]
    }
  };

  const EXPORT_COLS = {
    visits: [
      { key: "visit_code", label: "Tashrif kodi" },
      { key: "visit_date", label: "Sana" },
      { key: "patient", label: "Bemor" },
      { key: "doctor_code", label: "Shifokor kodi" },
      { key: "doctor_name", label: "Shifokor" },
      { key: "medpred_name", label: "Medpred" },
      { key: "total_amount", label: "Yakuniy summa", type: "currency", sum: true },
      { key: "paid_amount", label: "To'langan", type: "currency", sum: true },
      { key: "payment_status", label: "To'lov holati" },
      { key: "status", label: "Holat" }
    ],
    doctors: [
      { key: "doctor_code", label: "ID kod" },
      { key: "full_name", label: "F.I.Sh." },
      { key: "specialty", label: "Mutaxassislik" },
      { key: "phone", label: "Telefon" },
      { key: "medpred", label: "Medpred" },
      { key: "temp_rate_pct", label: "Ulush %", type: "number" },
      { key: "status", label: "Holat" }
    ],
    medpreds: [
      { key: "medpred_code", label: "ID kod" },
      { key: "full_name", label: "F.I.Sh." },
      { key: "phone", label: "Telefon" },
      { key: "territory", label: "Hudud" },
      { key: "temp_rate_pct", label: "Ulush %", type: "number" },
      { key: "status", label: "Holat" }
    ],
    patients: [
      { key: "patient_code", label: "Bemor ID" },
      { key: "full_name", label: "F.I.Sh." },
      { key: "phone", label: "Telefon" },
      { key: "birth_date", label: "Tug'ilgan sana" },
      { key: "created_at", label: "Yaratilgan" }
    ],
    services: [
      { key: "service_code", label: "Kod" },
      { key: "name", label: "Xizmat nomi" },
      { key: "category", label: "Kategoriya" },
      { key: "price", label: "Narxi", type: "currency" },
      { key: "status", label: "Holat" }
    ],
    payments: [
      { key: "paid_at", label: "Sana" },
      { key: "payment_kind", label: "Turi" },
      { key: "payment_method", label: "Usul" },
      { key: "amount", label: "Summa", type: "currency", sum: true },
      { key: "note", label: "Izoh" }
    ]
  };

  const state = {
    parsed: null,
    fileName: "",
    validated: [],
    errorRows: []
  };

  const els = {
    entity: document.getElementById("imp-entity"),
    mode: document.getElementById("imp-mode"),
    file: document.getElementById("imp-file"),
    mapBox: document.getElementById("imp-mapping-box"),
    mapGrid: document.getElementById("imp-mapping-grid"),
    prevBox: document.getElementById("imp-preview-box"),
    prevTitle: document.getElementById("imp-preview-title"),
    prevHead: document.getElementById("imp-prev-thead"),
    prevBody: document.getElementById("imp-prev-tbody"),
    btnDlErr: document.getElementById("btn-dl-errors"),
    btnCommit: document.getElementById("btn-commit-import"),
    expEntity: document.getElementById("exp-entity"),
    expFormat: document.getElementById("exp-format"),
    expFrom: document.getElementById("exp-from"),
    expTo: document.getElementById("exp-to"),
    expCols: document.getElementById("exp-cols"),
    logsBody: document.getElementById("logs-tbody")
  };

  // URL parametridan entity olish
  const urlEntity = new URLSearchParams(window.location.search).get("entity");
  if (urlEntity && SCHEMAS[urlEntity]) els.entity.value = urlEntity;

  // Tablar
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      ["tab-import", "tab-export", "tab-logs"].forEach((id) => {
        document.getElementById(id).classList.toggle("hidden", id !== btn.dataset.tab);
      });
      if (btn.dataset.tab === "tab-logs") loadImportLogs();
    });
  });

  // Fayl yuklanganda ustunlarni avtomatik moslashtirish
  els.file.addEventListener("change", async () => {
    const f = els.file.files?.[0];
    if (!f) return;
    try {
      state.fileName = f.name;
      state.parsed = await window.ExcelEngine.parseFile(f);
      renderMappingUI();
      els.mapBox.classList.remove("hidden");
      els.prevBox.classList.add("hidden");
      window.CRM.toast(`Fayl o'qildi: ${state.parsed.rows.length} qator`, "success");
    } catch (err) {
      window.CRM.toast(err.message, "error");
    }
  });

  els.entity.addEventListener("change", () => {
    if (state.parsed) renderMappingUI();
    els.prevBox.classList.add("hidden");
  });

  function renderMappingUI() {
    const schema = SCHEMAS[els.entity.value];
    const auto = window.ExcelEngine.autoMap(state.parsed.headers, schema.fields);
    els.mapGrid.innerHTML = schema.fields.map((f) => `
      <div class="form-group">
        <label>${window.CRM.esc(f.label)} ${f.required ? "*" : ""}</label>
        <select class="select" data-map-key="${f.key}">
          <option value="">— Tanlanmagan —</option>
          ${state.parsed.headers.map((h) => `<option value="${window.CRM.esc(h)}" ${auto[f.key] === h ? "selected" : ""}>${window.CRM.esc(h)}</option>`).join("")}
        </select>
      </div>`).join("");
  }

  function getMapping() {
    const m = {};
    els.mapGrid.querySelectorAll("[data-map-key]").forEach((sel) => {
      m[sel.dataset.mapKey] = sel.value;
    });
    return m;
  }

  // Preview & validatsiya
  document.getElementById("btn-run-preview")?.addEventListener("click", async () => {
    if (!state.parsed) return;
    const entity = els.entity.value;
    const schema = SCHEMAS[entity];
    const map = getMapping();

    // Mavjud yozuvlarni takroriylikni aniqlash uchun yuklash
    let existingMap = new Map();
    if (entity === "services") {
      const { data } = await window.sb.from("services").select("id, name, price");
      (data || []).forEach((x) => existingMap.set(x.name.trim().toLowerCase(), x));
    } else if (entity === "doctors") {
      const { data } = await window.sb.from("doctors").select("id, full_name, phone_normalized");
      (data || []).forEach((x) => existingMap.set((x.full_name.trim().toLowerCase() + "|" + (x.phone_normalized || "")), x));
    } else if (entity === "medpreds") {
      const { data } = await window.sb.from("medpreds").select("id, full_name, phone_normalized");
      (data || []).forEach((x) => existingMap.set(x.full_name.trim().toLowerCase(), x));
    } else if (entity === "organizations") {
      const { data } = await window.sb.from("organizations").select("id, name");
      (data || []).forEach((x) => existingMap.set(x.name.trim().toLowerCase(), x));
    } else if (entity === "patients") {
      const { data } = await window.sb.from("patients").select("id, full_name, phone_normalized");
      (data || []).forEach((x) => existingMap.set(x.phone_normalized || x.full_name.trim().toLowerCase(), x));
    }

    state.validated = [];
    state.errorRows = [];

    state.parsed.rows.forEach((raw) => {
      const rec = { __rowNum: raw.__rowNum, __raw: raw, __status: "valid", __error: "", __existing: null };
      schema.fields.forEach((f) => {
        const col = map[f.key];
        let val = col ? raw[col] : "";
        if (f.type === "number") {
          const cleaned = String(val ?? "").replace(/\s+/g, "").replace(",", ".");
          val = cleaned === "" ? null : Number(cleaned);
          if (f.required && (val === null || Number.isNaN(val) || val < 0)) {
            rec.__status = "error";
            rec.__error += `${f.label} noto'g'ri raqam; `;
          }
        } else {
          val = String(val ?? "").trim();
          if (f.required && !val) {
            rec.__status = "error";
            rec.__error += `${f.label} bo'sh; `;
          }
        }
        rec[f.key] = val;
      });

      if (rec.__status === "valid") {
        let key = "";
        if (entity === "services" || entity === "organizations") key = rec.name.toLowerCase();
        else if (entity === "medpreds") key = rec.full_name.toLowerCase();
        else if (entity === "doctors") key = rec.full_name.toLowerCase() + "|" + String(rec.phone || "").replace(/\D/g, "");
        else if (entity === "patients") key = String(rec.phone || "").replace(/\D/g, "") || rec.full_name.toLowerCase();

        if (existingMap.has(key)) {
          rec.__existing = existingMap.get(key);
          rec.__status = "duplicate";
        }
      }

      if (rec.__status === "error") {
        state.errorRows.push({ ...raw, "Xatolik sababi": rec.__error.trim() });
      }
      state.validated.push(rec);
    });

    const validCnt = state.validated.filter((r) => r.__status === "valid").length;
    const dupCnt = state.validated.filter((r) => r.__status === "duplicate").length;
    const errCnt = state.errorRows.length;

    els.prevTitle.textContent = `Preview: ${validCnt} yangi · ${dupCnt} takroriy · ${errCnt} xatoli`;
    els.btnDlErr.classList.toggle("hidden", errCnt === 0);

    els.prevHead.innerHTML = `<tr><th>Qator</th><th>Holat</th>${schema.fields.map((f) => `<th>${window.CRM.esc(f.label)}</th>`).join("")}<th>Izoh</th></tr>`;
    els.prevBody.innerHTML = state.validated.slice(0, 100).map((r) => {
      const badge = r.__status === "valid"
        ? `<span class="badge badge-success">Yaroqli</span>`
        : r.__status === "duplicate"
          ? `<span class="badge badge-warning">Takroriy</span>`
          : `<span class="badge badge-danger">Xato</span>`;
      return `<tr>
        <td class="mono">${r.__rowNum}</td>
        <td>${badge}</td>
        ${schema.fields.map((f) => `<td>${window.CRM.esc(r[f.key] ?? "")}</td>`).join("")}
        <td style="font-size:12.5px;color:var(--danger);">${window.CRM.esc(r.__error)}</td>
      </tr>`;
    }).join("");

    els.prevBox.classList.remove("hidden");
  });

  // Xatoli qatorlarni alohida Excelga yuklash
  els.btnDlErr.addEventListener("click", () => {
    if (!state.errorRows.length) return;
    const keys = Object.keys(state.errorRows[0]).filter((k) => k !== "__rowNum");
    window.ExcelEngine.exportData(
      state.errorRows,
      keys.map((k) => ({ key: k, label: k })),
      `xatolar_${els.entity.value}`,
      "xlsx",
      { includeTotals: false, sheetName: "Xatolar" }
    );
  });

  // Yaroqli qatorlarni Supabase ga yozish
  els.btnCommit.addEventListener("click", async () => {
    const entity = els.entity.value;
    const mode = els.mode.value;
    els.btnCommit.disabled = true;

    let inserted = 0, updated = 0, skipped = 0, errors = state.errorRows.length;
    const runtimeErrors = [...state.errorRows];

    try {
      // Katalog lookup (kategoriyalar, mutaxassisliklar, medpredlar)
      const [catRes, specRes, mpRes] = await Promise.all([
        entity === "services" ? window.sb.from("service_categories").select("id, name") : { data: [] },
        entity === "doctors" ? window.sb.from("specialties").select("id, name") : { data: [] },
        entity === "doctors" ? window.sb.from("medpreds").select("id, medpred_code, full_name") : { data: [] }
      ]);

      const catByName = new Map((catRes.data || []).map((c) => [c.name.toLowerCase(), c.id]));
      const specByName = new Map((specRes.data || []).map((s) => [s.name.toLowerCase(), s.id]));
      const mpByCode = new Map((mpRes.data || []).map((m) => [m.medpred_code.toUpperCase(), m.id]));

      for (const r of state.validated) {
        if (r.__status === "error") continue;
        if (r.__status === "duplicate" && (mode === "SKIP_DUPLICATES" || mode === "INSERT")) {
          skipped++;
          continue;
        }

        let res = { error: null };
        if (entity === "services") {
          let catId = null;
          if (r.category) {
            const k = r.category.toLowerCase();
            if (catByName.has(k)) {
              catId = catByName.get(k);
            } else {
              const ins = await window.sb.from("service_categories").insert({ name: r.category }).select().single();
              if (!ins.error) { catId = ins.data.id; catByName.set(k, catId); }
            }
          }
          if (r.__existing && mode === "UPDATE") {
            const oldPrice = Number(r.__existing.price || 0);
            res = await window.sb.from("services").update({ price: r.price, category_id: catId || undefined }).eq("id", r.__existing.id);
            if (!res.error) {
              if (oldPrice !== Number(r.price)) {
                await window.sb.from("service_price_history").insert({
                  service_id: r.__existing.id, old_price: oldPrice, new_price: r.price, source: "excel_import", changed_by: user.id
                });
              }
              updated++;
            }
          } else {
            res = await window.sb.from("services").insert({ name: r.name, category_id: catId, price: r.price, is_active: true });
            if (!res.error) inserted++;
          }
        } else if (entity === "doctors") {
          const specId = r.specialty ? (specByName.get(r.specialty.toLowerCase()) || null) : null;
          const mpId = r.medpred_code ? (mpByCode.get(String(r.medpred_code).toUpperCase()) || null) : null;
          const payload = {
            full_name: r.full_name, phone: r.phone || "", specialty_id: specId,
            current_medpred_id: mpId, temp_rate_pct: r.temp_rate_pct ?? 10.0, created_by: user.id
          };
          if (r.__existing && mode === "UPDATE") {
            res = await window.sb.from("doctors").update(payload).eq("id", r.__existing.id);
            if (!res.error) updated++;
          } else {
            res = await window.sb.from("doctors").insert(payload);
            if (!res.error) inserted++;
          }
        } else if (entity === "medpreds") {
          const payload = { full_name: r.full_name, phone: r.phone || "", address: r.address || "", temp_rate_pct: r.temp_rate_pct ?? 3.0 };
          res = (r.__existing && mode === "UPDATE")
            ? await window.sb.from("medpreds").update(payload).eq("id", r.__existing.id)
            : await window.sb.from("medpreds").insert(payload);
          if (!res.error) (r.__existing && mode === "UPDATE") ? updated++ : inserted++;
        } else if (entity === "organizations") {
          const payload = { name: r.name, org_type: r.org_type || "other", phone: r.phone || "", address: r.address || "" };
          res = (r.__existing && mode === "UPDATE")
            ? await window.sb.from("organizations").update(payload).eq("id", r.__existing.id)
            : await window.sb.from("organizations").insert(payload);
          if (!res.error) (r.__existing && mode === "UPDATE") ? updated++ : inserted++;
        } else if (entity === "patients") {
          const payload = { full_name: r.full_name, phone: r.phone || "", birth_date: r.birth_date || null, created_by: user.id };
          res = (r.__existing && mode === "UPDATE")
            ? await window.sb.from("patients").update(payload).eq("id", r.__existing.id)
            : await window.sb.from("patients").insert(payload);
          if (!res.error) (r.__existing && mode === "UPDATE") ? updated++ : inserted++;
        }

        if (res.error) {
          errors++;
          runtimeErrors.push({ ...r.__raw, "Xatolik sababi": res.error.message });
        }
      }

      // import_logs ga yozish
      await window.sb.from("import_logs").insert({
        entity_type: entity,
        file_name: state.fileName,
        import_mode: mode,
        total_rows: state.validated.length,
        inserted_rows: inserted,
        updated_rows: updated,
        skipped_rows: skipped,
        error_rows: errors,
        error_details: runtimeErrors.slice(0, 50),
        imported_by: user.id
      });

      state.errorRows = runtimeErrors;
      els.btnDlErr.classList.toggle("hidden", runtimeErrors.length === 0);
      window.CRM.toast(`Import yakunlandi: +${inserted} qo'shildi, ${updated} yangilandi, ${skipped} o'tkazildi, ${errors} xato`, "success");
    } finally {
      els.btnCommit.disabled = false;
    }
  });

  // ---------- MAXSUS EXPORT ----------
  function renderExportColumns() {
    const cols = EXPORT_COLS[els.expEntity.value] || [];
    els.expCols.innerHTML = cols.map((c) => `
      <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;">
        <input type="checkbox" name="exp_col" value="${c.key}" checked>
        <span>${window.CRM.esc(c.label)}</span>
      </label>`).join("");
  }

  els.expEntity.addEventListener("change", renderExportColumns);
  renderExportColumns();

  document.getElementById("btn-run-export")?.addEventListener("click", async () => {
    const entity = els.expEntity.value;
    const fmt = els.expFormat.value;
    const from = els.expFrom.value;
    const to = els.expTo.value;
    const selectedKeys = Array.from(els.expCols.querySelectorAll("input:checked")).map((i) => i.value);
    const cols = (EXPORT_COLS[entity] || []).filter((c) => selectedKeys.includes(c.key));
    if (!cols.length) return window.CRM.toast("Kamida bitta ustun tanlang", "warning");

    let rows = [];
    if (entity === "visits") {
      let q = window.sb.from("visits").select("*, patients(full_name)").order("visit_date", { ascending: false });
      if (from) q = q.gte("visit_date", from);
      if (to) q = q.lte("visit_date", to + "T23:59:59");
      const { data } = await q;
      rows = (data || []).map((v) => ({
        visit_code: v.visit_code, visit_date: (v.visit_date || "").slice(0, 10),
        patient: v.patients?.full_name || "", doctor_code: v.doctor_code_snapshot,
        doctor_name: v.doctor_name_snapshot, medpred_name: v.medpred_name_snapshot,
        total_amount: v.total_amount, paid_amount: v.paid_amount,
        payment_status: v.payment_status, status: v.status
      }));
    } else if (entity === "doctors") {
      const { data } = await window.sb.from("doctors").select("*, specialties(name), medpreds(full_name)").order("doctor_code");
      rows = (data || []).map((d) => ({
        doctor_code: d.doctor_code, full_name: d.full_name, specialty: d.specialties?.name || "",
        phone: d.phone, medpred: d.medpreds?.full_name || "", temp_rate_pct: d.temp_rate_pct, status: d.status
      }));
    } else if (entity === "medpreds") {
      const { data } = await window.sb.from("medpreds").select("*, territories(name)").order("medpred_code");
      rows = (data || []).map((m) => ({
        medpred_code: m.medpred_code, full_name: m.full_name, phone: m.phone,
        territory: m.territories?.name || "", temp_rate_pct: m.temp_rate_pct, status: m.status
      }));
    } else if (entity === "patients") {
      const { data } = await window.sb.from("patients").select("*").order("created_at", { ascending: false });
      rows = (data || []).map((p) => ({
        patient_code: p.patient_code, full_name: p.full_name, phone: p.phone,
        birth_date: p.birth_date || "", created_at: (p.created_at || "").slice(0, 10)
      }));
    } else if (entity === "services") {
      const { data } = await window.sb.from("services").select("*, service_categories(name)").order("name");
      rows = (data || []).map((s) => ({
        service_code: s.service_code, name: s.name, category: s.service_categories?.name || "",
        price: s.price, status: s.is_active ? "Faol" : "Nofaol"
      }));
    } else if (entity === "payments") {
      let q = window.sb.from("payments").select("*").order("paid_at", { ascending: false });
      if (from) q = q.gte("paid_at", from);
      if (to) q = q.lte("paid_at", to + "T23:59:59");
      const { data } = await q;
      rows = (data || []).map((p) => ({
        paid_at: (p.paid_at || "").slice(0, 10), payment_kind: p.payment_kind,
        payment_method: p.payment_method, amount: p.amount, note: p.note
      }));
    }

    window.ExcelEngine.exportData(rows, cols, `medpred_export_${entity}`, fmt);
    window.CRM.toast(`Eksport tayyor (${rows.length} qator)`, "success");
  });

  async function loadImportLogs() {
    const { data } = await window.sb.from("import_logs").select("*").order("created_at", { ascending: false }).limit(50);
    const logs = data || [];
    if (!logs.length) {
      els.logsBody.innerHTML = `<tr><td colspan="9" class="empty-state">Import tarixi bo'sh.</td></tr>`;
      return;
    }
    els.logsBody.innerHTML = logs.map((l) => `<tr>
      <td class="mono">${window.CRM.fmtDateTime(l.created_at)}</td>
      <td>${window.CRM.esc(l.entity_type)}</td>
      <td>${window.CRM.esc(l.file_name)}</td>
      <td class="mono">${window.CRM.esc(l.import_mode)}</td>
      <td class="text-right mono">${l.total_rows}</td>
      <td class="text-right mono">${l.inserted_rows}</td>
      <td class="text-right mono">${l.updated_rows}</td>
      <td class="text-right mono">${l.skipped_rows}</td>
      <td class="text-right mono">${l.error_rows}</td>
    </tr>`).join("");
  }
})();
