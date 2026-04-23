function escapeCsvCell(value) {
  const text = String(value ?? "");

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function buildCsv(columns, rows) {
  const header = columns.map((column) => escapeCsvCell(column.label)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((column) => {
        const value =
          typeof column.value === "function"
            ? column.value(row)
            : row[column.key];

        return escapeCsvCell(value);
      })
      .join(",")
  );

  return [header, ...lines].join("\r\n");
}

module.exports = {
  buildCsv,
};
