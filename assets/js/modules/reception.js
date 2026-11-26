/**
 * MedPred CRM — Takomillashtirilgan Tezkor Qabulxona
 * - Alohida "Yangi bemor" modali yo'q: ism (+ ixtiyoriy telefon) yozilsa avtomatik topadi yoki saqlashda o'zi yaratadi.
 * - Tezkor shifokor chiplari + qisqa kod bilan Enter bosib tanlash.
 * - Kategoriya chiplari va 1 bosishda xizmat qo'shish.
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
    selectedCat: "",
    payMethod: "cash",
    cart: []
  };

  const els = {
    patName: document.getElementById("rec-pat-name"),
    patPhone: document.getElementById("rec-pat-phone"),
    patPill: document.getElementById("pat-status-pill"),
    patBar: document.getElementById("pat-selected-bar"),
    patList: document.getElementById("rec-pat-list"),
    docQ: document.getElementById("rec-doc-q"),
    docQuick: document.getElementById("rec-doc-quick"),
    docList: document.getElementById("rec-doc-list"),
    docSelected: document.getElementById("doctor-selected"),
    docPicker: document.getElementById("doctor-picker"),
    srvCats: document.getElementById("rec-srv-cats"),
    srvQ: document.getElementById("rec-srv-q"),
    srvList: document.getElementById("rec-srv-list"),
    srvCount: document.getElementById("srv-cart-count"),
    cartItems: document.getElementById("cart-items"),
    discount: document.getElementById("rec-discount"),
    rowDiscount: document.getElementById("row-discount"),
    paid: document.getElementById("rec-paid"),
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
      window.sb.from("patients").select("id, patient_code, full_name, phone, phone_normalized").order("created_at", { ascending: false }).limit(800),
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

    const urlPatId = new URLSearchParams(window.location.search).get("patient_id");
    if (urlPatId && !state.selectedPatient) {
      const found = state.patients.find((p) => p.id === urlPatId);
      if (found) selectPatient(found);
    }

    renderQuickDoctors();
    renderCategoryPills();
    renderServicesList();
    renderTodayVisits();
  }

  // ---------- 1-QADAM: BEMOR (AVTO QIDIRUV + AVTO YARATISH) ----------
  function onPatientInput() {
    // Agar foydalanuvchi tanlangan bemorni qo'lda tahrirlab boshlasa, bog'lanishni uzamiz
    if (state.selectedPatient) {
      const sameName = els.patName.value.trim() === state.selectedPatient.full_name;
      const samePhone = els.patPhone.value.trim() === (state.selectedPatient.phone || "");
      if (!sameName || !samePhone) {
        state.selectedPatient = null;
        els.patBar.classList.add("hidden");
      }
    }

    const nameQ = els.patName.value.trim().toLowerCase();
    const phoneQ = els.patPhone.value.trim();
    const digits = phoneQ.replace(/\D/g, "");

    if (!nameQ && !digits) {
      els.patList.classList.add("hidden");
      els.patPill.className = "badge badge-neutral";
      els.patPill.textContent = "Ism yoki telefon yozing";
      return;
    }

    const matches = state.patients.filter((p) => {
      const nameHit = nameQ.length >= 2 && (
        p.full_name.toLowerCase().includes(nameQ) ||
        p.patient_code.toLowerCase().includes(nameQ)
      );
      const phoneHit = digits.length >= 4 && (p.phone_normalized || "").includes(digits);
      return nameHit || phoneHit;
    }).slice(0, 8);

    // Aniq telefon mos kelsa ogohlantirish/taklif
    if (matches.length) {
      els.patList.classList.remove("hidden");
      els.patList.innerHTML = matches.map((p) => `
        <div class="pick-item" data-pat-id="${p.id}">
          <div>
            <strong>${window.CRM.esc(p.full_name)}</strong>
            <div class="text-muted mono" style="font-size:12px;">${window.CRM.esc(p.patient_code)} · ${window.CRM.esc(p.phone || "Telefonsiz")}</div>
          </div>
          <span class="badge badge-primary">Mavjudni tanlash</span>
        </div>`).join("");

      els.patList.querySelectorAll("[data-pat-id]").forEach((el) => {
        el.addEventListener("click", () => {
          const found = state.patients.find((x) => x.id === el.dataset.patId);
          if (found) selectPatient(found);
        });
      });
    } else {
      els.patList.classList.add("hidden");
    }

    if (!state.selectedPatient) {
      if (els.patName.value.trim().length >= 2) {
        els.patPill.className = "badge badge-info";
        els.patPill.textContent = "Yangi bemor — saqlashda avtomatik qo'shiladi";
      } else {
        els.patPill.className = "badge badge-neutral";
        els.patPill.textContent = "Bemor F.I.Sh. ni kiriting";
      }
    }
  }

  function selectPatient(p) {
    state.selectedPatient = p;
    els.patName.value = p.full_name;
    els.patPhone.value = p.phone || "";
    els.patList.classList.add("hidden");
    els.patPill.className = "badge badge-success";
    els.patPill.textContent = `Bazadan topildi (${p.patient_code})`;
    els.patBar.classList.remove("hidden");
    els.patBar.innerHTML = `
      <div style="font-size:13px;">
        <strong>${window.CRM.esc(p.full_name)}</strong>
        <span class="mono text-muted">(${window.CRM.esc(p.patient_code)})</span>
        ${p.phone ? ` · <span class="mono">${window.CRM.esc(p.phone)}</span>` : ""}
      </div>
      <button type="button" class="btn btn-sm" id="btn-clear-pat">Boshqa bemor</button>`;
    document.getElementById("btn-clear-pat")?.addEventListener("click", () => {
      state.selectedPatient = null;
      els.patName.value = "";
      els.patPhone.value = "";
      els.patBar.classList.add("hidden");
      onPatientInput();
      els.patName.focus();
    });
  }

  // ---------- 2-QADAM: SHIFOKOR + TEZKOR CHIPLAR ----------
  function doctorOrgNames(docId) {
    return state.workplaces
      .filter((w) => w.doctor_id === docId)
      .map((w) => w.organizations?.name)
      .filter(Boolean)
      .join(", ");
  }

  function renderQuickDoctors() {
    const top = state.doctors.slice(0, 6);
    if (!top.length) {
      els.docQuick.innerHTML = "";
      return;
    }
    els.docQuick.innerHTML = top.map((d) => `
      <button type="button" class="chip-btn" data-qdoc="${d.id}">
        <span class="mono" style="color:var(--primary-ink);font-weight:700;">${window.CRM.esc(d.doctor_code)}</span>
        <span>${window.CRM.esc(d.full_name.split(" ")[0])}</span>
      </button>`).join("");

    els.docQuick.querySelectorAll("[data-qdoc]").forEach((b) => {
      b.addEventListener("click", () => {
        const found = state.doctors.find((x) => x.id === b.dataset.qdoc);
        if (found) selectDoctor(found);
      });
    });
  }

  function findDoctorMatches(rawQ) {
    const q = rawQ.trim().toLowerCase();
    if (!q) return [];
    const normCode = /^\d{1,5}$/.test(q) ? "dr-" + q.padStart(4, "0") : "";
    return state.doctors.filter((d) => {
      const hay = [d.doctor_code, d.full_name, d.specialties?.name, doctorOrgNames(d.id)].join(" ").toLowerCase();
      return hay.includes(q) || (normCode && d.doctor_code.toLowerCase().includes(normCode));
    }).slice(0, 10);
  }

  function renderDoctorMatches() {
    const q = els.docQ.value.trim();
    if (!q) {
      els.docList.classList.add("hidden");
      return;
    }
    const matches = findDoctorMatches(q);
    els.docList.classList.remove("hidden");
    if (!matches.length) {
      els.docList.innerHTML = `<div style="padding:10px 12px;font-size:13px;color:var(--muted);">Shifokor topilmadi.</div>`;
      return;
    }
    els.docList.innerHTML = matches.map((d) => `
      <div class="pick-item" data-doc-id="${d.id}">
        <div>
          <span class="badge badge-primary mono">${window.CRM.esc(d.doctor_code)}</span>
          <strong style="margin-left:6px;">${window.CRM.esc(d.full_name)}</strong>
          <div class="text-muted" style="font-size:12px;">
            ${window.CRM.esc(d.specialties?.name || "—")} · ${window.CRM.esc(d.medpreds?.full_name || "Medpred yo'q")}
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
            ${window.CRM.esc(d.specialties?.name || "—")} · <strong>Medpred:</strong> ${window.CRM.esc(mpName)}
          </div>
        </div>
        <button type="button" class="btn btn-sm" id="btn-change-doc">Almashtirish</button>
      </div>`;
    document.getElementById("btn-change-doc")?.addEventListener("click", () => {
      state.selectedDoctor = null;
      els.docSelected.classList.add("hidden");
      els.docPicker.classList.remove("hidden");
      els.docQ.value = "";
      els.docList.classList.add("hidden");
      els.docQ.focus();
    });
  }

  // ---------- 3-QADAM: KATEGORIYA CHIPLARI + XIZMATLAR ----------
  function renderCategoryPills() {
    const items = [{ id: "", name: "Barchasi" }, ...state.categories];
    els.srvCats.innerHTML = items.map((c) => `
      <button type="button" class="chip-btn${state.selectedCat === c.id ? " active" : ""}" data-cat="${c.id}">
        ${window.CRM.esc(c.name)}
      </button>`).join("");

    els.srvCats.querySelectorAll("[data-cat]").forEach((b) => {
      b.addEventListener("click", () => {
        state.selectedCat = b.dataset.cat;
        renderCategoryPills();
        renderServicesList();
      });
    });
  }

  function renderServicesList() {
    const q = els.srvQ.value.trim().toLowerCase();
    const list = state.services.filter((s) => {
      if (state.selectedCat && s.category_id !== state.selectedCat) return false;
      if (q && ![s.name, s.service_code, s.service_categories?.name].join(" ").toLowerCase().includes(q)) return false;
      return true;
    }).slice(0, 40);

    if (!list.length) {
      els.srvList.innerHTML = `<div style="padding:12px;font-size:13.5px;color:var(--muted);">Xizmatlar topilmadi.</div>`;
      return;
    }

    els.srvList.innerHTML = list.map((s) => {
      const inCart = state.cart.find((c) => c.service_id === s.id);
      return `
      <div class="pick-item${inCart ? " in-cart" : ""}" data-srv-id="${s.id}">
        <div>
          <strong>${window.CRM.esc(s.name)}</strong>
          <div class="text-muted" style="font-size:12px;">${window.CRM.esc(s.service_categories?.name || "—")}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <strong class="mono">${window.CRM.fmtSom(s.price)}</strong>
          <span class="badge ${inCart ? "badge-success" : "badge-primary"}">${inCart ? `×${inCart.quantity}` : "+"}</span>
        </div>
      </div>`;
    }).join("");

    els.srvList.querySelectorAll("[data-srv-id]").forEach((el) => {
      el.addEventListener("click", () => addToCart(el.dataset.srvId));
    });
  }

  function addToCart(serviceId) {
    const srv = state.services.find((s) => s.id === serviceId);
    if (!srv) return;
    const existing = state.cart.find((c) => c.service_id === serviceId);
    if (existing) existing.quantity += 1;
    else state.cart.push({ service_id: srv.id, name: srv.name, price: Number(srv.price || 0), quantity: 1 });
    renderCart();
    renderServicesList();
  }

  function renderCart() {
    const totalItems = state.cart.reduce((s, c) => s + c.quantity, 0);
    els.srvCount.textContent = `${totalItems} ta tanlandi`;

    if (!state.cart.length) {
      els.cartItems.innerHTML = `<div class="text-muted" style="font-size:13.5px;padding:8px 0;">Chapdan xizmatlarni bosing — bu yerga qo'shiladi.</div>`;
    } else {
      els.cartItems.innerHTML = state.cart.map((c, idx) => `
        <div class="cart-row">
          <div>
            <strong>${window.CRM.esc(c.name)}</strong>
            <div class="mono text-muted" style="font-size:12px;">${window.CRM.fmtSom(c.price)}</div>
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
        renderCart(); renderServicesList();
      }));
      els.cartItems.querySelectorAll("[data-inc]").forEach((b) => b.addEventListener("click", () => {
        state.cart[Number(b.dataset.inc)].quantity++;
        renderCart(); renderServicesList();
      }));
      els.cartItems.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
        state.cart.splice(Number(b.dataset.rm), 1);
        renderCart(); renderServicesList();
      }));
    }
    recalcTotals(true);
  }

  function calcTotals() {
    const subtotal = state.cart.reduce((s, c) => s + c.price * c.quantity, 0);
    const discount = Math.max(0, Math.min(subtotal, Number(els.discount.value || 0)));
    const total = Math.max(0, subtotal - discount);
    const paid = Math.max(0, Math.min(total, Number(els.paid.value || 0)));
    const status = total === 0 ? "empty" : (paid === 0 ? "unpaid" : (paid < total ? "partial" : "paid"));
    return { subtotal, discount, total, paid, status };
  }

  function recalcTotals(autoFillPaid = false) {
    const pre = calcTotals();
    if (autoFillPaid) els.paid.value = String(Math.round(pre.total));
    const t = calcTotals();
    els.sumSub.textContent = window.CRM.fmtSom(t.subtotal);
    els.sumDisc.textContent = window.CRM.fmtSom(t.discount);
    els.rowDiscount.style.display = t.discount > 0 ? "flex" : "none";
    els.sumTot.textContent = window.CRM.fmtSom(t.total);
    const badgeMap = {
      empty: `<span class="badge badge-neutral">Kutilmoqda</span>`,
      paid: `<span class="badge badge-success">To'langan</span>`,
      partial: `<span class="badge badge-warning">Qisman</span>`,
      unpaid: `<span class="badge badge-danger">To'lanmagan</span>`
    };
    els.sumBadge.innerHTML = badgeMap[t.status];
  }

  // ---------- 4-QADAM: TASDIQLASH VA AVTOMATIK BEMOR + TASHRIF SAQLASH ----------
  function openConfirmModal() {
    const typedName = els.patName.value.trim();
    const typedPhone = els.patPhone.value.trim();
    if (!state.selectedPatient && typedName.length < 2) {
      els.patName.focus();
      return window.CRM.toast("1-qadam: Bemor F.I.Sh. ni kiriting", "warning");
    }
    if (!state.selectedDoctor) {
      els.docQ.focus();
      return window.CRM.toast("2-qadam: Shifokorni tanlang", "warning");
    }
    if (!state.cart.length) {
      return window.CRM.toast("3-qadam: Kamida bitta xizmat tanlang", "warning");
    }

    const t = calcTotals();
    const d = state.selectedDoctor;
    const mp = d.medpreds;
    const isNewPat = !state.selectedPatient;
    const patNameShow = isNewPat ? typedName : state.selectedPatient.full_name;
    const patPhoneShow = isNewPat ? typedPhone : (state.selectedPatient.phone || "");
    const methodLbl = { cash: "Naqd", card: "Karta", transfer: "O'tkazma" }[state.payMethod] || state.payMethod;

    const docPct = Number(d.temp_rate_pct || 0);
    const repPct = Number(mp?.temp_rate_pct || 0);
    const docBonus = state.bonusEnabled ? Math.round(t.total * docPct / 100) : 0;
    const repBonus = (state.bonusEnabled && mp) ? Math.round(t.total * repPct / 100) : 0;

    window.CRM.openModal(
      "Tashrifni tasdiqlash",
      `<div style="display:grid;gap:12px;">
        <div class="card" style="padding:12px 14px;background:var(--surface-2);font-size:14px;">
          <div><strong>Bemor:</strong> ${window.CRM.esc(patNameShow)} ${isNewPat ? `<span class="badge badge-info">Yangi — avto qo'shiladi</span>` : `<span class="mono text-muted">(${window.CRM.esc(state.selectedPatient.patient_code)})</span>`}</div>
          ${patPhoneShow ? `<div><strong>Telefon:</strong> <span class="mono">${window.CRM.esc(patPhoneShow)}</span></div>` : ""}
          <div><strong>Shifokor:</strong> ${window.CRM.esc(d.full_name)} <span class="mono">(${window.CRM.esc(d.doctor_code)})</span></div>
          <div><strong>Medpred:</strong> ${window.CRM.esc(mp?.full_name || "Biriktirilmagan")}</div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Xizmat</th><th class="text-right">Soni</th><th class="text-right">Jami</th></tr></thead>
            <tbody>${state.cart.map((c) => `<tr>
              <td>${window.CRM.esc(c.name)}</td>
              <td class="text-right mono">${c.quantity}</td>
              <td class="text-right mono"><strong>${window.CRM.fmtSom(c.price * c.quantity)}</strong></td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:8px;">
          <div class="sum-line total" style="border-top:0;margin-top:0;padding-top:0;"><span>Yakuniy summa:</span><span class="mono">${window.CRM.fmtSom(t.total)}</span></div>
          <div class="sum-line"><span>To'lanmoqda (${methodLbl}):</span><strong class="mono">${window.CRM.fmtSom(t.paid)}</strong></div>
        </div>
        ${canSeeBonus && state.bonusEnabled ? `
        <div class="alert alert-info" style="margin:0;font-size:12.5px;">
          <i data-lucide="calculator"></i>
          <div>Prototip hisob: Shifokor (${docPct}%) ${window.CRM.fmtSom(docBonus)} · Medpred (${repPct}%) ${window.CRM.fmtSom(repBonus)}</div>
        </div>` : ""}
      </div>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Orqaga</button>
       <button type="button" class="btn btn-primary" id="btn-commit-visit">Saqlash</button>`
    );

    document.getElementById("btn-commit-visit")?.addEventListener("click", async (ev) => {
      ev.target.disabled = true;
      try {
        // Agar bemor bazada bo'lmasa — avtomatik yaratamiz!
        let patientId = state.selectedPatient?.id;
        if (!patientId) {
          const { data: createdPat, error: patErr } = await window.sb.from("patients").insert({
            full_name: typedName,
            phone: typedPhone,
            created_by: user.id
          }).select().single();
          if (patErr) throw new Error("Bemor yaratishda xato: " + patErr.message);
          patientId = createdPat.id;
        }

        const res = await window.CRM.rpc("rpc_create_visit", {
          p_patient_id: patientId,
          p_doctor_id: d.id,
          p_services: state.cart.map((c) => ({ service_id: c.service_id, quantity: c.quantity })),
          p_branch_id: user.branch_id || null,
          p_discount: t.discount,
          p_paid_amount: t.paid,
          p_payment_method: state.payMethod,
          p_notes: els.notes.value.trim()
        });

        window.CRM.closeModal();
        window.CRM.toast(`Saqlandi: ${res.visit_code}`, "success");
        resetForm();
        await loadCatalogs();
        els.patName.focus();
      } catch (err) {
        window.CRM.toast("Xato: " + err.message, "error");
        ev.target.disabled = false;
      }
    });
  }

  function resetForm() {
    state.selectedPatient = null;
    state.selectedDoctor = null;
    state.cart = [];
    els.patName.value = "";
    els.patPhone.value = "";
    els.patBar.classList.add("hidden");
    els.patList.classList.add("hidden");
    els.patPill.className = "badge badge-neutral";
    els.patPill.textContent = "Ism yoki telefon yozing";
    els.docQ.value = "";
    els.docSelected.classList.add("hidden");
    els.docPicker.classList.remove("hidden");
    els.docList.classList.add("hidden");
    els.discount.value = "0";
    els.paid.value = "0";
    els.notes.value = "";
    renderCart();
    renderServicesList();
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
        ? `<span class="badge badge-danger">Bekor</span>`
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
      "Qolgan to'lovni qayd etish",
      `<form id="part-pay-form" class="form-grid">
        <div class="form-group">
          <label>Summa (qoldiq: ${window.CRM.fmtSom(rem)}) *</label>
          <input class="input mono" name="amount" type="number" min="1" max="${rem}" required value="${Math.round(rem)}">
        </div>
        <div class="form-group">
          <label>Usul</label>
          <select class="select" name="method">
            <option value="cash">Naqd</option>
            <option value="card">Plastik karta</option>
            <option value="transfer">O'tkazma</option>
          </select>
        </div>
      </form>`,
      `<button type="button" class="btn" onclick="window.CRM.closeModal()">Bekor</button>
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
          p_note: "Qabulxonadan qolgan to'lov"
        });
        window.CRM.closeModal();
        window.CRM.toast("To'lov qayd etildi", "success");
        await loadCatalogs();
      } catch (err) {
        window.CRM.toast("Xato: " + err.message, "error");
      }
    });
  }

  // Event listeners
  els.patName.addEventListener("input", onPatientInput);
  els.patPhone.addEventListener("input", onPatientInput);
  els.docQ.addEventListener("input", renderDoctorMatches);
  els.docQ.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const m = findDoctorMatches(els.docQ.value);
      if (m.length === 1) { e.preventDefault(); selectDoctor(m[0]); }
    }
  });
  els.srvQ.addEventListener("input", renderServicesList);
  els.discount.addEventListener("input", () => recalcTotals(true));
  els.paid.addEventListener("input", () => recalcTotals(false));
  document.getElementById("btn-pay-zero")?.addEventListener("click", () => { els.paid.value = "0"; recalcTotals(false); });
  document.querySelectorAll("#pay-methods .pay-method-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.payMethod = btn.dataset.method;
      document.querySelectorAll("#pay-methods .pay-method-btn").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });
  document.getElementById("btn-review-visit")?.addEventListener("click", openConfirmModal);
  document.getElementById("btn-reset-form")?.addEventListener("click", resetForm);

  await loadCatalogs();
  els.patName.focus();
})();
