import type {
  Tenant,
  StoreBranch,
  StaffMember,
  Product,
  Category,
  RecipeBomItem,
  ModifierGroup,
  ModifierOption,
  Ingredient,
  BranchIngredientStock,
  DiningTable,
  DiningZone,
  Order,
  OrderItem,
  OrderItemModifier,
  OrderPayment,
  CashierShift,
  Plan,
  SaasPayment,
  StockMovement,
  CashMovement,
  Prisma,
} from "@prisma/client";
type Jsonify<T> = T extends Date
  ? string
  : T extends Prisma.Decimal
    ? string
    : T extends Array<infer U>
      ? Jsonify<U>[]
      : T extends object
        ? { [K in keyof T]: Jsonify<T[K]> }
        : T;
export type ProductView = Jsonify<
  Product & {
    stockVersion: number;
    category: Category;
    recipeItems: RecipeBomItem[];
    modifierGroups: {
      modifierGroupId: string;
      modifierGroup: ModifierGroup & { options: ModifierOption[] };
    }[];
  }
>;
export type OrderView = Jsonify<
  Order & {
    items: (OrderItem & { modifiers: OrderItemModifier[] })[];
    payments: OrderPayment[];
    table: DiningTable | null;
    staff: { displayName: string } | null;
  }
>;
export type Bootstrap = {
  release?: { mode: string; checkoutAvailable: boolean };
  entitlement?: {
    source: "BASE" | "PILOT" | "PAID";
    profile: string | null;
    state: string;
    endsAt: string | null;
  };
  terminals: {
    id: string;
    clientId: string;
    branchId: string;
    lastSeenAt: string;
  }[];
  tenant: Jsonify<Tenant>;
  state: string;
  shiftCash: number;
  shiftMovements: number;
  branch: Jsonify<StoreBranch>;
  branches: Jsonify<StoreBranch>[];
  staff: Pick<StaffMember, "id" | "displayName" | "role">;
  accountStaffId: string;
  products: ProductView[];
  categories: Jsonify<Category>[];
  ingredients: Jsonify<
    Ingredient & { branchStocks: BranchIngredientStock[] }
  >[];
  tables: Jsonify<DiningTable & { zone: DiningZone }>[];
  orders: OrderView[];
  shifts: Jsonify<CashierShift>[];
  staffList: (Pick<
    StaffMember,
    "id" | "displayName" | "role" | "isActive" | "userId"
  > & { branchIds: string[]; canSwitch: boolean })[];
  plans: Jsonify<Plan>[];
  payments: Jsonify<SaasPayment>[];
  stockMovements: Jsonify<StockMovement & { ingredient: Ingredient }>[];
  cashMovements: Jsonify<CashMovement>[];
  zones: Jsonify<DiningZone>[];
  integrations: {
    stripe: boolean;
    platformPromptpay: boolean;
    hasStripeSubscription?: boolean;
    recurring?: boolean;
  };
};
export type CartLine = {
  key: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  optionIds: string[];
  optionNames: string[];
  note: string;
  imageUrl: string | null;
};
