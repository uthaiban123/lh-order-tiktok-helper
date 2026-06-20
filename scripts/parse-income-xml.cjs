const fs = require("fs");
const path = require("path");

const folder = path.join("18-06-69", "xlsx_extract");
const xml = fs.readFileSync(path.join(folder, "xl", "sharedStrings.xml"), "utf8");
const strings = [...xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]);
const sheet = fs.readFileSync(path.join(folder, "xl", "worksheets", "sheet1.xml"), "utf8");
const rows = [...sheet.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];

function cellVal(cellXml) {
  if (/ t="s"/.test(cellXml)) {
    const v = cellXml.match(/<v>(\d+)<\/v>/);
    return v ? strings[Number(v[1])] : "";
  }
  const v = cellXml.match(/<v>([^<]+)<\/v>/);
  return v ? v[1] : "";
}

function rowValues(rowXml) {
  const cells = [...rowXml.matchAll(/<c r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)];
  const vals = {};
  for (const c of cells) vals[c[1]] = cellVal(c[2]);
  return vals;
}

const header = rowValues(rows[0][2]);
console.log("Header A:", header.A);
console.log("Header D:", header.D);
console.log("Header F:", header.F);

const orderIds = [];
for (const row of rows.slice(1)) {
  const vals = rowValues(row[2]);
  if (vals.A && /^\d/.test(vals.A)) orderIds.push(vals.A);
}

console.log("Income orders:", orderIds.length);
console.log("Sample:", orderIds.slice(0, 3));

module.exports = { orderIds };
