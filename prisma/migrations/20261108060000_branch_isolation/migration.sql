BEGIN;
-- CreateTable
CREATE TABLE "StaffBranchAccess" (
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "StaffBranchAccess_pkey" PRIMARY KEY ("staffId","branchId")
);

-- CreateTable
CREATE TABLE "BranchProduct" (
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BranchProduct_pkey" PRIMARY KEY ("branchId","productId")
);

-- CreateTable
CREATE TABLE "ProductStockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" TEXT NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffBranchAccess_tenantId_branchId_idx" ON "StaffBranchAccess"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchProduct_tenantId_branchId_productId_key" ON "BranchProduct"("tenantId", "branchId", "productId");

-- CreateIndex
CREATE INDEX "ProductStockMovement_tenantId_branchId_createdAt_idx" ON "ProductStockMovement"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductStockMovement_tenantId_branchId_orderId_productId_ki_key" ON "ProductStockMovement"("tenantId", "branchId", "orderId", "productId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_branchId_id_key" ON "Order"("tenantId", "branchId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_id_key" ON "Product"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_tenantId_id_key" ON "StaffMember"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StoreBranch_tenantId_id_key" ON "StoreBranch"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "StaffBranchAccess" ADD CONSTRAINT "StaffBranchAccess_tenantId_staffId_fkey" FOREIGN KEY ("tenantId", "staffId") REFERENCES "StaffMember"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffBranchAccess" ADD CONSTRAINT "StaffBranchAccess_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "StoreBranch"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchProduct" ADD CONSTRAINT "BranchProduct_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "StoreBranch"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchProduct" ADD CONSTRAINT "BranchProduct_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStockMovement" ADD CONSTRAINT "ProductStockMovement_tenantId_branchId_productId_fkey" FOREIGN KEY ("tenantId", "branchId", "productId") REFERENCES "BranchProduct"("tenantId", "branchId", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStockMovement" ADD CONSTRAINT "ProductStockMovement_tenantId_branchId_orderId_fkey" FOREIGN KEY ("tenantId", "branchId", "orderId") REFERENCES "Order"("tenantId", "branchId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BranchProduct" ADD CONSTRAINT "BranchProduct_nonnegative" CHECK ("quantity" >= 0 AND "price" >= 0 AND "version" >= 0);
ALTER TABLE "ProductStockMovement" ADD CONSTRAINT "ProductStockMovement_valid" CHECK ("balanceAfter" >= 0 AND "quantityChange" <> 0 AND "kind" IN ('OPENING','ADJUSTMENT','SALE','RETURN'));

-- Existing grants preserve existing access, never grant future branches implicitly.
INSERT INTO "StaffBranchAccess" ("tenantId","staffId","branchId")
SELECT s."tenantId",s.id,b.id FROM "StaffMember" s JOIN "StoreBranch" b ON b."tenantId"=s."tenantId"
WHERE s.role <> 'OWNER' AND b."isActive";

-- Legacy stock was tenant-wide. Place it in the existing default branch once.
INSERT INTO "BranchProduct" ("tenantId","branchId","productId",price,quantity,"isAvailable")
SELECT p."tenantId",b.id,p.id,p.price,
 CASE WHEN b.id=(SELECT id FROM "StoreBranch" x WHERE x."tenantId"=p."tenantId" ORDER BY x."isActive" DESC,x.id LIMIT 1) THEN p."directStockQty" ELSE 0 END,
 p."isAvailable" FROM "Product" p JOIN "StoreBranch" b ON b."tenantId"=p."tenantId";
INSERT INTO "ProductStockMovement" (id,"tenantId","branchId","productId",kind,"quantityChange","balanceAfter",reason)
SELECT 'p1-opening-'||md5("tenantId"||':'||"branchId"||':'||"productId"),"tenantId","branchId","productId",'OPENING',quantity,quantity,'ยอดเดิมก่อนแยกสาขา: ตรวจการกระจายคลังกับเจ้าของร้าน' FROM "BranchProduct" WHERE quantity > 0;

CREATE FUNCTION pos_init_product_branches() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "BranchProduct" ("tenantId","branchId","productId",price,quantity,"isAvailable")
 SELECT NEW."tenantId",b.id,NEW.id,NEW.price,
 CASE WHEN b.id=(SELECT id FROM "StoreBranch" x WHERE x."tenantId"=NEW."tenantId" ORDER BY x."isActive" DESC,x.id LIMIT 1) THEN NEW."directStockQty" ELSE 0 END,
 NEW."isAvailable" FROM "StoreBranch" b WHERE b."tenantId"=NEW."tenantId";
 RETURN NEW;
END $$;
CREATE TRIGGER pos_init_product_branches AFTER INSERT ON "Product" FOR EACH ROW EXECUTE FUNCTION pos_init_product_branches();

CREATE FUNCTION pos_init_branch_products() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "BranchProduct" ("tenantId","branchId","productId",price,quantity,"isAvailable")
 SELECT NEW."tenantId",NEW.id,p.id,p.price,0,p."isAvailable" FROM "Product" p WHERE p."tenantId"=NEW."tenantId";
 RETURN NEW;
END $$;
CREATE TRIGGER pos_init_branch_products AFTER INSERT ON "StoreBranch" FOR EACH ROW EXECUTE FUNCTION pos_init_branch_products();

CREATE FUNCTION pos_branch_product_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.version := OLD.version + CASE WHEN ROW(NEW.quantity,NEW.price,NEW."isAvailable") IS DISTINCT FROM ROW(OLD.quantity,OLD.price,OLD."isAvailable") THEN 1 ELSE 0 END;
 RETURN NEW;
END $$;
CREATE TRIGGER pos_branch_product_version BEFORE UPDATE ON "BranchProduct" FOR EACH ROW EXECUTE FUNCTION pos_branch_product_version();

-- Compatibility aggregate only: no sale reads the legacy quantity after phase 1.
CREATE FUNCTION pos_branch_product_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p TEXT; t TEXT;
BEGIN
 p := COALESCE(NEW."productId",OLD."productId"); t := COALESCE(NEW."tenantId",OLD."tenantId");
 PERFORM id FROM "Product" WHERE id=p AND "tenantId"=t FOR UPDATE;
 UPDATE "Product" SET "directStockQty"=(SELECT COALESCE(sum(quantity),0) FROM "BranchProduct" WHERE "productId"=p AND "tenantId"=t) WHERE id=p AND "tenantId"=t;
 RETURN NULL;
END $$;
CREATE TRIGGER pos_branch_product_total AFTER INSERT OR UPDATE OF quantity OR DELETE ON "BranchProduct" FOR EACH ROW EXECUTE FUNCTION pos_branch_product_total();
COMMIT;
