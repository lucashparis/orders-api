type JsonRecord = Record<string, unknown>;

type GraphqlResponse = { data: JsonRecord };

type CreatedUser = { id: string; name: string; email: string };

type CreatedProduct = { id: string; name: string; priceInCents: number; stock: number };

type ProductSpec = { name: string; priceInCents: number; stock: number };

type DemoCatalog = {
  buyer: CreatedUser;
  users: CreatedUser[];
  products: CreatedProduct[];
  limitedProduct: CreatedProduct;
  expensiveProduct: CreatedProduct;
};

type ListingScan = { users: unknown[]; pages: number; stoppedAtCap: boolean };

type OrderLine = { productId: string; quantity: number };

type ErrorExample = {
  title: string;
  field: string;
  expectedType: string;
  document: string;
  variables: Record<string, unknown>;
};

const API_URL = process.env.API_URL ?? "http://localhost:3000/graphql";
const MAXIMUM_AMOUNT_IN_CENTS = 2_147_483_647;
const MISSING_ID = "2147483000";
const CONCURRENT_ORDERS = 50;
const LIMITED_STOCK = 10;
const USERS_PAGE_SIZE = 100;
const ORDERS_PAGE_SIZE = 3;
const MAXIMUM_LISTING_PAGES = 50;
const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const USER_NAMES = ["Bruno", "Carla"];
const PRODUCT_SPECS: ProductSpec[] = [
  { name: "Teclado mecânico", priceInCents: 35000, stock: 100 },
  { name: "Mouse sem fio", priceInCents: 12000, stock: 100 },
  { name: "Monitor 4K", priceInCents: 189900, stock: 100 },
];

const VALIDATION_FIELDS = "... on ValidationError { code message fields { field message } }";

const CREATE_USER_DOCUMENT = `mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    __typename
    ... on User { id name email }
    ${VALIDATION_FIELDS}
    ... on EmailAlreadyInUseError { code message email }
  }
}`;

const CREATE_PRODUCT_DOCUMENT = `mutation CreateProduct($input: CreateProductInput!) {
  createProduct(input: $input) {
    __typename
    ... on Product { id name priceInCents stock }
    ${VALIDATION_FIELDS}
  }
}`;

const CREATE_ORDER_DOCUMENT = `mutation CreateOrder($input: CreateOrderInput!) {
  createOrder(input: $input) {
    __typename
    ... on Order {
      id
      totalInCents
      items { quantity unitPriceInCents product { id name stock } }
    }
    ${VALIDATION_FIELDS}
    ... on UserNotFoundError { code message userId }
    ... on ProductNotFoundError { code message productIds }
    ... on InsufficientStockError { code message items { productId requested available } }
    ... on OrderTotalLimitExceededError { code message limitInCents }
  }
}`;

const PRODUCTS_PAGE_DOCUMENT = `query ProductsPage($after: String) {
  products(first: 100, after: $after) {
    edges { node { id stock } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const USERS_WITH_ORDERS_DOCUMENT = `query UsersWithOrders($first: Int!, $after: String, $ordersFirst: Int!) {
  users(first: $first, after: $after) {
    edges {
      node {
        id
        name
        email
        orders(first: $ordersFirst) {
          edges {
            node {
              id
              totalInCents
              items {
                quantity
                unitPriceInCents
                product { id name priceInCents stock }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

class DemoError extends Error {}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readField(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function readText(value: unknown, key: string): string {
  const field = readField(value, key);
  if (typeof field !== "string") {
    throw new DemoError(`Resposta inesperada da API: o campo "${key}" não é um texto.`);
  }
  return field;
}

function readNumber(value: unknown, key: string): number {
  const field = readField(value, key);
  if (typeof field !== "number") {
    throw new DemoError(`Resposta inesperada da API: o campo "${key}" não é um número.`);
  }
  return field;
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatCents(cents: number): string {
  return CURRENCY_FORMATTER.format(cents / 100);
}

function buildRunSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function postGraphql(document: string, variables: Record<string, unknown>): Promise<unknown> {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: new Headers({ "content-type": "application/json" }),
      body: JSON.stringify({ query: document, variables }),
    });
    return await response.json();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new DemoError(`Não foi possível se comunicar com a API em ${API_URL} (${reason}).`);
  }
}

async function sendGraphqlRequest(
  document: string,
  variables: Record<string, unknown>,
): Promise<GraphqlResponse> {
  const body = await postGraphql(document, variables);
  const errors = readField(body, "errors");
  if (errors !== undefined) {
    throw new DemoError(`A API retornou erros GraphQL:\n${toPrettyJson(errors)}`);
  }
  const data = readField(body, "data");
  if (!isRecord(data)) {
    throw new DemoError('A API respondeu sem o campo "data".');
  }
  return { data };
}

async function runMutation(
  document: string,
  field: string,
  expectedType: string,
  input: unknown,
): Promise<JsonRecord> {
  const response = await sendGraphqlRequest(document, { input });
  const result = readField(response.data, field);
  if (!isRecord(result) || result.__typename !== expectedType) {
    throw new DemoError(`Esperava ${expectedType} em ${field}, mas veio:\n${toPrettyJson(result)}`);
  }
  return result;
}

async function createUser(name: string, email: string): Promise<CreatedUser> {
  const result = await runMutation(CREATE_USER_DOCUMENT, "createUser", "User", { name, email });
  return {
    id: readText(result, "id"),
    name: readText(result, "name"),
    email: readText(result, "email"),
  };
}

async function createProduct(spec: ProductSpec): Promise<CreatedProduct> {
  const result = await runMutation(CREATE_PRODUCT_DOCUMENT, "createProduct", "Product", spec);
  return {
    id: readText(result, "id"),
    name: readText(result, "name"),
    priceInCents: readNumber(result, "priceInCents"),
    stock: readNumber(result, "stock"),
  };
}

function printCatalog(catalog: DemoCatalog): void {
  for (const user of catalog.users) {
    console.log(`  usuário #${user.id}  ${user.name} <${user.email}>`);
  }
  const products = [...catalog.products, catalog.limitedProduct, catalog.expensiveProduct];
  for (const product of products) {
    const price = formatCents(product.priceInCents);
    console.log(`  produto #${product.id}  ${product.name} · ${price} · estoque ${product.stock}`);
  }
}

async function seedDemoCatalog(): Promise<DemoCatalog> {
  console.log("\n=== 1. Cadastro inicial ===");
  const suffix = buildRunSuffix();
  const emailOf = (name: string): string => `${name.toLowerCase()}.${suffix}@demo.example`;
  const buyer = await createUser("Ana", emailOf("Ana"));
  const others = await Promise.all(USER_NAMES.map((name) => createUser(name, emailOf(name))));
  const products = await Promise.all(PRODUCT_SPECS.map(createProduct));
  const limitedProduct = await createProduct({
    name: "Edição limitada",
    priceInCents: 2500,
    stock: LIMITED_STOCK,
  });
  const expensiveProduct = await createProduct({
    name: "Joia rara",
    priceInCents: MAXIMUM_AMOUNT_IN_CENTS,
    stock: 5,
  });
  const catalog = { buyer, users: [buyer, ...others], products, limitedProduct, expensiveProduct };
  printCatalog(catalog);
  return catalog;
}

function placeOrder(userId: string, items: OrderLine[]): Promise<GraphqlResponse> {
  return sendGraphqlRequest(CREATE_ORDER_DOCUMENT, { input: { userId, items } });
}

function readOrderType(response: GraphqlResponse): string {
  return readText(readField(response.data, "createOrder"), "__typename");
}

function countByType(types: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const type of types) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return counts;
}

function findStock(page: unknown, productId: string): number | undefined {
  const edges = readField(page, "edges");
  if (!Array.isArray(edges)) {
    throw new DemoError("Resposta inesperada da API: a página de produtos não tem edges.");
  }
  for (const edge of edges) {
    const node = readField(edge, "node");
    if (readField(node, "id") === productId) {
      return readNumber(node, "stock");
    }
  }
  return undefined;
}

async function readProductStock(productId: string): Promise<number> {
  let cursor: string | null = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const response: GraphqlResponse = await sendGraphqlRequest(PRODUCTS_PAGE_DOCUMENT, {
      after: cursor,
    });
    const page = readField(response.data, "products");
    const stock = findStock(page, productId);
    if (stock !== undefined) {
      return stock;
    }
    const pageInfo = readField(page, "pageInfo");
    hasNextPage = readField(pageInfo, "hasNextPage") === true;
    cursor = hasNextPage ? readText(pageInfo, "endCursor") : null;
  }
  throw new DemoError(`O produto ${productId} não apareceu na listagem de produtos.`);
}

async function runConcurrencyScenario(catalog: DemoCatalog): Promise<void> {
  console.log("\n=== 2. Concorrência ===");
  const { buyer, limitedProduct } = catalog;
  console.log(
    `Disparando ${CONCURRENT_ORDERS} pedidos em paralelo (1 unidade cada) do produto #${limitedProduct.id}, que tem estoque ${LIMITED_STOCK}...`,
  );
  const items = [{ productId: limitedProduct.id, quantity: 1 }];
  const requests = Array.from({ length: CONCURRENT_ORDERS }, () => placeOrder(buyer.id, items));
  const counts = countByType((await Promise.all(requests)).map(readOrderType));
  const accepted = counts.get("Order") ?? 0;
  const rejected = counts.get("InsufficientStockError") ?? 0;
  const finalStock = await readProductStock(limitedProduct.id);
  const summary = `${accepted} aceitos · ${rejected} InsufficientStockError · estoque final ${finalStock}`;
  const isExpected =
    accepted === LIMITED_STOCK &&
    rejected === CONCURRENT_ORDERS - LIMITED_STOCK &&
    finalStock === 0;
  if (isExpected) {
    console.log(`✔ ${summary}`);
    return;
  }
  console.log(`✘ Resultado inesperado: ${summary}`);
  console.log(`  Contagem por tipo de resposta: ${toPrettyJson(Object.fromEntries(counts))}`);
  process.exitCode = 1;
}

function orderExample(
  title: string,
  expectedType: string,
  userId: string,
  items: OrderLine[],
): ErrorExample {
  return {
    title,
    field: "createOrder",
    expectedType,
    document: CREATE_ORDER_DOCUMENT,
    variables: { input: { userId, items } },
  };
}

function buildUserExamples(catalog: DemoCatalog): ErrorExample[] {
  return [
    {
      title: "ValidationError: nome vazio e e-mail inválido",
      field: "createUser",
      expectedType: "ValidationError",
      document: CREATE_USER_DOCUMENT,
      variables: { input: { name: "", email: "isto-nao-e-um-email" } },
    },
    {
      title: "EmailAlreadyInUseError: e-mail que já pertence a outro usuário",
      field: "createUser",
      expectedType: "EmailAlreadyInUseError",
      document: CREATE_USER_DOCUMENT,
      variables: { input: { name: "Outra Pessoa", email: catalog.buyer.email } },
    },
  ];
}

function buildOrderExamples(catalog: DemoCatalog): ErrorExample[] {
  const { buyer, products, limitedProduct, expensiveProduct } = catalog;
  const productId = products[0]?.id ?? limitedProduct.id;
  return [
    orderExample("UserNotFoundError: usuário inexistente", "UserNotFoundError", MISSING_ID, [
      { productId, quantity: 1 },
    ]),
    orderExample("ProductNotFoundError: produto inexistente", "ProductNotFoundError", buyer.id, [
      { productId: MISSING_ID, quantity: 1 },
    ]),
    orderExample(
      "InsufficientStockError: quantidade acima do estoque",
      "InsufficientStockError",
      buyer.id,
      [{ productId: limitedProduct.id, quantity: LIMITED_STOCK + 1 }],
    ),
    orderExample(
      "OrderTotalLimitExceededError: total acima do limite de pedido",
      "OrderTotalLimitExceededError",
      buyer.id,
      [{ productId: expensiveProduct.id, quantity: 2 }],
    ),
  ];
}

async function showErrorExample(example: ErrorExample): Promise<void> {
  console.log(`\n--- ${example.title} ---`);
  console.log("Requisição:");
  console.log(example.document);
  console.log("Variáveis:");
  console.log(toPrettyJson(example.variables));
  const response = await sendGraphqlRequest(example.document, example.variables);
  console.log("Resposta:");
  console.log(toPrettyJson(response));
  const actualType = readText(readField(response.data, example.field), "__typename");
  if (actualType !== example.expectedType) {
    console.log(`✘ Esperava ${example.expectedType}, mas a API retornou ${actualType}.`);
    process.exitCode = 1;
  }
}

async function showErrorCatalog(catalog: DemoCatalog): Promise<void> {
  console.log("\n=== 3. Catálogo de erros ===");
  const examples = [...buildUserExamples(catalog), ...buildOrderExamples(catalog)];
  for (const example of examples) {
    await showErrorExample(example);
  }
}

function pickRunUsers(page: unknown, emails: Set<string>): unknown[] {
  const edges = readField(page, "edges");
  if (!Array.isArray(edges)) {
    throw new DemoError("Resposta inesperada da API: a página de usuários não tem edges.");
  }
  const nodes = edges.map((edge) => readField(edge, "node"));
  return nodes.filter((node) => emails.has(readText(node, "email")));
}

async function collectRunUsers(emails: Set<string>): Promise<ListingScan> {
  const users: unknown[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let pages = 0;
  while (hasNextPage && pages < MAXIMUM_LISTING_PAGES && users.length < emails.size) {
    const variables = { first: USERS_PAGE_SIZE, ordersFirst: ORDERS_PAGE_SIZE, after: cursor };
    const response: GraphqlResponse = await sendGraphqlRequest(
      USERS_WITH_ORDERS_DOCUMENT,
      variables,
    );
    const page = readField(response.data, "users");
    users.push(...pickRunUsers(page, emails));
    const pageInfo = readField(page, "pageInfo");
    hasNextPage = readField(pageInfo, "hasNextPage") === true;
    cursor = hasNextPage ? readText(pageInfo, "endCursor") : null;
    pages += 1;
  }
  return { users, pages, stoppedAtCap: hasNextPage && users.length < emails.size };
}

function describeShortfall(found: number, expected: number, stoppedAtCap: boolean): string | null {
  if (found >= expected) {
    return null;
  }
  const counts = `${found} de ${expected} usuários desta execução foram encontrados`;
  if (stoppedAtCap) {
    return `A varredura parou no limite de ${MAXIMUM_LISTING_PAGES} páginas: ${counts}.`;
  }
  return `A listagem terminou antes de encontrar todos: ${counts}.`;
}

async function showUsersWithOrders(catalog: DemoCatalog): Promise<void> {
  console.log("\n=== 4. Listagem: usuários, pedidos, itens e produtos ===");
  console.log(
    `A listagem é paginada: ${USERS_PAGE_SIZE} usuários por página e ${ORDERS_PAGE_SIZE} pedidos por usuário. A demonstração percorre as páginas com pageInfo.endCursor (argumento after) até a última (no máximo ${MAXIMUM_LISTING_PAGES} páginas) e mostra abaixo apenas os usuários criados nesta execução, com seus pedidos, itens e produtos.`,
  );
  console.log(USERS_WITH_ORDERS_DOCUMENT);
  const emails = new Set(catalog.users.map((user) => user.email));
  const { users, pages, stoppedAtCap } = await collectRunUsers(emails);
  console.log(`Páginas percorridas: ${pages}. Usuários desta execução: ${users.length}.`);
  const shortfall = describeShortfall(users.length, emails.size, stoppedAtCap);
  if (shortfall !== null) {
    console.log(shortfall);
  }
  console.log(toPrettyJson({ data: { users } }));
}

async function runDemo(): Promise<void> {
  console.log(`Demonstração da API de pedidos em ${API_URL}`);
  const catalog = await seedDemoCatalog();
  await runConcurrencyScenario(catalog);
  await showErrorCatalog(catalog);
  await showUsersWithOrders(catalog);
}

function reportFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`✘ A demonstração falhou: ${message}`);
  process.exitCode = 1;
}

runDemo().catch(reportFailure);
