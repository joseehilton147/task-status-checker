import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { create, getStatus, update, TaskStatus, TaskNotFoundError, InvalidStatusError } from './index.js';

const TASKS_DIR = '.alfredo/tasks';

/**
 * Utility function to clean up test files after each test
 */
async function cleanupTestFiles(): Promise<void> {
  try {
    const files = await fs.readdir(TASKS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        await fs.unlink(join(TASKS_DIR, file));
      }
    }
  } catch (error) {
    // Directory might not exist, which is fine
  }
}

/**
 * Utility function to read a task file and parse its JSON content
 */
async function readTaskFile(taskId: string): Promise<TaskStatus> {
  const filePath = join(TASKS_DIR, `${taskId}.json`);
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as TaskStatus;
}

describe('create', () => {
  test('should create a task with valid owner and details', async () => {
    await cleanupTestFiles();
    
    const owner = 'alfredo-orchestrator';
    const details = 'Test task creation';
    
    const taskId = await create(owner, details);
    
    // Verify task ID is a valid UUID format
    assert.match(taskId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    
    // Verify file was created
    const filePath = join(TASKS_DIR, `${taskId}.json`);
    const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
    assert.strictEqual(fileExists, true);
    
    // Verify file content
    const taskStatus = await readTaskFile(taskId);
    assert.strictEqual(taskStatus.status, 'running');
    assert.strictEqual(taskStatus.owner, owner);
    assert.strictEqual(taskStatus.details, details);
    
    // Verify timestamps are ISO 8601 format and equal
    assert.match(taskStatus.started_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.match(taskStatus.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.strictEqual(taskStatus.started_at, taskStatus.updated_at);
    
    await cleanupTestFiles();
  });

  test('should create tasks directory automatically if it does not exist', async () => {
    await cleanupTestFiles();
    
    // Remove the tasks directory if it exists
    try {
      await fs.rmdir(TASKS_DIR);
    } catch (error) {
      // Directory might not exist, which is fine
    }
    
    const owner = 'test-owner';
    const details = 'Test directory creation';
    
    const taskId = await create(owner, details);
    
    // Verify directory was created
    const dirExists = await fs.access(TASKS_DIR).then(() => true).catch(() => false);
    assert.strictEqual(dirExists, true);
    
    // Verify task was created successfully
    const taskStatus = await readTaskFile(taskId);
    assert.strictEqual(taskStatus.owner, owner);
    assert.strictEqual(taskStatus.details, details);
    
    await cleanupTestFiles();
  });

  test('should generate unique task IDs for multiple tasks', async () => {
    await cleanupTestFiles();
    
    const taskIds = new Set<string>();
    const numTasks = 5;
    
    for (let i = 0; i < numTasks; i++) {
      const taskId = await create(`owner-${i}`, `Task ${i}`);
      assert.strictEqual(taskIds.has(taskId), false, `Duplicate task ID generated: ${taskId}`);
      taskIds.add(taskId);
    }
    
    assert.strictEqual(taskIds.size, numTasks);
    
    await cleanupTestFiles();
  });

  test('should trim whitespace from owner and details', async () => {
    await cleanupTestFiles();
    
    const owner = '  alfredo-orchestrator  ';
    const details = '  Test task with whitespace  ';
    
    const taskId = await create(owner, details);
    const taskStatus = await readTaskFile(taskId);
    
    assert.strictEqual(taskStatus.owner, 'alfredo-orchestrator');
    assert.strictEqual(taskStatus.details, 'Test task with whitespace');
    
    await cleanupTestFiles();
  });

  test('should throw error for empty owner parameter', async () => {
    await assert.rejects(
      async () => await create('', 'Valid details'),
      {
        name: 'Error',
        message: 'Owner parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for whitespace-only owner parameter', async () => {
    await assert.rejects(
      async () => await create('   ', 'Valid details'),
      {
        name: 'Error',
        message: 'Owner parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for null owner parameter', async () => {
    await assert.rejects(
      async () => await create(null as any, 'Valid details'),
      {
        name: 'Error',
        message: 'Owner parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for non-string owner parameter', async () => {
    await assert.rejects(
      async () => await create(123 as any, 'Valid details'),
      {
        name: 'Error',
        message: 'Owner parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for empty details parameter', async () => {
    await assert.rejects(
      async () => await create('valid-owner', ''),
      {
        name: 'Error',
        message: 'Details parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for whitespace-only details parameter', async () => {
    await assert.rejects(
      async () => await create('valid-owner', '   '),
      {
        name: 'Error',
        message: 'Details parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for null details parameter', async () => {
    await assert.rejects(
      async () => await create('valid-owner', null as any),
      {
        name: 'Error',
        message: 'Details parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for non-string details parameter', async () => {
    await assert.rejects(
      async () => await create('valid-owner', 123 as any),
      {
        name: 'Error',
        message: 'Details parameter is required and must be a non-empty string'
      }
    );
  });
});

describe('getStatus', () => {
  test('should retrieve task status for valid task ID', async () => {
    await cleanupTestFiles();
    
    const owner = 'alfredo-orchestrator';
    const details = 'Test task for retrieval';
    
    // Create a task first
    const taskId = await create(owner, details);
    
    // Retrieve the task status
    const taskStatus = await getStatus(taskId);
    
    // Verify all fields are present and correct
    assert.strictEqual(taskStatus.status, 'running');
    assert.strictEqual(taskStatus.owner, owner);
    assert.strictEqual(taskStatus.details, details);
    assert.match(taskStatus.started_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.match(taskStatus.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.strictEqual(taskStatus.started_at, taskStatus.updated_at);
    
    await cleanupTestFiles();
  });

  test('should throw TaskNotFoundError for non-existent task ID', async () => {
    await cleanupTestFiles();
    
    const nonExistentTaskId = 'non-existent-task-id';
    
    await assert.rejects(
      async () => await getStatus(nonExistentTaskId),
      {
        name: 'TaskNotFoundError',
        message: `Task with ID '${nonExistentTaskId}' not found`
      }
    );
    
    await cleanupTestFiles();
  });

  test('should throw TaskNotFoundError for UUID format but non-existent task', async () => {
    await cleanupTestFiles();
    
    const nonExistentUUID = '12345678-1234-4567-8901-123456789012';
    
    await assert.rejects(
      async () => await getStatus(nonExistentUUID),
      {
        name: 'TaskNotFoundError',
        message: `Task with ID '${nonExistentUUID}' not found`
      }
    );
    
    await cleanupTestFiles();
  });

  test('should handle task ID with whitespace by trimming', async () => {
    await cleanupTestFiles();
    
    const owner = 'test-owner';
    const details = 'Test whitespace handling';
    
    // Create a task first
    const taskId = await create(owner, details);
    
    // Retrieve with whitespace around task ID
    const taskStatus = await getStatus(`  ${taskId}  `);
    
    assert.strictEqual(taskStatus.owner, owner);
    assert.strictEqual(taskStatus.details, details);
    
    await cleanupTestFiles();
  });

  test('should throw error for empty task ID parameter', async () => {
    await assert.rejects(
      async () => await getStatus(''),
      {
        name: 'Error',
        message: 'Task ID parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for whitespace-only task ID parameter', async () => {
    await assert.rejects(
      async () => await getStatus('   '),
      {
        name: 'Error',
        message: 'Task ID parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for null task ID parameter', async () => {
    await assert.rejects(
      async () => await getStatus(null as any),
      {
        name: 'Error',
        message: 'Task ID parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for non-string task ID parameter', async () => {
    await assert.rejects(
      async () => await getStatus(123 as any),
      {
        name: 'Error',
        message: 'Task ID parameter is required and must be a non-empty string'
      }
    );
  });

  test('should handle corrupted JSON file gracefully', async () => {
    await cleanupTestFiles();
    
    const taskId = 'test-corrupted-json';
    const filePath = join(TASKS_DIR, `${taskId}.json`);
    
    // Ensure directory exists
    await fs.mkdir(TASKS_DIR, { recursive: true });
    
    // Write invalid JSON to file
    await fs.writeFile(filePath, '{ invalid json content', 'utf8');
    
    await assert.rejects(
      async () => await getStatus(taskId),
      {
        name: 'Error',
        message: /Failed to retrieve task status for ID 'test-corrupted-json': Failed to parse task data/
      }
    );
    
    await cleanupTestFiles();
  });

  test('should validate task data structure and throw error for invalid status', async () => {
    await cleanupTestFiles();
    
    const taskId = 'test-invalid-status';
    const filePath = join(TASKS_DIR, `${taskId}.json`);
    
    // Ensure directory exists
    await fs.mkdir(TASKS_DIR, { recursive: true });
    
    // Write task data with invalid status
    const invalidTaskData = {
      status: 'invalid-status',
      owner: 'test-owner',
      details: 'Test details',
      started_at: '2024-01-15T10:30:00.000Z',
      updated_at: '2024-01-15T10:30:00.000Z'
    };
    
    await fs.writeFile(filePath, JSON.stringify(invalidTaskData), 'utf8');
    
    await assert.rejects(
      async () => await getStatus(taskId),
      {
        name: 'Error',
        message: /Failed to retrieve task status for ID 'test-invalid-status': Invalid status: invalid-status/
      }
    );
    
    await cleanupTestFiles();
  });

  test('should validate task data structure and throw error for missing owner', async () => {
    await cleanupTestFiles();
    
    const taskId = 'test-missing-owner';
    const filePath = join(TASKS_DIR, `${taskId}.json`);
    
    // Ensure directory exists
    await fs.mkdir(TASKS_DIR, { recursive: true });
    
    // Write task data with missing owner
    const invalidTaskData = {
      status: 'running',
      details: 'Test details',
      started_at: '2024-01-15T10:30:00.000Z',
      updated_at: '2024-01-15T10:30:00.000Z'
    };
    
    await fs.writeFile(filePath, JSON.stringify(invalidTaskData), 'utf8');
    
    await assert.rejects(
      async () => await getStatus(taskId),
      {
        name: 'Error',
        message: /Failed to retrieve task status for ID 'test-missing-owner': Owner must be a non-empty string/
      }
    );
    
    await cleanupTestFiles();
  });

  test('should validate task data structure and throw error for invalid timestamp format', async () => {
    await cleanupTestFiles();
    
    const taskId = 'test-invalid-timestamp';
    const filePath = join(TASKS_DIR, `${taskId}.json`);
    
    // Ensure directory exists
    await fs.mkdir(TASKS_DIR, { recursive: true });
    
    // Write task data with invalid timestamp format
    const invalidTaskData = {
      status: 'running',
      owner: 'test-owner',
      details: 'Test details',
      started_at: 'invalid-timestamp',
      updated_at: '2024-01-15T10:30:00.000Z'
    };
    
    await fs.writeFile(filePath, JSON.stringify(invalidTaskData), 'utf8');
    
    await assert.rejects(
      async () => await getStatus(taskId),
      {
        name: 'Error',
        message: /Failed to retrieve task status for ID 'test-invalid-timestamp': started_at must be a valid ISO 8601 timestamp/
      }
    );
    
    await cleanupTestFiles();
  });

  test('should return complete TaskStatus object with all required fields', async () => {
    await cleanupTestFiles();
    
    const owner = 'comprehensive-test-owner';
    const details = 'Comprehensive test for all fields';
    
    // Create a task first
    const taskId = await create(owner, details);
    
    // Retrieve the task status
    const taskStatus = await getStatus(taskId);
    
    // Verify the object has exactly the expected properties
    const expectedKeys = ['status', 'owner', 'details', 'started_at', 'updated_at'];
    const actualKeys = Object.keys(taskStatus).sort();
    assert.deepStrictEqual(actualKeys, expectedKeys.sort());
    
    // Verify types of all fields
    assert.strictEqual(typeof taskStatus.status, 'string');
    assert.strictEqual(typeof taskStatus.owner, 'string');
    assert.strictEqual(typeof taskStatus.details, 'string');
    assert.strictEqual(typeof taskStatus.started_at, 'string');
    assert.strictEqual(typeof taskStatus.updated_at, 'string');
    
    // Verify status is one of the allowed values
    const validStatuses = ['running', 'completed', 'failed', 'blocked'];
    assert.ok(validStatuses.includes(taskStatus.status));
    
    await cleanupTestFiles();
  });
});

describe('update', () => {
  test('should update task status and details for valid task ID', async () => {
    await cleanupTestFiles();
    
    const owner = 'alfredo-orchestrator';
    const initialDetails = 'Initial task details';
    
    // Create a task first
    const taskId = await create(owner, initialDetails);
    
    // Get initial task state
    const initialTask = await getStatus(taskId);
    
    // Wait a small amount to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Update the task
    const newStatus = 'completed';
    const newDetails = 'Task has been completed successfully';
    await update(taskId, newStatus, newDetails);
    
    // Retrieve updated task
    const updatedTask = await getStatus(taskId);
    
    // Verify status and details were updated
    assert.strictEqual(updatedTask.status, newStatus);
    assert.strictEqual(updatedTask.details, newDetails);
    
    // Verify preserved fields
    assert.strictEqual(updatedTask.owner, owner);
    assert.strictEqual(updatedTask.started_at, initialTask.started_at);
    
    // Verify updated_at timestamp was refreshed
    assert.notStrictEqual(updatedTask.updated_at, initialTask.updated_at);
    assert.match(updatedTask.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    
    // Verify updated_at is more recent than started_at
    assert.ok(new Date(updatedTask.updated_at) >= new Date(updatedTask.started_at));
    
    await cleanupTestFiles();
  });

  test('should update task with all valid status values', async () => {
    await cleanupTestFiles();
    
    const owner = 'test-owner';
    const initialDetails = 'Test task';
    
    // Create a task first
    const taskId = await create(owner, initialDetails);
    
    const validStatuses: TaskStatus['status'][] = ['running', 'completed', 'failed', 'blocked'];
    
    for (const status of validStatuses) {
      const details = `Task is now ${status}`;
      
      // Wait a small amount to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await update(taskId, status, details);
      
      const updatedTask = await getStatus(taskId);
      assert.strictEqual(updatedTask.status, status);
      assert.strictEqual(updatedTask.details, details);
    }
    
    await cleanupTestFiles();
  });

  test('should preserve existing owner and started_at fields', async () => {
    await cleanupTestFiles();
    
    const owner = 'preservation-test-owner';
    const initialDetails = 'Initial details';
    
    // Create a task first
    const taskId = await create(owner, initialDetails);
    const initialTask = await getStatus(taskId);
    
    // Update multiple times
    await update(taskId, 'completed', 'First update');
    await update(taskId, 'failed', 'Second update');
    await update(taskId, 'blocked', 'Third update');
    
    const finalTask = await getStatus(taskId);
    
    // Verify preserved fields remain unchanged
    assert.strictEqual(finalTask.owner, owner);
    assert.strictEqual(finalTask.started_at, initialTask.started_at);
    
    // Verify updated fields
    assert.strictEqual(finalTask.status, 'blocked');
    assert.strictEqual(finalTask.details, 'Third update');
    
    await cleanupTestFiles();
  });

  test('should trim whitespace from task ID and details', async () => {
    await cleanupTestFiles();
    
    const owner = 'whitespace-test-owner';
    const initialDetails = 'Initial details';
    
    // Create a task first
    const taskId = await create(owner, initialDetails);
    
    // Update with whitespace around parameters
    const newDetails = '  Updated details with whitespace  ';
    await update(`  ${taskId}  `, 'completed', newDetails);
    
    const updatedTask = await getStatus(taskId);
    assert.strictEqual(updatedTask.status, 'completed');
    assert.strictEqual(updatedTask.details, 'Updated details with whitespace');
    
    await cleanupTestFiles();
  });

  test('should throw TaskNotFoundError for non-existent task ID', async () => {
    await cleanupTestFiles();
    
    const nonExistentTaskId = 'non-existent-task-id';
    
    await assert.rejects(
      async () => await update(nonExistentTaskId, 'completed', 'Should not work'),
      {
        name: 'TaskNotFoundError',
        message: `Task with ID '${nonExistentTaskId}' not found`
      }
    );
    
    await cleanupTestFiles();
  });

  test('should throw InvalidStatusError for invalid status values', async () => {
    await cleanupTestFiles();
    
    const owner = 'test-owner';
    const initialDetails = 'Test task';
    
    // Create a task first
    const taskId = await create(owner, initialDetails);
    
    const invalidStatuses = ['invalid', 'pending', 'cancelled', 'paused', ''];
    
    for (const invalidStatus of invalidStatuses) {
      await assert.rejects(
        async () => await update(taskId, invalidStatus as any, 'Should not work'),
        {
          name: 'InvalidStatusError',
          message: `Invalid status '${invalidStatus}'. Must be one of: running, completed, failed, blocked`
        }
      );
    }
    
    await cleanupTestFiles();
  });

  test('should throw error for empty task ID parameter', async () => {
    await assert.rejects(
      async () => await update('', 'completed', 'Valid details'),
      {
        name: 'Error',
        message: 'Task ID parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for whitespace-only task ID parameter', async () => {
    await assert.rejects(
      async () => await update('   ', 'completed', 'Valid details'),
      {
        name: 'Error',
        message: 'Task ID parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for null task ID parameter', async () => {
    await assert.rejects(
      async () => await update(null as any, 'completed', 'Valid details'),
      {
        name: 'Error',
        message: 'Task ID parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for non-string task ID parameter', async () => {
    await assert.rejects(
      async () => await update(123 as any, 'completed', 'Valid details'),
      {
        name: 'Error',
        message: 'Task ID parameter is required and must be a non-empty string'
      }
    );
  });

  test('should throw error for null status parameter', async () => {
    await cleanupTestFiles();
    
    const owner = 'test-owner';
    const taskId = await create(owner, 'Test task');
    
    await assert.rejects(
      async () => await update(taskId, null as any, 'Valid details'),
      {
        name: 'Error',
        message: 'Status parameter is required and must be a string'
      }
    );
    
    await cleanupTestFiles();
  });

  test('should throw error for non-string status parameter', async () => {
    await cleanupTestFiles();
    
    const owner = 'test-owner';
    const taskId = await create(owner, 'Test task');
    
    await assert.rejects(
      async () => await update(taskId, 123 as any, 'Valid details'),
      {
        name: 'Error',
        message: 'Status parameter is required and must be a string'
      }
    );
    
    await cleanupTestFiles();
  });

  test('should throw error for null details parameter', async () => {
    await cleanupTestFiles();
    
    const owner = 'test-owner';
    const taskId = await create(owner, 'Test task');
    
    await assert.rejects(
      async () => await update(taskId, 'completed', null as any),
      {
        name: 'Error',
        message: 'Details parameter is required and must be a string'
      }
    );
    
    await cleanupTestFiles();
  });

  test('should throw error for non-string details parameter', async () => {
    await cleanupTestFiles();
    
    const owner = 'test-owner';
    const taskId = await create(owner, 'Test task');
    
    await assert.rejects(
      async () => await update(taskId, 'completed', 123 as any),
      {
        name: 'Error',
        message: 'Details parameter is required and must be a string'
      }
    );
    
    await cleanupTestFiles();
  });

  test('should handle empty string details parameter', async () => {
    await cleanupTestFiles();
    
    const owner = 'test-owner';
    const initialDetails = 'Initial details';
    
    // Create a task first
    const taskId = await create(owner, initialDetails);
    
    // Update with empty details (should be allowed)
    await update(taskId, 'completed', '');
    
    const updatedTask = await getStatus(taskId);
    assert.strictEqual(updatedTask.status, 'completed');
    assert.strictEqual(updatedTask.details, '');
    
    await cleanupTestFiles();
  });

  test('should perform atomic write operations', async () => {
    await cleanupTestFiles();
    
    const owner = 'atomic-test-owner';
    const initialDetails = 'Initial details';
    
    // Create a task first
    const taskId = await create(owner, initialDetails);
    
    // Update the task
    await update(taskId, 'completed', 'Updated details');
    
    // Verify the file was written atomically by reading it directly
    const filePath = join(TASKS_DIR, `${taskId}.json`);
    const fileContent = await fs.readFile(filePath, 'utf8');
    const taskData = JSON.parse(fileContent);
    
    // Verify the file contains the complete updated data
    assert.strictEqual(taskData.status, 'completed');
    assert.strictEqual(taskData.details, 'Updated details');
    assert.strictEqual(taskData.owner, owner);
    assert.match(taskData.started_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.match(taskData.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    
    await cleanupTestFiles();
  });

  test('should update timestamp with proper ISO 8601 format', async () => {
    await cleanupTestFiles();
    
    const owner = 'timestamp-test-owner';
    const initialDetails = 'Initial details';
    
    // Create a task first
    const taskId = await create(owner, initialDetails);
    const initialTask = await getStatus(taskId);
    
    // Wait to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Update the task
    await update(taskId, 'completed', 'Updated details');
    
    const updatedTask = await getStatus(taskId);
    
    // Verify updated_at timestamp format
    assert.match(updatedTask.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    
    // Verify updated_at is different from initial
    assert.notStrictEqual(updatedTask.updated_at, initialTask.updated_at);
    
    // Verify updated_at is a valid date
    const updatedDate = new Date(updatedTask.updated_at);
    assert.ok(!isNaN(updatedDate.getTime()));
    
    // Verify updated_at is more recent than started_at
    const startedDate = new Date(updatedTask.started_at);
    assert.ok(updatedDate >= startedDate);
    
    await cleanupTestFiles();
  });

  test('should handle sequential updates correctly', async () => {
    await cleanupTestFiles();
    
    const owner = 'sequential-test-owner';
    const initialDetails = 'Initial details';
    
    // Create a task first
    const taskId = await create(owner, initialDetails);
    
    // Perform sequential updates
    await update(taskId, 'completed', 'Update 1');
    await update(taskId, 'failed', 'Update 2');
    await update(taskId, 'blocked', 'Update 3');
    
    // Verify the final task state
    const finalTask = await getStatus(taskId);
    
    // The last update should have succeeded
    assert.strictEqual(finalTask.status, 'blocked');
    assert.strictEqual(finalTask.details, 'Update 3');
    
    // Verify preserved fields
    assert.strictEqual(finalTask.owner, owner);
    assert.match(finalTask.started_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.match(finalTask.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    
    await cleanupTestFiles();
  });
});

describe('Integration Tests - Complete Task Lifecycle', () => {
  test('should handle complete task lifecycle: create → get → update → get', async () => {
    await cleanupTestFiles();
    
    const owner = 'integration-test-owner';
    const initialDetails = 'Integration test task';
    
    // Step 1: Create task
    const taskId = await create(owner, initialDetails);
    assert.match(taskId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    
    // Step 2: Get initial status
    const initialStatus = await getStatus(taskId);
    assert.strictEqual(initialStatus.status, 'running');
    assert.strictEqual(initialStatus.owner, owner);
    assert.strictEqual(initialStatus.details, initialDetails);
    assert.strictEqual(initialStatus.started_at, initialStatus.updated_at);
    
    // Wait to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Step 3: Update task
    const updatedDetails = 'Task has been updated';
    await update(taskId, 'completed', updatedDetails);
    
    // Step 4: Get updated status
    const updatedStatus = await getStatus(taskId);
    assert.strictEqual(updatedStatus.status, 'completed');
    assert.strictEqual(updatedStatus.owner, owner);
    assert.strictEqual(updatedStatus.details, updatedDetails);
    assert.strictEqual(updatedStatus.started_at, initialStatus.started_at); // Preserved
    assert.notStrictEqual(updatedStatus.updated_at, initialStatus.updated_at); // Changed
    
    // Verify filesystem persistence by reading file directly
    const filePath = join(TASKS_DIR, `${taskId}.json`);
    const fileContent = await fs.readFile(filePath, 'utf8');
    const persistedData = JSON.parse(fileContent);
    
    assert.deepStrictEqual(persistedData, updatedStatus);
    
    await cleanupTestFiles();
  });

  test('should handle multiple task lifecycle operations in sequence', async () => {
    await cleanupTestFiles();
    
    const tasks = [
      { owner: 'owner-1', details: 'Task 1' },
      { owner: 'owner-2', details: 'Task 2' },
      { owner: 'owner-3', details: 'Task 3' }
    ];
    
    const taskIds: string[] = [];
    
    // Create multiple tasks
    for (const task of tasks) {
      const taskId = await create(task.owner, task.details);
      taskIds.push(taskId);
    }
    
    // Verify all tasks were created
    assert.strictEqual(taskIds.length, 3);
    assert.strictEqual(new Set(taskIds).size, 3); // All unique
    
    // Update each task to different statuses
    const statuses: TaskStatus['status'][] = ['completed', 'failed', 'blocked'];
    
    for (let i = 0; i < taskIds.length; i++) {
      await update(taskIds[i], statuses[i], `Updated ${tasks[i].details}`);
    }
    
    // Verify all updates persisted correctly
    for (let i = 0; i < taskIds.length; i++) {
      const status = await getStatus(taskIds[i]);
      assert.strictEqual(status.status, statuses[i]);
      assert.strictEqual(status.owner, tasks[i].owner);
      assert.strictEqual(status.details, `Updated ${tasks[i].details}`);
    }
    
    await cleanupTestFiles();
  });

  test('should maintain filesystem persistence across function calls', async () => {
    await cleanupTestFiles();
    
    const owner = 'persistence-test-owner';
    const details = 'Persistence test task';
    
    // Create task
    const taskId = await create(owner, details);
    
    // Verify file exists on filesystem
    const filePath = join(TASKS_DIR, `${taskId}.json`);
    const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
    assert.strictEqual(fileExists, true);
    
    // Read file directly from filesystem
    const fileContent1 = await fs.readFile(filePath, 'utf8');
    const fileData1 = JSON.parse(fileContent1);
    
    // Get status through API
    const apiData1 = await getStatus(taskId);
    
    // Verify filesystem and API data match
    assert.deepStrictEqual(fileData1, apiData1);
    
    // Update task
    await update(taskId, 'completed', 'Updated details');
    
    // Read file directly from filesystem again
    const fileContent2 = await fs.readFile(filePath, 'utf8');
    const fileData2 = JSON.parse(fileContent2);
    
    // Get status through API again
    const apiData2 = await getStatus(taskId);
    
    // Verify filesystem and API data still match after update
    assert.deepStrictEqual(fileData2, apiData2);
    
    // Verify the update was persisted
    assert.strictEqual(fileData2.status, 'completed');
    assert.strictEqual(fileData2.details, 'Updated details');
    assert.notStrictEqual(fileData2.updated_at, fileData1.updated_at);
    
    await cleanupTestFiles();
  });

  test('should handle task operations with directory auto-creation in clean environment', async () => {
    await cleanupTestFiles();
    
    // Remove the entire .alfredo directory to simulate clean environment
    try {
      await fs.rm('.alfredo', { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, which is fine
    }
    
    // Verify directory doesn't exist
    const dirExists = await fs.access('.alfredo').then(() => true).catch(() => false);
    assert.strictEqual(dirExists, false);
    
    const owner = 'clean-env-test-owner';
    const details = 'Clean environment test';
    
    // Create task - should auto-create directory
    const taskId = await create(owner, details);
    
    // Verify directory was created
    const dirExistsAfter = await fs.access('.alfredo').then(() => true).catch(() => false);
    assert.strictEqual(dirExistsAfter, true);
    
    // Verify tasks subdirectory was created
    const tasksDirExists = await fs.access(TASKS_DIR).then(() => true).catch(() => false);
    assert.strictEqual(tasksDirExists, true);
    
    // Verify task was created successfully
    const taskStatus = await getStatus(taskId);
    assert.strictEqual(taskStatus.owner, owner);
    assert.strictEqual(taskStatus.details, details);
    
    // Verify file exists in the auto-created directory
    const filePath = join(TASKS_DIR, `${taskId}.json`);
    const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
    assert.strictEqual(fileExists, true);
    
    await cleanupTestFiles();
  });
});

describe('Integration Tests - Concurrent Operations', () => {
  test('should handle concurrent task creation without conflicts', async () => {
    await cleanupTestFiles();
    
    const numConcurrentTasks = 10;
    const promises: Promise<string>[] = [];
    
    // Create multiple tasks concurrently
    for (let i = 0; i < numConcurrentTasks; i++) {
      const promise = create(`concurrent-owner-${i}`, `Concurrent task ${i}`);
      promises.push(promise);
    }
    
    // Wait for all tasks to complete
    const taskIds = await Promise.all(promises);
    
    // Verify all tasks were created with unique IDs
    assert.strictEqual(taskIds.length, numConcurrentTasks);
    assert.strictEqual(new Set(taskIds).size, numConcurrentTasks);
    
    // Verify all tasks can be retrieved
    const retrievalPromises = taskIds.map(taskId => getStatus(taskId));
    const taskStatuses = await Promise.all(retrievalPromises);
    
    // Verify all tasks have correct initial state
    for (let i = 0; i < numConcurrentTasks; i++) {
      assert.strictEqual(taskStatuses[i].status, 'running');
      assert.strictEqual(taskStatuses[i].owner, `concurrent-owner-${i}`);
      assert.strictEqual(taskStatuses[i].details, `Concurrent task ${i}`);
    }
    
    await cleanupTestFiles();
  });

  test('should handle concurrent updates to different tasks', async () => {
    await cleanupTestFiles();
    
    const numTasks = 5;
    const taskIds: string[] = [];
    
    // Create multiple tasks first
    for (let i = 0; i < numTasks; i++) {
      const taskId = await create(`owner-${i}`, `Task ${i}`);
      taskIds.push(taskId);
    }
    
    // Update all tasks concurrently with different statuses
    const statuses: TaskStatus['status'][] = ['completed', 'failed', 'blocked', 'running', 'completed'];
    const updatePromises = taskIds.map((taskId, index) => 
      update(taskId, statuses[index], `Updated task ${index}`)
    );
    
    // Wait for all updates to complete
    await Promise.all(updatePromises);
    
    // Verify all updates were applied correctly
    const verificationPromises = taskIds.map(taskId => getStatus(taskId));
    const updatedStatuses = await Promise.all(verificationPromises);
    
    for (let i = 0; i < numTasks; i++) {
      assert.strictEqual(updatedStatuses[i].status, statuses[i]);
      assert.strictEqual(updatedStatuses[i].details, `Updated task ${i}`);
      assert.strictEqual(updatedStatuses[i].owner, `owner-${i}`);
    }
    
    await cleanupTestFiles();
  });

  test('should handle concurrent reads of the same task', async () => {
    await cleanupTestFiles();
    
    const owner = 'concurrent-read-owner';
    const details = 'Concurrent read test task';
    
    // Create a task first
    const taskId = await create(owner, details);
    
    const numConcurrentReads = 10;
    const readPromises: Promise<TaskStatus>[] = [];
    
    // Perform multiple concurrent reads of the same task
    for (let i = 0; i < numConcurrentReads; i++) {
      readPromises.push(getStatus(taskId));
    }
    
    // Wait for all reads to complete
    const results = await Promise.all(readPromises);
    
    // Verify all reads returned the same data
    const firstResult = results[0];
    for (let i = 1; i < results.length; i++) {
      assert.deepStrictEqual(results[i], firstResult);
    }
    
    // Verify the data is correct
    assert.strictEqual(firstResult.status, 'running');
    assert.strictEqual(firstResult.owner, owner);
    assert.strictEqual(firstResult.details, details);
    
    await cleanupTestFiles();
  });

  test('should handle mixed concurrent operations (create, read, update)', async () => {
    await cleanupTestFiles();
    
    const promises: Promise<any>[] = [];
    const taskIds: string[] = [];
    
    // Create some initial tasks
    for (let i = 0; i < 3; i++) {
      const promise = create(`mixed-owner-${i}`, `Mixed task ${i}`);
      promises.push(promise.then(taskId => {
        taskIds.push(taskId);
        return taskId;
      }));
    }
    
    // Wait for initial tasks to be created
    await Promise.all(promises);
    
    const mixedPromises: Promise<any>[] = [];
    
    // Mix of operations:
    // - Create new tasks
    // - Read existing tasks
    // - Update existing tasks
    
    // Create operations
    for (let i = 3; i < 6; i++) {
      mixedPromises.push(create(`mixed-owner-${i}`, `Mixed task ${i}`));
    }
    
    // Read operations
    for (const taskId of taskIds) {
      mixedPromises.push(getStatus(taskId));
    }
    
    // Update operations
    for (let i = 0; i < taskIds.length; i++) {
      mixedPromises.push(update(taskIds[i], 'completed', `Updated mixed task ${i}`));
    }
    
    // Execute all mixed operations concurrently
    const results = await Promise.all(mixedPromises);
    
    // Verify the results
    // First 3 results should be new task IDs
    for (let i = 0; i < 3; i++) {
      assert.match(results[i], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
    
    // Next 3 results should be TaskStatus objects from reads
    for (let i = 3; i < 6; i++) {
      assert.strictEqual(typeof results[i], 'object');
      assert.ok('status' in results[i]);
      assert.ok('owner' in results[i]);
    }
    
    // Last 3 results should be undefined (update returns void)
    for (let i = 6; i < 9; i++) {
      assert.strictEqual(results[i], undefined);
    }
    
    // Verify that updates were applied by reading the tasks again
    for (let i = 0; i < taskIds.length; i++) {
      const updatedTask = await getStatus(taskIds[i]);
      assert.strictEqual(updatedTask.status, 'completed');
      assert.strictEqual(updatedTask.details, `Updated mixed task ${i}`);
    }
    
    await cleanupTestFiles();
  });
});

describe('Integration Tests - Error Handling and Edge Cases', () => {
  test('should handle filesystem errors gracefully during concurrent operations', async () => {
    await cleanupTestFiles();
    
    const owner = 'error-test-owner';
    const details = 'Error handling test';
    
    // Create a task first
    const taskId = await create(owner, details);
    
    // Attempt concurrent operations including some that should fail
    const promises: Promise<any>[] = [];
    
    // Valid operations
    promises.push(getStatus(taskId));
    promises.push(update(taskId, 'completed', 'Updated details'));
    
    // Invalid operations that should fail
    promises.push(
      getStatus('non-existent-task-id').catch(error => ({ error: error.name }))
    );
    promises.push(
      update('another-non-existent-id', 'completed', 'Should fail').catch(error => ({ error: error.name }))
    );
    promises.push(
      update(taskId, 'invalid-status' as any, 'Should fail').catch(error => ({ error: error.name }))
    );
    
    const results = await Promise.all(promises);
    
    // Verify valid operations succeeded
    assert.strictEqual(typeof results[0], 'object');
    assert.ok('status' in results[0]);
    assert.strictEqual(results[1], undefined); // update returns void
    
    // Verify invalid operations failed with correct errors
    assert.deepStrictEqual(results[2], { error: 'TaskNotFoundError' });
    assert.deepStrictEqual(results[3], { error: 'TaskNotFoundError' });
    assert.deepStrictEqual(results[4], { error: 'InvalidStatusError' });
    
    await cleanupTestFiles();
  });

  test('should maintain data integrity during rapid sequential operations', async () => {
    await cleanupTestFiles();
    
    const owner = 'integrity-test-owner';
    const details = 'Data integrity test';
    
    // Create a task
    const taskId = await create(owner, details);
    
    // Perform rapid sequential updates
    const statuses: TaskStatus['status'][] = ['completed', 'failed', 'blocked', 'running', 'completed'];
    
    for (let i = 0; i < statuses.length; i++) {
      await update(taskId, statuses[i], `Update ${i + 1}`);
      
      // Verify the update was applied immediately
      const currentStatus = await getStatus(taskId);
      assert.strictEqual(currentStatus.status, statuses[i]);
      assert.strictEqual(currentStatus.details, `Update ${i + 1}`);
      
      // Verify filesystem consistency
      const filePath = join(TASKS_DIR, `${taskId}.json`);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const fileData = JSON.parse(fileContent);
      assert.deepStrictEqual(fileData, currentStatus);
    }
    
    await cleanupTestFiles();
  });
});

describe('Integration Tests - Cleanup Utilities', () => {
  test('cleanup utility should remove all test files', async () => {
    // Create some test tasks
    const taskIds: string[] = [];
    
    for (let i = 0; i < 5; i++) {
      const taskId = await create(`cleanup-owner-${i}`, `Cleanup task ${i}`);
      taskIds.push(taskId);
    }
    
    // Verify files exist
    for (const taskId of taskIds) {
      const filePath = join(TASKS_DIR, `${taskId}.json`);
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      assert.strictEqual(exists, true);
    }
    
    // Run cleanup
    await cleanupTestFiles();
    
    // Verify files were removed
    for (const taskId of taskIds) {
      const filePath = join(TASKS_DIR, `${taskId}.json`);
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      assert.strictEqual(exists, false);
    }
  });

  test('cleanup utility should handle empty directory', async () => {
    // Ensure directory is empty
    await cleanupTestFiles();
    
    // Run cleanup on empty directory (should not throw)
    await cleanupTestFiles();
    
    // Directory should still exist
    const dirExists = await fs.access(TASKS_DIR).then(() => true).catch(() => false);
    assert.strictEqual(dirExists, true);
  });

  test('cleanup utility should handle non-existent directory', async () => {
    // Remove the entire tasks directory
    try {
      await fs.rm(TASKS_DIR, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, which is fine
    }
    
    // Run cleanup on non-existent directory (should not throw)
    await cleanupTestFiles();
    
    // This should complete without errors
    assert.ok(true);
  });

  test('cleanup utility should preserve non-JSON files', async () => {
    await cleanupTestFiles();
    
    // Create a task file
    const taskId = await create('test-owner', 'Test task');
    
    // Create a non-JSON file in the tasks directory
    const nonJsonFile = join(TASKS_DIR, 'readme.txt');
    await fs.writeFile(nonJsonFile, 'This is not a task file', 'utf8');
    
    // Verify both files exist
    const taskFilePath = join(TASKS_DIR, `${taskId}.json`);
    const taskFileExists = await fs.access(taskFilePath).then(() => true).catch(() => false);
    const nonJsonExists = await fs.access(nonJsonFile).then(() => true).catch(() => false);
    assert.strictEqual(taskFileExists, true);
    assert.strictEqual(nonJsonExists, true);
    
    // Run cleanup
    await cleanupTestFiles();
    
    // Verify JSON file was removed but non-JSON file remains
    const taskFileExistsAfter = await fs.access(taskFilePath).then(() => true).catch(() => false);
    const nonJsonExistsAfter = await fs.access(nonJsonFile).then(() => true).catch(() => false);
    assert.strictEqual(taskFileExistsAfter, false);
    assert.strictEqual(nonJsonExistsAfter, true);
    
    // Clean up the non-JSON file
    await fs.unlink(nonJsonFile);
  });
});