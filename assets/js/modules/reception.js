/**
 * MedPred CRM — Qabulxona 6 bosqichli tezkor ish jarayoni
 */
(async function () {
  const user = await window.Auth.initPage("reception", "Qabulxona");
  if (!user) return;

  const canSeeBonus = ["SUPERADMIN", "DIRECTOR"].includes(user.role);

  const state = {
    patients: [],
    doctors: [],
    workplaces: [],
    services: [],
    categories: [],
    todayVisits: [],
    allowDiscount: true,
    bonusEnabled: true,
    selectedPatient: null,
    selectedDoctor: null,
    cart: [] // { service_id, name, price, quantity }
  };

  const els = {
    patQ: document.getElementById("rec-pat-q"),
    patList: document.getElementById("rec-pat-list"),
    patSelected: document.getElementById("patient-selected"),
    patPicker: document.getElementById("patient-picker"),
    docQ: document.getElementById("rec-doc-q"),
    docList: document.getElementById("rec-doc-list"),
    docSelected: document.getElementById("doctor-selected"),
    docPicker: document.getElementById("doctor-picker"),
    srvQ: document.getElementById("rec-srv-q"),
    srvCat: document.getElementById("rec-srv-cat"),
    srvList: document.getElementById("rec-srv-list"),
    cartItems: document.getElementById("cart-items"),
    discount: document.getElementById("rec-discount"),
    discountGroup: document.getElementById("discount-group"),
    paid: document.getElementById("rec-paid"),
    payMethod: document.getElementById("rec-pay-method"),
    notes: document.getElementById("rec-notes"),
    sumSub: document.getElementById("sum-subtotal"),
    sumDisc: document.getElementById("sum-discount"),
    sumTot: document.getElementById("sum-total"),
    sumBadge: document.getElementById("sum-pay-badge"),
    todayTbody: document.getElementById("today-tbody"),
    todaySum: document.getElementById("today-summary")
  };

  async function loadCatalogs() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [pRes, dRes, wpRes, cRes, sRes, setRes, vRes] = await Promise.all([
      window.sb.from("patients").select("id, patient_code, full_name, phone, phone_normalized").order("created_at", { ascending: false }).limit(500),
      window.sb.from("doctors").select("id, doctor_code, full_name, temp_rate_pct, specialties(name), medpreds(id, full_name, medpred_code, temp_rate_pct)").eq("status", "active").order("full_name"),
      window.sb.from("doctor_workplaces").select("doctor_id, is_primary, organizations(name)").eq("is_active", true),
      window.sb.from("service_categories").select("id, name").eq("is_active", true).order("sort_order"),
      window.sb.from("services").select("id, service_code, name, price, category_id, service_categories(name)").eq("is_active", true).order("name"),
      window.sb.from("system_settings").select("key, value").in("key", ["allow_reception_discount", "referral_calc_enabled"]),
      window.sb.from("visits")
        .select("id, visit_code, visit_date, doctor_code_snapshot, doctor_name_snapshot, medpred_name_snapshot, total_amount, paid_amount, payment_status, status, patients(full_name, phone)")
        .gte("visit_date", todayStart.toISOString())
        .order("visit_date", { ascending: false })
    ]);

    state.patients = pRes.data || [];
    state.doctors = dRes.data || [];
    state.workplaces = wpRes.data || [];
    state.categories = cRes.data || [];
    state.services = sRes.data || [];
    state.todayVisits = vRes.data || [];

    (setRes.data || []).forEach((row) => {
      if (row.key === "allow_reception_discount") state.allowDiscount = Boolean(row.value);
      if (row.key === "referral_calc_enabled") state.bonusEnabled = Boolean(row.value);
    });

    if (user.role === "RECEPTION" && !state.allowDiscount) {
      els.discount.value = "0";
      els.discount.disabled = true;
    }

    els.srvCat.innerHTML = `<option value="">Barcha kategoriyalar</option>` +
      state.categories.map((c) => `<option value="${c.id}">${window.CRM.esc(c.name)}</option>`).join("");

    // URL orqali patient_id kelgan bo'lsa avtomatik tanlash
    const urlPatId = new URLSearchParams(window.location.search).get("patient_id");
    if (urlPatId && !state.selectedPatient) {
      const found = state.patients.find((p) => p.id === urlPatId);
      if (found) selectPatient(found);
    }

    renderServicesList();
    renderTodayVisits();
  }

  // ---------- 1-QADAM: BEMOR ----------
  function renderPatientMatches() {
    const q = els.patQ.value.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    if (!q) {
      els.patList.classList.add("hidden");
      return;
    }
    const matches = state.patients.filter((p) => {
      const hay = [p.patient_code, p.full_name, p.phone].join(" ").toLowerCase();
      return hay.includes(q) || (digits.length >= 4 && (p.phone_normalized || "").includes(digits));
    }).slice(0, 12);

    els.patList.classList.remove("hidden");
    if (!matches.length) {
      els.patList.innerHTML = `<div style="padding:12px;font-size:13.5px;color:var(--muted);">Bemor topilmadi. «+ Yangi bemor» tugmasini bosing.</div>`;
      return;
    }
    els.patList.innerHTML = matches.map((p) => `
      <div class="pick-item" data-pat-id="${p.id}">
        <div>
          <strong>${window.CRM.esc(p.full_name)}</strong>
          <div class="text-muted mono" style="font-size:12px;">${window.CRM.esc(p.patient_code)} · ${window.CRM.esc(p.phone || "Telefonsiz")}</div>
        </div>
        <span class="badge badge-primary">Tanlash</span>
      </div>`).join("");

    els.patList.querySelectorAll("[data-pat-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const found = state.patients.find((x) => x.id === el.dataset.patId);
        if (found) selectPatient(found);
      });
    });
  }

  function selectPatient(p) {
    state.selectedPatient = p;
    els.patPicker.classList.add("hidden");
    els.patSelected.classList.remove("hidden");
    els.patSelected.innerHTML = `
      <div class="selected-box">
        <div>
          <strong>${window.CRM.esc(p.full_name)}</strong>
          <div class="mono text-muted" style="font-size:12.5px;">${window.CRM.esc(p.patient_code)} · ${window.CRM.esc(p.phone || "Telefonsiz")}</div>
        </div>
        <button type="button" class="btn btn-sm" id="btn-change-pat">Almashtirish</button>
      </div>`;
    document.getElementById("btn-change-pat")?.addEventListener("click", () => {
      state.selectedPatient = null;
      els.patSelected.classList.add("hidden");
      els.patPicker.classList.remove("hidden");
      els.patQ.focus();
    });
  }

  function openQuickNewPatientModal() {
    window.CRM.openModal(
      "Tezkor yangi bemor yaratish",
      `<form id="quick-pat-form" class="form-grid">
        <div class="form-group full">
          <label>F.I.Sh. *</label>
          <input class="input" name="full_name" required placeholder="Karimova Malika">
        </div>
        <div class="form-group">
          <label>Telefon raqami (ixtiyoriy)</label>
          <input class="input" name="phone" placeholder="+998 90 123 45 67" value="${window.CRM.esc(/^\+?\d/.test(els.patQ.value.trim()) ? els.patQ.value.trim() : "")}">
        </div>
        <div class="form-group">
          <label>Tug'ilgan sana (ixtiyoriy)</label>
          <input class="input" name="birth_date" type="date">
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="quick-pat-form" class="btn btn-primary">Yaratish va tanlash</button>`
    );

    document.getElementById("quick-pat-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const { data, error } = await window.sb.from("patients").insert({
        full_name: String(fd.get("full_name") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        birth_date: fd.get("birth_date") || null,
        created_by: user.id
      }).select().single();

      if (error) {
        window.CRM.toast("Xato: " + error.message, "error");
        return;
      }
      state.patients.unshift(data);
      selectPatient(data);
      window.CRM.closeModal();
      window.CRM.toast(`Bemor yaratildi: ${data.patient_code}`, "success");
    });
  }

  // ---------- 2-QADAM: SHIFOKOR -> MEDPRED AVTOMATIK ----------
  function doctorOrgNames(docId) {
    return state.workplaces
      .filter((w) => w.doctor_id === docId)
      .map((w) => w.organizations?.name)
      .filter(Boolean)
      .join(", ");
  }

  function renderDoctorMatches() {
    const q = els.docQ.value.trim().toLowerCase();
    if (!q) {
      els.docList.classList.add("hidden");
      return;
    }
    const normCode = /^\d{1,5}$/.test(q) ? "dr-" + q.padStart(4, "0") : "";
    const matches = state.doctors.filter((d) => {
      const hay = [d.doctor_code, d.full_name, d.specialties?.name, doctorOrgNames(d.id)].join(" ").toLowerCase();
      return hay.includes(q) || (normCode && d.doctor_code.toLowerCase().includes(normCode));
    }).slice(0, 12);

    els.docList.classList.remove("hidden");
    if (!matches.length) {
      els.docList.innerHTML = `<div style="padding:12px;font-size:13.5px;color:var(--muted);">Shifokor topilmadi.</div>`;
      return;
    }
    els.docList.innerHTML = matches.map((d) => `
      <div class="pick-item" data-doc-id="${d.id}">
        <div>
          <span class="badge badge-primary mono">${window.CRM.esc(d.doctor_code)}</span>
          <strong style="margin-left:6px;">${window.CRM.esc(d.full_name)}</strong>
          <div class="text-muted" style="font-size:12px;">
            ${window.CRM.esc(d.specialties?.name || "—")} · ${window.CRM.esc(doctorOrgNames(d.id) || "Ish joyi ko'rsatilmagan")}
          </div>
        </div>
        <span class="badge badge-success">Tanlash</span>
      </div>`).join("");

    els.docList.querySelectorAll("[data-doc-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const found = state.doctors.find((x) => x.id === el.dataset.docId);
        if (found) selectDoctor(found);
      });
    });
  }

  function selectDoctor(d) {
    state.selectedDoctor = d;
    els.docPicker.classList.add("hidden");
    els.docSelected.classList.remove("hidden");
    const mpName = d.medpreds?.full_name || "Biriktirilmagan";
    els.docSelected.innerHTML = `
      <div class="selected-box">
        <div>
          <span class="badge badge-primary mono">${window.CRM.esc(d.doctor_code)}</span>
          <strong style="margin-left:6px;">${window.CRM.esc(d.full_name)}</strong>
          <div class="text-muted" style="font-size:12.5px;margin-top:3px;">
            ${window.CRM.esc(d.specialties?.name || "—")} · ${window.CRM.esc(doctorOrgNames(d.id) || "—")}<br>
            <strong>Medpredstavitel (avtomatik):</strong> ${window.CRM.esc(mpName)}
          </div>
        </div>
        <button type="button" class="btn btn-sm" id="btn-change-doc">Almashtirish</button>
      </div>`;
    document.getElementById("btn-change-doc")?.addEventListener("click", () => {
      state.selectedDoctor = null;
      els.docSelected.classList.add("hidden");
      els.docPicker.classList.remove("hidden");
      els.docQ.focus();
    });
  }

  // ---------- 3-QADAM: XIZMATLAR SAVATI ----------
  function renderServicesList() {
    const q = els.srvQ.value.trim().toLowerCase();
    const catId = els.srvCat.value;
    const list = state.services.filter((s) => {
      if (catId && s.category_id !== catId) return false;
      if (q && ![s.name, s.service_code, s.service_categories?.name].join(" ").toLowerCase().includes(q)) return false;
      return true;
    }).slice(0, 30);

    if (!list.length) {
      els.srvList.innerHTML = `<div style="padding:14px;font-size:13.5px;color:var(--muted);">Xizmatlar topilmadi. «Xizmatlar» bo'limida yoki Excel orqali xizmat qo'shing.</div>`;
      return;
    }

    els.srvList.innerHTML = list.map((s) => `
      <div class="pick-item" data-srv-id="${s.id}">
        <div>
          <strong>${window.CRM.esc(s.name)}</strong>
          <div class="text-muted" style="font-size:12px;">${window.CRM.esc(s.service_categories?.name || "—")}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <strong class="mono">${window.CRM.fmtSom(s.price)}</strong>
          <span class="badge badge-primary">+ Qo'shish</span>
        </div>
      </div>`).join("");

    els.srvList.querySelectorAll("[data-srv-id]").forEach((el) => {
      el.addEventListener("click", () => addToCart(el.dataset.srvId));
    });
  }

  function addToCart(serviceId) {
    const srv = state.services.find((s) => s.id === serviceId);
    if (!srv) return;
    const existing = state.cart.find((c) => c.service_id === serviceId);
    if (existing) {
      existing.quantity += 1;
    } else {
      state.cart.push({ service_id: srv.id, name: srv.name, price: Number(srv.price || 0), quantity: 1 });
    }
    renderCart();
  }

  function renderCart() {
    if (!state.cart.length) {
      els.cartItems.innerHTML = `<div class="text-muted" style="font-size:13.5px;padding:10px 0;">Hali xizmat tanlanmagan.</div>`;
    } else {
      els.cartItems.innerHTML = state.cart.map((c, idx) => `
        <div class="cart-row">
          <div>
            <strong>${window.CRM.esc(c.name)}</strong>
            <div class="mono text-muted" style="font-size:12px;">${window.CRM.fmtSom(c.price)} × ${c.quantity}</div>
          </div>
          <div class="qty-ctrl">
            <button type="button" data-dec="${idx}">−</button>
            <span class="mono">${c.quantity}</span>
            <button type="button" data-inc="${idx}">+</button>
          </div>
          <strong class="mono">${window.CRM.fmtSom(c.price * c.quantity)}</strong>
          <button type="button" class="btn btn-ghost btn-sm" data-rm="${idx}" style="color:var(--danger);padding:0 6px;">×</button>
        </div>`).join("");

      els.cartItems.querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", () => {
        const i = Number(b.dataset.dec);
        if (state.cart[i].quantity > 1) state.cart[i].quantity--; else state.cart.splice(i, 1);
        renderCart();
      }));
      els.cartItems.querySelectorAll("[data-inc]").forEach((b) => b.addEventListener("click", () => {
        state.cart[Number(b.dataset.inc)].quantity++;
        renderCart();
      }));
      els.cartItems.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
        state.cart.splice(Number(b.dataset.rm), 1);
        renderCart();
      }));
    }
    recalcTotals(true);
  }

  function calcTotals() {
    const subtotal = state.cart.reduce((s, c) => s + c.price * c.quantity, 0);
    const discount = Math.max(0, Math.min(subtotal, Number(els.discount.value || 0)));
    const total = Math.max(0, subtotal - discount);
    const paid = Math.max(0, Math.min(total, Number(els.paid.value || 0)));
    const status = paid === 0 ? "unpaid" : (paid < total ? "partial" : "paid");
    return { subtotal, discount, total, paid, status };
  }

  function recalcTotals(autoFillPaid = false) {
    const pre = calcTotals();
    if (autoFillPaid) els.paid.value = String(Math.round(pre.total));
    const t = calcTotals();
    els.sumSub.textContent = window.CRM.fmtSom(t.subtotal);
    els.sumDisc.textContent = window.CRM.fmtSom(t.discount);
    els.sumTot.textContent = window.CRM.fmtSom(t.total);
    const badgeMap = {
      paid: `<span class="badge badge-success">To'langan</span>`,
      partial: `<span class="badge badge-warning">Qisman to'langan</span>`,
      unpaid: `<span class="badge badge-danger">To'lanmagan</span>`
    };
    els.sumBadge.innerHTML = badgeMap[t.status];
  }

  // ---------- 6-QADAM: TASDIQLASH VA ATOMIK SAQLASH ----------
  function openConfirmModal() {
    if (!state.selectedPatient) return window.CRM.toast("1-qadam: Avval bemorni tanlang", "warning");
    if (!state.selectedDoctor) return window.CRM.toast("2-qadam: Yo'llanma bergan shifokorni tanlang", "warning");
    if (!state.cart.length) return window.CRM.toast("3-qadam: Kamida bitta xizmat tanlang", "warning");

    const t = calcTotals();
    const d = state.selectedDoctor;
    const p = state.selectedPatient;
    const mp = d.medpreds;
    const docPct = Number(d.temp_rate_pct || 0);
    const repPct = Number(mp?.temp_rate_pct || 0);
    const docBonus = state.bonusEnabled ? Math.round(t.total * docPct / 100) : 0;
    const repBonus = (state.bonusEnabled && mp) ? Math.round(t.total * repPct / 100) : 0;

    const srvRows = state.cart.map((c) => `<tr>
      <td>${window.CRM.esc(c.name)}</td>
      <td class="text-right mono">${c.quantity}</td>
      <td class="text-right mono">${window.CRM.fmtSom(c.price)}</td>
      <td class="text-right mono"><strong>${window.CRM.fmtSom(c.price * c.quantity)}</strong></td>
    </tr>`).join("");

    window.CRM.openModal(
      "Tashrifni tasdiqlash",
      `<div style="display:grid;gap:12px;">
        <div class="card" style="padding:14px;background:var(--surface-2);">
          <div><strong>Bemor:</strong> ${window.CRM.esc(p.full_name)} <span class="mono">(${window.CRM.esc(p.patient_code)})</span> · ${window.CRM.esc(p.phone || "Telefonsiz")}</div>
          <div><strong>Shifokor:</strong> ${window.CRM.esc(d.full_name)} <span class="mono">(${window.CRM.esc(d.doctor_code)})</span></div>
          <div><strong>Medpred (avtomatik):</strong> ${window.CRM.esc(mp?.full_name || "Biriktirilmagan")}</div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Xizmat</th><th class="text-right">Soni</th><th class="text-right">Narxi</th><th class="text-right">Jami</th></tr></thead>
            <tbody>${srvRows}</tbody>
          </table>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:10px;">
          <div class="sum-line"><span>Xizmatlar jami:</span><strong class="mono">${window.CRM.fmtSom(t.subtotal)}</strong></div>
          <div class="sum-line"><span>Chegirma:</span><span class="mono">${window.CRM.fmtSom(t.discount)}</span></div>
          <div class="sum-line total"><span>Yakuniy summa:</span><span class="mono">${window.CRM.fmtSom(t.total)}</span></div>
          <div class="sum-line"><span>To'lanmoqda (${window.CRM.esc(els.payMethod.value)}):</span><strong class="mono">${window.CRM.fmtSom(t.paid)}</strong></div>
        </div>
        ${canSeeBonus && state.bonusEnabled ? `
        <div class="alert alert-info" style="margin-bottom:0;">
          <i data-lucide="calculator"></i>
          <div><strong>Vaqtinchalik hisob-kitob (prototip):</strong> Shifokor (${docPct}%): ${window.CRM.fmtSom(docBonus)} · Medpred (${repPct}%): ${window.CRM.fmtSom(repBonus)} · Klinika: ${window.CRM.fmtSom(t.total - docBonus - repBonus)}</div>
        </div>` : ""}
      </div>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Orqaga</button>
       <button type="button" class="btn btn-primary" id="btn-commit-visit">Tasdiqlash va saqlash</button>`,
      true
    );

    document.getElementById("btn-commit-visit")?.addEventListener("click", async (ev) => {
      ev.target.disabled = true;
      try {
        const res = await window.CRM.rpc("rpc_create_visit", {
          p_patient_id: p.id,
          p_doctor_id: d.id,
          p_services: state.cart.map((c) => ({ service_id: c.service_id, quantity: c.quantity })),
          p_branch_id: user.branch_id || null,
          p_discount: t.discount,
          p_paid_amount: t.paid,
          p_payment_method: els.payMethod.value,
          p_notes: els.notes.value.trim()
        });
        window.CRM.closeModal();
        window.CRM.toast(`Tashrif saqlandi: ${res.visit_code}`, "success");
        resetForm();
        await loadCatalogs();
      } catch (err) {
        window.CRM.toast("Saqlashda xato: " + err.message, "error");
        ev.target.disabled = false;
      }
    });
  }

  function resetForm() {
    state.selectedPatient = null;
    state.selectedDoctor = null;
    state.cart = [];
    els.patQ.value = "";
    els.docQ.value = "";
    els.discount.value = "0";
    els.paid.value = "0";
    els.notes.value = "";
    els.patSelected.classList.add("hidden");
    els.patPicker.classList.remove("hidden");
    els.patList.classList.add("hidden");
    els.docSelected.classList.add("hidden");
    els.docPicker.classList.remove("hidden");
    els.docList.classList.add("hidden");
    renderCart();
  }

  function renderTodayVisits() {
    const active = state.todayVisits.filter((v) => v.status === "completed");
    const totalSum = active.reduce((s, v) => s + Number(v.total_amount || 0), 0);
    els.todaySum.textContent = `${active.length} ta · ${window.CRM.fmtSom(totalSum)}`;

    if (!state.todayVisits.length) {
      els.todayTbody.innerHTML = `<tr><td colspan="7" class="empty-state">Bugun hali tashrif qayd etilmagan.</td></tr>`;
      return;
    }

    els.todayTbody.innerHTML = state.todayVisits.map((v) => {
      const rem = Number(v.total_amount || 0) - Number(v.paid_amount || 0);
      const badge = v.status === "cancelled"
        ? `<span class="badge badge-danger">Bekor qilingan</span>`
        : v.payment_status === "paid"
          ? `<span class="badge badge-success">To'langan</span>`
          : v.payment_status === "partial"
            ? `<span class="badge badge-warning">Qisman</span>`
            : `<span class="badge badge-danger">To'lanmagan</span>`;
      return `<tr>
        <td>
          <strong class="mono">${window.CRM.esc(v.visit_code)}</strong>
          <div class="text-muted mono" style="font-size:12px;">${window.CRM.fmtDateTime(v.visit_date)}</div>
        </td>
        <td>
          <strong>${window.CRM.esc(v.patients?.full_name || "—")}</strong>
          <div class="text-muted mono" style="font-size:12px;">${window.CRM.esc(v.patients?.phone || "")}</div>
        </td>
        <td>
          <div>${window.CRM.esc(v.doctor_name_snapshot)} <span class="mono text-muted">(${window.CRM.esc(v.doctor_code_snapshot)})</span></div>
          <div class="text-muted" style="font-size:12px;">${window.CRM.esc(v.medpred_name_snapshot || "—")}</div>
        </td>
        <td class="text-right mono">${window.CRM.fmtSom(v.total_amount)}</td>
        <td class="text-right mono">${window.CRM.fmtSom(v.paid_amount)}</td>
        <td>${badge}</td>
        <td class="text-right">
          ${v.status === "completed" && rem > 0 ? `<button type="button" class="btn btn-sm btn-primary" data-pay="${v.id}" data-rem="${rem}">To'lov</button>` : `<a class="btn btn-sm" href="visits.html">Ko'rish</a>`}
        </td>
      </tr>`;
    }).join("");

    els.todayTbody.querySelectorAll("[data-pay]").forEach((b) => {
      b.addEventListener("click", () => openPartialPayModal(b.dataset.pay, Number(b.dataset.rem)));
    });
  }

  function openPartialPayModal(visitId, rem) {
    window.CRM.openModal(
      "Qo'shimcha / qisman to'lov qayd etish",
      `<form id="part-pay-form" class="form-grid">
        <div class="form-group">
          <label>Summa (qoldiq: ${window.CRM.fmtSom(rem)}) *</label>
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
          <input class="input" name="note" placeholder="Qolgan to'lov...">
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor qilish</button>
       <button type="submit" form="part-pay-form" class="btn btn-primary">Saqlash</button>`
    );

    document.getElementById("part-pay-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await window.CRM.rpc("rpc_record_visit_payment", {
          p_visit_id: visitId,
          p_amount: Number(fd.get("amount")),
          p_payment_method: fd.get("method"),
          p_note: String(fd.get("note") || "").trim()
        });
        window.CRM.closeModal();
        window.CRM.toast("To'lov qayd etildi", "success");
        await loadCatalogs();
      } catch (err) {
        window.CRM.toast("Xato: " + err.message, "error");
      }
    });
  }

  els.patQ.addEventListener("input", renderPatientMatches);
  els.docQ.addEventListener("input", renderDoctorMatches);
  els.srvQ.addEventListener("input", renderServicesList);
  els.srvCat.addEventListener("change", renderServicesList);
  els.discount.addEventListener("input", () => recalcTotals(true));
  els.paid.addEventListener("input", () => recalcTotals(false));
  document.getElementById("btn-pay-full")?.addEventListener("click", () => recalcTotals(true));
  document.getElementById("btn-pay-zero")?.addEventListener("click", () => { els.paid.value = "0"; recalcTotals(false); });
  document.getElementById("btn-quick-new-pat")?.addEventListener("click", openQuickNewPatientModal);
  document.getElementById("btn-review-visit")?.addEventListener("click", openConfirmModal);
  document.getElementById("btn-reset-form")?.addEventListener("click", resetForm);

  await loadCatalogs();
})();
