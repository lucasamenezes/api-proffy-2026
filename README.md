# Proffy API — Middlewares/Hooks e Rotas Protegidas

API REST do projeto **Proffy** desenvolvida com **Fastify**, **TypeScript**, **Drizzle ORM**, **PostgreSQL** (via Docker Compose), **Zod**, **Argon2**, **JWT** e documentação interativa OpenAPI/Scalar em `/docs`.

Este repositório implementa a camada de autenticação e proteção de rotas seguindo o conceito de **segurança em camadas**:

1. **Validação de Schema (Zod)** — valida o formato dos dados antes de processar a requisição.
2. **Hook de Autenticação (`checkRequestJWT`)** — verifica o token JWT no cookie (`request.cookies.token`) ou no header (`request.headers.authorization`) usando nullish coalescing (`??`), rejeitando com `401` (corpo vazio) caso ausente ou inválido.
3. **Tipagem Customizada (`@types/fastify.d.ts`)** — amplia `FastifyRequest` via *declaration merging* com `user?: { sub: string; role: "student" | "teacher" }`.
4. **Função Utilitária (`getAuthenticatedUserFromRequest`)** — centraliza a obtenção segura de `request.user` (princípio DRY), garantindo tipagem sem `undefined`.
5. **Handler da Rota** — executa a regra de negócio usando `user.sub` para associar os dados ao usuário autenticado.

---

## Pré-requisitos

- Node.js (v20+)
- Docker e Docker Compose

## Como executar o projeto

1. **Clone o repositório:**
   ```bash
   git clone [https://github.com/](https://github.com/)lucasamenezes/api-proffy-2026.git
   cd api-proffy-2026
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente:**
   Copie o arquivo `.env.example` para `.env` e preencha os valores (o arquivo `.env` não é versionado no Git):
   ```bash
   cp .env.example .env
   ```
   Principais variáveis esperadas no `.env`:
   - `DATABASE_URL` — URL de conexão com o PostgreSQL
   - `JWT_TOKEN` — chave secreta usada para assinar e verificar tokens JWT
   - `COOKIE_SECRET` — segredo usado pelo `@fastify/cookie`

4. **Suba o banco de dados com Docker Compose:**
   ```bash
   docker compose up -d
   ```

5. **Execute as migrações do banco de dados:**
   ```bash
   npm run db:migrate
   ```

6. **Inicie o servidor em modo de desenvolvimento:**
   ```bash
   npm run dev
   ```

7. **Acesse a documentação interativa (Scalar/OpenAPI):**
   ```text
   http://localhost:3333/docs
   ```

---

## Rotas implementadas

### Rotas públicas (não exigem autenticação)

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `POST` | `/users` | Cadastra um novo usuário com validação via Zod e hash de senha com Argon2. |
| `POST` | `/sessions` | Autentica o usuário (Zod + Argon2), gera o token JWT com `{ sub, role }` e retorna o token no cookie `httpOnly` (quando `x-platform: web`) e no corpo JSON. |

### Rotas protegidas (exigem token JWT válido via `preHandler: [checkRequestJWT]`)

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `POST` | `/classes` | Cria uma nova aula e seus horários em transação no banco, associando a aula ao usuário autenticado via `getAuthenticatedUserFromRequest(request)` (`user.sub`). |

---

## Exemplos de requisição e cenários testados em `/docs`

Todos os cenários abaixo foram estruturados para validação via `http://localhost:3333/docs` (Scalar):

### 1. `POST /sessions` com credenciais válidas (`200 OK`)

**Requisição:**
```http
POST http://localhost:3333/sessions
Content-Type: application/json
x-platform: web
```

```json
{
  "email": "professor@proffy.com",
  "password": "senha-segura-123"
}
```

**Resposta esperada (`200 OK`):**
- Header `Set-Cookie` contendo `token=<jwt>; HttpOnly; Path=/; SameSite=Lax` (quando `x-platform: web`).
- Corpo JSON:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 2. `POST /classes` com token válido (`201 Created`)

O token pode ser enviado automaticamente via cookie `token` (cliente Web) ou pelo header `Authorization` (cliente Mobile).

**Requisição:**
```http
POST http://localhost:3333/classes
Content-Type: application/json
Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

```json
{
  "subject": "Matemática",
  "cost": 80,
  "schedules": [
    {
      "week_day": 1,
      "from": "09:00",
      "to": "12:00"
    },
    {
      "week_day": 3,
      "from": "14:00",
      "to": "18:00"
    }
  ]
}
```

**Resposta esperada (`201 Created`):**
```json
{
  "classeId": "550e8400-e29b-41d4-a716-446655440000"
}
```
> A aula é salva na tabela `classes` associada ao `userId` extraído do token (`user.sub`), e os horários são convertidos para minutos e salvos na tabela `class_schedule` dentro de uma transação.

---

### 3. `POST /classes` sem token (`401 Unauthorized`)

**Requisição (sem cookie `token` e sem header `Authorization`):**
```http
POST http://localhost:3333/classes
Content-Type: application/json
```

```json
{
  "subject": "Matemática",
  "cost": 80,
  "schedules": [
    {
      "week_day": 1,
      "from": "09:00",
      "to": "12:00"
    }
  ]
}
```

**Resposta esperada (`401 Unauthorized`):**
```text
(corpo vazio)
```
> O hook `checkRequestJWT` interrompe a requisição no `preHandler` e o handler da rota não é executado.

---

### 4. `POST /classes` com token inválido ou expirado (`401 Unauthorized`)

**Requisição:**
```http
POST http://localhost:3333/classes
Content-Type: application/json
Authorization: token.invalido.ou.expirado
```

```json
{
  "subject": "Matemática",
  "cost": 80,
  "schedules": [
    {
      "week_day": 1,
      "from": "09:00",
      "to": "12:00"
    }
  ]
}
```

**Resposta esperada (`401 Unauthorized`):**
```text
(corpo vazio)
```
> A validação `jwt.verify(token, env.JWT_TOKEN)` falha, o bloco `catch` captura o erro e responde `401` sem expor detalhes internos ao cliente.

---

## Estrutura principal da camada de autenticação

```text
src/
├── @types/
│   └── fastify.d.ts                            # Declaration merging adicionando user? em FastifyRequest
├── routers/
│   ├── create-users.ts                         # POST /users (pública)
│   ├── login.ts                                # POST /sessions (pública)
│   └── create-classes.ts                       # POST /classes (protegida com preHandler: [checkRequestJWT])
├── routes/
│   └── hooks/
│       └── check-request-jwt.ts                # Hook de autenticação JWT
├── utils/
│   ├── convert-hours-to-minute.ts              # Conversão de horários HH:MM para minutos
│   ├── env.ts                                  # Validação de variáveis de ambiente
│   └── get-authenticated-user-from-request.ts  # Helper DRY para extrair request.user
└── server.ts                                   # Registro de plugins e rotas Fastify
```
