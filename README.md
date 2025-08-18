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