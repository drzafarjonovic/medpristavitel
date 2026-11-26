# MedPred CRM — Mustaqil Klinika Yo'llanma Web CRM Tizimi

Mavjud `medpred-bot` Telegram botidagi biznes jarayonlari asosida yaratilgan, ammo undan mustaqil ishlaydigan zamonaviy **Vanilla HTML5 / CSS3 / JavaScript + Supabase PostgreSQL** veb-CRM tizimi.

## Texnologiyalar
- **Frontend:** sof HTML5, CSS3, Vanilla JavaScript (React/Vue/Angular/Next.js ishlatilmagan), Lucide Icons, Chart.js, SheetJS (XLSX/CSV).
- **Backend va Baza:** Supabase PostgreSQL (26 ta normalizatsiya qilingan jadval, `NUMERIC(18,2)`), Supabase Auth, Row Level Security (53 ta siyosat), PostgreSQL RPC funksiyalari va `audit_logs` triggerlari.

## Xavfsizlik qoidalari
- Frontend kodida **hech qachon** `service_role` kaliti ishlatilmaydi — faqat ommaviy `SUPABASE_URL` va `SUPABASE_ANON_KEY`.
- Eski botdagi `.env`, `BOT_TOKEN` va `PAROL.txt` ma'lumotlari ushbu loyihaga ko'chirilmagan.
- Barcha 6 ta rol (`SUPERADMIN`, `DIRECTOR`, `MANAGER`, `MEDPRED`, `RECEPTION`, `ACCOUNTANT`) ham UI, ham Supabase RLS/RPC darajasida tekshiriladi.
- `audit_logs` jadvali faqat yozish (append-only) rejimida himoyalangan.

## O'rnatish va Deploy (5 daqiqa)

### 1. Supabase loyihasini tayyorlash
1. [Supabase](https://supabase.com) da yangi loyiha yarating.
2. **SQL Editor** bo'limida `supabase/` papkasidagi fayllarni qat'iy shu tartibda ishga tushiring:
   1. `supabase/schema.sql`
   2. `supabase/functions.sql`
   3. `supabase/rls_policies.sql`
   4. `supabase/seed.sql`

### 2. Birinchi Superadmin foydalanuvchini yaratish
1. Supabase Dashboard → **Authentication → Users → Add user** orqali email va parol bilan foydalanuvchi yarating va uning **User UID** qiymatini nusxalang.
2. SQL Editor'da quyidagi so'rovni bajaring (`USER_UID_BU_YERGA` va emailni almashtirib):

```sql
INSERT INTO public.profiles (id, role_id, branch_id, full_name, email, is_active)
SELECT
    'USER_UID_BU_YERGA'::uuid,
    (SELECT id FROM public.roles WHERE code = 'SUPERADMIN'),
    (SELECT id FROM public.branches WHERE code = 'MAIN'),
    'Asosiy Superadmin',
    'admin@klinika.uz',
    TRUE;
```

### 3. Frontendni ulash va joylashtirish
1. `assets/js/config.js` faylida `SUPABASE_URL` va `SUPABASE_ANON_KEY` (ommaviy anon kalit) ni kiriting — yoki `login.html` sahifasidagi **«Ulanish sozlamalari»** oynasidan saqlang.
2. `clinic-referral-crm/` papkasini istalgan statik hostingga (Netlify, Vercel, Cloudflare Pages, GitHub Pages yoki ichki Nginx/IIS) joylashtiring.

## 20 ta Qabul Testi (QA Checklist)
1. Yangi medpred qo'shish (`pages/medpreds.html`, avtomatik `MP-0001`).
2. Medpredga shifokor biriktirish va biriktirish tarixi (`pages/doctors.html` → `rpc_assign_doctor_medpred`).
3. Shifokorga avtomatik takrorlanmas `DR-0001` ID berilishi (`trg_auto_doctor_fields`).
4. Excel orqali shifokorlar importi (`pages/imports.html` + `templates/doctors_template.xlsx`).
5. Excel orqali xizmatlar va narxlar importi (`pages/imports.html` + `templates/services_template.xlsx`).
6. Telefon yoki `PT-ID` orqali bemorni qidirish (`pages/patients.html`, `pages/reception.html`).
7. Yangi bemor yaratish (telefon bilan yoki telefonsiz).
8. Qabulxonada shifokorni ID/F.I.Sh. orqali tanlash (`pages/reception.html`).
9. Shifokorga biriktirilgan medpredning avtomatik aniqlanishi (`doctor_assignments`).
10. Xizmat tanlanganda katalog narxining avtomatik chiqishi.
11. Bir tashrifga bir nechta xizmat va miqdor qo'shish.
12. Jami summa, chegirma va to'lov holatining avtomatik hisoblanishi.
13. Vaqtinchalik prototip referal hisob-kitoblarining server RPC orqali `NUMERIC(18,2)` da bajarilishi.
14. Tasdiqlash modali orqali tashrifni atomik saqlash (`rpc_create_visit`).
15. Qisman to'lov qayd etish (`rpc_record_visit_payment`).
16. Barcha hisobotlarni Excel/CSV formatida yuklab olish (`pages/reports.html`, `pages/imports.html`).
17. Rolga mos bo'lmagan sahifa va ma'lumotlarga kirishni bloklash (UI 403 + 53 ta RLS siyosati).
18. Xizmat narxi o'zgarganda eski tashrif summasi o'zgarmasligi (`visit_services.unit_price` snapshot).
19. Foiz stavkasi o'zgarganda eski tashrif hisob-kitobi o'zgarmasligi (`visits.doctor_pct_snapshot` / `medpred_pct_snapshot`).
20. Barcha muhim o'zgarishlarning `audit_logs` jadvalida qayd etilishi (`pages/settings.html` → Audit jurnali).
