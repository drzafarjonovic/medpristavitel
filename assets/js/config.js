/**
 * MedPred CRM — Ommaviy konfiguratsiya fayli
 * MUHIM XAVFSIZLIK QOIDASI:
 * Bu faylga hech qachon Supabase service_role kalitini yozmang!
 * Faqat ommaviy SUPABASE_URL va SUPABASE_ANON_KEY ishlatiladi.
 */
window.APP_CONFIG = {
  APP_NAME: "MedPred CRM",
  APP_VERSION: "1.0.0",
  // O'z Supabase loyihangiz ma'lumotlarini shu yerga kiriting
  // (yoki Login sahifasidagi "Ulanish sozlamalari" orqali ham kiritish mumkin)
  SUPABASE_URL: localStorage.getItem("medpred_supabase_url") || "",
  SUPABASE_ANON_KEY: localStorage.getItem("medpred_supabase_anon_key") || "",
  TIMEZONE: "Asia/Tashkent",
  CURRENCY_SUFFIX: " so'm"
};
