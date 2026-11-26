/**
 * MedPred CRM — SheetJS (XLSX / CSV) Import va Export yadrosi
 */
window.ExcelEngine = {
  async parseFile(file) {
    if (!window.XLSX) throw new Error("SheetJS (XLSX) kutubxonasi yuklanmagan");
    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: "array", cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("Excel faylda varaq topilmadi");
    const ws = wb.Sheets[sheetName];
    const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (aoa.length < 2) throw new Error("Faylda sarlavha va ma'lumot qatorlari yetarli emas");

    const headers = aoa[0].map((h, i) => String(h || `Ustun_${i + 1}`).trim());
    const rows = aoa.slice(1)
      .filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""))
      .map((r, idx) => {
        const obj = { __rowNum: idx + 2 };
        headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
        return obj;
      });
    return { headers, rows, sheetName };
  },

  autoMap(headers, fieldDefs) {
    const mapping = {};
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9а-яёўқғҳ]+/gi, "");
    fieldDefs.forEach((f) => {
      const aliases = [f.key, f.label, ...(f.aliases || [])].map(norm);
      const hit = headers.find((h) => aliases.includes(norm(h)) || aliases.some((a) => a && norm(h).includes(a)));
      mapping[f.key] = hit || "";
    });
    return mapping;
  },

  exportData(rows, columns, baseFileName, format = "xlsx", options = {}) {
    if (!window.XLSX) {
      window.CRM.toast("SheetJS kutubxonasi yuklanmagan", "error");
      return;
    }
    const headers = columns.map((c) => c.label);
    const dataRows = rows.map((row) => columns.map((c) => {
      const val = row[c.key];
      if (c.type === "currency" || c.type === "number") return Number(val || 0);
      return val ?? "";
    }));

    const aoa = [headers, ...dataRows];

    // JAMI qatori (pul/son ustunlari bor bo'lsa)
    if (options.includeTotals !== false && rows.length > 0 && columns.some((c) => c.sum)) {
      const totRow = columns.map((c, idx) => {
        if (idx === 0) return "JAMI";
        if (c.sum) return rows.reduce((s, r) => s + Number(r[c.key] || 0), 0);
        return "";
      });
      aoa.push(totRow);
    }

    const ws = window.XLSX.utils.aoa_to_sheet(aoa);

    // Pul formati va ustun kengliklari
    const colWidths = columns.map((c, colIdx) => {
      let maxLen = c.label.length + 2;
      for (let r = 1; r < aoa.length; r++) {
        const v = aoa[r][colIdx];
        const cellRef = window.XLSX.utils.encode_cell({ r, c: colIdx });
        if (ws[cellRef] && c.type === "currency") {
          ws[cellRef].z = "#,##0";
        }
        maxLen = Math.max(maxLen, String(v ?? "").length + 2);
      }
      return { wch: Math.min(42, Math.max(12, maxLen)) };
    });
    ws["!cols"] = colWidths;

    // Sarlavha filtri (autofilter)
    if (rows.length > 0) {
      const lastCol = window.XLSX.utils.encode_col(columns.length - 1);
      ws["!autofilter"] = { ref: `A1:${lastCol}${rows.length + 1}` };
    }

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, (options.sheetName || "Hisobot").slice(0, 31));
    const dateStamp = new Date().toISOString().slice(0, 10);
    const ext = format === "csv" ? "csv" : "xlsx";
    window.XLSX.writeFile(wb, `${baseFileName}_${dateStamp}.${ext}`, { bookType: ext });
  }
};
