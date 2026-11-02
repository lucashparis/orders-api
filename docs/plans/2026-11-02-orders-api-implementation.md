# orders-api — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** construir a API GraphQL de pedidos descrita na spec, com integridade de estoque sob concorrência, testes automatizados e execução via Docker.

**Arquitetura:** Fastify + Mercurius com schema-first; módulos `users`, `products` e `orders`, cada um com resolver → service → repository; Prisma 7 sobre PostgreSQL 18, com SQL explícito na transação do pedido; erros de negócio como uniões tipadas (N2).

**Stack:** Node 24.22.2 (TypeScript nativo), TypeScript 7.0.2, Fastify 5.12.8, Mercurius 16.12.1, graphql 17.0.2, Prisma 7.10.1, Zod 4.6.7, Vitest 5.1.0, Biome 2.6.4.

**Spec:** [docs/specs/2026-11-02-orders-api-design.md](../specs/2026-11-02-orders-api-design.md)

## Restrições globais

- Versões exatas da seção 2 da spec; instalação com `npm ci`; `.npmrc` com `save-exact=true`, `engine-strict=true`, `fund=false`.
- Zero `npm warn deprecated` e zero vulnerabilidades no `npm audit`; nenhuma dependência nova sem repetir essa verificação.
- `overrides`: `glob` 14.0.3 e `minimatch` 11.0.4. `allowScripts`: apenas `prisma@7.10.1` e `@prisma/engines@7.10.1`.
- ESM, imports relativos com extensão `.ts`, apenas sintaxe apagável (sem `enum`, `namespace` ou parameter properties).
- Nenhum comentário em arquivos escritos à mão (`.ts`, `.graphql`, `.sql`, `.prisma`, `Dockerfile`, `.yml`).
- Todo tipo e campo do SDL de produção tem descrição `"""..."""` em inglês. SDL usado apenas em testes está isento.
- Sem `else` nem `else if`; cláusulas de guarda e early return; sem ternário aninhado.
- Funções com no máximo 30 linhas e complexidade cognitiva máxima de 10; identificadores com 3+ caracteres (exceção: `id`); sem `any`.
- Código, SDL e mensagens da API em inglês; README, documentos e saída do `demo` em pt-BR.
- Dinheiro em centavos inteiros; limite de 2147483647 por valor.
- Todo texto versionado descreve o projeto por si só, sem referências a contextos externos.
- Commits: Conventional Commits em inglês, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Testes de banco usam `db-test` (porta 5433), com `fileParallelism: false`.

## Foco de revisão

Casos que a spec implica sem que nenhum teste os cubra diretamente. Cada um tem teste na tarefa indicada:

1. E-mail com espaços e maiúsculas (`" Ana@Example.com "`) é gravado como `ana@example.com`, e uma segunda conta com `"ANA@example.com"` recebe `EmailAlreadyInUseError` (Tarefa 3.1).
2. Cursor adulterado (`"garbage"`, `base64url("v1:-5")`, `base64url("v2:5")`) retorna `BAD_USER_INPUT`, nunca erro interno (Tarefas 2.2 e 3.1).
3. `userId` ou `productId` não numérico ou acima de 2147483647 (`"99999999999"`) retorna `ValidationError`, nunca estouro no SQL (Tarefa 4.1).
4. Total exatamente em 2147483647 é aceito e 2147483648 é recusado (Tarefas 4.1 e 4.2).
5. Cadastros simultâneos com o mesmo e-mail criam exatamente um usuário; os demais recebem `EmailAlreadyInUseError`, não erro interno (Tarefa 3.1).

---

## Procedimento de fechamento de etapa (vale para todas)

- [ ] `npm run check` termina com sucesso.
- [ ] Revisão do texto que será mesclado (`git diff main`): descreve o projeto por si só, sem referências a contextos externos.
- [ ] Resumo para o usuário em pt-BR: o que foi entregue, justificativa de cada módulo em 3 a 5 linhas.
- [ ] Após a aprovação do usuário: `git checkout main && git merge --no-ff <branch> --no-edit`.
- [ ] Nada é enviado ao GitHub sem pedido explícito.

---

## Etapa 1 — `chore/project-setup` (Haiku + Sonnet)

### Tarefa 1.1: Toolchain e configuração (Haiku)

**Arquivos:**
- Criar: `package.json`, `.npmrc`, `.gitattributes`, `tsconfig.json`, `biome.json`, `lint-rules/no-else.grit`, `lint-rules/no-short-names.grit`, `vitest.config.ts`, `.env.example`

**Interfaces:**
- Produz: scripts npm `typecheck`, `lint`, `format`, `test`, `check:comments`, `generate` e `check` (a Tarefa 3.1 amplia `generate`; a Tarefa 2.4 troca `test` por `test:coverage` dentro de `check`).

- [ ] **Passo 1: Criar a branch**

```bash
git checkout -b chore/project-setup
```

- [ ] **Passo 2: Criar `package.json`**

```json
{
  "name": "orders-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24.22.2 <25" },
  "scripts": {
    "dev": "node --env-file-if-exists=.env --watch src/server.ts",
    "start": "node src/server.ts",
    "generate": "prisma generate",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "format": "biome format --write .",
    "check:comments": "node --disable-warning=ExperimentalWarning scripts/check-no-comments.ts",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "db:migrate": "prisma migrate deploy",
    "demo": "node scripts/demo.ts",
    "check": "npm run generate && npm run typecheck && npm run lint && npm run check:comments && npm audit && npm test"
  },
  "dependencies": {
    "@prisma/adapter-pg": "7.10.1",
    "@prisma/client": "7.10.1",
    "fastify": "5.12.8",
    "graphql": "17.0.2",
    "mercurius": "16.12.1",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@biomejs/biome": "2.6.4",
    "@graphql-codegen/core": "6.2.2",
    "@graphql-codegen/typescript": "6.1.2",
    "@graphql-codegen/typescript-resolvers": "6.1.1",
    "@types/node": "24.19.2",
    "@vitest/coverage-v8": "5.1.0",
    "acorn": "8.19.0",
    "pino-pretty": "13.2.0",
    "prisma": "7.10.1",
    "typescript": "7.0.2",
    "vitest": "5.1.0"
  },
  "overrides": { "glob": "14.0.3", "minimatch": "11.0.4" },
  "allowScripts": { "prisma@7.10.1": true, "@prisma/engines@7.10.1": true }
}
```

- [ ] **Passo 3: Criar `.npmrc` (`save-exact=true`, `engine-strict=true`, `fund=false`) e `.gitattributes` (`* text=auto eol=lf`)**

- [ ] **Passo 4: Criar `tsconfig.json`**

`compilerOptions`: `target: "es2024"`, `module: "nodenext"`, `moduleResolution: "nodenext"`, `strict: true`, `noEmit: true`, `erasableSyntaxOnly: true`, `verbatimModuleSyntax: true`, `allowImportingTsExtensions: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `skipLibCheck: true`, `types: ["node"]`. `include`: `["src", "tests", "scripts", "prisma.config.ts", "vitest.config.ts"]`.

- [ ] **Passo 5: Criar as regras GritQL e o `biome.json`**

`lint-rules/no-else.grit` (validado em 2026-11-02):

```
language js

JsElseClause() as $elseClause where {
  register_diagnostic(span=$elseClause, message="Avoid else: use a guard clause with early return.")
}
```

`lint-rules/no-short-names.grit`: mesmo formato, casando `JsIdentifierBinding()` com a regex `^[A-Za-z_$][A-Za-z0-9_$]?$`, exceto o nome `id`, com a mensagem `"Use a descriptive name (3+ characters)."`.

`biome.json`: `plugins` com os dois arquivos; `files.includes` cobrindo `src`, `tests`, `scripts` e os arquivos `.ts` da raiz, excluindo `src/generated`; `linter.rules.recommended: true` e, com nível `error`: `suspicious.noExplicitAny`, `style.noUselessElse`, `style.noNestedTernary`, `style.useNamingConvention`, `complexity.noExcessiveCognitiveComplexity` (`maxAllowedComplexity: 10`), `complexity.noExcessiveLinesPerFunction` (`maxLines: 30`), `nursery`/grupo atual de `noFloatingPromises`, `noMisusedPromises` e `useExhaustiveSwitchCases` (use `npx biome explain <rule>` para o grupo correto). Configure `useNamingConvention` de modo que chaves de mapas de resolvers em PascalCase (`Query`, `User`) e `__typename` sejam aceitas. Formatter: indentação de 2 espaços, `lineWidth: 100`.

- [ ] **Passo 6: Criar `vitest.config.ts`**

`test.include: ["tests/**/*.test.ts"]`, `test.fileParallelism: false`, `test.globalSetup: ["tests/helpers/global-setup.ts"]` (o arquivo nasce na Tarefa 1.3; até lá, deixe `globalSetup` fora e adicione-o naquela tarefa), `coverage.provider: "v8"`, `coverage.include: ["src/**/*.ts"]`, `coverage.exclude: ["src/generated/**", "src/server.ts"]`.

- [ ] **Passo 7: Criar `.env.example`**

```
DATABASE_URL=postgresql://orders:orders@localhost:5432/orders
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
NODE_ENV=development
GRAPHIQL_ENABLED=true
TEST_DATABASE_URL=postgresql://orders:orders@localhost:5433/orders_test
```

- [ ] **Passo 8: Instalar e verificar a política de dependências**

Run: `npm install`
Expected: `found 0 vulnerabilities`, nenhuma linha `npm warn` na saída.

Run: `node -e "const lock=require('./package-lock.json');const deprecated=Object.entries(lock.packages).filter(([,entry])=>entry.deprecated);console.log(deprecated.length)"`
Expected: `0`

- [ ] **Passo 9: Verificar se as regras do Biome disparam**

Crie temporariamente `src/rule-probe.ts` com um `if/else` e um parâmetro `(x)`.
Run: `npx biome lint src/rule-probe.ts`
Expected: diagnósticos `Avoid else: use a guard clause with early return.` e `Use a descriptive name (3+ characters).`. Apague o arquivo.

- [ ] **Passo 10: Commit**

```bash
git add package.json package-lock.json .npmrc .gitattributes tsconfig.json biome.json lint-rules vitest.config.ts .env.example
git commit -m "chore: configure toolchain, dependency policy and lint rules"
```

### Tarefa 1.2: Verificação de ausência de comentários (Sonnet)

**Arquivos:**
- Criar: `scripts/comment-detection.ts`, `scripts/check-no-comments.ts`
- Teste: `tests/unit/scripts/comment-detection.test.ts`

**Interfaces:**
- Produz:
  - `findTypeScriptComments(source: string): string[]`
  - `findLineComments(source: string, marker: "#" | "--" | "//"): string[]`
  - `commentMarkerForFile(filePath: string): "typescript" | "#" | "--" | "//" | null`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
describe("comment detection", () => {
  it("returns line and block comments from TypeScript source", () => {
    expect(findTypeScriptComments("// first\nconst total: number = 1;\n/* second */")).toEqual(["first", "second"]);
  });
  it("ignores comment-like text inside strings", () => {
    expect(findTypeScriptComments('const address: string = "http://example.com";')).toEqual([]);
  });
  it("returns lines that start with the marker", () => {
    expect(findLineComments("SELECT 1;\n  -- note\nSELECT 2;", "--")).toEqual(["-- note"]);
  });
  it("does not treat SDL descriptions as comments", () => {
    expect(findLineComments('"""A customer."""\ntype User { id: ID! }', "#")).toEqual([]);
  });
  it("maps files to comment markers", () => {
    expect(commentMarkerForFile("src/app.ts")).toBe("typescript");
    expect(commentMarkerForFile("src/modules/users/users.graphql")).toBe("#");
    expect(commentMarkerForFile("prisma/migrations/0001_init/migration.sql")).toBe("--");
    expect(commentMarkerForFile("prisma/schema.prisma")).toBe("//");
    expect(commentMarkerForFile("Dockerfile")).toBe("#");
    expect(commentMarkerForFile("docker-compose.yml")).toBe("#");
    expect(commentMarkerForFile("README.md")).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/scripts/comment-detection.test.ts`
Expected: FAIL, módulo `scripts/comment-detection.ts` inexistente.

- [ ] **Passo 3: Implementar `scripts/comment-detection.ts`**

`findTypeScriptComments`: `stripTypeScriptTypes` de `node:module` seguido de `acorn.parse` com `ecmaVersion: "latest"`, `sourceType: "module"` e `onComment`, retornando o texto aparado.

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx vitest run tests/unit/scripts/comment-detection.test.ts`
Expected: PASS

- [ ] **Passo 5: Implementar `scripts/check-no-comments.ts`**

Percorre `src`, `tests`, `scripts`, `prisma`, `lint-rules` e os arquivos da raiz `Dockerfile`, `docker-compose.yml`, `prisma.config.ts` e `vitest.config.ts`, ignorando `src/generated` e `node_modules`. Imprime `arquivo: comentário` para cada ocorrência e define `process.exitCode = 1` quando houver alguma.

Run: `npm run check:comments`
Expected: saída vazia e código de saída 0.

- [ ] **Passo 6: Commit**

```bash
git add scripts tests/unit/scripts
git commit -m "chore: add automated check that forbids code comments"
```

### Tarefa 1.3: Banco, schema Prisma e migration (Sonnet)

**Arquivos:**
- Criar: `docker-compose.yml` (serviços `db` e `db-test`), `prisma/schema.prisma`, `prisma.config.ts`, `prisma/migrations/<timestamp>_init/migration.sql`, `tests/helpers/test-database-url.ts`, `tests/helpers/global-setup.ts`, `tests/helpers/database.ts`
- Modificar: `vitest.config.ts` (adicionar `globalSetup`)
- Teste: `tests/integration/database/schema-constraints.test.ts`

**Interfaces:**
- Produz:
  - `testDatabaseUrl: string` (`process.env.TEST_DATABASE_URL`, padrão `postgresql://orders:orders@localhost:5433/orders_test`)
  - `createTestPrismaClient(): PrismaClient`
  - `truncateAllTables(prisma: PrismaClient): Promise<void>` (`TRUNCATE order_items, orders, products, users RESTART IDENTITY CASCADE`)
  - `readConstraintViolation(operation: () => Promise<unknown>): Promise<string>`, que retorna a mensagem original do PostgreSQL (de `meta.driverAdapterError.cause.message` ou `error.message`)
  - Prisma Client gerado em `src/generated/prisma/client.ts`, com os models `User`, `Product`, `Order` e `OrderItem`

- [ ] **Passo 1: Criar `docker-compose.yml`**

`db`: `postgres:18.6-alpine`, usuário/senha/banco `orders`/`orders`/`orders`, porta `5432:5432`, volume nomeado `orders-data`, healthcheck `pg_isready -U orders -d orders`. `db-test`: mesma imagem, banco `orders_test`, porta `5433:5432`, `tmpfs: /var/lib/postgresql`, `profiles: ["tools"]`.

Run: `docker compose up -d db db-test`
Expected: os dois serviços `healthy` em `docker compose ps`.

- [ ] **Passo 2: Criar `prisma.config.ts` e `prisma/schema.prisma`**

`prisma.config.ts`: carrega `.env` com `process.loadEnvFile` quando o arquivo existe (guarda com `existsSync`) e exporta `defineConfig({ schema: "prisma/schema.prisma", migrations: { path: "prisma/migrations" }, datasource: { url: env("DATABASE_URL") } })`.

`schema.prisma`: gerador `prisma-client` com `output = "../src/generated/prisma"`, `moduleFormat = "esm"`, `generatedFileExtension = "ts"`, `importFileExtension = "ts"`; datasource `postgresql`. Models com os nomes de tabela e coluna da seção 4 da spec, via `@@map`/`@map`; `@db.VarChar(100)` e `@db.VarChar(254)`; `@db.Timestamptz(6)` com `@default(now())`; `email @unique(map: "users_email_key")`; `@@unique([orderId, productId], map: "order_items_order_id_product_id_key")`; `@@index([userId, id(sort: Desc)], map: "orders_user_id_id_idx")`; `@@index([productId], map: "order_items_product_id_idx")`; relações com `onDelete: Restrict, onUpdate: Restrict`.

- [ ] **Passo 3: Gerar e editar a migration**

Run: `npx prisma migrate dev --create-only --name init`

Edite `migration.sql` para refletir a DDL da seção 4 da spec: `INTEGER GENERATED ALWAYS AS IDENTITY`, todos os `CHECK` com os nomes da spec, `ON DELETE RESTRICT ON UPDATE RESTRICT`. Remova todas as linhas de comentário.

- [ ] **Passo 4: Aplicar e confirmar que não há divergência**

Run: `npx prisma migrate deploy` e depois `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
Expected: `-- This is an empty migration.`. Se aparecer diferença, ajuste a SQL para a forma canônica do Prisma, preservando tipos, constraints e nomes da spec.

- [ ] **Passo 5: Gerar o cliente e validar tipos e execução**

Run: `npm run generate && npm run typecheck`
Expected: sem erros. **Se surgirem erros apenas dentro de `src/generated` por causa de `exactOptionalPropertyTypes` ou `noUncheckedIndexedAccess`, pare e reporte ao usuário com as mensagens (validação pendente 2 da spec), sem relaxar o tsconfig por conta própria.**

- [ ] **Passo 6: Criar os helpers de teste e escrever o teste de constraints**

`global-setup.ts`: executa `npx prisma migrate deploy` com `DATABASE_URL = testDatabaseUrl` (via `execSync`, saída herdada). Adicione `globalSetup` ao `vitest.config.ts`.

```ts
describe("database constraints", () => {
  it("rejects negative stock", async () => {
    const message = await readConstraintViolation(() => prisma.$executeRaw`INSERT INTO products (name, price_cents, stock) VALUES ('Cap', 100, -1)`);
    expect(message).toContain("products_stock_non_negative");
  });
  it("rejects negative price", ...toContain("products_price_cents_non_negative"));
  it("rejects uppercase email", ...toContain("users_email_lowercase"));
  it("rejects zero quantity", ...toContain("order_items_quantity_positive"));
  it("rejects the same product twice in one order", ...toContain("order_items_order_id_product_id_key"));
  it("rejects an order without user", ...toContain("user_id"));
  it("rejects an explicit id on insert", ...toContain("GENERATED ALWAYS"));
});
```

Cada teste prepara as linhas de que precisa; `beforeEach` chama `truncateAllTables`.

- [ ] **Passo 7: Rodar e ver passar**

Run: `npx vitest run tests/integration/database`
Expected: PASS (7 testes).

- [ ] **Passo 8: Commit**

```bash
git add docker-compose.yml prisma prisma.config.ts tests/helpers tests/integration/database vitest.config.ts
git commit -m "feat: add database schema with integrity constraints and indexes"
```

### Tarefa 1.4: Motor de migrations do Prisma no Alpine (Haiku)

- [ ] **Passo 1: Executar as migrations a partir da imagem de produção**

Run: `docker run --rm --network host -v "${PWD}:/app" -w /app -e DATABASE_URL=postgresql://orders:orders@localhost:5433/orders_test node:24.22.2-alpine3.24 sh -c "apk add --no-cache openssl && npx prisma migrate deploy"`
Expected: `No pending migrations to apply.`. Os `node_modules` do Windows não servem no Linux; se o binário não for encontrado, rode `npm ci` dentro do contêiner num volume separado.

- [ ] **Passo 2: Registrar a decisão**

Se funcionar, a etapa 6 usa `node:24.22.2-alpine3.24` com `openssl`. Se falhar, repita com `node:24.22.2-trixie-slim`, registre o motivo no resumo da etapa e use essa imagem na etapa 6.

- [ ] **Passo 3: Fechamento da etapa 1** (procedimento comum)

---

## Etapa 2 — `feat/app-skeleton` (Sonnet)

### Tarefa 2.1: Configuração, logger e infraestrutura HTTP

**Arquivos:**
- Criar: `src/config/env.ts`, `src/shared/logger/logger-options.ts`, `src/shared/http/request-id.ts`, `src/shared/database/prisma-client.ts`
- Teste: `tests/unit/config/env.test.ts`, `tests/unit/shared/logger-options.test.ts`

**Interfaces:**
- Produz:
  - `type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent"`
  - `type NodeEnvironment = "development" | "production" | "test"`
  - `type Environment = { databaseUrl: string; port: number; host: string; logLevel: LogLevel; nodeEnv: NodeEnvironment; graphiqlEnabled: boolean }`
  - `loadEnvironment(variables: NodeJS.ProcessEnv): Environment` (lança `Error` cuja mensagem cita cada variável inválida)
  - `buildLoggerOptions(environment: Environment): { level: LogLevel; transport?: { target: "pino-pretty" } }`
  - `requestIdHeaderName = "x-request-id"`, `generateRequestId(): string`, `registerRequestIdEcho(app: FastifyInstance): void`
  - `createPrismaClient(databaseUrl: string): PrismaClient` e `type DatabaseClient = PrismaClient | Prisma.TransactionClient`

- [ ] **Passo 1: Criar a branch** `git checkout main && git checkout -b feat/app-skeleton`

- [ ] **Passo 2: Escrever os testes que falham**

```ts
it("applies defaults when optional variables are absent", () => {
  expect(loadEnvironment({ DATABASE_URL: "postgresql://orders:orders@localhost:5432/orders" })).toEqual({
    databaseUrl: "postgresql://orders:orders@localhost:5432/orders",
    port: 3000, host: "0.0.0.0", logLevel: "info", nodeEnv: "production", graphiqlEnabled: false,
  });
});
it("names a missing DATABASE_URL", () => { expect(() => loadEnvironment({})).toThrow(/DATABASE_URL/); });
it("parses PORT as a number and GRAPHIQL_ENABLED as a boolean", ...);
it("rejects an unknown LOG_LEVEL", () => { expect(() => loadEnvironment({ DATABASE_URL: "postgresql://x", LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/); });
it("uses pino-pretty only in development", () => {
  expect(buildLoggerOptions({ ...baseEnvironment, nodeEnv: "development" }).transport).toEqual({ target: "pino-pretty" });
  expect("transport" in buildLoggerOptions({ ...baseEnvironment, nodeEnv: "production" })).toBe(false);
});
```

- [ ] **Passo 3: Rodar e ver falhar** — `npx vitest run tests/unit/config tests/unit/shared/logger-options.test.ts` → FAIL.

- [ ] **Passo 4: Implementar**

`loadEnvironment` com um schema Zod (`GRAPHIQL_ENABLED` aceita `"true"`/`"false"`). `createPrismaClient` usa `new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })`. `registerRequestIdEcho` registra um hook `onRequest` que define o cabeçalho `x-request-id` com `request.id`.

- [ ] **Passo 5: Rodar e ver passar** — mesmo comando → PASS.

- [ ] **Passo 6: Commit** `feat: add environment validation, logger options and request id`

### Tarefa 2.2: Primitivas de paginação

**Arquivos:**
- Criar: `src/shared/pagination/cursor.ts`, `src/shared/pagination/connection.ts`, `src/shared/pagination/page-request.ts`, `src/shared/graphql/bad-user-input.ts`
- Teste: `tests/unit/shared/pagination.test.ts`

**Interfaces:**
- Produz:
  - `encodeCursor(id: number): string` (`base64url("v1:<id>")`) e `decodeCursor(cursor: string): number | null` (nulo para formato inválido, versão diferente de `v1` ou ID fora de 1..2147483647)
  - `type Edge<NodeType> = { cursor: string; node: NodeType }`
  - `type Connection<NodeType> = { edges: Edge<NodeType>[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }`
  - `buildConnection<NodeType extends { id: number }>(rowsWithLookahead: NodeType[], pageSize: number): Connection<NodeType>`
  - `defaultPageSize = 20`, `maximumPageSize = 100`, `type PageRequest = { pageSize: number; afterId: number | null }`
  - `parsePageRequest(connectionArguments: { first?: number | null; after?: string | null }): PageRequest` (lança o erro de `createBadUserInputError`)
  - `createBadUserInputError(message: string): GraphQLError` (`extensions.code = "BAD_USER_INPUT"`)

- [ ] **Passo 1: Escrever os testes que falham**

```ts
it("round-trips a cursor", () => { expect(decodeCursor(encodeCursor(42))).toBe(42); });
it.each(["garbage", toBase64Url("v1:-5"), toBase64Url("v1:abc"), toBase64Url("v2:5"), toBase64Url("v1:2147483648")])(
  "rejects the tampered cursor %s", (cursor) => { expect(decodeCursor(cursor)).toBeNull(); });
it("reports a next page when the lookahead row exists", () => {
  const connection = buildConnection([{ id: 1 }, { id: 2 }, { id: 3 }], 2);
  expect(connection.edges.map((edge) => edge.node.id)).toEqual([1, 2]);
  expect(connection.pageInfo).toEqual({ hasNextPage: true, endCursor: encodeCursor(2) });
});
it("returns a null end cursor for an empty page", () => {
  expect(buildConnection([], 20).pageInfo).toEqual({ hasNextPage: false, endCursor: null });
});
it("defaults the page size", () => { expect(parsePageRequest({})).toEqual({ pageSize: 20, afterId: null }); });
it.each([0, -1, 101])("rejects first = %i", (first) => {
  expect(() => parsePageRequest({ first })).toThrow(expect.objectContaining({ extensions: { code: "BAD_USER_INPUT" } }));
});
it("rejects a tampered after cursor", ...);
it("decodes a valid after cursor", () => { expect(parsePageRequest({ first: 5, after: encodeCursor(7) })).toEqual({ pageSize: 5, afterId: 7 }); });
```

- [ ] **Passo 2: Rodar e ver falhar** — `npx vitest run tests/unit/shared/pagination.test.ts` → FAIL.
- [ ] **Passo 3: Implementar os quatro arquivos.**
- [ ] **Passo 4: Rodar e ver passar** → PASS.
- [ ] **Passo 5: Commit** `feat: add cursor pagination primitives`

### Tarefa 2.3: Erros de domínio e tradução

**Arquivos:**
- Criar: `src/shared/errors/domain-errors.ts`, `src/shared/errors/validation-failure.ts`, `src/shared/errors/database-errors.ts`, `src/shared/graphql/error-payload.ts`
- Teste: `tests/unit/shared/errors.test.ts`

**Interfaces:**
- Produz (`domain-errors.ts`):
  ```ts
  export type FieldViolation = { field: string; message: string };
  export type StockShortage = { productId: number; requested: number; available: number };
  export type ValidationFailure = { kind: "ValidationError"; fields: FieldViolation[] };
  export type EmailAlreadyInUse = { kind: "EmailAlreadyInUseError"; email: string };
  export type UserNotFound = { kind: "UserNotFoundError"; userId: number };
  export type ProductNotFound = { kind: "ProductNotFoundError"; productIds: number[] };
  export type InsufficientStock = { kind: "InsufficientStockError"; items: StockShortage[] };
  export type OrderTotalLimitExceeded = { kind: "OrderTotalLimitExceededError"; limitInCents: number };
  export type DomainError = ValidationFailure | EmailAlreadyInUse | UserNotFound | ProductNotFound | InsufficientStock | OrderTotalLimitExceeded;
  export const domainErrorCodes: Record<DomainError["kind"], string>;
  ```
  Códigos: `BAD_USER_INPUT`, `EMAIL_ALREADY_IN_USE`, `USER_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `INSUFFICIENT_STOCK`, `ORDER_TOTAL_LIMIT_EXCEEDED`.
- `toValidationFailure(error: ZodError): ValidationFailure` (caminho unido por `.`)
- `isUniqueConstraintViolation(error: unknown): boolean` (`P2002` ou `originalCode` `23505`)
- `toErrorPayload(error: DomainError)`: objeto com `__typename` igual a `kind`, `code`, `message` e os campos específicos. Mensagens fixas:
  - `ValidationError`: `"Invalid input."`
  - `EmailAlreadyInUseError`: `"Email is already in use."`
  - `UserNotFoundError`: `"User not found."`
  - `ProductNotFoundError`: `"One or more products were not found."`
  - `InsufficientStockError`: `"Insufficient stock for one or more items."`
  - `OrderTotalLimitExceededError`: `"Order total exceeds the maximum allowed amount."`

- [ ] **Passo 1: Escrever os testes que falham**

```ts
it("flattens Zod issue paths into dotted fields", () => {
  const result = z.object({ items: z.array(z.object({ quantity: z.number().int().min(1) })) }).safeParse({ items: [{ quantity: 0 }] });
  expect(result.success).toBe(false);
  expect(toValidationFailure(result.error).fields.map((violation) => violation.field)).toEqual(["items.0.quantity"]);
});
it("detects unique violations", () => {
  expect(isUniqueConstraintViolation(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7.10.1" }))).toBe(true);
  expect(isUniqueConstraintViolation(new Prisma.PrismaClientKnownRequestError("missing", { code: "P2025", clientVersion: "7.10.1" }))).toBe(false);
  expect(isUniqueConstraintViolation(new Error("other"))).toBe(false);
});
it("maps a domain error to its GraphQL payload", () => {
  expect(toErrorPayload({ kind: "InsufficientStockError", items: [{ productId: 7, requested: 5, available: 2 }] })).toEqual({
    __typename: "InsufficientStockError", code: "INSUFFICIENT_STOCK",
    message: "Insufficient stock for one or more items.", items: [{ productId: 7, requested: 5, available: 2 }],
  });
});
```

Inclua um caso de `toErrorPayload` para cada um dos outros cinco tipos.

- [ ] **Passo 2: Rodar e ver falhar** — `npx vitest run tests/unit/shared/errors.test.ts` → FAIL.
- [ ] **Passo 3: Implementar.** `toErrorPayload` usa um `switch` exaustivo sobre `kind`.
- [ ] **Passo 4: Rodar e ver passar** → PASS.
- [ ] **Passo 5: Commit** `feat: add domain error model and translations`

### Tarefa 2.4: Fábrica da aplicação

**Arquivos:**
- Criar: `src/shared/graphql/base.graphql`, `src/shared/graphql/base-type-defs.ts`, `src/shared/graphql/graphql-module.ts`, `src/shared/graphql/error-formatter.ts`, `src/shared/http/health-route.ts`, `src/app.ts`, `tests/helpers/graphql.ts`, `tests/helpers/test-environment.ts`
- Modificar: `package.json` (`check` passa a usar `npm run test:coverage`), `vitest.config.ts` (`coverage.thresholds.lines: 80`)
- Teste: `tests/integration/app/app.test.ts`

**Interfaces:**
- Consome: Tarefas 2.1 a 2.3.
- Produz:
  ```ts
  export type ModuleDependencies = { prisma: PrismaClient; logger: FastifyBaseLogger };
  export type GraphqlModule = { typeDefs: string; resolvers: IResolvers; loaders: MercuriusLoaders };
  export type BuildAppOptions = { environment: Environment; prisma: PrismaClient; createGraphqlModules: (dependencies: ModuleDependencies) => GraphqlModule[] };
  export function buildApp(options: BuildAppOptions): Promise<FastifyInstance>;
  export const baseTypeDefs: string;
  export function executeGraphql<ResponseData>(app: FastifyInstance, document: string, variables?: Record<string, unknown>, headers?: Record<string, string>): Promise<{ statusCode: number; headers: Record<string, unknown>; data: ResponseData | null; errors: Array<{ message: string; extensions?: Record<string, unknown> }> }>;
  export const testEnvironment: Environment;
  ```
  `testEnvironment`: `databaseUrl: testDatabaseUrl`, `logLevel: "silent"`, `nodeEnv: "test"`, `graphiqlEnabled: false`, `port: 0`, `host: "127.0.0.1"`.
- `base.graphql`: `interface Error`, `enum ErrorCode`, `FieldError`, `ValidationError`, `PageInfo`, `type Query` e `type Mutation` sem campos (os módulos usam `extend type`), todos com descrições.
- `buildApp`: Fastify com `logger: buildLoggerOptions(...)`, `requestIdHeader: "x-request-id"`, `genReqId: generateRequestId`; `registerRequestIdEcho`; `registerHealthRoute`; Mercurius com `schema` = base + `typeDefs` dos módulos unidos por `"\n"`, resolvers e loaders mesclados por tipo, `graphiql: environment.graphiqlEnabled`, `queryDepth: 10`, `errorFormatter`.
- `error-formatter.ts`: preserva `GRAPHQL_PARSE_FAILED` (mensagem iniciada por `Syntax Error`), `GRAPHQL_VALIDATION_FAILED` (erros sem `path`) e `BAD_USER_INPUT`. Qualquer outro erro vira `{ message: "Internal server error", extensions: { code: "INTERNAL_SERVER_ERROR", requestId } }`, e o erro original é registrado com `request.log.error`. O status HTTP do Mercurius é mantido.
- `health-route.ts`: `GET /health` → `200 { status: "ok" }` se `SELECT 1` responde; `503 { status: "unavailable" }` caso contrário.

- [ ] **Passo 1: Escrever os testes que falham**

Um módulo de sonda, definido só no teste:

```ts
const probeModule: GraphqlModule = {
  typeDefs: "extend type Query { failUnexpectedly: String! rejectInput: String! root: ProbeNode! } type ProbeNode { name: String! child: ProbeNode! }",
  resolvers: { Query: { failUnexpectedly: () => { throw new Error("database password leaked"); }, rejectInput: () => { throw createBadUserInputError("first must be between 1 and 100"); }, root: () => ({ name: "root" }) }, ProbeNode: { child: () => ({ name: "child" }) } },
  loaders: {},
};
```

Testes:
- `GET /health` → 200 `{ status: "ok" }`.
- `GET /health` com Prisma em `postgresql://orders:orders@127.0.0.1:1/none` → 503 `{ status: "unavailable" }`.
- `{ failUnexpectedly }` com cabeçalho `x-request-id: req-test-123` → `errors[0]` igual a `{ message: "Internal server error", extensions: { code: "INTERNAL_SERVER_ERROR", requestId: "req-test-123" } }`, corpo sem `password` e cabeçalho de resposta `x-request-id` igual a `req-test-123`.
- Sem cabeçalho de entrada, o `x-request-id` da resposta é um UUID.
- `{ rejectInput }` → `extensions.code` `BAD_USER_INPUT` e a mensagem original.
- `{ root {` → `GRAPHQL_PARSE_FAILED`; `{ unknownField }` → `GRAPHQL_VALIDATION_FAILED`.
- Query com `child` aninhado 11 vezes → `GRAPHQL_VALIDATION_FAILED`.
- `GET /graphiql` → 404 com `graphiqlEnabled: false` e 200 com `true`.

- [ ] **Passo 2: Rodar e ver falhar** — `npx vitest run tests/integration/app` → FAIL.
- [ ] **Passo 3: Implementar os arquivos listados.**
- [ ] **Passo 4: Rodar e ver passar** → PASS.
- [ ] **Passo 5: Commit** `feat: add application factory with error masking and health check`
- [ ] **Passo 6: Fechamento da etapa 2** (procedimento comum)

---

## Etapa 3 — `feat/users-products` (Sonnet)

### Tarefa 3.1: Geração de tipos GraphQL e módulo de usuários

**Arquivos:**
- Criar: `scripts/generate-graphql-types.ts`, `src/modules/application-type-defs.ts`, `src/modules/application-modules.ts`, `src/modules/users/users.graphql`, `src/modules/users/users.type-defs.ts`, `src/modules/users/users.types.ts`, `src/modules/users/users.schemas.ts`, `src/modules/users/users.repository.ts`, `src/modules/users/users.service.ts`, `src/modules/users/users.resolvers.ts`, `tests/helpers/app.ts`
- Modificar: `package.json` (`generate` = `prisma generate && node scripts/generate-graphql-types.ts`)
- Teste: `tests/integration/users/users.test.ts`

**Interfaces:**
- Consome: Etapa 2.
- Produz:
  ```ts
  export type UserRecord = { id: number; name: string; email: string; createdAt: Date };
  export type CreateUserOutcome = { kind: "UserCreated"; user: UserRecord } | ValidationFailure | EmailAlreadyInUse;
  export const createUserInputSchema;
  export type CreateUserInput = z.infer<typeof createUserInputSchema>;
  export function insertUser(database: DatabaseClient, input: CreateUserInput): Promise<UserRecord | null>;
  export function findUsersAfter(database: DatabaseClient, pageRequest: PageRequest): Promise<UserRecord[]>;
  export function createUsersService(dependencies: { prisma: PrismaClient }): { createUser(input: unknown): Promise<CreateUserOutcome>; listUsers(pageRequest: PageRequest): Promise<Connection<UserRecord>> };
  export function createUsersModule(dependencies: ModuleDependencies): GraphqlModule;
  export const applicationTypeDefs: string[];
  export function createApplicationModules(dependencies: ModuleDependencies): GraphqlModule[];
  export function buildTestApp(prisma: PrismaClient): Promise<FastifyInstance>;
  ```
  - `insertUser` retorna `null` quando `isUniqueConstraintViolation`.
  - `findUsersAfter` busca `pageSize + 1` linhas com `id > afterId`, ordenadas por `id ASC`.
  - Codegen: saída `src/generated/graphql.ts`, plugins `typescript` e `typescript-resolvers`, config `useTypeImports: true`, `enumsAsTypes: true`, `contextType: "mercurius#MercuriusContext"`, `scalars: { ID: { input: "string", output: "string | number" } }`, `mappers` de cada tipo GraphQL para o registro de domínio (`User: "../modules/users/users.types.ts#UserRecord"`, `UserConnection`/`UserEdge` para aliases de `Connection<UserRecord>`/`Edge<UserRecord>` em `users.types.ts`).
  - O resolver de `User.createdAt` retorna `toISOString()`. A mutation mapeia `UserCreated` para o usuário com `__typename: "User"` e os erros para `toErrorPayload`.

- [ ] **Passo 1: Criar a branch** `git checkout main && git checkout -b feat/users-products`

- [ ] **Passo 2: Escrever os testes que falham** (`beforeEach`: `truncateAllTables`; queries em constantes nomeadas)

- Cria o usuário com `name: "  Ana Souza  "` e `email: " Ana@Example.com "` → `__typename: "User"`, `name: "Ana Souza"`, `email: "ana@example.com"`, `id` string, `createdAt` casando `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/`.
- `name: "   "` e `email: "not-an-email"` → `ValidationError`, `code: "BAD_USER_INPUT"`, `message: "Invalid input."`, campos `["email", "name"]` (ordenados no teste).
- Nome com 101 caracteres → campo `name`; e-mail com 255 caracteres → campo `email`.
- Cria `"Ana@Example.com"` e depois `"ANA@example.com"` → `EmailAlreadyInUseError` com `email: "ana@example.com"` (Foco de revisão 1).
- 10 `createUser` em paralelo com o mesmo e-mail → exatamente 1 `User` e 9 `EmailAlreadyInUseError`; `count` na tabela = 1 (Foco de revisão 5).
- Três usuários: `users(first: 2)` → 2 arestas com IDs crescentes e `hasNextPage: true`; `users(first: 2, after: endCursor)` → 1 aresta e `hasNextPage: false`.
- `users(first: 101)` e `users(after: "garbage")` → `errors[0].extensions.code` igual a `BAD_USER_INPUT` (Foco de revisão 2).

- [ ] **Passo 3: Rodar e ver falhar** — `npx vitest run tests/integration/users` → FAIL.
- [ ] **Passo 4: Implementar** o script de codegen, o SDL com descrições e as camadas do módulo. Em seguida, `npm run generate`.
- [ ] **Passo 5: Rodar e ver passar** — `npx vitest run tests/integration/users && npm run typecheck` → PASS.
- [ ] **Passo 6: Commit** `feat: add users module with typed GraphQL contract`

### Tarefa 3.2: Módulo de produtos

**Arquivos:**
- Criar: `src/modules/products/products.graphql`, `products.type-defs.ts`, `products.types.ts`, `products.schemas.ts`, `products.repository.ts`, `products.service.ts`, `products.resolvers.ts`
- Modificar: `src/modules/application-type-defs.ts`, `src/modules/application-modules.ts`, `scripts/generate-graphql-types.ts` (mappers)
- Teste: `tests/integration/products/products.test.ts`

**Interfaces:**
- Produz:
  ```ts
  export type ProductRecord = { id: number; name: string; priceInCents: number; stock: number; createdAt: Date };
  export type CreateProductOutcome = { kind: "ProductCreated"; product: ProductRecord } | ValidationFailure;
  export function insertProduct(database: DatabaseClient, input: CreateProductInput): Promise<ProductRecord>;
  export function findProductsAfter(database: DatabaseClient, pageRequest: PageRequest): Promise<ProductRecord[]>;
  export function findProductsByIds(database: DatabaseClient, productIds: readonly number[]): Promise<ProductRecord[]>;
  export function createProductsService(dependencies: { prisma: PrismaClient }): { createProduct(input: unknown): Promise<CreateProductOutcome>; listProducts(pageRequest: PageRequest): Promise<Connection<ProductRecord>> };
  export function createProductsModule(dependencies: ModuleDependencies): GraphqlModule;
  ```

- [ ] **Passo 1: Escrever os testes que falham**

- `priceInCents: 0` e `stock: 0` são aceitos → `Product` com os mesmos valores.
- `name: ""`, `priceInCents: -1`, `stock: -5` → `ValidationError` com campos `["name", "priceInCents", "stock"]`.
- Dois produtos com o mesmo nome → os dois retornam `Product`.
- Estabilidade: três produtos; `products(first: 2)`; insere um quarto; `products(first: 2, after: endCursor)` → IDs `[3, 4]` sem repetição.
- `products(first: 0)` → `BAD_USER_INPUT`.

- [ ] **Passo 2: Rodar e ver falhar** — `npx vitest run tests/integration/products` → FAIL.
- [ ] **Passo 3: Implementar** seguindo o mesmo padrão do módulo de usuários; `npm run generate`.
- [ ] **Passo 4: Rodar e ver passar** → PASS.
- [ ] **Passo 5: Commit** `feat: add products module`

### Tarefa 3.3: Ponto de entrada do servidor

**Arquivos:**
- Criar: `src/server.ts`

**Interfaces:**
- Produz: `startServer(): Promise<FastifyInstance>`, que carrega o ambiente, cria o Prisma, chama `buildApp` com `createApplicationModules` e faz `listen` em `{ port, host }`. O arquivo termina chamando `await startServer()`.

- [ ] **Passo 1: Implementar** `src/server.ts`.
- [ ] **Passo 2: Verificar manualmente**

Run: `cp .env.example .env && docker compose up -d db && npm run db:migrate && npm run dev`, depois `curl http://localhost:3000/health`
Expected: `{"status":"ok"}`. Abrir `http://localhost:3000/graphiql` mostra o painel Docs com as descrições de `User` e `Product`. Encerrar o processo.

- [ ] **Passo 3: Commit** `feat: add server entry point`
- [ ] **Passo 4: Fechamento da etapa 3** (procedimento comum)

---

## Etapa 4 — `feat/orders` (Opus)

### Tarefa 4.1: Regras puras do pedido e validação

**Arquivos:**
- Criar: `src/modules/orders/orders.types.ts`, `src/modules/orders/orders.rules.ts`, `src/modules/orders/orders.schemas.ts`
- Teste: `tests/unit/orders/orders-rules.test.ts`, `tests/unit/orders/orders-schemas.test.ts`

**Interfaces:**
- Produz:
  ```ts
  export type RequestedItem = { productId: number; quantity: number };
  export type LockedProduct = { id: number; priceInCents: number; stock: number };
  export type OrderRecord = { id: number; userId: number; totalInCents: number; createdAt: Date };
  export type OrderItemRecord = { id: number; orderId: number; productId: number; quantity: number; unitPriceInCents: number };
  export type CreateOrderOutcome = { kind: "OrderCreated"; order: OrderRecord } | ValidationFailure | UserNotFound | ProductNotFound | InsufficientStock | OrderTotalLimitExceeded;
  export const maximumAmountInCents = 2_147_483_647;
  export function findMissingProductIds(requestedItems: readonly RequestedItem[], lockedProducts: readonly LockedProduct[]): number[];
  export function findStockShortages(requestedItems: readonly RequestedItem[], lockedProducts: readonly LockedProduct[]): StockShortage[];
  export function calculateOrderTotal(requestedItems: readonly RequestedItem[], lockedProducts: readonly LockedProduct[]): number | null;
  export const createOrderInputSchema;
  ```
  - O schema converte para `{ userId: number; items: RequestedItem[] }`. IDs válidos casam `^[1-9]\d*$` e ficam ≤ 2147483647. De 1 a 100 itens. `quantity` inteiro ≥ 1. `productId` repetido gera uma issue em `["items", índice, "productId"]` com a mensagem `"Duplicate product in order."`.
  - `calculateOrderTotal` soma item a item e retorna `null` assim que o acumulado ultrapassa `maximumAmountInCents`.
  - `findMissingProductIds` retorna os IDs em ordem crescente.

- [ ] **Passo 1: Criar a branch** `git checkout main && git checkout -b feat/orders`

- [ ] **Passo 2: Escrever os testes que falham**

```ts
const locked: LockedProduct[] = [{ id: 1, priceInCents: 1990, stock: 2 }, { id: 2, priceInCents: 500, stock: 9 }];
it("sums the total in cents", () => {
  expect(calculateOrderTotal([{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }], locked)).toBe(4480);
});
it("accepts a total exactly at the limit", () => {
  expect(calculateOrderTotal([{ productId: 9, quantity: 1 }], [{ id: 9, priceInCents: 2_147_483_647, stock: 1 }])).toBe(2_147_483_647);
});
it("rejects a total one cent above the limit", () => {
  expect(calculateOrderTotal([{ productId: 9, quantity: 1 }, { productId: 8, quantity: 1 }], [{ id: 9, priceInCents: 2_147_483_647, stock: 1 }, { id: 8, priceInCents: 1, stock: 1 }])).toBeNull();
});
it("rejects huge products without precision loss", () => {
  expect(calculateOrderTotal([{ productId: 9, quantity: 2_147_483_647 }], [{ id: 9, priceInCents: 2_147_483_647, stock: 2_147_483_647 }])).toBeNull();
});
it("lists every missing product in ascending order", () => {
  expect(findMissingProductIds([{ productId: 3, quantity: 1 }, { productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }], [{ id: 1, priceInCents: 1, stock: 1 }])).toEqual([2, 3]);
});
it("lists every stock shortage", () => {
  expect(findStockShortages([{ productId: 1, quantity: 5 }, { productId: 2, quantity: 1 }], locked)).toEqual([{ productId: 1, requested: 5, available: 2 }]);
});
```

Schema: `{ userId: "7", items: [{ productId: "3", quantity: 2 }] }` → `{ userId: 7, items: [{ productId: 3, quantity: 2 }] }`; `userId: "abc"` → issue em `userId`; `productId: "99999999999"` → `items.0.productId` (Foco de revisão 3); `items: []` → `items`; 101 itens → `items`; produto repetido → `items.1.productId` com `"Duplicate product in order."`; `quantity: 0` → `items.0.quantity`.

- [ ] **Passo 3: Rodar e ver falhar** — `npx vitest run tests/unit/orders` → FAIL.
- [ ] **Passo 4: Implementar.**
- [ ] **Passo 5: Rodar e ver passar** → PASS.
- [ ] **Passo 6: Commit** `feat: add order rules and input validation`

### Tarefa 4.2: Transação do pedido, repository e contrato GraphQL

**Arquivos:**
- Criar: `src/modules/orders/orders.graphql`, `orders.type-defs.ts`, `orders.repository.ts`, `orders.service.ts`, `orders.loaders.ts`, `orders.resolvers.ts`
- Modificar: `src/modules/application-type-defs.ts`, `src/modules/application-modules.ts`, `scripts/generate-graphql-types.ts`
- Teste: `tests/integration/orders/orders.test.ts`

**Interfaces:**
- Consome: Tarefa 4.1; `findProductsByIds` (Tarefa 3.2).
- Produz:
  ```ts
  export type NewOrder = { userId: number; totalInCents: number; items: Array<{ productId: number; quantity: number; unitPriceInCents: number }> };
  export function userExists(database: DatabaseClient, userId: number): Promise<boolean>;
  export function lockProducts(database: DatabaseClient, productIds: readonly number[]): Promise<LockedProduct[]>;
  export function decrementStock(database: DatabaseClient, requestedItems: readonly RequestedItem[]): Promise<void>;
  export function insertOrder(database: DatabaseClient, order: NewOrder): Promise<OrderRecord>;
  export function findItemsByOrderIds(database: DatabaseClient, orderIds: readonly number[]): Promise<OrderItemRecord[]>;
  export const orderTransactionOptions = { maxWait: 5_000, timeout: 10_000 };
  export function createOrdersService(dependencies: { prisma: PrismaClient; logger: FastifyBaseLogger }): { createOrder(input: unknown): Promise<CreateOrderOutcome> };
  export function createOrdersLoaders(prisma: PrismaClient): MercuriusLoaders;
  export function createOrdersModule(dependencies: ModuleDependencies): GraphqlModule;
  ```
  - `lockProducts` executa via `$queryRaw` o SQL do passo 4 da seção 6.1 da spec (`ORDER BY id FOR NO KEY UPDATE`), com os IDs já ordenados.
  - `decrementStock` executa via `$executeRaw` o `UPDATE ... FROM unnest(...)` do passo 8.
  - `insertOrder` usa `create` com `items: { createMany }`.
  - O service segue os passos 1 a 9 da seção 6.1, dentro de `prisma.$transaction(callback, orderTransactionOptions)`. Erros esperados são retornados pelo callback antes de qualquer escrita. Registra `{ event: "order.created", orderId, userId, itemsCount, totalInCents }` e `{ event: "order.rejected", code }` em nível `info`.
  - Loaders: `Order.items` (via `findItemsByOrderIds`, ordenado por `id`) e `OrderItem.product` (via `findProductsByIds`). Cada um devolve os resultados na ordem das consultas recebidas.
  - `Order.createdAt` (assim como `Product.createdAt` na Tarefa 3.2) retorna `toISOString()`.
  - `orders.graphql` contém `Order`, `OrderItem`, os quatro tipos de erro do pedido, `StockShortage`, `CreateOrderInput`, `OrderItemInput`, `CreateOrderResult` e `extend type Mutation { createOrder }`.

- [ ] **Passo 1: Escrever os testes que falham** (fixtures criadas via Prisma em funções nomeadas do próprio arquivo de teste)

- Caminho feliz: produtos A (1990, estoque 5) e B (500, estoque 3); pedido `[{A, 2}, {B, 1}]` → `Order` com `totalInCents: 4480` e itens com `unitPriceInCents` e `product { name }`; estoque passa a A = 3 e B = 2.
- Foto do preço: depois do pedido, o preço de A muda para 2500 → o item continua com `unitPriceInCents: 1990`.
- `userId: "999999"` → `UserNotFoundError` com `userId: "999999"`.
- Dois produtos inexistentes → `ProductNotFoundError` com `productIds` em ordem crescente; estoques inalterados.
- Dois itens sem estoque suficiente → `InsufficientStockError` listando os dois; estoques inalterados.
- Produto com preço 2147483647 e estoque 2: `quantity: 1` → `Order` com `totalInCents: 2147483647`; `quantity: 2` → `OrderTotalLimitExceededError` com `limitInCents: 2147483647` (Foco de revisão 4).
- Precedência: um produto inexistente e outro sem estoque no mesmo pedido → `ProductNotFoundError`.
- `items: []` → `ValidationError` com o campo `items`.

- [ ] **Passo 2: Rodar e ver falhar** — `npx vitest run tests/integration/orders/orders.test.ts` → FAIL.
- [ ] **Passo 3: Implementar**; `npm run generate`.
- [ ] **Passo 4: Rodar e ver passar** → PASS.
- [ ] **Passo 5: Commit** `feat: add order placement with ordered row locking`

### Tarefa 4.3: Testes de concorrência e deadlock

**Arquivos:**
- Teste: `tests/integration/orders/orders-concurrency.test.ts`

- [ ] **Passo 1: Escrever os testes**

```ts
it("sells exactly the available stock under 50 concurrent orders", async () => {
  const outcomes = await Promise.all(Array.from({ length: 50 }, () => placeOrder(app, userId, [{ productId, quantity: 1 }])));
  expect(countByTypename(outcomes, "Order")).toBe(10);
  expect(countByTypename(outcomes, "InsufficientStockError")).toBe(40);
  expect(await readStock(prisma, productId)).toBe(0);
});
it("completes crossed orders without deadlock", async () => {
  const rounds = Array.from({ length: 20 }, () => Promise.all([
    placeOrder(app, userId, [{ productId: firstProductId, quantity: 1 }, { productId: secondProductId, quantity: 1 }]),
    placeOrder(app, userId, [{ productId: secondProductId, quantity: 1 }, { productId: firstProductId, quantity: 1 }]),
  ]));
  const outcomes = (await Promise.all(rounds)).flat();
  expect(countByTypename(outcomes, "Order")).toBe(40);
  expect(await readStock(prisma, firstProductId)).toBe(60);
});
```

Estoque inicial: 10 no primeiro teste; 100 para cada produto no segundo. `placeOrder`, `countByTypename` e `readStock` são funções nomeadas do próprio arquivo.

- [ ] **Passo 2: Rodar** — `npx vitest run tests/integration/orders/orders-concurrency.test.ts` → PASS. Se falhar, investigue a causa (bloqueio, ordenação, opções da transação) antes de qualquer ajuste.
- [ ] **Passo 3: Commit** `test: prove stock integrity and deadlock freedom under concurrency`
- [ ] **Passo 4: Fechamento da etapa 4** (procedimento comum)

---

## Etapa 5 — `feat/listing-loaders` (Sonnet + revisão Opus)

### Tarefa 5.1: Pedidos do usuário como connection

**Arquivos:**
- Modificar: `src/modules/orders/orders.graphql` (`extend type User { orders(first: Int = 20, after: String): OrderConnection! }`, `OrderEdge`, `OrderConnection`), `orders.repository.ts`, `orders.loaders.ts`, `scripts/generate-graphql-types.ts`
- Teste: `tests/integration/orders/user-orders.test.ts`

**Interfaces:**
- Produz: `findRecentOrdersByUserIds(database: DatabaseClient, userIds: readonly number[], pageRequest: PageRequest): Promise<OrderRecord[]>`. O loader `User.orders` agrupa as consultas por `first`/`after`, chama `parsePageRequest` uma vez por grupo e monta `buildConnection` por usuário.

```sql
SELECT id, user_id, total_cents, created_at
FROM (
  SELECT id, user_id, total_cents, created_at,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id DESC) AS position
  FROM orders
  WHERE user_id = ANY($1::int[]) AND ($2::int IS NULL OR id < $2)
) AS ranked
WHERE position <= $3
ORDER BY user_id, id DESC
```

`$3` = `pageSize + 1`.

- [ ] **Passo 1: Criar a branch** `git checkout main && git checkout -b feat/listing-loaders`
- [ ] **Passo 2: Escrever os testes que falham**

- Usuário 1 com três pedidos e usuário 2 com um: `users { edges { node { orders(first: 2) {...} } } }` → usuário 1 com os dois mais recentes (IDs decrescentes) e `hasNextPage: true`; usuário 2 com um pedido e `hasNextPage: false`.
- `orders(first: 2, after: endCursor)` → o pedido mais antigo do usuário 1.
- Usuário sem pedidos → `edges: []`.
- `orders(first: 101)` → `BAD_USER_INPUT`.

- [ ] **Passo 3: Rodar e ver falhar** — `npx vitest run tests/integration/orders/user-orders.test.ts` → FAIL.
- [ ] **Passo 4: Implementar**; `npm run generate`.
- [ ] **Passo 5: Rodar e ver passar** → PASS.
- [ ] **Passo 6: Commit** `feat: list user orders through a batched connection`

### Tarefa 5.2: Prova do N+1

**Arquivos:**
- Criar: `tests/helpers/query-counter.ts`
- Teste: `tests/integration/orders/query-count.test.ts`

**Interfaces:**
- Produz: `createQueryCountingPrismaClient(): { prisma: PrismaClient; readQueryCount(): number; resetQueryCount(): void }`

- [ ] **Passo 1: Verificar o mecanismo de contagem** (validação pendente 4 da spec)

Abordagem preferida: `new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] })` com `$on("query", ...)`. Confirme que os eventos disparam com o adaptador pg e que o cliente é aceito por `buildApp`. Alternativa: contar as chamadas `query` de um `pg.Pool` instrumentado passado ao `PrismaPg`, o que exige `pg` como dependência direta verificada pela política. Se nenhuma funcionar, pare e reporte ao usuário.

- [ ] **Passo 2: Escrever o teste**

```ts
it("resolves users, orders, items and products with exactly four queries", async () => {
  await seedUsersWithOrders(prisma, { users: 3, ordersPerUser: 2, itemsPerOrder: 2 });
  resetQueryCount();
  const response = await executeGraphql(app, usersWithOrdersAndProductsQuery);
  expect(response.errors).toEqual([]);
  expect(readQueryCount()).toBe(4);
});
it("keeps four queries when the number of users doubles", ...);
```

- [ ] **Passo 3: Rodar e ver passar** — `npx vitest run tests/integration/orders/query-count.test.ts` → PASS.
- [ ] **Passo 4: Commit** `test: prove constant query count for nested listing`
- [ ] **Passo 5: Revisão do Opus** sobre o SQL de janela e os loaders, seguida do fechamento da etapa 5 (procedimento comum).

---

## Etapa 6 — `feat/docker-demo` (Sonnet)

### Tarefa 6.1: Desligamento seguro

**Arquivos:**
- Criar: `src/shared/http/graceful-shutdown.ts`
- Modificar: `src/server.ts`
- Teste: `tests/unit/shared/graceful-shutdown.test.ts`

**Interfaces:**
- Produz: `registerGracefulShutdown(dependencies: { app: Pick<FastifyInstance, "close" | "log">; prisma: Pick<PrismaClient, "$disconnect">; processEvents: Pick<NodeJS.EventEmitter, "once"> }): void`, que trata `SIGTERM` e `SIGINT`.

- [ ] **Passo 1: Criar a branch** `git checkout main && git checkout -b feat/docker-demo`
- [ ] **Passo 2: Escrever o teste que falha**

```ts
it("closes the server before disconnecting the database on SIGTERM", async () => {
  const calls: string[] = [];
  const processEvents = new EventEmitter();
  registerGracefulShutdown({ app: { close: async () => { calls.push("close"); }, log: silentLogger }, prisma: { $disconnect: async () => { calls.push("disconnect"); } }, processEvents });
  processEvents.emit("SIGTERM");
  await vi.waitFor(() => { expect(calls).toEqual(["close", "disconnect"]); });
});
```

- [ ] **Passo 3: Rodar e ver falhar → implementar → rodar e ver passar** — `npx vitest run tests/unit/shared/graceful-shutdown.test.ts`.
- [ ] **Passo 4: Ligar** em `src/server.ts` com `processEvents: process`.
- [ ] **Passo 5: Commit** `feat: shut down gracefully on termination signals`

### Tarefa 6.2: Dockerfile e Compose completo

**Arquivos:**
- Criar: `Dockerfile`, `.dockerignore`
- Modificar: `docker-compose.yml`

- [ ] **Passo 1: Criar o `Dockerfile`**

Imagem decidida na Tarefa 1.4. Etapas:
- `deps`: `npm ci`.
- `verify`: copia o projeto e executa `npm run generate` e `npm run typecheck`.
- `runtime`: `npm ci --omit=dev`, copia `src/`, `prisma/`, `prisma.config.ts` e `src/generated/` da etapa `verify`; `ENV NODE_ENV=production`; `USER node`; `EXPOSE 3000`; `CMD ["node", "src/server.ts"]`.

`.dockerignore`: `node_modules`, `coverage`, `.env`, `.git`.

- [ ] **Passo 2: Completar o `docker-compose.yml`** conforme a tabela da seção 12 da spec

- `migrate`: `target: verify`, `command: ["npx", "prisma", "migrate", "deploy"]`, depende de `db` saudável.
- `api`: `target: runtime`, `init: true`, porta `3000:3000`, depende de `migrate` com `service_completed_successfully`, healthcheck `["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"]`.
- `test`: `target: verify`, perfil `tools`, `TEST_DATABASE_URL` apontando para `db-test:5432`, `command: ["npm", "test"]`.
- `demo`: `target: verify`, perfil `tools`, `API_URL=http://api:3000/graphql`, depende de `api` saudável, `command: ["npm", "run", "demo"]` (o script nasce na Tarefa 6.3).

- [ ] **Passo 3: Verificar**

Run: `docker compose down -v && docker compose up -d --build && docker compose ps`
Expected: `api` em `healthy` e `migrate` encerrado com código 0.

Run: `docker compose run --rm test`
Expected: todos os testes passam.

Run: `docker compose stop api && docker compose logs api --tail 5`
Expected: encerramento limpo, sem erro.

- [ ] **Passo 4: Commit** `feat: containerize the api with migrations and health checks`

### Tarefa 6.3: Script de demonstração

**Arquivos:**
- Criar: `scripts/demo.ts`

**Interfaces:**
- Produz funções nomeadas, cada uma com até 30 linhas: `sendGraphqlRequest(document: string, variables: Record<string, unknown>): Promise<GraphqlResponse>`, `seedDemoCatalog(): Promise<DemoCatalog>`, `runConcurrencyScenario(catalog: DemoCatalog): Promise<void>`, `showErrorCatalog(catalog: DemoCatalog): Promise<void>`, `showUsersWithOrders(): Promise<void>`, `runDemo(): Promise<void>`. `API_URL` tem padrão `http://localhost:3000/graphql`; os e-mails levam um sufixo único por execução.
- Saída em pt-BR. A linha de resumo da concorrência é exatamente: `✔ 10 aceitos · 40 InsufficientStockError · estoque final 0`.

- [ ] **Passo 1: Implementar** `scripts/demo.ts` seguindo a seção 15 da spec.
- [ ] **Passo 2: Verificar**

Run: `docker compose run --rm demo` (duas vezes seguidas)
Expected: nas duas execuções aparecem a linha de resumo da concorrência, uma requisição e uma resposta de cada erro do catálogo, e a listagem paginada.

- [ ] **Passo 3: Commit** `feat: add runnable demonstration of the api behavior`
- [ ] **Passo 4: Fechamento da etapa 6** (procedimento comum)

---

## Etapa 7 — `docs/readme` (Sonnet + revisão Opus)

### Tarefa 7.1: README

**Arquivos:**
- Criar: `README.md`

- [ ] **Passo 1: Criar a branch** `git checkout main && git checkout -b docs/readme`
- [ ] **Passo 2: Escrever o README em pt-BR**, com as seções da seção 16 da spec. As decisões vêm da seção 18, os limites e evoluções das seções 1.2, 6.3 e 6.4, e os comandos da seção 12. Inclua exemplos de `createOrder` com sucesso e com `InsufficientStockError`.
- [ ] **Passo 3: Revisão do Opus:** cada afirmação do README confere com o código e com a spec, e o texto descreve um projeto independente.
- [ ] **Passo 4: Verificação final a partir do zero**

Run: `docker compose down -v && docker compose up -d --build && docker compose run --rm demo && docker compose run --rm test && npm run check`
Expected: tudo com sucesso.

- [ ] **Passo 5: Commit** `docs: add project readme`
- [ ] **Passo 6: Fechamento da etapa 7** (procedimento comum) e demonstração do GraphiQL ao usuário (painel Docs com as descrições).
