const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(outPath));
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function main() {
  const source = path.join("18-06-69", "xlsx_extract");
  const out = path.join("18-06-69", "repacked_income.xlsx");
  await zipDirectory(source, out);
  console.log("Created", out, fs.statSync(out).size, "bytes");
}

main().catch(console.error);
