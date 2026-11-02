# orders-api — Especificação de design

- **Data:** 2026-11-02
- **Status:** aprovada
- **Idioma:** documentos em pt-BR; código, SDL e mensagens de erro da API em inglês

## 1. Visão geral

API GraphQL para gestão de pedidos: cadastro e listagem de usuários com seus pedidos, cadastro e listagem de produtos e emissão de pedidos de compra. O requisito central é a **integridade do estoque sob pedidos simultâneos**: um pedido que não puder ser atendido por falta de estoque é rejeitado com um erro tipado, e o estoque nunca fica negativo.

### 1.1 Funcionalidades

| Funcionalidade | Operação GraphQL |
|---|---|
| Cadastrar usuário | `mutation createUser` |
| Listar usuários e seus pedidos | `query users` → `User.orders` → `Order.items` → `OrderItem.product` |
| Cadastrar produto | `mutation createProduct` |
| Listar produtos | `query products` |
| Emitir pedido | `mutation createOrder` |

### 1.2 Fora do escopo (documentado no README como evolução)

Autenticação e autorização, pagamento, reserva de estoque com expiração, status e cancelamento de pedido, múltiplas moedas, `totalCount` nas listagens, rate limiting, site de documentação estático, pipeline de CI e tabela de estoque separada para "linhas quentes".

## 2. Stack e versões (todas fixadas em versão exata)

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js (execução nativa de TypeScript por remoção de tipos) | 24.22.2 |
| Linguagem / verificação de tipos | TypeScript | 7.0.2 |
| Banco | PostgreSQL | 18.6 (imagem `postgres:18.6-alpine`) |
| HTTP | Fastify | 5.12.8 |
| GraphQL | Mercurius / graphql | 16.12.1 / 17.0.2 |
| Acesso a dados | Prisma (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) | 7.10.1 |
| Validação | Zod | 4.6.7 |
| Geração de tipos GraphQL | `@graphql-codegen/core` 6.2.2, `@graphql-codegen/typescript` 6.1.2, `@graphql-codegen/typescript-resolvers` 6.1.1 | — |
| Testes | Vitest + `@vitest/coverage-v8` | 5.1.0 |
| Lint e format | Biome | 2.6.4 |
| Logs (formatação em desenvolvimento) | pino-pretty | 13.2.0 |
| Verificação de comentários | acorn | 8.19.0 |
| Tipos do Node | @types/node | 24.19.2 |
| Gerenciador de pacotes | npm | 11.19.1 |

### 2.1 Política de dependências

- `.npmrc` com `save-exact=true`, `engine-strict=true` e `fund=false`; `engines.node` = `>=24.22.2 <25`.
- `package-lock.json` versionado; Docker e scripts instalam com `npm ci`.
- **Zero** `npm warn deprecated` e **zero** vulnerabilidades no `npm audit`. Verificado em instalação limpa em 2026-11-02: 354 pacotes, 0 vulnerabilidades, 0 depreciados, 0 avisos.
- `overrides`: `glob` 14.0.3 e `minimatch` 11.0.4. Motivo: `mercurius` → `@fastify/static@10.1.8` exige `glob ^13`, afetado por GHSA-3g3m-2fjr-6pw4, que depende de `minimatch@10`, afetado por GHSA-g3hv-75wg-m249. O override aplica as versões corrigidas e deve ser removido quando `@fastify/static` corrigir na origem. A correção automática do npm (rebaixar `mercurius` para 13.3.3, feito para Fastify 4) foi rejeitada.
- `@graphql-codegen/core` é usado por script próprio em vez de `@graphql-codegen/cli`, que traz `minimatch` vulnerável, `node-domexception` depreciado e carregadores remotos sem uso (213 pacotes a menos).
- `allowScripts` aprova apenas `prisma@7.10.1` e `@prisma/engines@7.10.1`.
- Nenhuma dependência para carregar `.env`: Node usa `--env-file-if-exists=.env` e o `prisma.config.ts` usa `process.loadEnvFile`.
- Toda dependência nova passa pelo mesmo procedimento antes de entrar no projeto.

## 3. Arquitetura

### 3.1 Estrutura

```
src/
  server.ts                  inicia o processo: config → app → listen → desligamento seguro
  app.ts                     monta Fastify + Mercurius e injeta dependências (composition root)
  config/env.ts              variáveis de ambiente validadas com Zod
  shared/
    database/                PrismaClient com adaptador pg
    errors/                  tipos de erro N2, tradução de erros do Prisma, mascaramento
    graphql/                 SDL base (Query, Mutation, Error, PageInfo), formatador de erros
    pagination/              cursor opaco e montagem de connections
    logger/                  configuração do Pino
  modules/
    users/                   users.graphql, users.resolvers.ts, users.service.ts, users.repository.ts, users.schemas.ts
    products/                mesmo formato
    orders/                  mesmo formato; orders.repository.ts contém o SQL de bloqueio
  generated/                 cliente Prisma e tipos do codegen (fora do Git)
prisma/
  schema.prisma
  migrations/
prisma.config.ts
scripts/
  generate-graphql-types.ts
  check-no-comments.ts
  demo.ts
tests/
  unit/
  integration/
  helpers/
```

### 3.2 Camadas

Fluxo: `Resolver → Service → Repository → PostgreSQL`.

| Camada | Responsabilidade | Proibido |
|---|---|---|
| Resolver | Traduzir argumentos GraphQL para o service e resultados de domínio para tipos GraphQL (`__typename`) | Acessar Prisma; conter regra de negócio |
| Service | Regras de negócio, ordem de verificação, abertura de transações | Conhecer GraphQL |
| Repository | Consultas Prisma e SQL explícito | Decidir regra de negócio |

### 3.3 Estilo

- Funções fábrica em vez de classes (`createOrdersService({ ordersRepository, prisma, logger })`). As dependências são passadas por parâmetro e montadas em `app.ts`, sem contêiner de injeção.
- Erros esperados são **valores de retorno** (uniões discriminadas); exceções ficam reservadas ao inesperado.
- Somente sintaxe TypeScript apagável (`erasableSyntaxOnly`): sem `enum`, `namespace` ou parameter properties. Imports relativos com extensão `.ts`.

### 3.4 Execução do TypeScript

- Desenvolvimento: `node --env-file-if-exists=.env --watch src/server.ts`.
- Produção: `node src/server.ts`. É o mesmo código, sem etapa de build.
- Garantia de tipos: `tsc --noEmit` (TypeScript 7) no `npm run check` e na construção da imagem Docker.
- `tsconfig`: `strict`, `noEmit`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module`/`moduleResolution` = `nodenext`.
- Gerador Prisma `prisma-client` com `moduleFormat = "esm"`, `generatedFileExtension = "ts"` e `importFileExtension = "ts"`, validado sob remoção de tipos do Node 24.

## 4. Modelo de dados

Os relacionamentos seguem o desenho clássico normalizado: `users 1:N orders 1:N order_items N:1 products`, com o preço unitário registrado no item no momento da compra. Os valores monetários são **centavos inteiros** de ponta a ponta.

```sql
CREATE TABLE users (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(254) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);

CREATE TABLE products (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  price_cents INTEGER      NOT NULL,
  stock       INTEGER      NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT products_price_cents_non_negative CHECK (price_cents >= 0),
  CONSTRAINT products_stock_non_negative CHECK (stock >= 0)
);

CREATE TABLE orders (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER     NOT NULL REFERENCES users (id),
  total_cents INTEGER     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orders_total_cents_non_negative CHECK (total_cents >= 0)
);
CREATE INDEX orders_user_id_id_idx ON orders (user_id, id DESC);

CREATE TABLE order_items (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders (id),
  product_id       INTEGER NOT NULL REFERENCES products (id),
  quantity         INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_items_unit_price_cents_non_negative CHECK (unit_price_cents >= 0),
  CONSTRAINT order_items_order_id_product_id_key UNIQUE (order_id, product_id)
);
CREATE INDEX order_items_product_id_idx ON order_items (product_id);
```

| Decisão | Justificativa |
|---|---|
| `INTEGER GENERATED ALWAYS AS IDENTITY` | Padrão SQL que substitui `SERIAL`; `ALWAYS` impede inserir IDs manualmente. O Prisma trata como autoincremento sem divergência de migration (verificado no PG 18.6). |
| `NOT NULL` em todas as chaves estrangeiras | Impede pedido sem usuário e item órfão |
| Índices `orders (user_id, id DESC)` e `order_items (product_id)` | O PostgreSQL não indexa chaves estrangeiras automaticamente. O índice composto atende a "pedidos mais recentes de cada usuário". `order_items (order_id)` já é coberto pelo `UNIQUE (order_id, product_id)`. |
| `CHECK` de não negatividade e quantidade positiva | Integridade garantida pelo banco, mesmo com bug na aplicação. `products_stock_non_negative` é a última barreira contra venda acima do estoque. |
| `TIMESTAMPTZ NOT NULL` | Instante absoluto, independente do fuso do servidor |
| `UNIQUE (order_id, product_id)` | Um produto aparece uma vez por pedido |
| E-mail em minúsculas + `CHECK` | Torna o `UNIQUE` insensível a maiúsculas sem extensão |
| Centavos em `INTEGER` | Mesmo tipo e mesmo limite (2.147.483.647) no banco, na API (`Int`) e no TypeScript (`number`); sem conversão nem biblioteca decimal |
| `orders.total_cents` desnormalizado | Valor do pedido no momento da compra, calculado no servidor dentro da transação |
| `ON DELETE` implícito (RESTRICT) | Não há exclusão no escopo; impede apagar produto com histórico de pedidos |

Prisma: models `User`, `Product`, `Order`, `OrderItem` mapeados para as tabelas e colunas acima com `@@map`/`@map`. A migration inicial é gerada com `prisma migrate dev --create-only` e editada para incluir `IDENTITY`, os `CHECK`s, o índice composto e os nomes de constraints, sem os comentários que o Prisma gera. O Prisma ignora `CHECK`s ao comparar schema e banco, então migrations futuras não os removem (verificado).

## 5. Contrato GraphQL

Schema-first: cada módulo tem seu `.graphql`; o SDL base declara `Query`, `Mutation`, `Error`, `ErrorCode`, `FieldError` e `PageInfo`; os módulos usam `extend type`. O `buildSchema` do graphql 17 combina os arquivos sem dependência extra (verificado). Todos os tipos e campos recebem descrições `"""..."""` em inglês, visíveis no GraphiQL.

```graphql
interface Error {
  code: ErrorCode!
  message: String!
}

enum ErrorCode {
  BAD_USER_INPUT
  EMAIL_ALREADY_IN_USE
  USER_NOT_FOUND
  PRODUCT_NOT_FOUND
  INSUFFICIENT_STOCK
  ORDER_TOTAL_LIMIT_EXCEEDED
}

type FieldError {
  field: String!
  message: String!
}

type PageInfo {
  hasNextPage: Boolean!
  endCursor: String
}

type User {
  id: ID!
  name: String!
  email: String!
  createdAt: String!
  orders(first: Int = 20, after: String): OrderConnection!
}

type Product {
  id: ID!
  name: String!
  priceInCents: Int!
  stock: Int!
  createdAt: String!
}

type Order {
  id: ID!
  totalInCents: Int!
  createdAt: String!
  items: [OrderItem!]!
}

type OrderItem {
  product: Product!
  quantity: Int!
  unitPriceInCents: Int!
}

type UserEdge { cursor: String!  node: User! }
type UserConnection { edges: [UserEdge!]!  pageInfo: PageInfo! }
type ProductEdge { cursor: String!  node: Product! }
type ProductConnection { edges: [ProductEdge!]!  pageInfo: PageInfo! }
type OrderEdge { cursor: String!  node: Order! }
type OrderConnection { edges: [OrderEdge!]!  pageInfo: PageInfo! }

type ValidationError implements Error { code: ErrorCode!  message: String!  fields: [FieldError!]! }
type EmailAlreadyInUseError implements Error { code: ErrorCode!  message: String!  email: String! }
type UserNotFoundError implements Error { code: ErrorCode!  message: String!  userId: ID! }
type ProductNotFoundError implements Error { code: ErrorCode!  message: String!  productIds: [ID!]! }
type StockShortage { productId: ID!  requested: Int!  available: Int! }
type InsufficientStockError implements Error { code: ErrorCode!  message: String!  items: [StockShortage!]! }
type OrderTotalLimitExceededError implements Error { code: ErrorCode!  message: String!  limitInCents: Int! }

input CreateUserInput { name: String!  email: String! }
input CreateProductInput { name: String!  priceInCents: Int!  stock: Int! }
input OrderItemInput { productId: ID!  quantity: Int! }
input CreateOrderInput { userId: ID!  items: [OrderItemInput!]! }

union CreateUserResult = User | ValidationError | EmailAlreadyInUseError
union CreateProductResult = Product | ValidationError
union CreateOrderResult =
  | Order
  | ValidationError
  | UserNotFoundError
  | ProductNotFoundError
  | InsufficientStockError
  | OrderTotalLimitExceededError

type Query {
  users(first: Int = 20, after: String): UserConnection!
  products(first: Int = 20, after: String): ProductConnection!
}

type Mutation {
  createUser(input: CreateUserInput!): CreateUserResult!
  createProduct(input: CreateProductInput!): CreateProductResult!
  createOrder(input: CreateOrderInput!): CreateOrderResult!
}
```

- `createdAt` é uma string ISO 8601 em UTC (`2026-11-02T14:03:00.000Z`).
- `OrderTotalLimitExceededError` expõe apenas `limitInCents`: um total acima do limite não cabe em `Int` por definição.
- Codegen com `enumsAsTypes: true` e `useTypeImports: true`; os tipos de resolver ficam em `src/generated/graphql.ts`.

## 6. Emissão de pedido e concorrência

### 6.1 Algoritmo de `createOrder`

1. **Validação (Zod)** do input → `ValidationError`.
2. **Abertura da transação** interativa do Prisma (isolamento `READ COMMITTED`, padrão do PostgreSQL; `maxWait` 5 s; `timeout` 10 s).
3. **Usuário existe?** → `UserNotFoundError`.
4. **Bloqueio dos produtos em ordem fixa:**
   ```sql
   SELECT id, price_cents, stock
   FROM products
   WHERE id = ANY($1::int[])
   ORDER BY id
   FOR NO KEY UPDATE
   ```
   `FOR NO KEY UPDATE` é o mesmo nível de bloqueio que o `UPDATE` de estoque adquire: bloqueia outros pedidos sobre a mesma linha sem bloquear verificações de chave estrangeira de outras transações. A ordenação por `id` elimina deadlocks entre pedidos com produtos em comum.
5. **Produtos ausentes** → `ProductNotFoundError` listando todos os IDs ausentes.
6. **Estoque insuficiente** → `InsufficientStockError` listando todos os itens em falta, com `requested` e `available`.
7. **Total** = Σ `quantity × price_cents`, em inteiros, somado item a item e interrompido assim que ultrapassa 2.147.483.647 → `OrderTotalLimitExceededError`. A interrupção evita que produtos intermediários passem de 2^53, onde `number` perde precisão.
8. **Gravação:** baixa do estoque num único comando, depois inserção do pedido e dos itens com o `unit_price_cents` lido no passo 4.
   ```sql
   UPDATE products AS product
   SET stock = product.stock - requested.quantity
   FROM unnest($1::int[], $2::int[]) AS requested (product_id, quantity)
   WHERE product.id = requested.product_id
   ```
9. **Commit** e retorno do `Order`.

Qualquer erro esperado retornado nos passos 3 a 7 desfaz a transação antes de qualquer escrita.

### 6.2 Garantias

| Ameaça | Proteção |
|---|---|
| Dois pedidos compram a última unidade | Bloqueio de linha: o segundo pedido espera e lê o estoque já baixado |
| Deadlock entre pedidos A→B e B→A | Bloqueio em ordem de `id` e produtos únicos por pedido |
| Bug que tente gravar estoque negativo | `CHECK products_stock_non_negative`; a violação vira `INTERNAL_SERVER_ERROR` e é registrada em log como erro |
| Preço alterado durante o pedido | Preço lido sob bloqueio e copiado para `unit_price_cents` |
| Leituras concorrentes | MVCC: listagens não esperam pelos bloqueios de escrita |

### 6.3 Limite conhecido e evolução

Uma linha por produto concentra a disputa ("linha quente"): pedidos simultâneos do mesmo produto formam fila na mesma linha, e o primeiro recurso a se esgotar são as conexões do pool. A evolução documentada é a da Shopify (2026): estoque em tabela própria com um conjunto limitado de linhas por produto, reservadas com `FOR UPDATE SKIP LOCKED` e repostas por um processo separado.

### 6.4 Limite do total e evolução

O limite de 2.147.483.647 centavos (R$ 21.474.836,47) por valor é uma regra explícita do contrato: o pedido acima dele recebe `OrderTotalLimitExceededError` antes de qualquer escrita. O schema relacional de partida (`DECIMAL(10,2)`) tinha um limite equivalente em R$ 99.999.999,99, sem tratamento, e resultaria em `numeric field overflow` exposto como erro interno.

Evolução, se o negócio exigir valores maiores:

| Camada | Mudança |
|---|---|
| Banco | `INTEGER` → `BIGINT` nas colunas de centavos; em tabelas grandes, coluna nova + cópia + troca |
| Prisma | `BIGINT` chega como `bigint`, exato |
| API | `Int` do GraphQL é 32 bits por especificação: novo escalar serializado como string |
| Compatibilidade | Novo campo (`totalAmountInCents`) e o antigo marcado com `@deprecated`, sem versionar a URL |

## 7. Validação (Zod)

| Operação | Campo | Regra |
|---|---|---|
| `createUser` | `name` | `trim`, 1 a 100 caracteres |
| `createUser` | `email` | `trim`, minúsculas, formato de e-mail, até 254 caracteres |
| `createUser` | unicidade | Decidida pelo `UNIQUE` do banco, sem consulta prévia: violação `P2002` em `users_email_key` → `EmailAlreadyInUseError` |
| `createProduct` | `name` | `trim`, 1 a 100 caracteres; nomes repetidos permitidos |
| `createProduct` | `priceInCents` | Inteiro ≥ 0 (gratuito permitido) |
| `createProduct` | `stock` | Inteiro ≥ 0 (estoque inicial zero permitido) |
| `createOrder` | `userId`, `productId` | IDs numéricos positivos; formato inválido → `ValidationError` |
| `createOrder` | `items` | De 1 a 100 itens; `productId` repetido no mesmo pedido → `ValidationError` |
| `createOrder` | `quantity` | Inteiro ≥ 1, sem teto próprio (o limite do total cobre) |
| Listagens | `first` | De 1 a 100 |
| Listagens | `after` | Cursor emitido pela própria API |

Os caminhos de erro do Zod viram `fields[].field` em notação de ponto (`items.0.quantity`).

Argumentos de paginação inválidos não têm tipo de resultado próprio, porque as queries retornam connections: viram `errors[]` com `extensions.code = BAD_USER_INPUT`, usando o mesmo vocabulário de códigos.

## 8. Tratamento de erros

| Tipo | Canal | Formato |
|---|---|---|
| Sintaxe ou campo inexistente na query | `errors[]` (engine) | `GRAPHQL_PARSE_FAILED` ou `GRAPHQL_VALIDATION_FAILED` |
| Erro de negócio esperado | `data` (união da mutation) | Tipo que implementa `Error` (`code`, `message`, campos específicos) |
| Argumento de paginação inválido | `errors[]` | `BAD_USER_INPUT` |
| Erro inesperado | `errors[]` mascarado | `message: "Internal server error"`, `extensions: { code: "INTERNAL_SERVER_ERROR", requestId }`; detalhes apenas no log |

Tradução de erros do Prisma (`shared/errors`):

| Origem | Resultado |
|---|---|
| `P2002` em `users_email_key` | `EmailAlreadyInUseError` |
| Código PostgreSQL `23514` (CHECK) em `meta.driverAdapterError.cause.originalCode` | Inesperado: `INTERNAL_SERVER_ERROR` + log `error` |
| `P2028` (tempo de transação esgotado) e demais | Inesperado: `INTERNAL_SERVER_ERROR` + log `error` |

## 9. Paginação e N+1

- Connections no padrão Relay. `first` padrão 20, máximo 100. Cursor opaco `base64url("v1:<id>")`. Sem `totalCount`.
- `users` e `products`: `WHERE id > :afterId ORDER BY id ASC LIMIT first + 1`; o registro extra indica `hasNextPage`.
- `User.orders`: do mais recente para o mais antigo, com `after` aplicado como `id < :afterId`.
- Loaders do Mercurius (uma consulta por nível, quatro no total para `users → orders → items → product`):

| Loader | Consulta |
|---|---|
| `User.orders` | Agrupa por argumentos (`first`, `after`). Uma consulta com `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id DESC)` limitada a `first + 1` por usuário, usando o índice `orders (user_id, id DESC)`. |
| `Order.items` | `WHERE order_id = ANY($ids) ORDER BY id` |
| `OrderItem.product` | `WHERE id = ANY($ids)` |

- `queryDepth: 10` no Mercurius.

## 10. Observabilidade

- Pino nativo do Fastify: JSON em produção, `pino-pretty` apenas em desenvolvimento.
- `x-request-id`: reaproveitado quando recebido, gerado (UUID) quando ausente, devolvido no cabeçalho da resposta e usado como `requestId` dos erros mascarados.
- Variáveis GraphQL nunca são registradas (contêm e-mails). Registra-se nome da operação, duração e resultado.
- Eventos de negócio: `order.created` (`orderId`, `userId`, `itemsCount`, `totalInCents`) e `order.rejected` (`code`).
- `LOG_LEVEL` com padrão `info`.

## 11. Configuração

Variáveis validadas com Zod na inicialização; a API não sobe se alguma for inválida.

| Variável | Padrão | Uso |
|---|---|---|
| `DATABASE_URL` | obrigatória | Conexão com o PostgreSQL |
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface de escuta |
| `LOG_LEVEL` | `info` | Nível do Pino |
| `NODE_ENV` | `production` | `development` ativa `pino-pretty` |
| `GRAPHIQL_ENABLED` | `false` | `true` em desenvolvimento |

`.env.example` versionado; `.env` fora do Git.

## 12. Docker e Compose

Dockerfile em etapas, base `node:24.22.2-alpine3.24`:

1. `deps`: `npm ci`.
2. `verify`: `prisma generate`, geração dos tipos GraphQL e `tsc --noEmit`. A imagem não é construída se os tipos não batem.
3. `runtime`: dependências de produção, `src/` e `src/generated/`, usuário `node`, `CMD ["node", "src/server.ts"]`.

| Serviço | Imagem / alvo | Função |
|---|---|---|
| `db` | `postgres:18.6-alpine` | Banco principal, volume nomeado, healthcheck `pg_isready` |
| `migrate` | etapa `verify` | `prisma migrate deploy`; termina e libera a API |
| `api` | etapa `runtime` | Sobe após `migrate` concluir com sucesso; healthcheck por `node` em `GET /health`; `init: true` |
| `db-test` | `postgres:18.6-alpine` com `tmpfs` | Banco descartável dos testes (perfil `tools`) |
| `test` | etapa `verify` | `npm test` contra `db-test` (perfil `tools`) |
| `demo` | etapa `verify` | `scripts/demo.ts` contra `http://api:3000/graphql` (perfil `tools`) |

- `GET /health`: `200 { "status": "ok" }` se o processo está vivo e `SELECT 1` responde; `503` caso contrário.
- Desligamento: em `SIGTERM`/`SIGINT`, `fastify.close()` termina as requisições em andamento e depois desconecta o Prisma.
- Risco a validar no início da implementação: motor de migrations do Prisma no Alpine (`linux-musl-openssl-3.0.x`, exige `openssl`). Alternativa: `node:24.22.2-trixie-slim`.

Comandos de uso:

```bash
docker compose up -d
docker compose run --rm demo
docker compose run --rm test
```

## 13. Testes

| Camada | Escopo |
|---|---|
| Unitários | Schemas Zod, cursor, cálculo do total e limite, tradução de erros do Prisma |
| Integração (`app.inject`, banco real) | Cada operação: caminho feliz e cada erro do catálogo |
| Concorrência | 50 `createOrder` em paralelo contra estoque 10: exatamente 10 `Order`, 40 `InsufficientStockError`, estoque final 0 |
| Deadlock | Pedidos A→B e B→A em paralelo, repetidos: todos terminam sem erro de deadlock |
| N+1 | `users → orders → items → product` executa exatamente 4 consultas, contadas pelos eventos de query do Prisma |
| Paginação | Navegação completa sem repetição nem omissão, inclusive com inserções entre páginas |

- Banco: `db-test` (local na porta 5433). Um `globalSetup` aplica as migrations; `TRUNCATE ... RESTART IDENTITY CASCADE` entre testes; arquivos de integração rodam em sequência.
- Cobertura mínima de 80% (linhas), medida com `@vitest/coverage-v8`.

## 14. Qualidade de código

Regras obrigatórias para todo código escrito à mão (`src`, `tests`, `scripts`):

| Regra | Garantia automática |
|---|---|
| Sem comentários | `scripts/check-no-comments.ts`. Arquivos `.ts`: remove tipos com `stripTypeScriptTypes` (`node:module`) e coleta comentários com `acorn` (`onComment`), ignorando textos dentro de strings; executado com `--disable-warning=ExperimentalWarning`. Arquivos `.graphql`, `Dockerfile` e `.yml`: linhas iniciadas por `#`. Arquivos `.sql`: linhas iniciadas por `--`. As descrições `"""..."""` do SDL são contrato, não comentário. |
| Sem `else` (inclui `else if`) | Plugin GritQL do Biome sobre `JsElseClause()` + `noUselessElse` |
| Sem ternário aninhado | `noNestedTernary` |
| Funções pequenas | `noExcessiveLinesPerFunction` com no máximo 30 linhas |
| Baixo acoplamento | `noExcessiveCognitiveComplexity` com no máximo 10, além das camadas da arquitetura |
| Nomes descritivos | Plugin GritQL que rejeita identificadores de 1 ou 2 caracteres + `useNamingConvention` |
| Sem `any` | `noExplicitAny` + `strict` |
| Promessas tratadas | `noFloatingPromises`, `noMisusedPromises` |
| Uniões tratadas por completo | `useExhaustiveSwitchCases` |

Todas as regras do Biome acima ficam com severidade `error`. Queries GraphQL usadas em testes ficam em constantes nomeadas.

### 14.1 Scripts npm

| Script | Ação |
|---|---|
| `dev` | `node --env-file-if-exists=.env --watch src/server.ts` |
| `start` | `node src/server.ts` |
| `generate` | `prisma generate` + `node scripts/generate-graphql-types.ts` |
| `typecheck` | `tsc --noEmit` |
| `lint` / `format` | `biome check` / `biome format --write` |
| `check:comments` | Verificação de comentários |
| `test` / `test:coverage` | Vitest |
| `db:migrate` | `prisma migrate deploy` |
| `demo` | `node scripts/demo.ts` |
| `check` | `generate` → `typecheck` → `lint` → `check:comments` → `npm audit` → `test:coverage` |

## 15. Demonstração

`scripts/demo.ts` envia requisições GraphQL reais via `fetch` e imprime o resultado em pt-BR:

1. Cria usuários e produtos de exemplo pelas mutations, com e-mails únicos por execução.
2. Dispara 50 pedidos em paralelo contra um produto com estoque 10 e imprime o resumo (`10 aceitos · 40 InsufficientStockError · estoque final 0`).
3. Mostra requisição e resposta de cada erro do catálogo.
4. Lista `users → orders → items → product` paginado.

Pode ser executado várias vezes; não há seed automático na subida do ambiente.

## 16. README (pt-BR)

Seções: visão geral, como executar (Docker e local), comandos (`demo`, `test`, `check`), exemplos de queries e mutations, decisões técnicas (uma linha de justificativa por decisão), trade-offs, limites conhecidos e evoluções futuras.

## 17. Fluxo de implementação

Cada etapa é uma branch, com merge `--no-ff` na `main` quando funcional. Durante a etapa rodam os testes relacionados; no fechamento, `npm run check` completo e um resumo com a justificativa de cada módulo, para aprovação antes do merge. O Opus coordena e revisa; cada tarefa é executada pelo modelo indicado.

| # | Branch | Conteúdo | Modelo | Estimativa |
|---|---|---|---|---|
| 1 | `chore/project-setup` | Dependências, tsconfig, Biome com plugins, verificação de comentários, scripts, `db`/`db-test`, schema Prisma, migration editada, validação do Prisma no Alpine | Haiku + Sonnet | 30–45 min |
| 2 | `feat/app-skeleton` | Fastify + Mercurius, config, logger, infraestrutura de erros, `/health`, cursor, codegen | Sonnet | 30–45 min |
| 3 | `feat/users-products` | Módulos de usuários e produtos com testes | Sonnet | 45–60 min |
| 4 | `feat/orders` | Transação do pedido, catálogo de erros, testes de concorrência e deadlock | Opus | 60–90 min |
| 5 | `feat/listing-loaders` | `User.orders`, loaders, teste de N+1, `queryDepth` | Sonnet + revisão Opus | 45–60 min |
| 6 | `feat/docker-demo` | Dockerfile, Compose completo, demo, desligamento seguro | Sonnet | 45–60 min |
| 7 | `docs/readme` | README | Sonnet + revisão Opus | 20–30 min |

Estimativa total: 4h30 a 6h30 de execução, recalibrada após a etapa 1.

## 18. Decisões e justificativas

| Decisão | Justificativa |
|---|---|
| PostgreSQL | Bloqueio por linha, MVCC, `CHECK` e migrations transacionais |
| Bloqueio pessimista ordenado | Correção sob concorrência, sem deadlock por construção, erros precisos e preço lido sob bloqueio |
| Prisma 7.10.1 | Acelera o CRUD; o caminho crítico usa SQL explícito na mesma transação |
| Fastify + Mercurius | Desempenho, Pino nativo, loaders para N+1, health check e desligamento seguro |
| Schema-first + codegen | O SDL é a especificação; divergência entre schema e resolver é erro de compilação |
| TypeScript nativo no Node 24 | O código que roda em desenvolvimento é o que roda em produção; `tsc --noEmit` garante os tipos |
| Erros como dados tipados (N2) | Erros de negócio fazem parte do contrato e o compilador obriga o cliente a tratá-los |
| Centavos inteiros | Mesmo tipo e limite em todas as camadas, sem erro de arredondamento |
| Zod | O tipo nasce da regra; cada violação vira um campo do `ValidationError` |
| Módulos por funcionalidade | Responsabilidade única por camada: transação no service, SQL no repository, GraphQL no resolver |
| Paginação Relay por cursor | Desempenho constante e estável com inserções concorrentes |
| Loaders do Mercurius | Número fixo de consultas por nível, comprovado em teste |
| Biome + TypeScript 7 | Uma ferramenta de lint/format sem vulnerabilidades, compatível com o compilador nativo |
| Dependências exatas e auditadas | Instalação reprodutível, sem avisos e sem vulnerabilidades conhecidas |

## 19. Validações pendentes no início da implementação

1. Motor de migrations do Prisma no Alpine (alternativa: `trixie-slim`).
2. `tsc` 7.0.2 sobre o cliente gerado pelo Prisma e pelo codegen.
3. Plugins GritQL do Biome com a configuração final do projeto.
4. Eventos de query do Prisma com adaptador pg para a contagem do teste de N+1. Alternativa: contar no pool do `pg`.
