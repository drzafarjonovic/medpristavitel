-- ============================================================================
-- MEDPRED CRM — ROW LEVEL SECURITY (RLS) SIYOSATLARI (BARCHA 26 TA JADVAL)
-- Bosqich 2: 6 ta rol bo'yicha backend darajasidagi qat'iy kirish nazorati
-- ============================================================================

-- Barcha 26 ta jadvalda RLS ni yoqish
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'roles','permissions','role_permissions','branches','territories','profiles',
        'medpreds','specialties','organizations','doctors','doctor_workplaces','doctor_assignments',
        'service_categories','services','service_price_history','patients','referrals','visits',
        'visit_services','payments','refunds','bonus_rules','bonus_transactions',
        'import_logs','audit_logs','system_settings'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END;
$$;

-- ============================================================================
-- 1. ROLES, PERMISSIONS, ROLE_PERMISSIONS
-- ============================================================================
CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY roles_admin ON public.roles FOR ALL TO authenticated
    USING (public.current_user_role() = 'SUPERADMIN')
    WITH CHECK (public.current_user_role() = 'SUPERADMIN');

CREATE POLICY perms_read ON public.permissions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY perms_admin ON public.permissions FOR ALL TO authenticated
    USING (public.current_user_role() = 'SUPERADMIN')
    WITH CHECK (public.current_user_role() = 'SUPERADMIN');

CREATE POLICY role_perms_read ON public.role_permissions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY role_perms_admin ON public.role_permissions FOR ALL TO authenticated
    USING (public.current_user_role() = 'SUPERADMIN')
    WITH CHECK (public.current_user_role() = 'SUPERADMIN');

-- ============================================================================
-- 2. PROFILES (Foydalanuvchilar)
-- ============================================================================
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER')
    );

CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR'));

CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
    USING (
        public.current_user_role() = 'SUPERADMIN'
        OR (public.current_user_role() = 'DIRECTOR' AND id <> auth.uid())
    )
    WITH CHECK (
        public.current_user_role() = 'SUPERADMIN'
        OR public.current_user_role() = 'DIRECTOR'
    );

-- ============================================================================
-- 3. BRANCHES, TERRITORIES, SPECIALTIES, SERVICE_CATEGORIES (Kataloglar)
-- ============================================================================
CREATE POLICY branches_select ON public.branches FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY branches_write ON public.branches FOR ALL TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR'))
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR'));

CREATE POLICY territories_select ON public.territories FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY territories_write ON public.territories FOR ALL TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER'));

CREATE POLICY specialties_select ON public.specialties FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY specialties_write ON public.specialties FOR ALL TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER'));

CREATE POLICY service_cat_select ON public.service_categories FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY service_cat_write ON public.service_categories FOR ALL TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR'))
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR'));

-- ============================================================================
-- 4. MEDPREDS (Medpred faqat o'z profilini ko'radi!)
-- ============================================================================
CREATE POLICY medpreds_select ON public.medpreds FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER', 'ACCOUNTANT', 'RECEPTION')
        OR (public.current_user_role() = 'MEDPRED' AND id = public.current_medpred_id())
    );

CREATE POLICY medpreds_write ON public.medpreds FOR ALL TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'MANAGER'));

-- ============================================================================
-- 5. ORGANIZATIONS, DOCTORS, DOCTOR_WORKPLACES, DOCTOR_ASSIGNMENTS
-- ============================================================================
CREATE POLICY orgs_select ON public.organizations FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY orgs_write ON public.organizations FOR ALL TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER'));

-- Medpred faqat o'z shifokorlarini ko'radi; yangi shifokorni faqat o'ziga biriktirib qo'shadi
CREATE POLICY doctors_select ON public.doctors FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER', 'RECEPTION', 'ACCOUNTANT')
        OR (public.current_user_role() = 'MEDPRED' AND current_medpred_id = public.current_medpred_id())
    );

CREATE POLICY doctors_insert ON public.doctors FOR INSERT TO authenticated
    WITH CHECK (
        public.current_user_role() IN ('SUPERADMIN', 'MANAGER')
        OR (public.current_user_role() = 'MEDPRED' AND current_medpred_id = public.current_medpred_id())
    );

CREATE POLICY doctors_update ON public.doctors FOR UPDATE TO authenticated
    USING (
        public.current_user_role() IN ('SUPERADMIN', 'MANAGER')
        OR (public.current_user_role() = 'MEDPRED' AND current_medpred_id = public.current_medpred_id())
    )
    WITH CHECK (
        public.current_user_role() IN ('SUPERADMIN', 'MANAGER')
        OR (public.current_user_role() = 'MEDPRED' AND current_medpred_id = public.current_medpred_id())
    );

CREATE POLICY doc_workplaces_select ON public.doctor_workplaces FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER', 'RECEPTION', 'ACCOUNTANT')
        OR EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.id = doctor_id AND d.current_medpred_id = public.current_medpred_id()
        )
    );

CREATE POLICY doc_workplaces_write ON public.doctor_workplaces FOR ALL TO authenticated
    USING (
        public.current_user_role() IN ('SUPERADMIN', 'MANAGER')
        OR (public.current_user_role() = 'MEDPRED' AND EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.id = doctor_id AND d.current_medpred_id = public.current_medpred_id()
        ))
    )
    WITH CHECK (
        public.current_user_role() IN ('SUPERADMIN', 'MANAGER')
        OR (public.current_user_role() = 'MEDPRED' AND EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.id = doctor_id AND d.current_medpred_id = public.current_medpred_id()
        ))
    );

CREATE POLICY doc_assignments_select ON public.doctor_assignments FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER', 'ACCOUNTANT')
        OR (public.current_user_role() = 'MEDPRED' AND medpred_id = public.current_medpred_id())
    );

CREATE POLICY doc_assignments_write ON public.doctor_assignments FOR ALL TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'MANAGER'))
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'MANAGER'));

-- ============================================================================
-- 6. SERVICES VA SERVICE_PRICE_HISTORY
-- ============================================================================
CREATE POLICY services_select ON public.services FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY services_write ON public.services FOR ALL TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR'))
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR'));

CREATE POLICY price_hist_select ON public.service_price_history FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'ACCOUNTANT', 'MANAGER'));

-- ============================================================================
-- 7. PATIENTS, REFERRALS, VISITS, VISIT_SERVICES
-- ============================================================================
-- Bemor shaxsiy ma'lumotlari rollar bo'yicha himoyalangan (MEDPRED faqat o'z tashriflaridagi bemorlarni ko'radi)
CREATE POLICY patients_select ON public.patients FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER', 'RECEPTION', 'ACCOUNTANT')
        OR (
            public.current_user_role() = 'MEDPRED' AND EXISTS (
                SELECT 1 FROM public.visits v
                WHERE v.patient_id = patients.id AND v.medpred_id = public.current_medpred_id()
            )
        )
    );

CREATE POLICY patients_write ON public.patients FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'RECEPTION'));

CREATE POLICY patients_update ON public.patients FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'RECEPTION'))
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'RECEPTION'));

CREATE POLICY referrals_select ON public.referrals FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER', 'RECEPTION', 'ACCOUNTANT')
        OR (public.current_user_role() = 'MEDPRED' AND medpred_id = public.current_medpred_id())
    );

CREATE POLICY referrals_write ON public.referrals FOR ALL TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'RECEPTION'))
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'RECEPTION'));

CREATE POLICY visits_select ON public.visits FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER', 'ACCOUNTANT')
        OR (public.current_user_role() = 'RECEPTION')
        OR (public.current_user_role() = 'MEDPRED' AND medpred_id = public.current_medpred_id())
    );

-- Tashriflar asosan rpc_create_visit / rpc_cancel_visit orqali yoziladi; qattiq DELETE taqiqlangan
CREATE POLICY visits_insert ON public.visits FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'RECEPTION'));

CREATE POLICY visits_update ON public.visits FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'RECEPTION', 'ACCOUNTANT'))
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'RECEPTION', 'ACCOUNTANT'));

CREATE POLICY visit_services_select ON public.visit_services FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER', 'RECEPTION', 'ACCOUNTANT')
        OR (
            public.current_user_role() = 'MEDPRED' AND EXISTS (
                SELECT 1 FROM public.visits v
                WHERE v.id = visit_id AND v.medpred_id = public.current_medpred_id()
            )
        )
    );

CREATE POLICY visit_services_write ON public.visit_services FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'RECEPTION'));

-- ============================================================================
-- 8. PAYMENTS, REFUNDS, BONUS_RULES, BONUS_TRANSACTIONS
-- ============================================================================
CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'ACCOUNTANT')
        OR (public.current_user_role() = 'RECEPTION' AND payment_kind = 'visit_payment')
        OR (public.current_user_role() = 'MEDPRED' AND payment_kind = 'medpred_payout' AND medpred_id = public.current_medpred_id())
    );

CREATE POLICY payments_insert ON public.payments FOR INSERT TO authenticated
    WITH CHECK (
        public.current_user_role() IN ('SUPERADMIN', 'ACCOUNTANT')
        OR (public.current_user_role() = 'RECEPTION' AND payment_kind = 'visit_payment')
    );

CREATE POLICY refunds_select ON public.refunds FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'ACCOUNTANT', 'RECEPTION'));

CREATE POLICY refunds_insert ON public.refunds FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'ACCOUNTANT'));

CREATE POLICY bonus_rules_select ON public.bonus_rules FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'ACCOUNTANT'));

CREATE POLICY bonus_rules_write ON public.bonus_rules FOR ALL TO authenticated
    USING (public.current_user_role() = 'SUPERADMIN')
    WITH CHECK (public.current_user_role() = 'SUPERADMIN');

CREATE POLICY bonus_tx_select ON public.bonus_transactions FOR SELECT TO authenticated
    USING (
        public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'ACCOUNTANT')
        OR (public.current_user_role() = 'MEDPRED' AND recipient_type = 'medpred' AND medpred_id = public.current_medpred_id())
    );

-- ============================================================================
-- 9. IMPORT_LOGS, AUDIT_LOGS, SYSTEM_SETTINGS
-- ============================================================================
CREATE POLICY import_logs_select ON public.import_logs FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER', 'ACCOUNTANT'));

CREATE POLICY import_logs_insert ON public.import_logs FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'MANAGER'));

-- Audit loglar faqat o'qiladi (UPDATE va DELETE hech bir rolga berilmaydi!)
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'ACCOUNTANT'));

-- Qabulxona va Medpred tizim sozlamalarini o'zgartira olmaydi
CREATE POLICY settings_select ON public.system_settings FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('SUPERADMIN', 'DIRECTOR', 'ACCOUNTANT', 'MANAGER', 'RECEPTION'));

CREATE POLICY settings_write ON public.system_settings FOR ALL TO authenticated
    USING (public.current_user_role() = 'SUPERADMIN')
    WITH CHECK (public.current_user_role() = 'SUPERADMIN');
