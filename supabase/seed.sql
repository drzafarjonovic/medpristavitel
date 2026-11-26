-- ============================================================================
-- MEDPRED CRM — BOSHLANG'ICH MA'LUMOTLAR (SEED)
-- Bosqich 2: 6 ta rol, ruxsatlar, kataloglar va vaqtinchalik prototip sozlamalar
-- MUHIM: Hech qanday parol, .env yoki bot tokeni bu faylga kiritilmaydi.
-- ============================================================================

-- 1. Rollar (6 ta)
INSERT INTO public.roles (code, name_uz, description) VALUES
    ('SUPERADMIN', 'Superadmin',      'Barcha modullar, sozlamalar, foydalanuvchilar va audit loglarga to''liq kirish'),
    ('DIRECTOR',   'Direktor',        'Umumiy dashboard, statistika, moliyaviy hisobotlar va xodimlar nazorati'),
    ('MANAGER',    'Menejer',         'Medpredlar, shifokorlar biriktirish, hududlar va faoliyat nazorati'),
    ('MEDPRED',    'Medpredstavitel', 'O''z profili, o''z shifokorlari, yo''llanmalari va vaqtinchalik hisob-kitoblari'),
    ('RECEPTION',  'Qabulxona',       'Tezkor bemor kiritish, shifokor/xizmat tanlash va bugungi tashriflar'),
    ('ACCOUNTANT', 'Buxgalter',       'Tashrif to''lovlari, refund, vaqtinchalik hisob-kitob to''lovlari va Excel hisobotlar')
ON CONFLICT (code) DO NOTHING;

-- 2. Ruxsatlar (Permissions)
INSERT INTO public.permissions (code, module, description) VALUES
    ('dashboard.view_all',      'dashboard',     'Umumiy klinika dashboardini ko''rish'),
    ('dashboard.view_own',      'dashboard',     'Faqat o''z statistikasini ko''rish'),
    ('medpreds.view',           'medpreds',      'Medpredlar ro''yxatini ko''rish'),
    ('medpreds.manage',         'medpreds',      'Medpred yaratish va tahrirlash'),
    ('doctors.view',            'doctors',       'Shifokorlar ro''yxatini ko''rish'),
    ('doctors.create',          'doctors',       'Yangi shifokor qo''shish'),
    ('doctors.manage',          'doctors',       'Shifokorlarni tahrirlash va medpredga biriktirish'),
    ('organizations.view',      'organizations', 'Muassasalarni ko''rish'),
    ('organizations.manage',    'organizations', 'Muassasalarni yaratish va tahrirlash'),
    ('patients.view',           'patients',      'Bemorlarni ko''rish'),
    ('patients.manage',         'patients',      'Bemor qo''shish va tahrirlash'),
    ('reception.use',           'reception',     'Qabulxona tezkor oynasidan foydalanish'),
    ('visits.view',             'visits',        'Tashriflarni ko''rish'),
    ('visits.cancel',           'visits',        'Tashrifni bekor qilish'),
    ('services.view',           'services',      'Xizmatlar katalogini ko''rish'),
    ('services.manage',         'services',      'Xizmatlar va narxlarni boshqarish'),
    ('payments.view',           'payments',      'To''lovlar va qoldiqlarni ko''rish'),
    ('payments.manage',         'payments',      'To''lov va refund qayd etish'),
    ('reports.view',            'reports',       'Hisobotlarni ko''rish'),
    ('excel.import',            'imports',       'Excel/CSV import qilish'),
    ('excel.export',            'reports',       'Excel/CSV export qilish'),
    ('users.manage',            'users',         'Foydalanuvchilar va rollarni boshqarish'),
    ('settings.manage',         'settings',      'Tizim sozlamalari va foizlarni o''zgartirish'),
    ('audit.view',              'audit',         'Audit jurnalini ko''rish')
ON CONFLICT (code) DO NOTHING;

-- 3. Rol <-> Ruxsat bog'lanishlari
-- SUPERADMIN: hamma ruxsat
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p WHERE r.code = 'SUPERADMIN'
ON CONFLICT DO NOTHING;

-- DIRECTOR
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.code IN (
    'dashboard.view_all','medpreds.view','doctors.view','organizations.view','patients.view',
    'visits.view','visits.cancel','services.view','payments.view','reports.view','excel.export','users.manage','audit.view'
) WHERE r.code = 'DIRECTOR'
ON CONFLICT DO NOTHING;

-- MANAGER
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.code IN (
    'dashboard.view_all','medpreds.view','medpreds.manage','doctors.view','doctors.create','doctors.manage',
    'organizations.view','organizations.manage','patients.view','visits.view','services.view','reports.view','excel.import','excel.export'
) WHERE r.code = 'MANAGER'
ON CONFLICT DO NOTHING;

-- MEDPRED
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.code IN (
    'dashboard.view_own','doctors.view','doctors.create','organizations.view','visits.view','services.view'
) WHERE r.code = 'MEDPRED'
ON CONFLICT DO NOTHING;

-- RECEPTION
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.code IN (
    'doctors.view','organizations.view','patients.view','patients.manage','reception.use',
    'visits.view','visits.cancel','services.view'
) WHERE r.code = 'RECEPTION'
ON CONFLICT DO NOTHING;

-- ACCOUNTANT
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.code IN (
    'dashboard.view_all','medpreds.view','doctors.view','patients.view','visits.view','visits.cancel',
    'services.view','payments.view','payments.manage','reports.view','excel.export','audit.view'
) WHERE r.code = 'ACCOUNTANT'
ON CONFLICT DO NOTHING;

-- 4. Boshlang'ich kataloglar
INSERT INTO public.branches (code, name, address) VALUES
    ('MAIN', 'Asosiy filial', 'Markaziy klinika')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.territories (name, region) VALUES
    ('Markaz', 'Asosiy hudud'),
    ('Shimoliy hudud', 'Viloyat'),
    ('Janubiy hudud', 'Viloyat')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.specialties (name) VALUES
    ('Terapevt'), ('Ginekolog'), ('Pediatr'), ('Kardiolog'),
    ('Nevropatolog'), ('LOR'), ('Urolog'), ('Endokrinolog'), ('Jarroh'), ('Boshqa')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.service_categories (name, sort_order) VALUES
    ('Konsultatsiya', 1),
    ('Laboratoriya tahlillari', 2),
    ('UZI va diagnostika', 3),
    ('Muolajalar', 4),
    ('Boshqa xizmatlar', 5)
ON CONFLICT (name) DO NOTHING;

-- 5. Tizim sozlamalari (Vaqtinchalik prototip sozlamalari)
INSERT INTO public.system_settings (key, value, description) VALUES
    ('referral_calc_enabled',    'true'::jsonb,             'Vaqtinchalik referal hisob-kitob modulini yoqish/o''chirish (prototip)'),
    ('calc_base_mode',           '"after_discount"'::jsonb, 'Hisoblash bazasi: after_discount | gross | paid'),
    ('default_doctor_pct',       '10.00'::jsonb,            'Shifokor uchun vaqtinchalik standart foiz (prototip)'),
    ('default_medpred_pct',      '3.00'::jsonb,             'Medpredstavitel uchun vaqtinchalik standart foiz (prototip)'),
    ('allow_reception_discount', 'true'::jsonb,             'Qabulxona xodimiga chegirma kiritish ruxsati'),
    ('clinic_name',              '"MedPred Klinika CRM"'::jsonb, 'Klinika nomi')
ON CONFLICT (key) DO NOTHING;

-- 6. Standart prototip bonus qoidalari
INSERT INTO public.bonus_rules (scope_type, rate_pct, is_active, is_prototype, note)
SELECT 'global_doctor', 10.00, TRUE, TRUE, 'Mavjud botdan saqlangan vaqtinchalik standart stavka (prototip)'
WHERE NOT EXISTS (SELECT 1 FROM public.bonus_rules WHERE scope_type = 'global_doctor' AND is_active = TRUE);

INSERT INTO public.bonus_rules (scope_type, rate_pct, is_active, is_prototype, note)
SELECT 'global_medpred', 3.00, TRUE, TRUE, 'Mavjud botdan saqlangan vaqtinchalik standart stavka (prototip)'
WHERE NOT EXISTS (SELECT 1 FROM public.bonus_rules WHERE scope_type = 'global_medpred' AND is_active = TRUE);
