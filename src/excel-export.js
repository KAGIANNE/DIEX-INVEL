(function attachDiexExcel() {
  const encoder = new TextEncoder();
  const spreadsheetMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  function xml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function columnName(index) {
    let result = "";
    let value = index + 1;
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function excelDate(date) {
    return (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  function cellXml(value, rowIndex, columnIndex, options, header) {
    if (value === null || value === undefined || value === "") return "";
    const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
    if (header) return `<c r="${reference}" s="1" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return `<c r="${reference}" s="4"><v>${excelDate(value)}</v></c>`;
    if (typeof value === "number" && Number.isFinite(value)) {
      const style = options.currencyColumns?.includes(columnIndex) ? 3 : 2;
      return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
    }
    return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }

  function worksheetXml(rows, options = {}) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const lastColumn = columnName(Math.max(0, ...safeRows.map((row) => Math.max(0, row.length - 1))));
    const lastRow = Math.max(1, safeRows.length);
    const body = safeRows.map((row, rowIndex) => {
      const cells = (Array.isArray(row) ? row : []).map((value, columnIndex) => cellXml(value, rowIndex, columnIndex, options, rowIndex === 0)).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");
    const widths = (options.widths || []).map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>${widths ? `<cols>${widths}</cols>` : ""}<sheetData>${body}</sheetData><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0" footer="0"/></worksheet>`;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function put16(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
  }

  function put32(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
  }

  function concatBytes(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    parts.forEach((part) => { result.set(part, offset); offset += part.length; });
    return result;
  }

  function zipStore(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    files.forEach((file) => {
      const name = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      const checksum = crc32(data);
      const local = concatBytes([
        put32(0x04034b50), put16(20), put16(0), put16(0), put16(0), put16(0), put32(checksum), put32(data.length), put32(data.length), put16(name.length), put16(0), name, data
      ]);
      const central = concatBytes([
        put32(0x02014b50), put16(20), put16(20), put16(0), put16(0), put16(0), put16(0), put32(checksum), put32(data.length), put32(data.length), put16(name.length), put16(0), put16(0), put16(0), put16(0), put32(0), put32(offset), name
      ]);
      localParts.push(local);
      centralParts.push(central);
      offset += local.length;
    });
    const centralDirectory = concatBytes(centralParts);
    const end = concatBytes([put32(0x06054b50), put16(0), put16(0), put16(files.length), put16(files.length), put32(centralDirectory.length), put32(offset), put16(0)]);
    return concatBytes([...localParts, centralDirectory, end]);
  }

  function workbookBytes(sheets) {
    const safeSheets = sheets.filter((sheet) => sheet?.name && Array.isArray(sheet.rows));
    const workbookSheets = safeSheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
    const files = [
      { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${safeSheets.map((sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
      { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="DIEX INVEL"/><workbookPr defaultThemeVersion="124226"/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="18000" windowHeight="12000"/></bookViews><sheets>${workbookSheets}</sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safeSheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;S/&quot;#,##0.00"/></numFmts><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0C1F35"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
      ...safeSheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(sheet.rows, sheet) }))
    ];
    return zipStore(files);
  }

  function downloadWorkbook(filename, sheets) {
    const bytes = workbookBytes(sheets);
    const blob = new Blob([bytes], { type: spreadsheetMime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.DiexExcel = Object.freeze({ downloadWorkbook, workbookBytes });
})();
