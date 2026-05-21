const XLSX = require("xlsx");

function getWorkbook(buffer) {
  return XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
  });
}

function normalizeSheetRange(sheet) {
  const keys = Object.keys(sheet).filter((key) => /^[A-Z]+[0-9]+$/i.test(key));
  if (keys.length === 0) {
    return sheet;
  }

  let minRow = Number.POSITIVE_INFINITY;
  let minCol = Number.POSITIVE_INFINITY;
  let maxRow = 0;
  let maxCol = 0;

  for (const key of keys) {
    const cell = XLSX.utils.decode_cell(key);
    minRow = Math.min(minRow, cell.r);
    minCol = Math.min(minCol, cell.c);
    maxRow = Math.max(maxRow, cell.r);
    maxCol = Math.max(maxCol, cell.c);
  }

  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: minRow, c: minCol },
    e: { r: maxRow, c: maxCol },
  });

  return sheet;
}

function sheetRowsAsArrays(sheet) {
  return XLSX.utils.sheet_to_json(normalizeSheetRange(sheet), {
    header: 1,
    defval: "",
    raw: false,
  });
}

function normalizeHeader(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function buildHeaderIndexMap(headers) {
  return new Map(headers.map((header, index) => [normalizeHeader(header), index]));
}

function findValue(row, headerIndexMap, aliases) {
  for (const alias of aliases) {
    const index = headerIndexMap.get(normalizeHeader(alias));
    if (index !== undefined) {
      return row[index];
    }
  }
  return "";
}

function parseRowsFromConfig(sheet, config) {
  const rows = sheetRowsAsArrays(sheet);
  const headers = rows[config.headerRow] || [];
  const headerIndexMap = buildHeaderIndexMap(headers);
  const dataRows = rows.slice(config.dataStartRow).filter((row) => row.some((cell) => String(cell || "").trim()));

  return {
    headers,
    headerIndexMap,
    dataRows,
    allRows: rows,
  };
}

function getCellValue(row, headerIndexMap, columnAliases) {
  return String(findValue(row, headerIndexMap, columnAliases) || "").trim();
}

function setCellValue(sheet, rowIndex, colIndex, value) {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  sheet[address] = {
    t: typeof value === "number" ? "n" : "s",
    v: value,
  };
}

module.exports = {
  getWorkbook,
  sheetRowsAsArrays,
  normalizeHeader,
  buildHeaderIndexMap,
  findValue,
  parseRowsFromConfig,
  getCellValue,
  setCellValue,
  normalizeSheetRange,
};
