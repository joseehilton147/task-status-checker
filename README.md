# Task Status Checker

Um gerenciador de estado de tarefas assíncronas, leve e com zero dependências, que utiliza o sistema de arquivos. Projetado para orquestração de Agentes de IA e workflows automatizados, desenvolvimento pensado no ecossistema Alfredo, porém de facil adaptação.

## Instalação

```bash
pnpm add task-status-checker
```

## Uso

### Criar uma Nova Tarefa

```typescript
import { create } from 'task-status-checker';

const taskId = await create('alfredo-orchestrator', 'Iniciando a execução da SPEC-123');
console.log(`Tarefa criada com ID: ${taskId}`);
```

### Obter o Status de uma Tarefa

```typescript
import { getStatus } from 'task-status-checker';

try {
  const status = await getStatus('seu-task-id');
  console.log(`O status da tarefa é: ${status.status}`);
} catch (error) {
  console.error(error.message);
}
```

### Atualizar uma Tarefa

```typescript
import { update } from 'task-status-checker';

try {
  await update('seu-task-id', 'completed', 'A SPEC-123 foi concluída com sucesso.');
  console.log('Tarefa atualizada!');
} catch (error) {
  console.error(error.message);
}
```

## Uso como Servidor MCP (Model Context Protocol)

Este pacote pode ser executado como um servidor MCP independente para desacoplar a gestão de estado do seu agente principal.

### 1. Executando o Servidor

Após a instalação das dependências (`pnpm install`) e compilação (`pnpm run build`), inicie o servidor com:

```bash
pnpm run start:mcp
```

O servidor será iniciado na porta 3000.

### 2. Configurando no seu Projeto MCP

Para usar o TaskStatus como servidor MCP, configure o arquivo de configuração MCP:

**Configuração Local (.kiro/settings/mcp.json):**
```json
{
  "mcpServers": {
    "TaskStatus": {
      "command": "node",
      "args": ["dist/server.js", "--mcp"],
      "cwd": "."
    }
  }
}
```

**Configuração Global (~/.kiro/settings/mcp.json):**
```json
{
  "mcpServers": {
    "TaskStatus": {
      "command": "node",
      "args": ["/caminho/completo/para/task-status-checker/dist/server.js", "--mcp"]
    }
  }
}
```

**Usando via npx:**
```json
{
  "mcpServers": {
    "TaskStatus": {
      "command": "npx",
      "args": ["-y", "task-status-checker", "--mcp"]
    }
  }
}
```

### 3. Usando as Ferramentas MCP

Após a configuração, as seguintes ferramentas estarão disponíveis no seu cliente MCP:

**create_task** - Criar uma nova tarefa:
```typescript
// Parâmetros:
{
  owner: "alfredo-orchestrator",
  details: "Executando a SPEC-456"
}
// Retorna: { taskId: "uuid-gerado" }
```

**get_task_status** - Obter status de uma tarefa:
```typescript
// Parâmetros:
{
  taskId: "abc123-def456-ghi789"
}
// Retorna: TaskStatus completo
```

**update_task** - Atualizar uma tarefa:
```typescript
// Parâmetros:
{
  taskId: "abc123-def456-ghi789",
  newStatus: "completed", // running | completed | failed | blocked
  newDetails: "SPEC-456 executada com sucesso"
}
// Retorna: { success: true }
```

### 4. Modo HTTP (Alternativo)

O servidor também pode ser executado em modo HTTP para acesso direto via API:

```bash
# Inicia servidor HTTP na porta 3000
node dist/server.js

# Ou usando o script npm
pnpm run start:mcp
```

**Exemplo de requisição HTTP:**
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "create",
    "params": {
      "owner": "alfredo-orchestrator",
      "details": "Executando a SPEC-456"
    }
  }'
```

### 5. Estrutura de Dados

**TaskStatus:**
```typescript
interface TaskStatus {
  status: 'running' | 'completed' | 'failed' | 'blocked';
  owner: string;
  details: string;
  started_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}
```