/**
 * Column/sheet layout for marketplace batch templates.
 * Values derived from files in /templates at project root.
 */
module.exports = {
  tiktok: {
    sheet: "Template",
    headerRow: 0,
    dataStartRow: 5,
    columns: {
      productId: ["product_id", "รหัสสินค้า"],
      category: ["category", "หมวดหมู่"],
      productName: ["product_name", "ชื่อสินค้า"],
      skuId: ["sku_id", "sku id"],
      variationValue: ["variation_value", "ตัวเลือกของตัวแปร"],
      price: ["price", "ราคาขายปลีก (สกุลเงินท้องถิ่น)", "ราคาขายปลีก"],
      quantity: ["quantity", "ปริมาณ"],
      sellerSku: ["seller_sku", "sku ของผู้ขาย"],
    },
    exportTemplateFile: "Tiktoksellercenter_batchedit_20260521_sales_information_template.xlsx",
  },
  shopee: {
    sheet: "Sheet1",
    headerRow: 2,
    dataStartRow: 6,
    columns: {
      productId: ["et_title_product_id", "รหัสสินค้า"],
      productName: ["et_title_product_name", "ชื่อสินค้า"],
      variationId: ["et_title_variation_id", "รหัสตัวเลือกสินค้า"],
      variationName: ["et_title_variation_name", "ชื่อตัวเลือกสินค้า"],
      parentSku: ["et_title_parent_sku", "parent sku"],
      sellerSku: ["et_title_variation_sku", "เลข sku"],
      price: ["et_title_variation_price", "ราคา"],
      stock: ["et_title_variation_stock", "คลัง"],
    },
    exportTemplateFile: "shopee_mass_update_sales_info_308327713_20260521165625.xlsx",
  },
  lazada: {
    sheet: "template",
    headerRow: 0,
    dataStartRow: 4,
    columns: {
      productId: ["product id", "product_id"],
      productName: ["ชื่อสินค้า", "title.th_th"],
      lazadaSkuId: ["sku.skuid", "sku.sku_id", "sku.skuid"],
      shopSku: ["ร้าน sku", "sku.shop_sku", "shop sku"],
      quantity: ["จำนวน", "sku.quantity"],
      price: ["ราคา", "sku.price"],
    },
    exportTemplateFile: "lazada_pricestock101128272204export1779353876481_0521-16-57-56.xlsx",
  },
};
