import { Prisma, BusinessType } from "@prisma/client";
import { hash } from "bcryptjs";
export const templates = {
  CAFE_BEVERAGE: [
    ["อเมริกาโน่เย็น", 65, 1, 0],
    ["ลาเต้เย็น", 75, 2, 0],
    ["คาปูชิโน่", 75, 2, 0],
    ["เอสเปรสโซ่", 55, 0, 0],
    ["มัทฉะลาเต้", 85, 4, 1],
    ["ชาไทย", 65, 3, 1],
    ["โกโก้เย็น", 70, 2, 1],
    ["ครัวซองต์", 85, 5, 2],
    ["เค้กช็อกโกแลต", 95, 6, 2],
    ["แซนด์วิช", 90, 7, 2],
  ],
  RESTAURANT: [
    ["ข้าวผัดไก่", 70, 7, 0],
    ["กะเพราไก่", 75, 7, 0],
    ["พาสต้า", 129, 9, 0],
    ["สลัดไก่", 119, 8, 0],
    ["แซนด์วิช", 90, 7, 0],
    ["อเมริกาโน่", 65, 1, 1],
    ["ชาไทย", 65, 3, 1],
    ["มัทฉะลาเต้", 85, 4, 1],
    ["ครัวซองต์", 85, 5, 2],
    ["เค้กช็อกโกแลต", 95, 6, 2],
  ],
  RETAIL_SHOP: [
    ["น้ำดื่ม", 15, -1, 0],
    ["น้ำแร่", 25, -1, 0],
    ["นมสด", 30, -1, 0],
    ["กาแฟพร้อมดื่ม", 35, 1, 0],
    ["ชาเขียว", 30, 4, 0],
    ["ขนมปัง", 25, 5, 1],
    ["แซนด์วิช", 45, 7, 1],
    ["คุกกี้", 35, -1, 1],
    ["ถุงผ้า", 59, -1, 2],
    ["แก้วเก็บความเย็น", 199, -1, 2],
  ],
} satisfies Record<BusinessType, (string | number)[][]>;
export async function seedTenantTemplate(
  tx: Prisma.TransactionClient,
  tenantId: string,
  businessType: BusinessType,
  pin: string,
  userId: string,
  name: string,
  promptPayId: string | undefined,
  vatMode: string,
) {
  // Sample data is for the development demo and test fixtures only.
  const branch = await provisionEmptyTenant(
    tx,
    tenantId,
    pin,
    userId,
    name,
    promptPayId,
    vatMode,
  );
  await seedCatalog(tx, tenantId, businessType, branch.id);
  return branch;
}

export async function provisionEmptyTenant(
  tx: Prisma.TransactionClient,
  tenantId: string,
  pin: string,
  userId: string,
  name: string,
  promptPayId: string | undefined,
  vatMode: string,
) {
  const branch = await tx.storeBranch.create({
    data: {
      tenantId,
      name: "สาขาหลัก",
      promptPayId: promptPayId || null,
      vatRate: vatMode === "NONE" ? 0 : 7,
      vatInclusive: vatMode !== "EXCLUSIVE",
    },
  });
  await tx.staffMember.create({
    data: {
      tenantId,
      userId,
      displayName: name,
      role: "OWNER",
      pinCodeHash: await hash(pin, 10),
    },
  });
  return branch;
}

async function seedCatalog(
  tx: Prisma.TransactionClient,
  tenantId: string,
  businessType: BusinessType,
  branchId: string,
) {
  const names =
    businessType === "RETAIL_SHOP"
      ? ["เครื่องดื่ม", "อาหารและขนม", "ของใช้"]
      : businessType === "RESTAURANT"
        ? ["อาหาร", "เครื่องดื่ม", "เบเกอรี่"]
        : ["กาแฟ", "ชาและนม", "เบเกอรี่"];
  const categories = [];
  for (let i = 0; i < 3; i++)
    categories.push(
      await tx.category.create({
        data: {
          tenantId,
          name: names[i],
          sortOrder: i,
          kitchenStation:
            businessType === "RESTAURANT"
              ? ["MAIN", "BAR", "BAKERY"][i]
              : ["BAR", "BAR", "BAKERY"][i],
        },
      }),
    );
  const group = await tx.modifierGroup.create({
    data: {
      tenantId,
      name: "ระดับความหวาน",
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      options: {
        create: ["0%", "25%", "50%", "100%"].map((n, i) => ({
          tenantId,
          name: `หวาน ${n}`,
          isDefault: i === 2,
          sortOrder: i,
        })),
      },
    },
  });
  const milk = await tx.modifierGroup.create({
    data: {
      tenantId,
      name: "เพิ่มพิเศษ",
      maxSelect: 2,
      options: {
        create: [
          { tenantId, name: "นมโอ๊ต", priceDelta: 20 },
          { tenantId, name: "เพิ่มช็อต", priceDelta: 15 },
        ],
      },
    },
  });
  const ingredients = [];
  for (const [i, n] of [
    "เมล็ดกาแฟคั่วกลาง",
    "นมสดพาสเจอร์ไรส์",
    "แก้ว 16 oz",
  ].entries()) {
    const ingredient = await tx.ingredient.create({
      data: {
        tenantId,
        sku: `ING-${i + 1}`,
        name: n,
        unit: ["g", "ml", "ชิ้น"][i],
        costPerUnit: [0.6, 0.04, 2][i],
        lowStockThreshold: [500, 1000, 20][i],
      },
    });
    await tx.branchIngredientStock.create({
      data: {
        tenantId,
        branchId,
        ingredientId: ingredient.id,
        currentQty: [3000, 10000, 100][i],
      },
    });
    ingredients.push(ingredient);
  }
  for (const [i, row] of templates[businessType].entries()) {
    const [title, price, image, cat] = row as [string, number, number, number];
    const recipe = businessType !== "RETAIL_SHOP" && cat < 2;
    const p = await tx.product.create({
      data: {
        tenantId,
        categoryId: categories[cat].id,
        sku: `SKU-${String(i + 1).padStart(3, "0")}`,
        barcode: `885000000${String(i + 1).padStart(4, "0")}`,
        name: title,
        price,
        imageUrl: image >= 0 ? `sprite:${image}` : null,
        trackStockType: recipe ? "RECIPE" : "DIRECT_UNIT",
        directStockQty: 50,
        sortOrder: i,
        modifierGroups: recipe
          ? {
              create: [
                { tenantId, modifierGroupId: group.id },
                { tenantId, modifierGroupId: milk.id },
              ],
            }
          : undefined,
      },
    });
    if (recipe)
      for (const [j, quantity] of [18, 150, 1].entries())
        await tx.recipeBomItem.create({
          data: {
            tenantId,
            productId: p.id,
            ingredientId: ingredients[j].id,
            quantityUsed: quantity,
          },
        });
  }
  const zone = await tx.diningZone.create({
    data: { tenantId, branchId, name: "พื้นที่หลัก" },
  });
  for (let i = 1; i <= 6; i++)
    await tx.diningTable.create({
      data: {
        tenantId,
        zoneId: zone.id,
        name: `T-${String(i).padStart(2, "0")}`,
        seats: i > 4 ? 2 : 4,
      },
    });
}
