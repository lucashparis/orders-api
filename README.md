# orders-api

API GraphQL para gestão de pedidos: cadastro e listagem de usuários e produtos, emissão de pedidos de compra e consulta de usuários com seus pedidos, itens e produtos.

O requisito central é a **integridade do estoque sob pedidos simultâneos**. Um pedido que não pode ser atendido por falta de estoque é rejeitado com um erro tipado (`InsufficientStockError`), e o estoque nunca fica negativo.

## Sumário

- [Visão geral](#visão-geral)
- [Requisitos](#requisitos)
- [Como executar com Docker](#como-executar-com-docker)
- [Como executar localmente](#como-executar-localmente)
- [Comandos](#comandos)
- [Exemplos de uso](#exemplos-de-uso)
- [Decisões técnicas](#decisões-técnicas)
- [Trade-offs](#trade-offs)
- [Limites conhecidos](#limites-conhecidos)
- [Evoluções futuras](#evoluções-futuras)

## Visão geral

| Funcionalidade | Operação GraphQL |
|---|---|
| Cadastrar usuário | `mutation createUser` |
| Listar usuários e seus pedidos | `query users` → `User.orders` → `Order.items` → `OrderItem.product` |
| Cadastrar produto | `mutation createProduct` |
| Listar produtos | `query products` |
| Emitir pedido | `mutation createOrder` |

Stack:

- Node.js 24.22.2 executando TypeScript 7 por remoção de tipos, sem etapa de build.
- Fastify 5 e Mercurius 16 (GraphQL), com o SDL escrito em arquivos `.graphql` por módulo.
- Prisma 7 sobre PostgreSQL 18.6, com SQL explícito no caminho crítico do pedido.
- Zod 4 para validação, Vitest para testes e Biome para lint e formatação.
- Docker Compose para o ambiente completo (banco, migrations, API, testes e demonstração).

Arquitetura em camadas por módulo (`users`, `products`, `orders`): `Resolver → Service → Repository → PostgreSQL`. O resolver traduz GraphQL, o service concentra as regras de negócio e abre as transações, e o repository contém as consultas Prisma e o SQL explícito.

Comportamentos verificados pela suíte de testes e pela demonstração:

- 50 pedidos simultâneos de um produto com estoque 10 resultam em exatamente 10 pedidos aceitos, 40 `InsufficientStockError` e estoque final 0.
- Pedidos cruzados (A→B e B→A) em paralelo terminam sem deadlock.
- A listagem `users → orders → items → product` executa exatamente 4 consultas, independentemente da quantidade de registros.
- 173 testes automatizados.

## Requisitos

Para executar com Docker:

- Docker com Docker Compose v2.

Para executar localmente:

- Node.js 24.22.2 (`engines.node` = `>=24.22.2 <25`; o `.npmrc` usa `engine-strict=true`, então outras versões são recusadas na instalação).
- npm 11.
- Docker, para os bancos `db` e `db-test`.

## Como executar com Docker

```bash
docker compose up -d --build
```

O comando sobe o PostgreSQL (`db`), aplica as migrations (`migrate`) e inicia a API (`api`) somente depois que as migrations terminam com sucesso.

| Recurso | Endereço |
|---|---|
| Endpoint GraphQL | `http://localhost:3000/graphql` |
| GraphiQL | `http://localhost:3000/graphiql` |
| Health check | `http://localhost:3000/health` |

O GraphiQL vem habilitado na stack do Compose (`GRAPHIQL_ENABLED` tem padrão `true` no `docker-compose.yml`) e desabilitado por padrão na imagem. Todos os tipos, campos e argumentos do schema têm descrição, visível no painel de documentação do GraphiQL.

Demonstração e testes:

```bash
docker compose run --rm demo
docker compose run --rm test
```

- `demo` envia requisições GraphQL reais à API e imprime o resultado em pt-BR: cria usuários e produtos, dispara 50 pedidos simultâneos contra um produto com estoque 10, mostra a requisição e a resposta de cada erro do catálogo e lista `users → orders → items → product` paginado. Pode ser executado várias vezes; os e-mails são únicos por execução e não há seed automático.
- `test` executa `npm test` contra o banco descartável `db-test` (armazenado em `tmpfs`).

As imagens contêm o código da aplicação. Depois de alterar o código, reconstrua com `docker compose up -d --build`; os serviços `demo` e `test` reconstroem a imagem da etapa `verify` com `docker compose run --rm --build demo` e `docker compose run --rm --build test`.

Portas do host configuráveis por variáveis de ambiente (ou por um arquivo `.env` na raiz):

| Variável | Padrão | Serviço |
|---|---|---|
| `API_HOST_PORT` | `3000` | `api` |
| `DB_HOST_PORT` | `5432` | `db` |
| `DB_TEST_HOST_PORT` | `5433` | `db-test` |

```bash
API_HOST_PORT=3100 DB_HOST_PORT=5440 docker compose up -d --build
```

Se `DB_HOST_PORT` ou `DB_TEST_HOST_PORT` forem alteradas e a aplicação for executada localmente, `DATABASE_URL` e `TEST_DATABASE_URL` no `.env` devem usar as mesmas portas. Dentro da rede do Compose os serviços sempre usam a porta 5432 do contêiner, então os serviços `api`, `migrate`, `demo` e `test` não são afetados.

Para parar e para remover tudo, incluindo os dados:

```bash
docker compose stop
docker compose down -v
```

### Estrutura do Compose

| Serviço | Imagem / alvo | Função |
|---|---|---|
| `db` | `postgres:18.6-alpine` | Banco principal, volume nomeado, healthcheck `pg_isready` |
| `migrate` | etapa `verify` | `prisma migrate deploy`; termina e libera a API |
| `api` | etapa `runtime` | Healthcheck em `GET /health`; `init: true` |
| `db-test` | `postgres:18.6-alpine` com `tmpfs` | Banco descartável dos testes (perfil `tools`) |
| `test` | etapa `verify` | `npm test` contra `db-test` (perfil `tools`) |
| `demo` | etapa `verify` | `npm run demo` contra `http://api:3000/graphql` (perfil `tools`) |

O Dockerfile tem três etapas sobre `node:24.22.2-alpine3.24`: `deps` (`npm ci`), `verify` (gera o cliente Prisma e os tipos GraphQL e roda `tsc --noEmit`; a imagem não é construída se os tipos não batem) e `runtime` (apenas dependências de produção, `src/` e `prisma/`, executando como usuário `node`). A imagem de runtime tem cerca de 413 MB.

## Como executar localmente

```bash
npm ci
cp .env.example .env
docker compose up -d db db-test
npm run db:migrate
npm run dev
```

Em outro terminal, com a API no ar, `npm run demo` executa a demonstração contra `http://localhost:3000/graphql` (sobrescrevível por `API_URL`). Para os testes:

```bash
npm test
```

`npm test` usa o banco `db-test` (porta 5433 por padrão, ou `TEST_DATABASE_URL`). O `globalSetup` aplica as migrations nesse banco, e os arquivos de integração rodam em sequência.

O Node carrega o `.env` com `--env-file-if-exists=.env`, e o `prisma.config.ts` usa `process.loadEnvFile`; não há dependência extra para isso.

### Variáveis de ambiente

A API valida as variáveis com Zod na inicialização e não sobe se alguma for inválida.

| Variável | Padrão | Uso |
|---|---|---|
| `DATABASE_URL` | obrigatória | Conexão com o PostgreSQL |
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface de escuta |
| `LOG_LEVEL` | `info` | Nível do Pino |
| `NODE_ENV` | `production` | `development` ativa o `pino-pretty` |
| `GRAPHIQL_ENABLED` | `false` | `true` habilita o GraphiQL em `/graphiql` |
| `TEST_DATABASE_URL` | `postgresql://orders:orders@localhost:5433/orders_test` | Banco usado pelos testes |

O `.env.example` também documenta `DB_HOST_PORT` e `DB_TEST_HOST_PORT`, lidas pelo Compose.

## Comandos

| Comando | Ação |
|---|---|
| `npm run dev` | Servidor com `--watch` e leitura do `.env` |
| `npm start` | `node src/server.ts` (o mesmo código de produção) |
| `npm run generate` | `prisma generate` e geração dos tipos GraphQL (`src/generated/`, fora do Git) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `biome check .` |
| `npm run format` | `biome format --write .` |
| `npm run check:comments` | Verifica que não há comentários nos arquivos escritos à mão |
| `npm test` | Testes (Vitest) |
| `npm run test:coverage` | Testes com cobertura (mínimo de 80% das linhas) |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run demo` | Demonstração contra uma API em execução |
| `npm run check` | `generate` → `typecheck` → `lint` → `check:comments` → `npm audit` → `test:coverage` |

`npm run check` é a verificação completa de qualidade e exige o `db-test` no ar.

Regras de qualidade aplicadas automaticamente: sem comentários, sem `else`, sem ternário aninhado, funções com no máximo 30 linhas e complexidade cognitiva até 10, identificadores com 3 ou mais caracteres (exceto `id`), sem `any` e promessas sempre tratadas.

## Exemplos de uso

Todos os exemplos usam `POST http://localhost:3000/graphql` ou o GraphiQL. Os identificadores e valores abaixo são ilustrativos. Valores monetários são centavos inteiros.

### Criar usuário

```graphql
mutation {
  createUser(input: { name: "Ana", email: "ana@example.com" }) {
    __typename
    ... on User { id name email createdAt }
    ... on ValidationError { code message fields { field message } }
    ... on EmailAlreadyInUseError { code message email }
  }
}
```

```json
{
  "data": {
    "createUser": {
      "__typename": "User",
      "id": "1",
      "name": "Ana",
      "email": "ana@example.com",
      "createdAt": "2026-11-02T14:03:00.000Z"
    }
  }
}
```

Repetir o e-mail retorna `EmailAlreadyInUseError` (`code: EMAIL_ALREADY_IN_USE`). O e-mail é normalizado para minúsculas e a unicidade é garantida pelo banco.

### Criar produto

```graphql
mutation {
  createProduct(input: { name: "Teclado mecânico", priceInCents: 35000, stock: 10 }) {
    __typename
    ... on Product { id name priceInCents stock }
    ... on ValidationError { code message fields { field message } }
  }
}
```

```json
{
  "data": {
    "createProduct": {
      "__typename": "Product",
      "id": "1",
      "name": "Teclado mecânico",
      "priceInCents": 35000,
      "stock": 10
    }
  }
}
```

### Listar produtos

```graphql
query {
  products(first: 20) {
    edges { cursor node { id name priceInCents stock } }
    pageInfo { hasNextPage endCursor }
  }
}
```

Para a página seguinte, passe `after` com o `endCursor` recebido.

### Criar pedido: sucesso

```graphql
mutation CreateOrder($input: CreateOrderInput!) {
  createOrder(input: $input) {
    __typename
    ... on Order {
      id
      totalInCents
      createdAt
      items { quantity unitPriceInCents product { id name stock } }
    }
    ... on ValidationError { code message fields { field message } }
    ... on UserNotFoundError { code message userId }
    ... on ProductNotFoundError { code message productIds }
    ... on InsufficientStockError { code message items { productId requested available } }
    ... on OrderTotalLimitExceededError { code message limitInCents }
  }
}
```

Variáveis:

```json
{
  "input": {
    "userId": "1",
    "items": [{ "productId": "1", "quantity": 3 }]
  }
}
```

Resposta:

```json
{
  "data": {
    "createOrder": {
      "__typename": "Order",
      "id": "1",
      "totalInCents": 105000,
      "createdAt": "2026-11-02T14:05:00.000Z",
      "items": [
        {
          "quantity": 3,
          "unitPriceInCents": 35000,
          "product": { "id": "1", "name": "Teclado mecânico", "stock": 7 }
        }
      ]
    }
  }
}
```

### Criar pedido: estoque insuficiente

Com o produto acima restando 7 unidades, o mesmo documento com `quantity: 8`:

```json
{
  "input": {
    "userId": "1",
    "items": [{ "productId": "1", "quantity": 8 }]
  }
}
```

Resposta (HTTP 200; erros de negócio fazem parte de `data`):

```json
{
  "data": {
    "createOrder": {
      "__typename": "InsufficientStockError",
      "code": "INSUFFICIENT_STOCK",
      "message": "Insufficient stock for one or more items.",
      "items": [
        { "productId": "1", "requested": 8, "available": 7 }
      ]
    }
  }
}
```

Nenhuma escrita acontece: o estoque permanece em 7. Todos os itens em falta são listados de uma vez, com `requested` e `available`.

### Catálogo de erros de negócio

| Tipo | `code` | Quando |
|---|---|---|
| `ValidationError` | `BAD_USER_INPUT` | Input inválido; `fields[].field` usa notação de ponto (`items.0.quantity`) |
| `EmailAlreadyInUseError` | `EMAIL_ALREADY_IN_USE` | E-mail já cadastrado |
| `UserNotFoundError` | `USER_NOT_FOUND` | Usuário do pedido não existe |
| `ProductNotFoundError` | `PRODUCT_NOT_FOUND` | Um ou mais produtos não existem (todos os IDs ausentes são listados) |
| `InsufficientStockError` | `INSUFFICIENT_STOCK` | Estoque insuficiente em um ou mais itens |
| `OrderTotalLimitExceededError` | `ORDER_TOTAL_LIMIT_EXCEEDED` | Total do pedido acima de 2.147.483.647 centavos |

Fora da união de resultado, ficam em `errors[]`: sintaxe ou campo inexistente (`GRAPHQL_PARSE_FAILED` / `GRAPHQL_VALIDATION_FAILED`), argumentos de paginação inválidos (`BAD_USER_INPUT`) e erros inesperados, mascarados como `Internal server error` com `extensions.code = INTERNAL_SERVER_ERROR` e o `requestId` (o detalhe fica apenas no log).

### Usuários, pedidos, itens e produtos

```graphql
query {
  users(first: 10) {
    edges {
      node {
        id
        name
        email
        orders(first: 5) {
          edges {
            cursor
            node {
              id
              totalInCents
              createdAt
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
}
```

```json
{
  "data": {
    "users": {
      "edges": [
        {
          "node": {
            "id": "1",
            "name": "Ana",
            "email": "ana@example.com",
            "orders": {
              "edges": [
                {
                  "cursor": "djE6MQ",
                  "node": {
                    "id": "1",
                    "totalInCents": 105000,
                    "createdAt": "2026-11-02T14:05:00.000Z",
                    "items": [
                      {
                        "quantity": 3,
                        "unitPriceInCents": 35000,
                        "product": { "id": "1", "name": "Teclado mecânico", "priceInCents": 35000, "stock": 7 }
                      }
                    ]
                  }
                }
              ],
              "pageInfo": { "hasNextPage": false, "endCursor": "djE6MQ" }
            }
          }
        }
      ],
      "pageInfo": { "hasNextPage": false, "endCursor": "djE6MQ" }
    }
  }
}
```

Os pedidos de cada usuário vêm do mais recente para o mais antigo. Os cursores são opacos (`base64url("v1:<id>")`) e devem ser usados como recebidos. Em `users` e `products`, `first` aceita de 1 a 100 (padrão 20). A profundidade máxima de consulta é 10.

### Health check

```bash
curl http://localhost:3000/health
```

Retorna `200 {"status":"ok"}` quando o processo está vivo e o banco responde a `SELECT 1`, e `503` caso contrário.

## Decisões técnicas

| Decisão | Justificativa |
|---|---|
| PostgreSQL | Bloqueio por linha, MVCC, `CHECK` e migrations transacionais |
| Bloqueio pessimista ordenado | Correção sob concorrência, sem deadlock por construção, erros precisos e preço lido sob bloqueio |
| `SELECT ... ORDER BY id FOR NO KEY UPDATE` | Mesmo nível de bloqueio do `UPDATE` de estoque; a ordenação por `id` evita deadlock entre pedidos com produtos em comum |
| `CHECK (stock >= 0)` no banco | Última barreira contra estoque negativo, mesmo diante de um bug na aplicação |
| Prisma 7.10.1 | Acelera o CRUD; o caminho crítico usa SQL explícito na mesma transação |
| Fastify + Mercurius | Desempenho, Pino nativo, loaders para N+1, health check e desligamento seguro |
| Schema-first + codegen | O SDL é a especificação; divergência entre schema e resolver é erro de compilação |
| TypeScript nativo no Node 24 | O código que roda em desenvolvimento é o que roda em produção; `tsc --noEmit` garante os tipos |
| Erros como dados tipados | Erros de negócio fazem parte do contrato e o compilador obriga o cliente a tratá-los |
| Centavos inteiros | Mesmo tipo e limite em todas as camadas, sem erro de arredondamento |
| `orders.total_cents` e `order_items.unit_price_cents` gravados no pedido | Preservam o valor do momento da compra, mesmo que o preço do produto mude depois |
| Zod | O tipo nasce da regra; cada violação vira um campo do `ValidationError` |
| Unicidade de e-mail decidida pelo banco | Sem consulta prévia, sem corrida entre verificação e inserção |
| Módulos por funcionalidade | Responsabilidade única por camada: transação no service, SQL no repository, GraphQL no resolver |
| Paginação Relay por cursor | Desempenho constante e estável com inserções concorrentes |
| Loaders do Mercurius | Número fixo de consultas por nível, comprovado em teste |
| Biome + TypeScript 7 | Uma ferramenta de lint/format sem vulnerabilidades, compatível com o compilador nativo |
| Dependências exatas e auditadas | Instalação reprodutível (`npm ci`, `package-lock.json`, `save-exact`), sem avisos de depreciação e sem vulnerabilidades no `npm audit` |
| `overrides` de `glob` 14.0.3 e `minimatch` 11.0.4 | `mercurius` → `@fastify/static` depende de `glob ^13`, afetado por GHSA-3g3m-2fjr-6pw4, que usa `minimatch@10`, afetado por GHSA-g3hv-75wg-m249; o override aplica as versões corrigidas e deve ser removido quando `@fastify/static` corrigir na origem |
| `@graphql-codegen/core` em script próprio | Evita o `@graphql-codegen/cli`, que traz `minimatch` vulnerável, pacote depreciado e carregadores remotos sem uso |
| `allowScripts` apenas para `prisma` e `@prisma/engines` | Somente os scripts de instalação necessários são autorizados |
| Dockerfile em etapas com `verify` | A imagem não é construída se a geração de tipos ou o `tsc --noEmit` falham |

### Concorrência na emissão do pedido

`createOrder` executa em uma transação interativa (`READ COMMITTED`):

1. Valida o input (Zod).
2. Verifica se o usuário existe.
3. Bloqueia os produtos do pedido em ordem de `id` com `FOR NO KEY UPDATE`.
4. Retorna `ProductNotFoundError` com todos os IDs ausentes, ou `InsufficientStockError` com todos os itens em falta.
5. Calcula o total em inteiros, interrompendo a soma ao ultrapassar o limite de 2.147.483.647 centavos.
6. Baixa o estoque num único `UPDATE ... FROM unnest(...)` e grava o pedido e os itens com o preço lido sob bloqueio.

Qualquer erro esperado dos passos 2 a 5 desfaz a transação antes de qualquer escrita. Listagens usam MVCC e não esperam pelos bloqueios de escrita.

### Paginação e N+1

`users` e `products` usam `WHERE id > :afterId ORDER BY id LIMIT first + 1`; o registro extra indica `hasNextPage`. `User.orders` usa um loader que busca os pedidos de todos os usuários da página em uma única consulta (`ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id DESC)`, limitada a `first + 1` por usuário, apoiada no índice `orders (user_id, id DESC)`). `Order.items` e `OrderItem.product` têm um loader cada. O total é de 4 consultas para `users → orders → items → product`.

### Observabilidade

- Logs JSON do Pino (com `pino-pretty` apenas em desenvolvimento).
- `x-request-id` é reaproveitado quando recebido, gerado quando ausente e devolvido na resposta; é o `requestId` dos erros mascarados.
- Variáveis GraphQL nunca são registradas, pois podem conter dados pessoais.
- Eventos de negócio: `order.created` (`orderId`, `userId`, `itemsCount`, `totalInCents`) e `order.rejected` (`code`).
- Desligamento seguro: em `SIGTERM`/`SIGINT`, o servidor conclui as requisições em andamento e depois desconecta o banco.

## Trade-offs

| Escolha | Custo |
|---|---|
| Bloqueio pessimista por linha | Pedidos do mesmo produto formam fila na mesma linha; em troca, não há retentativas nem falhas por conflito de serialização |
| Erros de negócio como união no `data` | O cliente precisa tratar cada variante do resultado e lê `__typename`; em troca, o contrato é explícito e verificável pelo compilador |
| Centavos em `Int` de 32 bits | Limite de R$ 21.474.836,47 por valor; em troca, o mesmo tipo no banco, na API e no TypeScript, sem conversões |
| `total_cents` desnormalizado no pedido | Redundância com a soma dos itens; em troca, o valor do momento da compra fica registrado e consultável sem recálculo |
| SQL explícito no caminho do pedido | Menos abstração do ORM; em troca, controle exato do bloqueio e da ordem das operações |
| TypeScript sem etapa de build | Restringe a sintaxe a construções apagáveis (sem `enum`, `namespace` ou parameter properties) e exige Node 24; em troca, o código executado é o escrito |
| Schema-first com codegen | Exige `npm run generate` após alterar o SDL ou o schema Prisma; em troca, divergências viram erro de compilação |
| Paginação por cursor sem `totalCount` | Não há total de registros nem acesso a páginas arbitrárias; em troca, custo constante por página |
| Banco sem exclusões | Não existe remoção de usuários, produtos ou pedidos; chaves estrangeiras com `RESTRICT` protegem o histórico |

## Limites conhecidos

- **Contenção em linha única (linha quente).** Há uma linha por produto. Pedidos simultâneos do mesmo produto esperam uns pelos outros, e o primeiro recurso a se esgotar sob essa disputa são as conexões do pool.
- **Limite de 32 bits nos valores monetários.** Cada valor (preço, total do pedido, preço unitário) é limitado a 2.147.483.647 centavos (R$ 21.474.836,47). Um pedido acima disso recebe `OrderTotalLimitExceededError` antes de qualquer escrita, em vez de um estouro numérico no banco.
- **`User.orders(after:)` usa um identificador de pedido global.** O cursor `after` é aplicado como `id < :afterId` a todos os usuários da página. Ele é adequado para paginar os pedidos de um único usuário, mas, em uma página com vários usuários, o mesmo cursor vale para todos eles.
- **Paginação de `users` e `products` por criação.** A ordem é a de criação (`id` ascendente); não há ordenação nem filtros configuráveis.
- **Fora do escopo:** autenticação e autorização, pagamento, reserva de estoque com expiração, status e cancelamento de pedido, múltiplas moedas, `totalCount` nas listagens, rate limiting, pipeline de CI e site de documentação estático (a documentação do schema está nas descrições visíveis no GraphiQL).

## Evoluções futuras

- **Estoque em linhas distribuídas.** Para produtos com alta concorrência: estoque em tabela própria com um conjunto limitado de linhas por produto, reservadas com `FOR UPDATE SKIP LOCKED` e repostas por um processo separado.
- **Valores monetários maiores.** Se o negócio exigir mais que o limite de 32 bits:

  | Camada | Mudança |
  |---|---|
  | Banco | `INTEGER` → `BIGINT` nas colunas de centavos; em tabelas grandes, coluna nova, cópia e troca |
  | Prisma | `BIGINT` chega como `bigint`, exato |
  | API | `Int` do GraphQL é de 32 bits por especificação: novo escalar serializado como string |
  | Compatibilidade | Novo campo (por exemplo, `totalAmountInCents`) e o antigo marcado com `@deprecated`, sem versionar a URL |

- **Consulta por usuário.** Uma query `user(id)` tornaria o cursor de `User.orders` independente de outros usuários na mesma página.
- **Observabilidade.** Incluir o identificador da requisição nos eventos de negócio (`order.created`, `order.rejected`) e silenciar os logs das sondagens de `/health`.
- **Recursos de produto:** autenticação e autorização, pagamento, reserva de estoque com expiração, status e cancelamento de pedido, múltiplas moedas, `totalCount` nas listagens, rate limiting e pipeline de CI.
