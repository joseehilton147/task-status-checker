/**
 * Focus Chain Implementation for Task Status Checker
 * Prevents context poisoning by reinserting original objectives every N tasks
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const CHECKPOINTS_DIR = '.alfredo/checkpoints';
const REINJECT_THRESHOLD = 5;

export interface FocusCheckpoint {
  taskId: string;
  objective: string;
  taskCount: number;
  tasks: Array<{
    id: string;
    description: string;
    status: string;
    timestamp: string;
  }>;
  lastReinject?: string;
}

async function ensureCheckpointsDir(): Promise<void> {
  try {
    await fs.mkdir(CHECKPOINTS_DIR, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create checkpoints directory: ${error}`);
  }
}

export async function initializeFocusChain(taskId: string, objective: string): Promise<void> {
  await ensureCheckpointsDir();
  
  const checkpoint: FocusCheckpoint = {
    taskId,
    objective,
    taskCount: 0,
    tasks: []
  };
  
  const filePath = join(CHECKPOINTS_DIR, `${taskId}.json`);
  await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2));
}

export async function addFocusCheckpoint(
  taskId: string, 
  description: string, 
  status: string
): Promise<string | null> {
  const filePath = join(CHECKPOINTS_DIR, `${taskId}.json`);
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const checkpoint: FocusCheckpoint = JSON.parse(data);
    
    checkpoint.tasks.push({
      id: crypto.randomUUID(),
      description,
      status,
      timestamp: new Date().toISOString()
    });
    
    checkpoint.taskCount++;
    
    // Check if we need to reinject focus
    if (checkpoint.taskCount % REINJECT_THRESHOLD === 0) {
      const reinjectMessage = generateFocusReinject(checkpoint);
      checkpoint.lastReinject = new Date().toISOString();
      
      await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2));
      return reinjectMessage;
    }
    
    await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2));
    return null;
    
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      // Initialize if doesn't exist
      await initializeFocusChain(taskId, description);
      return null;
    }
    throw error;
  }
}

function generateFocusReinject(checkpoint: FocusCheckpoint): string {
  const completed = checkpoint.tasks.filter(t => t.status === 'completed');
  const pending = checkpoint.tasks.filter(t => t.status !== 'completed');
  
  return `🎯 FOCUS REINJECT - TASK #${checkpoint.taskCount}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ORIGINAL OBJECTIVE: ${checkpoint.objective}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ COMPLETED (${completed.length}):
${completed.map(t => `- ${t.description}`).join('\n')}

⏳ REMAINING (${pending.length}):
${pending.map(t => `- ${t.description}`).join('\n')}

⚠️ CRITICAL: Stay focused on original objective. No scope creep.`;
}

export async function getFocusStatus(taskId: string): Promise<FocusCheckpoint | null> {
  const filePath = join(CHECKPOINTS_DIR, `${taskId}.json`);
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
