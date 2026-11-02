CREATE TABLE "users" (
    "id" INTEGER GENERATED ALWAYS AS IDENTITY NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_key" UNIQUE ("email"),
    CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"))
);

CREATE TABLE "products" (
    "id" INTEGER GENERATED ALWAYS AS IDENTITY NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "products_price_cents_non_negative" CHECK ("price_cents" >= 0),
    CONSTRAINT "products_stock_non_negative" CHECK ("stock" >= 0)
);

CREATE TABLE "orders" (
    "id" INTEGER GENERATED ALWAYS AS IDENTITY NOT NULL,
    "user_id" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "orders_total_cents_non_negative" CHECK ("total_cents" >= 0)
);

CREATE TABLE "order_items" (
    "id" INTEGER GENERATED ALWAYS AS IDENTITY NOT NULL,
    "order_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "order_items_unit_price_cents_non_negative" CHECK ("unit_price_cents" >= 0),
    CONSTRAINT "order_items_order_id_product_id_key" UNIQUE ("order_id", "product_id")
);

CREATE INDEX "orders_user_id_id_idx" ON "orders"("user_id", "id" DESC);

CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
