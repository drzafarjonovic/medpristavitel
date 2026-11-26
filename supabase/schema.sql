-- ============================================================================
-- MEDPRED CRM — SUPABASE POSTGRESQL SCHEMA (26 NORMALIZED TABLES)
-- Bosqich 2: Jadvallar, Primary/Foreign Key, Unique, Indekslar, NUMERIC(18,2)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 0. SEQUENCE'LAR (Avtomatik unikal kodlar uchun)
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_doctor_code START 1;
CREATE SEQUENCE IF NOT EXISTS seq_patient_code START 1;
CREATE SEQUENCE IF NOT EXISTS seq_visit_code START 1;
CREATE SEQUENCE IF NOT EXISTS seq_medpred_code START 1;
CREATE SEQUENCE IF NOT EXISTS seq_service_code START 1;

-- Umumiy updated_at trigger funksiyasi
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 1. AUTH VA RBAC DOMENI (4 ta jadval)
-- ============================================================================

-- 1.1. roles
CREATE TABLE IF NOT EXISTS public.roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE CHECK (code IN ('SUPERADMIN','DIRECTOR','MANAGER','MEDPRED','RECEPTION','ACCOUNTANT')),
    name_uz     TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.2. permissions
CREATE TABLE IF NOT EXISTS public.permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,
    module      TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.3. role_permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id       UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (role_id, permission_id)
);

-- ============================================================================
-- 2. TUZILMA VA MEDPREDLAR DOMENI (3 ta jadval + profiles)
-- ============================================================================

-- 2.1. branches (Klinika filiallari)
CREATE TABLE IF NOT EXISTS public.branches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    address     TEXT NOT NULL DEFAULT '',
    phone       TEXT NOT NULL DEFAULT '',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.2. territories (Hududlar)
CREATE TABLE IF NOT EXISTS public.territories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    region      TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.4. profiles (Supabase auth.users bilan 1:1 bog'langan)
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES public.roles(id),
    branch_id   UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    full_name   TEXT NOT NULL,
    phone       TEXT NOT NULL DEFAULT '',
    email       TEXT NOT NULL DEFAULT '',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles(is_active);

-- 2.3. medpreds (Medpredstavitellar)
CREATE TABLE IF NOT EXISTS public.medpreds (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medpred_code        TEXT NOT NULL UNIQUE,
    profile_id          UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
    full_name           TEXT NOT NULL,
    phone               TEXT NOT NULL DEFAULT '',
    phone_normalized    TEXT NOT NULL DEFAULT '',
    address             TEXT NOT NULL DEFAULT '',
    territory_id        UUID REFERENCES public.territories(id) ON DELETE SET NULL,
    hire_date           DATE NOT NULL DEFAULT CURRENT_DATE,
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    temp_rate_pct       NUMERIC(5,2) NOT NULL DEFAULT 3.00 CHECK (temp_rate_pct >= 0 AND temp_rate_pct <= 100),
    notes               TEXT NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_medpreds_territory ON public.medpreds(territory_id);
CREATE INDEX IF NOT EXISTS idx_medpreds_status ON public.medpreds(status);
CREATE INDEX IF NOT EXISTS idx_medpreds_phone_norm ON public.medpreds(phone_normalized) WHERE phone_normalized <> '';

-- ============================================================================
-- 3. SHIFOKORLAR VA MUASSASALAR DOMENI (5 ta jadval)
-- ============================================================================

-- 3.1. specialties (Mutaxassisliklar)
CREATE TABLE IF NOT EXISTS public.specialties (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2. organizations (Tibbiyot muassasalari)
CREATE TABLE IF NOT EXISTS public.organizations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    org_type       TEXT NOT NULL DEFAULT 'other' CHECK (org_type IN (
                       'state_polyclinic', 'private_clinic', 'diagnostic_center', 'independent_doctor', 'other'
                   )),
    address        TEXT NOT NULL DEFAULT '',
    phone          TEXT NOT NULL DEFAULT '',
    territory_id   UUID REFERENCES public.territories(id) ON DELETE SET NULL,
    contact_person TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organizations_territory ON public.organizations(territory_id);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON public.organizations(org_type);

-- 3.3. doctors (Shifokorlar — DR-0001...)
CREATE TABLE IF NOT EXISTS public.doctors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_code         TEXT NOT NULL UNIQUE,
    full_name           TEXT NOT NULL,
    specialty_id        UUID REFERENCES public.specialties(id) ON DELETE SET NULL,
    phone               TEXT NOT NULL DEFAULT '',
    phone_normalized    TEXT NOT NULL DEFAULT '',
    territory_id        UUID REFERENCES public.territories(id) ON DELETE SET NULL,
    current_medpred_id  UUID REFERENCES public.medpreds(id) ON DELETE SET NULL,
    temp_rate_pct       NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (temp_rate_pct >= 0 AND temp_rate_pct <= 100),
    joined_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    notes               TEXT NOT NULL DEFAULT '',
    created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doctors_medpred ON public.doctors(current_medpred_id);
CREATE INDEX IF NOT EXISTS idx_doctors_specialty ON public.doctors(specialty_id);
CREATE INDEX IF NOT EXISTS idx_doctors_territory ON public.doctors(territory_id);
CREATE INDEX IF NOT EXISTS idx_doctors_status ON public.doctors(status);
CREATE INDEX IF NOT EXISTS idx_doctors_name ON public.doctors(full_name);

-- 3.4. doctor_workplaces (M:N — bir shifokor bir nechta muassasada ishlashi mumkin)
CREATE TABLE IF NOT EXISTS public.doctor_workplaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id       UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    position        TEXT NOT NULL DEFAULT '',
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (doctor_id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_doc_workplaces_doc ON public.doctor_workplaces(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doc_workplaces_org ON public.doctor_workplaces(organization_id);

-- 3.5. doctor_assignments (Shifokor -> Medpred biriktirish tarixi)
CREATE TABLE IF NOT EXISTS public.doctor_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id     UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    medpred_id    UUID NOT NULL REFERENCES public.medpreds(id) ON DELETE RESTRICT,
    assigned_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_to   TIMESTAMPTZ,
    is_current    BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    note          TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_active_assignment
    ON public.doctor_assignments(doctor_id) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_doc_assignments_medpred ON public.doctor_assignments(medpred_id);

-- ============================================================================
-- 4. XIZMATLAR KATALOGI DOMENI (3 ta jadval)
-- ============================================================================

-- 4.1. service_categories
CREATE TABLE IF NOT EXISTS public.service_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.2. services
CREATE TABLE IF NOT EXISTS public.services (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_code TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    category_id UUID REFERENCES public.service_categories(id) ON DELETE SET NULL,
    branch_id   UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    price       NUMERIC(18,2) NOT NULL CHECK (price >= 0),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_services_category ON public.services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_branch ON public.services(branch_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON public.services(is_active);
CREATE INDEX IF NOT EXISTS idx_services_name ON public.services(name);

-- 4.3. service_price_history (Narx o'zgarishlari tarixi)
CREATE TABLE IF NOT EXISTS public.service_price_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id  UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    old_price   NUMERIC(18,2) NOT NULL,
    new_price   NUMERIC(18,2) NOT NULL,
    source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'excel_import')),
    changed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_hist_service ON public.service_price_history(service_id, created_at DESC);

-- ============================================================================
-- 5. BEMORLAR, YO'LLANMALAR VA TASHRIFLAR DOMENI (4 ta jadval)
-- ============================================================================

-- 5.1. patients (Alohida jadval, telefonsiz ham PT-00001 ID bilan ishlaydi)
CREATE TABLE IF NOT EXISTS public.patients (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_code     TEXT NOT NULL UNIQUE,
    full_name        TEXT NOT NULL,
    phone            TEXT NOT NULL DEFAULT '',
    phone_normalized TEXT NOT NULL DEFAULT '',
    birth_date       DATE,
    gender           TEXT CHECK (gender IN ('male', 'female', 'other') OR gender IS NULL),
    notes            TEXT NOT NULL DEFAULT '',
    created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patients_phone_norm ON public.patients(phone_normalized) WHERE phone_normalized <> '';
CREATE INDEX IF NOT EXISTS idx_patients_name ON public.patients(full_name);

-- 5.2. referrals (Yo'llanmalar)
CREATE TABLE IF NOT EXISTS public.referrals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    doctor_id     UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
    medpred_id    UUID REFERENCES public.medpreds(id) ON DELETE RESTRICT,
    referral_code TEXT NOT NULL DEFAULT '',
    referral_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status        TEXT NOT NULL DEFAULT 'used' CHECK (status IN ('pending', 'used', 'cancelled')),
    notes         TEXT NOT NULL DEFAULT '',
    created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referrals_doctor ON public.referrals(doctor_id);
CREATE INDEX IF NOT EXISTS idx_referrals_medpred ON public.referrals(medpred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_patient ON public.referrals(patient_id);

-- 5.3. visits (Tashriflar — to'liq tarixiy snapshot bilan)
CREATE TABLE IF NOT EXISTS public.visits (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_code                  TEXT NOT NULL UNIQUE,
    patient_id                  UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    doctor_id                   UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
    medpred_id                  UUID REFERENCES public.medpreds(id) ON DELETE RESTRICT,
    referral_id                 UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
    branch_id                   UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    receptionist_id             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    visit_date                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status                      TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
    -- Tarixiy matn snapshotlari
    doctor_code_snapshot        TEXT NOT NULL,
    doctor_name_snapshot        TEXT NOT NULL,
    medpred_name_snapshot       TEXT NOT NULL DEFAULT '',
    -- Moliyaviy ustunlar: faqat NUMERIC(18,2)
    subtotal_amount             NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (subtotal_amount >= 0),
    discount_amount             NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    total_amount                NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    paid_amount                 NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    payment_status              TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded')),
    -- Vaqtinchalik prototip referal hisob-kitobi snapshotlari
    bonus_calc_enabled_snapshot BOOLEAN NOT NULL DEFAULT TRUE,
    calc_base_mode_snapshot     TEXT NOT NULL DEFAULT 'after_discount',
    calc_base_amount            NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    doctor_pct_snapshot         NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    medpred_pct_snapshot        NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    doctor_bonus_amount         NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    medpred_bonus_amount        NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    clinic_net_amount           NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    -- Bekor qilish ma'lumotlari (qattiq DELETE o'rniga)
    cancelled_at                TIMESTAMPTZ,
    cancelled_by                UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancel_reason               TEXT NOT NULL DEFAULT '',
    notes                       TEXT NOT NULL DEFAULT '',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_visits_date ON public.visits(visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_visits_patient ON public.visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_doctor ON public.visits(doctor_id);
CREATE INDEX IF NOT EXISTS idx_visits_medpred ON public.visits(medpred_id);
CREATE INDEX IF NOT EXISTS idx_visits_status ON public.visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_pay_status ON public.visits(payment_status);

-- 5.4. visit_services (Bir tashrifda bir nechta xizmat + narx snapshot)
CREATE TABLE IF NOT EXISTS public.visit_services (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id              UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
    service_id            UUID REFERENCES public.services(id) ON DELETE SET NULL,
    service_name_snapshot TEXT NOT NULL,
    category_snapshot     TEXT NOT NULL DEFAULT '',
    unit_price            NUMERIC(18,2) NOT NULL CHECK (unit_price >= 0),
    quantity              INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    line_total            NUMERIC(18,2) NOT NULL CHECK (line_total >= 0),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_visit_services_visit ON public.visit_services(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_services_service ON public.visit_services(service_id);

-- ============================================================================
-- 6. MOLIYA, TO'LOVLAR VA PROTOTIP BONUS DOMENI (4 ta jadval)
-- ============================================================================

-- 6.1. payments (Bemor to'lovlari hamda shifokor/medpredga qayd etilgan to'lovlar)
CREATE TABLE IF NOT EXISTS public.payments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_kind   TEXT NOT NULL CHECK (payment_kind IN ('visit_payment', 'doctor_payout', 'medpred_payout')),
    visit_id       UUID REFERENCES public.visits(id) ON DELETE RESTRICT,
    doctor_id      UUID REFERENCES public.doctors(id) ON DELETE RESTRICT,
    medpred_id     UUID REFERENCES public.medpreds(id) ON DELETE RESTRICT,
    amount         NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
    paid_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    received_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    note           TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payment_target CHECK (
        (payment_kind = 'visit_payment' AND visit_id IS NOT NULL) OR
        (payment_kind = 'doctor_payout' AND doctor_id IS NOT NULL) OR
        (payment_kind = 'medpred_payout' AND medpred_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_payments_visit ON public.payments(visit_id);
CREATE INDEX IF NOT EXISTS idx_payments_doctor ON public.payments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_payments_medpred ON public.payments(medpred_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments(paid_at DESC);

-- 6.2. refunds (Qaytarilgan mablag'lar — moliyaviy tarix o'chirilmaydi)
CREATE TABLE IF NOT EXISTS public.refunds (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id      UUID NOT NULL REFERENCES public.visits(id) ON DELETE RESTRICT,
    payment_id    UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    amount        NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    refund_method TEXT NOT NULL DEFAULT 'cash' CHECK (refund_method IN ('cash', 'card', 'transfer', 'other')),
    reason        TEXT NOT NULL,
    refunded_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    refunded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refunds_visit ON public.refunds(visit_id);

-- 6.3. bonus_rules (Vaqtinchalik prototip stavka qoidalari)
CREATE TABLE IF NOT EXISTS public.bonus_rules (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type     TEXT NOT NULL CHECK (scope_type IN ('global_doctor', 'global_medpred', 'doctor', 'medpred')),
    doctor_id      UUID REFERENCES public.doctors(id) ON DELETE CASCADE,
    medpred_id     UUID REFERENCES public.medpreds(id) ON DELETE CASCADE,
    rate_pct       NUMERIC(5,2) NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to   DATE,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    is_prototype   BOOLEAN NOT NULL DEFAULT TRUE,
    note           TEXT NOT NULL DEFAULT '',
    created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bonus_rules_scope ON public.bonus_rules(scope_type, is_active);

-- 6.4. bonus_transactions (Vaqtinchalik hisob-kitoblar va to'lovlar jurnali)
CREATE TABLE IF NOT EXISTS public.bonus_transactions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id       UUID REFERENCES public.visits(id) ON DELETE RESTRICT,
    payment_id     UUID REFERENCES public.payments(id) ON DELETE RESTRICT,
    recipient_type TEXT NOT NULL CHECK (recipient_type IN ('doctor', 'medpred')),
    doctor_id      UUID REFERENCES public.doctors(id) ON DELETE RESTRICT,
    medpred_id     UUID REFERENCES public.medpreds(id) ON DELETE RESTRICT,
    tx_type        TEXT NOT NULL CHECK (tx_type IN ('accrual', 'reversal', 'payout')),
    calc_base      NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    rate_pct       NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    amount         NUMERIC(18,2) NOT NULL,
    is_prototype   BOOLEAN NOT NULL DEFAULT TRUE,
    note           TEXT NOT NULL DEFAULT '',
    created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_bonus_recipient CHECK (
        (recipient_type = 'doctor' AND doctor_id IS NOT NULL) OR
        (recipient_type = 'medpred' AND medpred_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_bonus_tx_doctor ON public.bonus_transactions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_bonus_tx_medpred ON public.bonus_transactions(medpred_id);
CREATE INDEX IF NOT EXISTS idx_bonus_tx_visit ON public.bonus_transactions(visit_id);

-- ============================================================================
-- 7. IMPORT, AUDIT VA SOZLAMALAR DOMENI (3 ta jadval)
-- ============================================================================

-- 7.1. import_logs (Excel/CSV import jurnali)
CREATE TABLE IF NOT EXISTS public.import_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type   TEXT NOT NULL CHECK (entity_type IN ('medpreds', 'doctors', 'organizations', 'services', 'patients')),
    file_name     TEXT NOT NULL,
    import_mode   TEXT NOT NULL CHECK (import_mode IN ('INSERT', 'UPDATE', 'SKIP_DUPLICATES')),
    total_rows    INTEGER NOT NULL DEFAULT 0,
    inserted_rows INTEGER NOT NULL DEFAULT 0,
    updated_rows  INTEGER NOT NULL DEFAULT 0,
    skipped_rows  INTEGER NOT NULL DEFAULT 0,
    error_rows    INTEGER NOT NULL DEFAULT 0,
    error_details JSONB NOT NULL DEFAULT '[]'::jsonb,
    imported_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_logs_created ON public.import_logs(created_at DESC);

-- 7.2. audit_logs (O'zgartirib bo'lmaydigan append-only audit jurnali)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_role  TEXT NOT NULL DEFAULT 'SYSTEM',
    table_name  TEXT NOT NULL,
    record_id   TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'RPC')),
    old_data    JSONB,
    new_data    JSONB,
    reason      TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON public.audit_logs(table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);

-- 7.3. system_settings (Tizim sozlamalari, shu jumladan prototip bonus toggle)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- UPDATED_AT TRIGGERLARI (Barcha 26 ta jadval uchun)
-- ============================================================================
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
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
            t, t
        );
    END LOOP;
END;
$$;
