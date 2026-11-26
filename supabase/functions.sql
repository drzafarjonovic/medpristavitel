-- ============================================================================
-- MEDPRED CRM — POSTGRESQL FUNCTIONS, TRIGGERS VA RPC TRANZAKSIYALARI
-- Bosqich 2: Avtomatik ID generatsiya, narx tarixi, audit log va moliyaviy RPC
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. YORDAMCHI AUTH VA UTILITA FUNKSIYALARI
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT r.code
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = auth.uid() AND p.is_active = TRUE
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_medpred_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT m.id
    FROM public.medpreds m
    WHERE m.profile_id = auth.uid()
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_perm_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.role_permissions rp ON rp.role_id = p.role_id
        JOIN public.permissions perm ON perm.id = rp.permission_id
        WHERE p.id = auth.uid()
          AND p.is_active = TRUE
          AND perm.code = p_perm_code
    );
$$;

-- ----------------------------------------------------------------------------
-- 2. AVTOMATIK UNIKAL KODLAR VA TELEFON NORMALIZATSIYASI TRIGGERLARI
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_auto_doctor_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.doctor_code IS NULL OR btrim(NEW.doctor_code) = '' THEN
        NEW.doctor_code := 'DR-' || LPAD(nextval('public.seq_doctor_code')::TEXT, 4, '0');
    ELSE
        NEW.doctor_code := UPPER(btrim(NEW.doctor_code));
    END IF;
    NEW.phone_normalized := public.normalize_phone(NEW.phone);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctors_before_save ON public.doctors;
CREATE TRIGGER trg_doctors_before_save
BEFORE INSERT OR UPDATE ON public.doctors
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_doctor_fields();

CREATE OR REPLACE FUNCTION public.trg_auto_medpred_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.medpred_code IS NULL OR btrim(NEW.medpred_code) = '' THEN
        NEW.medpred_code := 'MP-' || LPAD(nextval('public.seq_medpred_code')::TEXT, 4, '0');
    ELSE
        NEW.medpred_code := UPPER(btrim(NEW.medpred_code));
    END IF;
    NEW.phone_normalized := public.normalize_phone(NEW.phone);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_medpreds_before_save ON public.medpreds;
CREATE TRIGGER trg_medpreds_before_save
BEFORE INSERT OR UPDATE ON public.medpreds
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_medpred_fields();

CREATE OR REPLACE FUNCTION public.trg_auto_patient_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.patient_code IS NULL OR btrim(NEW.patient_code) = '' THEN
        NEW.patient_code := 'PT-' || LPAD(nextval('public.seq_patient_code')::TEXT, 5, '0');
    END IF;
    NEW.phone_normalized := public.normalize_phone(NEW.phone);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patients_before_save ON public.patients;
CREATE TRIGGER trg_patients_before_save
BEFORE INSERT OR UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_patient_fields();

CREATE OR REPLACE FUNCTION public.trg_auto_service_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.service_code IS NULL OR btrim(NEW.service_code) = '' THEN
        NEW.service_code := 'SRV-' || LPAD(nextval('public.seq_service_code')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_services_before_save ON public.services;
CREATE TRIGGER trg_services_before_save
BEFORE INSERT ON public.services
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_service_code();

-- Xizmat narxi o'zgarganda service_price_history ga avtomatik yozish
CREATE OR REPLACE FUNCTION public.trg_track_service_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.price IS DISTINCT FROM NEW.price THEN
        INSERT INTO public.service_price_history(service_id, old_price, new_price, source, changed_by)
        VALUES (NEW.id, OLD.price, NEW.price, 'manual', auth.uid());
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_services_price_history ON public.services;
CREATE TRIGGER trg_services_price_history
AFTER UPDATE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.trg_track_service_price();

-- Shifokor birinchi marta yaratilganda doctor_assignments ga avtomatik yozish
CREATE OR REPLACE FUNCTION public.trg_doctor_initial_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.current_medpred_id IS NOT NULL THEN
        INSERT INTO public.doctor_assignments(doctor_id, medpred_id, is_current, assigned_by, note)
        VALUES (NEW.id, NEW.current_medpred_id, TRUE, auth.uid(), 'Dastlabki biriktirish')
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctors_initial_assign ON public.doctors;
CREATE TRIGGER trg_doctors_initial_assign
AFTER INSERT ON public.doctors
FOR EACH ROW EXECUTE FUNCTION public.trg_doctor_initial_assignment();

-- ----------------------------------------------------------------------------
-- 3. AUDIT LOG TRIGGERI (Barcha muhim jadvallardagi o'zgarishlar)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_write_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_rec_id TEXT;
BEGIN
    v_role := COALESCE(public.current_user_role(), 'SYSTEM');
    IF TG_OP = 'DELETE' THEN
        v_rec_id := COALESCE(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'key', '');
        INSERT INTO public.audit_logs(actor_id, actor_role, table_name, record_id, action, old_data, new_data)
        VALUES (auth.uid(), v_role, TG_TABLE_NAME, v_rec_id, 'DELETE', to_jsonb(OLD), NULL);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        v_rec_id := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'key', '');
        INSERT INTO public.audit_logs(actor_id, actor_role, table_name, record_id, action, old_data, new_data)
        VALUES (auth.uid(), v_role, TG_TABLE_NAME, v_rec_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSE
        v_rec_id := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'key', '');
        INSERT INTO public.audit_logs(actor_id, actor_role, table_name, record_id, action, old_data, new_data)
        VALUES (auth.uid(), v_role, TG_TABLE_NAME, v_rec_id, 'INSERT', NULL, to_jsonb(NEW));
        RETURN NEW;
    END IF;
END;
$$;

DO $$
DECLARE
    t TEXT;
    audited TEXT[] := ARRAY[
        'profiles','medpreds','doctors','doctor_assignments','services',
        'visits','payments','refunds','bonus_rules','system_settings'
    ];
BEGIN
    FOREACH t IN ARRAY audited LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_audit ON public.%I', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%I_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_write_audit_log()',
            t, t
        );
    END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. SERVER TOMONIDAGI ASOSIY RPC FUNKSIYALARI
-- ----------------------------------------------------------------------------

-- 4.1. Shifokorni boshqa medpredga o'tkazish (tarixni saqlagan holda)
CREATE OR REPLACE FUNCTION public.rpc_assign_doctor_medpred(
    p_doctor_id      UUID,
    p_new_medpred_id UUID,
    p_note           TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT := public.current_user_role();
BEGIN
    IF v_role NOT IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER') THEN
        RAISE EXCEPTION 'Ruxsat yo''q: shifokor biriktirish faqat Superadmin/Direktor/Menejer uchun';
    END IF;

    UPDATE public.doctor_assignments
    SET is_current = FALSE, assigned_to = NOW()
    WHERE doctor_id = p_doctor_id AND is_current = TRUE;

    INSERT INTO public.doctor_assignments(doctor_id, medpred_id, is_current, assigned_by, note)
    VALUES (p_doctor_id, p_new_medpred_id, TRUE, auth.uid(), COALESCE(p_note, ''));

    UPDATE public.doctors
    SET current_medpred_id = p_new_medpred_id
    WHERE id = p_doctor_id;

    RETURN jsonb_build_object('ok', TRUE, 'doctor_id', p_doctor_id, 'medpred_id', p_new_medpred_id);
END;
$$;

-- 4.2. Qabulxona: Yangi tashrifni atomik yaratish (ko'p xizmat, snapshot, prototip bonus)
-- p_services formati: [{"service_id": "uuid", "quantity": 1}, ...]
CREATE OR REPLACE FUNCTION public.rpc_create_visit(
    p_patient_id     UUID,
    p_doctor_id      UUID,
    p_services       JSONB,
    p_branch_id      UUID DEFAULT NULL,
    p_discount       NUMERIC(18,2) DEFAULT 0.00,
    p_paid_amount    NUMERIC(18,2) DEFAULT 0.00,
    p_payment_method TEXT DEFAULT 'cash',
    p_notes          TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role          TEXT := public.current_user_role();
    v_doc           RECORD;
    v_medpred_id    UUID;
    v_medpred_name  TEXT := '';
    v_medpred_pct   NUMERIC(5,2) := 0.00;
    v_doc_pct       NUMERIC(5,2) := 0.00;
    v_bonus_enabled BOOLEAN := TRUE;
    v_calc_mode     TEXT := 'after_discount';
    v_allow_disc    BOOLEAN := TRUE;
    v_subtotal      NUMERIC(18,2) := 0.00;
    v_discount      NUMERIC(18,2) := COALESCE(p_discount, 0.00);
    v_total         NUMERIC(18,2) := 0.00;
    v_paid          NUMERIC(18,2) := COALESCE(p_paid_amount, 0.00);
    v_pay_status    TEXT := 'unpaid';
    v_calc_base     NUMERIC(18,2) := 0.00;
    v_doc_bonus     NUMERIC(18,2) := 0.00;
    v_rep_bonus     NUMERIC(18,2) := 0.00;
    v_clinic_net    NUMERIC(18,2) := 0.00;
    v_visit_id      UUID;
    v_visit_code    TEXT;
    v_referral_id   UUID;
    v_item          JSONB;
    v_srv           RECORD;
    v_qty           INTEGER;
    v_line_total    NUMERIC(18,2);
BEGIN
    IF v_role NOT IN ('SUPERADMIN', 'DIRECTOR', 'RECEPTION') THEN
        RAISE EXCEPTION 'Ruxsat yo''q: tashrif yaratish faqat Qabulxona, Direktor yoki Superadmin uchun';
    END IF;

    IF p_services IS NULL OR jsonb_typeof(p_services) <> 'array' OR jsonb_array_length(p_services) = 0 THEN
        RAISE EXCEPTION 'Kamida bitta xizmat tanlanishi shart';
    END IF;

    IF v_discount < 0 OR v_paid < 0 THEN
        RAISE EXCEPTION 'Chegirma va to''lov summasi manfiy bo''lishi mumkin emas';
    END IF;

    -- Shifokorni olish
    SELECT d.* INTO v_doc FROM public.doctors d WHERE d.id = p_doctor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shifokor topilmadi';
    END IF;

    -- Faol biriktirilgan medpredni tarixiy jadvaldan (yoki doctors dan) avtomatik aniqlash
    SELECT da.medpred_id INTO v_medpred_id
    FROM public.doctor_assignments da
    WHERE da.doctor_id = p_doctor_id AND da.is_current = TRUE
    LIMIT 1;

    IF v_medpred_id IS NULL THEN
        v_medpred_id := v_doc.current_medpred_id;
    END IF;

    IF v_medpred_id IS NOT NULL THEN
        SELECT m.full_name, m.temp_rate_pct INTO v_medpred_name, v_medpred_pct
        FROM public.medpreds m WHERE m.id = v_medpred_id;
    END IF;

    -- Sozlamalarni o'qish
    SELECT COALESCE((value)::BOOLEAN, TRUE) INTO v_bonus_enabled
    FROM public.system_settings WHERE key = 'referral_calc_enabled';

    SELECT COALESCE(value #>> '{}', 'after_discount') INTO v_calc_mode
    FROM public.system_settings WHERE key = 'calc_base_mode';

    SELECT COALESCE((value)::BOOLEAN, TRUE) INTO v_allow_disc
    FROM public.system_settings WHERE key = 'allow_reception_discount';

    IF v_role = 'RECEPTION' AND NOT v_allow_disc AND v_discount > 0 THEN
        RAISE EXCEPTION 'Qabulxona xodimiga chegirma berish ruxsat etilmagan';
    END IF;

    -- Xizmatlar summasini server katalogidan hisoblash (frontend narxiga ishonilmaydi)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_services) LOOP
        v_qty := GREATEST(COALESCE((v_item->>'quantity')::INTEGER, 1), 1);
        SELECT s.id, s.name, s.price, COALESCE(sc.name, '') AS cat_name
        INTO v_srv
        FROM public.services s
        LEFT JOIN public.service_categories sc ON sc.id = s.category_id
        WHERE s.id = (v_item->>'service_id')::UUID AND s.is_active = TRUE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Faol xizmat topilmadi: %', v_item->>'service_id';
        END IF;

        v_subtotal := v_subtotal + ROUND(v_srv.price * v_qty, 2);
    END LOOP;

    IF v_discount > v_subtotal THEN
        RAISE EXCEPTION 'Chegirma jami summadan katta bo''lishi mumkin emas';
    END IF;

    v_total := ROUND(v_subtotal - v_discount, 2);

    IF v_paid > v_total THEN
        RAISE EXCEPTION 'To''langan summa yakuniy summadan katta bo''lishi mumkin emas';
    END IF;

    IF v_paid = 0 THEN
        v_pay_status := 'unpaid';
    ELSIF v_paid < v_total THEN
        v_pay_status := 'partial';
    ELSE
        v_pay_status := 'paid';
    END IF;

    -- Vaqtinchalik prototip referal hisob-kitobi
    v_doc_pct := COALESCE(v_doc.temp_rate_pct, 0.00);
    v_medpred_pct := COALESCE(v_medpred_pct, 0.00);

    IF v_calc_mode = 'gross' THEN
        v_calc_base := v_subtotal;
    ELSIF v_calc_mode = 'paid' THEN
        v_calc_base := v_paid;
    ELSE
        v_calc_base := v_total; -- default: chegirmadan keyingi summa
    END IF;

    IF v_bonus_enabled THEN
        v_doc_bonus := ROUND(v_calc_base * v_doc_pct / 100.0, 2);
        v_rep_bonus := CASE WHEN v_medpred_id IS NOT NULL THEN ROUND(v_calc_base * v_medpred_pct / 100.0, 2) ELSE 0.00 END;
    ELSE
        v_doc_bonus := 0.00;
        v_rep_bonus := 0.00;
    END IF;
    v_clinic_net := ROUND(v_calc_base - v_doc_bonus - v_rep_bonus, 2);

    -- Referral yozuvini yaratish
    INSERT INTO public.referrals(patient_id, doctor_id, medpred_id, referral_code, status, created_by)
    VALUES (p_patient_id, p_doctor_id, v_medpred_id, v_doc.doctor_code, 'used', auth.uid())
    RETURNING id INTO v_referral_id;

    -- Tashrifni snapshotlar bilan saqlash
    v_visit_code := 'VS-' || LPAD(nextval('public.seq_visit_code')::TEXT, 6, '0');

    INSERT INTO public.visits(
        visit_code, patient_id, doctor_id, medpred_id, referral_id, branch_id, receptionist_id,
        doctor_code_snapshot, doctor_name_snapshot, medpred_name_snapshot,
        subtotal_amount, discount_amount, total_amount, paid_amount, payment_status,
        bonus_calc_enabled_snapshot, calc_base_mode_snapshot, calc_base_amount,
        doctor_pct_snapshot, medpred_pct_snapshot,
        doctor_bonus_amount, medpred_bonus_amount, clinic_net_amount, notes
    )
    VALUES (
        v_visit_code, p_patient_id, p_doctor_id, v_medpred_id, v_referral_id, p_branch_id, auth.uid(),
        v_doc.doctor_code, v_doc.full_name, v_medpred_name,
        v_subtotal, v_discount, v_total, v_paid, v_pay_status,
        v_bonus_enabled, v_calc_mode, v_calc_base,
        v_doc_pct, v_medpred_pct,
        v_doc_bonus, v_rep_bonus, v_clinic_net, COALESCE(p_notes, '')
    )
    RETURNING id INTO v_visit_id;

    -- visit_services snapshotlarini kiritish
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_services) LOOP
        v_qty := GREATEST(COALESCE((v_item->>'quantity')::INTEGER, 1), 1);
        SELECT s.id, s.name, s.price, COALESCE(sc.name, '') AS cat_name
        INTO v_srv
        FROM public.services s
        LEFT JOIN public.service_categories sc ON sc.id = s.category_id
        WHERE s.id = (v_item->>'service_id')::UUID;

        v_line_total := ROUND(v_srv.price * v_qty, 2);

        INSERT INTO public.visit_services(
            visit_id, service_id, service_name_snapshot, category_snapshot, unit_price, quantity, line_total
        )
        VALUES (v_visit_id, v_srv.id, v_srv.name, v_srv.cat_name, v_srv.price, v_qty, v_line_total);
    END LOOP;

    -- Boshlang'ich to'lov bo'lsa payments ga yozish
    IF v_paid > 0 THEN
        INSERT INTO public.payments(payment_kind, visit_id, amount, payment_method, received_by, note)
        VALUES ('visit_payment', v_visit_id, v_paid, COALESCE(p_payment_method, 'cash'), auth.uid(), 'Tashrif vaqtidagi to''lov');
    END IF;

    -- Prototip bonus tranzaksiyalarini yozish
    IF v_bonus_enabled AND v_doc_bonus > 0 THEN
        INSERT INTO public.bonus_transactions(
            visit_id, recipient_type, doctor_id, tx_type, calc_base, rate_pct, amount, is_prototype, note, created_by
        )
        VALUES (v_visit_id, 'doctor', p_doctor_id, 'accrual', v_calc_base, v_doc_pct, v_doc_bonus, TRUE, 'Vaqtinchalik hisob-kitob (prototip)', auth.uid());
    END IF;

    IF v_bonus_enabled AND v_medpred_id IS NOT NULL AND v_rep_bonus > 0 THEN
        INSERT INTO public.bonus_transactions(
            visit_id, recipient_type, medpred_id, tx_type, calc_base, rate_pct, amount, is_prototype, note, created_by
        )
        VALUES (v_visit_id, 'medpred', v_medpred_id, 'accrual', v_calc_base, v_medpred_pct, v_rep_bonus, TRUE, 'Vaqtinchalik hisob-kitob (prototip)', auth.uid());
    END IF;

    RETURN jsonb_build_object(
        'id', v_visit_id,
        'visit_code', v_visit_code,
        'subtotal_amount', v_subtotal,
        'discount_amount', v_discount,
        'total_amount', v_total,
        'paid_amount', v_paid,
        'payment_status', v_pay_status,
        'doctor_bonus_amount', v_doc_bonus,
        'medpred_bonus_amount', v_rep_bonus,
        'clinic_net_amount', v_clinic_net
    );
END;
$$;

-- 4.3. Qisman yoki qo'shimcha to'lov qayd etish
CREATE OR REPLACE FUNCTION public.rpc_record_visit_payment(
    p_visit_id       UUID,
    p_amount         NUMERIC(18,2),
    p_payment_method TEXT DEFAULT 'cash',
    p_note           TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role      TEXT := public.current_user_role();
    v_visit     RECORD;
    v_new_paid  NUMERIC(18,2);
    v_status    TEXT;
BEGIN
    IF v_role NOT IN ('SUPERADMIN', 'DIRECTOR', 'RECEPTION', 'ACCOUNTANT') THEN
        RAISE EXCEPTION 'Ruxsat yo''q';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'To''lov summasi 0 dan katta bo''lishi kerak';
    END IF;

    SELECT * INTO v_visit FROM public.visits WHERE id = p_visit_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tashrif topilmadi';
    END IF;
    IF v_visit.status = 'cancelled' THEN
        RAISE EXCEPTION 'Bekor qilingan tashrifga to''lov qo''shib bo''lmaydi';
    END IF;

    v_new_paid := ROUND(v_visit.paid_amount + p_amount, 2);
    IF v_new_paid > v_visit.total_amount THEN
        RAISE EXCEPTION 'Jami to''lov tashrif summasidan oshib ketdi';
    END IF;

    v_status := CASE WHEN v_new_paid >= v_visit.total_amount THEN 'paid' ELSE 'partial' END;

    INSERT INTO public.payments(payment_kind, visit_id, amount, payment_method, received_by, note)
    VALUES ('visit_payment', p_visit_id, p_amount, COALESCE(p_payment_method, 'cash'), auth.uid(), COALESCE(p_note, ''));

    UPDATE public.visits
    SET paid_amount = v_new_paid, payment_status = v_status
    WHERE id = p_visit_id;

    RETURN jsonb_build_object('visit_id', p_visit_id, 'paid_amount', v_new_paid, 'payment_status', v_status);
END;
$$;

-- 4.4. Tashrifni bekor qilish va qaytarish (DELETE o'rniga soft-cancel + refund + bonus reversal)
CREATE OR REPLACE FUNCTION public.rpc_cancel_visit(
    p_visit_id      UUID,
    p_reason        TEXT,
    p_refund_amount NUMERIC(18,2) DEFAULT 0.00,
    p_refund_method TEXT DEFAULT 'cash'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role   TEXT := public.current_user_role();
    v_visit  RECORD;
BEGIN
    IF v_role NOT IN ('SUPERADMIN', 'DIRECTOR', 'ACCOUNTANT', 'RECEPTION') THEN
        RAISE EXCEPTION 'Ruxsat yo''q';
    END IF;

    IF btrim(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'Bekor qilish sababi kiritilishi shart';
    END IF;

    SELECT * INTO v_visit FROM public.visits WHERE id = p_visit_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tashrif topilmadi';
    END IF;
    IF v_visit.status = 'cancelled' THEN
        RAISE EXCEPTION 'Tashrif allaqachon bekor qilingan';
    END IF;

    IF COALESCE(p_refund_amount, 0) > v_visit.paid_amount THEN
        RAISE EXCEPTION 'Qaytariladigan summa to''langan summadan katta bo''lishi mumkin emas';
    END IF;

    IF COALESCE(p_refund_amount, 0) > 0 THEN
        INSERT INTO public.refunds(visit_id, amount, refund_method, reason, refunded_by)
        VALUES (p_visit_id, p_refund_amount, COALESCE(p_refund_method, 'cash'), p_reason, auth.uid());
    END IF;

    -- Prototip bonuslarni teskari yozuv (reversal) bilan yopish
    IF v_visit.doctor_bonus_amount > 0 THEN
        INSERT INTO public.bonus_transactions(
            visit_id, recipient_type, doctor_id, tx_type, calc_base, rate_pct, amount, is_prototype, note, created_by
        )
        VALUES (p_visit_id, 'doctor', v_visit.doctor_id, 'reversal', v_visit.calc_base_amount,
                v_visit.doctor_pct_snapshot, -v_visit.doctor_bonus_amount, TRUE, 'Bekor qilindi: ' || p_reason, auth.uid());
    END IF;

    IF v_visit.medpred_id IS NOT NULL AND v_visit.medpred_bonus_amount > 0 THEN
        INSERT INTO public.bonus_transactions(
            visit_id, recipient_type, medpred_id, tx_type, calc_base, rate_pct, amount, is_prototype, note, created_by
        )
        VALUES (p_visit_id, 'medpred', v_visit.medpred_id, 'reversal', v_visit.calc_base_amount,
                v_visit.medpred_pct_snapshot, -v_visit.medpred_bonus_amount, TRUE, 'Bekor qilindi: ' || p_reason, auth.uid());
    END IF;

    UPDATE public.visits
    SET status = 'cancelled',
        payment_status = CASE WHEN COALESCE(p_refund_amount, 0) > 0 THEN 'refunded' ELSE payment_status END,
        cancelled_at = NOW(),
        cancelled_by = auth.uid(),
        cancel_reason = p_reason
    WHERE id = p_visit_id;

    RETURN jsonb_build_object('ok', TRUE, 'visit_id', p_visit_id, 'status', 'cancelled');
END;
$$;

-- 4.5. Buxgalter: Shifokor yoki Medpredga vaqtinchalik hisob-kitob to'lovini qayd etish
CREATE OR REPLACE FUNCTION public.rpc_record_bonus_payout(
    p_recipient_type TEXT,
    p_recipient_id   UUID,
    p_amount         NUMERIC(18,2),
    p_payment_method TEXT DEFAULT 'cash',
    p_note           TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role       TEXT := public.current_user_role();
    v_payment_id UUID;
BEGIN
    IF v_role NOT IN ('SUPERADMIN', 'ACCOUNTANT') THEN
        RAISE EXCEPTION 'Ruxsat yo''q: to''lov qayd etish faqat Buxgalter yoki Superadmin uchun';
    END IF;

    IF p_recipient_type NOT IN ('doctor', 'medpred') THEN
        RAISE EXCEPTION 'Noto''g''ri qabul qiluvchi turi';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Summa 0 dan katta bo''lishi kerak';
    END IF;

    IF p_recipient_type = 'doctor' THEN
        INSERT INTO public.payments(payment_kind, doctor_id, amount, payment_method, received_by, note)
        VALUES ('doctor_payout', p_recipient_id, p_amount, COALESCE(p_payment_method, 'cash'), auth.uid(), COALESCE(p_note, ''))
        RETURNING id INTO v_payment_id;

        INSERT INTO public.bonus_transactions(
            payment_id, recipient_type, doctor_id, tx_type, amount, is_prototype, note, created_by
        )
        VALUES (v_payment_id, 'doctor', p_recipient_id, 'payout', -p_amount, TRUE, COALESCE(p_note, 'To''lov qayd etildi'), auth.uid());
    ELSE
        INSERT INTO public.payments(payment_kind, medpred_id, amount, payment_method, received_by, note)
        VALUES ('medpred_payout', p_recipient_id, p_amount, COALESCE(p_payment_method, 'cash'), auth.uid(), COALESCE(p_note, ''))
        RETURNING id INTO v_payment_id;

        INSERT INTO public.bonus_transactions(
            payment_id, recipient_type, medpred_id, tx_type, amount, is_prototype, note, created_by
        )
        VALUES (v_payment_id, 'medpred', p_recipient_id, 'payout', -p_amount, TRUE, COALESCE(p_note, 'To''lov qayd etildi'), auth.uid());
    END IF;

    RETURN jsonb_build_object('ok', TRUE, 'payment_id', v_payment_id);
END;
$$;
