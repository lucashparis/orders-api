import type { ValidationFailure } from "../../shared/errors/domain-errors.ts";
import type { Connection, Edge } from "../../shared/pagination/connection.ts";

export type ProductRecord = {
  id: number;
  name: string;
  priceInCents: number;
  stock: number;
  createdAt: Date;
};

export type ProductEdgeRecord = Edge<ProductRecord>;

export type ProductConnectionRecord = Connection<ProductRecord>;

export type CreateProductOutcome =
  | { kind: "ProductCreated"; product: ProductRecord }
  | ValidationFailure;
