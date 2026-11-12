import type { BranchProduct } from "@prisma/client";
export function branchProductView<T extends object>(
  product: T,
  stock: BranchProduct,
) {
  return {
    ...product,
    price: stock.price,
    directStockQty: stock.quantity,
    isAvailable: stock.isAvailable,
    stockVersion: stock.version,
  };
}
