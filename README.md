# Task Status Checker

Gerenciador de estado de tarefas assíncronas com zero dependências, usando sistema de arquivos. Ideal para orquestração de Agentes de IA e workflows automatizados.

## Instalação

```bash
npm install task-status-checker
```

## Uso como Biblioteca

```typescript
import { create, getStatus, update } from 'task-status-checker';

// Criar tarefa
const taskId = await create('my-agent', 'Processando dados...');

// Consultar status
const status = await getStatus(taskId);

// Atualizar tarefa
await update(taskId, 'completed', 'Processamento concluído');
```

## Uso como Servidor MCP

Para usar como servidor MCP (Model Context Protocol), configure no seu arquivo MCP:

```json
{
  "mcpServers": {
    "TaskStatus": {
      "command": "node",
      "args": ["/caminho/para/seu/projeto/node_modules/task-status-checker/dist/server.js", "--mcp"]
    }
  }
}
```

### Ferramentas MCP Disponíveis

- **create_task**: Criar nova tarefa
- **get_task_status**: Consultar status da tarefa  
- **update_task**: Atualizar tarefa

### Estrutura de Dados

```typescript
interface TaskStatus {
  status: 'running' | 'completed' | 'failed' | 'blocked';
  owner: string;
  details: string;
  started_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}
```

## Armazenamento

As tarefas são salvas como arquivos JSON no diretório `.alfredo/tasks/` do seu projeto.