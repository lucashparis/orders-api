import { ordersTypeDefs } from "./orders/orders.type-defs.ts";
import { productsTypeDefs } from "./products/products.type-defs.ts";
import { usersTypeDefs } from "./users/users.type-defs.ts";

export const applicationTypeDefs: string[] = [usersTypeDefs, productsTypeDefs, ordersTypeDefs];
