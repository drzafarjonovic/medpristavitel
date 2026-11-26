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
  SUPABASE_URL: localStorage.getItem("medpred_supabase_url") || "https://rohmpsgblgbtkrbbxfke.supabase.co",
  SUPABASE_ANON_KEY: localStorage.getItem("medpred_supabase_anon_key") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvaG1wc2dibGdidGtyYmJ4ZmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MzMzOTksImV4cCI6MjA5NzEwOTM5OX0.pFKO1mYkw1TPHNGcs0x9ciTozJlP42OP3vYWvBOFUI0",
  TIMEZONE: "Asia/Tashkent",
  CURRENCY_SUFFIX: " so'm"
};
