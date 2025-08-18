/**
 * Represents the status and metadata of a task in the Alfredo ecosystem.
 * 
 * This interface defines the complete structure for task tracking, including
 * execution state, ownership, descriptive details, and temporal information.
 * All tasks are persisted as JSON files in the `.alfredo/tasks/` directory.
 * 
 * @example
 * ```typescript
 * const taskStatus: TaskStatus = {
 *   status: 'running',
 *   owner: 'alfredo-orchestrator',
 *   details: 'Executing SPEC-MCP-001 implementation',
 *   started_at: '2024-01-15T10:30:00.000Z',
 *   updated_at: '2024-01-15T10:30:00.000Z'
 * };
 * ```
 */
export interface TaskStatus {
  /**
   * Current execution status of the task.
   * 
   * - `running`: Task is currently being executed
   * - `completed`: Task has finished successfully
   * - `failed`: Task encountered an error and could not complete
   * - `blocked`: Task is waiting for external dependencies or conditions
   */
  status: 'running' | 'completed' | 'failed' | 'blocked';
  
  /**
   * Identifier of the entity that owns or is responsible for this task.
   * Typically represents the orchestrator or agent that created the task.
   * 
   * @example 'alfredo-orchestrator'
   */
  owner: string;
  
  /**
   * Human-readable description of what the task is doing or its current state.
   * This field can be updated throughout the task lifecycle to provide
   * progress information or error details.
   * 
   * @example 'Executing SPEC-MCP-001 implementation'
   */
  details: string;
  
  /**
   * ISO 8601 formatted timestamp indicating when the task was initially created.
   * This value is set once during task creation and never modified.
   * 
   * @example '2024-01-15T10:30:00.000Z'
   */
  started_at: string;
  
  /**
   * ISO 8601 formatted timestamp indicating when the task was last modified.
   * This value is updated every time the task status or details change.
   * 
   * @example '2024-01-15T10:35:22.123Z'
   */
  updated_at: string;
}

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Base directory for task persistence within the Alfredo ecosystem.
 * All task files are stored as JSON files in this directory structure.
 */
const TASKS_DIR = '.alfredo/tasks';

/**
 * Ensures that a directory exists, creating it recursively if necessary.
 * 
 * This utility function handles the common pattern of checking for directory
 * existence and creating it if it doesn't exist. It uses recursive creation
 * to handle nested directory structures.
 * 
 * @param dirPath - The directory path to ensure exists
 * @throws {Error} When filesystem permissions prevent directory creation
 * 
 * @example
 * ```typescript
 * await ensureDirectoryExists('.alfredo/tasks');
 * // Directory is now guaranteed to exist
 * ```
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch (error) {
    // Directory doesn't exist, create it recursively
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (mkdirError) {
      throw new Error(`Failed to create directory ${dirPath}: ${mkdirError instanceof Error ? mkdirError.message : 'Unknown error'}`);
    }
  }
}

/**
 * Checks if a file exists at the specified path.
 * 
 * This utility function provides a clean async interface for file existence
 * checking, abstracting away the error-based approach of fs.access().
 * 
 * @param filePath - The file path to check
 * @returns Promise that resolves to true if file exists, false otherwise
 * 
 * @example
 * ```typescript
 * const exists = await fileExists('.alfredo/tasks/some-task-id.json');
 * if (exists) {
 *   // File exists, safe to read
 * }
 * ```
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates the full file path for a task JSON file.
 * 
 * This utility centralizes the path generation logic and ensures consistent
 * file naming across all task operations.
 * 
 * @param taskId - The unique task identifier
 * @returns The complete file path for the task's JSON file
 * 
 * @example
 * ```typescript
 * const path = getTaskFilePath('abc123-def456');
 * // Returns: '.alfredo/tasks/abc123-def456.json'
 * ```
 */
function getTaskFilePath(taskId: string): string {
  return join(TASKS_DIR, `${taskId}.json`);
}

/**
 * Ensures the tasks directory exists before performing file operations.
 * 
 * This function should be called before any file operations to guarantee
 * that the directory structure is in place. It handles the automatic
 * creation requirement specified in the design.
 * 
 * @throws {Error} When filesystem permissions prevent directory creation
 * 
 * @example
 * ```typescript
 * await ensureTasksDirectory();
 * // .alfredo/tasks/ directory is now guaranteed to exist
 * ```
 */
async function ensureTasksDirectory(): Promise<void> {
  await ensureDirectoryExists(TASKS_DIR);
}

/**
 * Creates a new task with a unique identifier and initial "running" status.
 * 
 * This function generates a new task with a UUID, sets the initial status to "running",
 * records creation and update timestamps, and persists the task to the filesystem.
 * The tasks directory is created automatically if it doesn't exist.
 * 
 * @param owner - Identifier of the entity responsible for this task
 * @param details - Human-readable description of the task
 * @returns Promise that resolves to the unique task ID
 * @throws {Error} When filesystem operations fail or parameters are invalid
 * 
 * @example
 * ```typescript
 * const taskId = await create('alfredo-orchestrator', 'Executing SPEC-MCP-001');
 * console.log(`Created task: ${taskId}`);
 * ```
 */
export async function create(owner: string, details: string): Promise<string> {
  // Validate input parameters
  if (!owner || typeof owner !== 'string' || owner.trim().length === 0) {
    throw new Error('Owner parameter is required and must be a non-empty string');
  }
  
  if (!details || typeof details !== 'string' || details.trim().length === 0) {
    throw new Error('Details parameter is required and must be a non-empty string');
  }

  // Generate unique task ID using crypto.randomUUID()
  const taskId = randomUUID();
  
  // Generate ISO 8601 timestamp for both started_at and updated_at
  const timestamp = new Date().toISOString();
  
  // Create initial TaskStatus object with "running" status
  const taskStatus: TaskStatus = {
    status: 'running',
    owner: owner.trim(),
    details: details.trim(),
    started_at: timestamp,
    updated_at: timestamp
  };

  try {
    // Ensure the tasks directory exists
    await ensureTasksDirectory();
    
    // Get the file path for this task
    const filePath = getTaskFilePath(taskId);
    
    // Write the task data to JSON file with proper error handling
    await fs.writeFile(filePath, JSON.stringify(taskStatus, null, 2), 'utf8');
    
    return taskId;
  } catch (error) {
    throw new Error(`Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Custom error class for when a task is not found.
 * 
 * This error is thrown when attempting to retrieve or update a task
 * that doesn't exist in the filesystem.
 */
export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task with ID '${taskId}' not found`);
    this.name = 'TaskNotFoundError';
  }
}

/**
 * Validates that an object conforms to the TaskStatus interface.
 * 
 * This function performs runtime validation to ensure that data read
 * from JSON files matches the expected TaskStatus structure.
 * 
 * @param obj - The object to validate
 * @returns True if the object is a valid TaskStatus
 * @throws {Error} If the object doesn't conform to TaskStatus interface
 */
function validateTaskStatus(obj: any): obj is TaskStatus {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Task data must be an object');
  }

  const validStatuses = ['running', 'completed', 'failed', 'blocked'];
  if (!validStatuses.includes(obj.status)) {
    throw new Error(`Invalid status: ${obj.status}. Must be one of: ${validStatuses.join(', ')}`);
  }

  if (typeof obj.owner !== 'string' || obj.owner.trim().length === 0) {
    throw new Error('Owner must be a non-empty string');
  }

  if (typeof obj.details !== 'string') {
    throw new Error('Details must be a string');
  }

  if (typeof obj.started_at !== 'string' || !obj.started_at.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)) {
    throw new Error('started_at must be a valid ISO 8601 timestamp');
  }

  if (typeof obj.updated_at !== 'string' || !obj.updated_at.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)) {
    throw new Error('updated_at must be a valid ISO 8601 timestamp');
  }

  return true;
}

/**
 * Retrieves the complete status information for a task by its ID.
 * 
 * This function reads the task data from the filesystem, validates the file
 * exists, parses the JSON content, and validates the data structure before
 * returning the TaskStatus object.
 * 
 * @param task_id - The unique identifier of the task to retrieve
 * @returns Promise that resolves to the complete TaskStatus object
 * @throws {TaskNotFoundError} When the task ID doesn't correspond to an existing file
 * @throws {Error} When file reading fails or data validation fails
 * 
 * @example
 * ```typescript
 * try {
 *   const status = await getStatus('abc123-def456');
 *   console.log(`Task status: ${status.status}`);
 * } catch (error) {
 *   if (error instanceof TaskNotFoundError) {
 *     console.log('Task not found');
 *   }
 * }
 * ```
 */
export async function getStatus(task_id: string): Promise<TaskStatus> {
  // Validate input parameter
  if (!task_id || typeof task_id !== 'string' || task_id.trim().length === 0) {
    throw new Error('Task ID parameter is required and must be a non-empty string');
  }

  const trimmedTaskId = task_id.trim();
  const filePath = getTaskFilePath(trimmedTaskId);

  try {
    // Check if file exists before attempting to read
    const exists = await fileExists(filePath);
    if (!exists) {
      throw new TaskNotFoundError(trimmedTaskId);
    }

    // Read and parse JSON file
    const fileContent = await fs.readFile(filePath, 'utf8');
    
    let taskData: any;
    try {
      taskData = JSON.parse(fileContent);
    } catch (parseError) {
      throw new Error(`Failed to parse task data for ID '${trimmedTaskId}': ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`);
    }

    // Validate the parsed data conforms to TaskStatus interface
    validateTaskStatus(taskData);

    return taskData as TaskStatus;
  } catch (error) {
    // Re-throw TaskNotFoundError as-is
    if (error instanceof TaskNotFoundError) {
      throw error;
    }
    
    // Wrap other errors with context
    throw new Error(`Failed to retrieve task status for ID '${trimmedTaskId}': ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Custom error class for invalid task status values.
 * 
 * This error is thrown when attempting to update a task with
 * a status that is not in the allowed union type.
 */
export class InvalidStatusError extends Error {
  constructor(status: string) {
    const validStatuses = ['running', 'completed', 'failed', 'blocked'];
    super(`Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}`);
    this.name = 'InvalidStatusError';
  }
}

/**
 * Updates the status and details of an existing task.
 * 
 * This function validates that the task exists, validates the new status against
 * the allowed values, preserves existing fields while updating specified ones,
 * refreshes the updated_at timestamp, and performs atomic file operations.
 * 
 * @param task_id - The unique identifier of the task to update
 * @param new_status - The new status value (must be one of the allowed union values)
 * @param new_details - The new details description for the task
 * @throws {TaskNotFoundError} When the task ID doesn't correspond to an existing file
 * @throws {InvalidStatusError} When the new status is not a valid value
 * @throws {Error} When input validation fails or filesystem operations fail
 * 
 * @example
 * ```typescript
 * try {
 *   await update('abc123-def456', 'completed', 'Task finished successfully');
 *   console.log('Task updated successfully');
 * } catch (error) {
 *   if (error instanceof TaskNotFoundError) {
 *     console.log('Task not found');
 *   } else if (error instanceof InvalidStatusError) {
 *     console.log('Invalid status provided');
 *   }
 * }
 * ```
 */
export async function update(task_id: string, new_status: TaskStatus['status'], new_details: string): Promise<void> {
  // Validate input parameters
  if (!task_id || typeof task_id !== 'string' || task_id.trim().length === 0) {
    throw new Error('Task ID parameter is required and must be a non-empty string');
  }

  if (typeof new_status !== 'string') {
    throw new Error('Status parameter is required and must be a string');
  }

  if (typeof new_details !== 'string') {
    throw new Error('Details parameter is required and must be a string');
  }

  const trimmedTaskId = task_id.trim();
  const trimmedDetails = new_details.trim();

  // Validate new_details consistency with create function - cannot be empty or whitespace-only
  if (trimmedDetails.length === 0) {
    throw new Error('Details parameter is required and must be a non-empty string');
  }

  // Validate status against allowed values union type
  const validStatuses: TaskStatus['status'][] = ['running', 'completed', 'failed', 'blocked'];
  if (!validStatuses.includes(new_status)) {
    throw new InvalidStatusError(new_status);
  }

  const filePath = getTaskFilePath(trimmedTaskId);

  try {
    // Check if file exists before attempting to read
    const exists = await fileExists(filePath);
    if (!exists) {
      throw new TaskNotFoundError(trimmedTaskId);
    }

    // Read and parse JSON file directly (avoiding internal getStatus call)
    const fileContent = await fs.readFile(filePath, 'utf8');
    
    let existingTask: any;
    try {
      existingTask = JSON.parse(fileContent);
    } catch (parseError) {
      throw new Error(`Failed to parse task data for ID '${trimmedTaskId}': ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`);
    }

    // Validate the existing data conforms to TaskStatus interface
    validateTaskStatus(existingTask);

    // Create updated task object, preserving existing fields while updating specified ones
    const updatedTask: TaskStatus = {
      status: new_status,
      owner: existingTask.owner, // Preserve existing owner
      details: trimmedDetails,
      started_at: existingTask.started_at, // Preserve original creation timestamp
      updated_at: new Date().toISOString() // Refresh updated_at timestamp using ISO 8601 format
    };

    // Perform atomic write operation by writing to JSON file
    await fs.writeFile(filePath, JSON.stringify(updatedTask, null, 2), 'utf8');

  } catch (error) {
    // Re-throw TaskNotFoundError and InvalidStatusError as-is
    if (error instanceof TaskNotFoundError || error instanceof InvalidStatusError) {
      throw error;
    }
    
    // Wrap other errors with context
    throw new Error(`Failed to update task with ID '${trimmedTaskId}': ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}