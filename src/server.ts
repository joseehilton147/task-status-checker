#!/usr/bin/env node
/**
 * MCP (Model Context Protocol) Server for Task Status Checker
 * 
 * This server exposes the task-status-checker functionality through both:
 * 1. MCP stdio protocol for integration with MCP clients
 * 2. HTTP endpoints for direct API access
 * 
 * The server can run in two modes:
 * - MCP mode: Uses stdio for communication (default when run via MCP client)
 * - HTTP mode: Uses HTTP server on specified port (when run directly)
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { parse as parseUrl } from 'node:url';
import { create, getStatus, update, TaskNotFoundError, InvalidStatusError } from './index.js';
import { 
  initializeFocusChain, 
  addFocusCheckpoint, 
  getFocusStatus 
} from './focus-chain.js';

/**
 * Default port for the MCP server
 */
const DEFAULT_PORT = 3000;

/**
 * Valid MCP endpoint path
 */
const MCP_ENDPOINT = '/mcp';

/**
 * Interface for MCP request body structure
 */
interface MCPRequest {
  method: string;
  params: Record<string, any>;
}

/**
 * Interface for MCP response structure
 */
interface MCPResponse {
  [key: string]: any;
}

/**
 * Interface for MCP error response structure
 */
interface MCPErrorResponse {
  error: string;
}

/**
 * Reads and parses JSON from the request body
 * 
 * @param req - The incoming HTTP request
 * @returns Promise that resolves to the parsed JSON object
 * @throws {Error} When JSON parsing fails or body is empty
 */
async function parseRequestBody(req: IncomingMessage): Promise<MCPRequest> {
  return new Promise((resolve, reject) => {
    let body = '';
    
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        if (!body.trim()) {
          reject(new Error('Request body is empty'));
          return;
        }
        
        const parsed = JSON.parse(body);
        
        // Validate basic MCP request structure
        if (!parsed || typeof parsed !== 'object') {
          reject(new Error('Request body must be a JSON object'));
          return;
        }
        
        if (typeof parsed.method !== 'string') {
          reject(new Error('Request must include a "method" field as string'));
          return;
        }
        
        if (!parsed.params || typeof parsed.params !== 'object') {
          reject(new Error('Request must include a "params" field as object'));
          return;
        }
        
        resolve(parsed as MCPRequest);
      } catch (error) {
        reject(new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown parsing error'}`));
      }
    });
    
    req.on('error', (error) => {
      reject(new Error(`Request error: ${error.message}`));
    });
  });
}

/**
 * Sends a JSON response with appropriate headers
 * 
 * @param res - The HTTP response object
 * @param statusCode - HTTP status code
 * @param data - Data to send as JSON
 */
function sendJSONResponse(res: ServerResponse, statusCode: number, data: MCPResponse | MCPErrorResponse): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Handles the 'create' method for creating new tasks
 * 
 * @param params - Parameters containing owner and details
 * @returns Promise that resolves to response object with taskId
 * @throws {Error} When required parameters are missing or invalid
 */
async function handleCreateMethod(params: Record<string, any>): Promise<MCPResponse> {
  const { owner, details } = params;
  
  if (typeof owner !== 'string' || !owner.trim()) {
    throw new Error('Parameter "owner" is required and must be a non-empty string');
  }
  
  if (typeof details !== 'string' || !details.trim()) {
    throw new Error('Parameter "details" is required and must be a non-empty string');
  }
  
  const taskId = await create(owner, details);
  return { taskId };
}

/**
 * Handles the 'getStatus' method for retrieving task status
 * 
 * @param params - Parameters containing taskId
 * @returns Promise that resolves to the complete TaskStatus object
 * @throws {Error} When taskId parameter is missing or invalid
 */
async function handleGetStatusMethod(params: Record<string, any>): Promise<MCPResponse> {
  const { taskId } = params;
  
  if (typeof taskId !== 'string' || !taskId.trim()) {
    throw new Error('Parameter "taskId" is required and must be a non-empty string');
  }
  
  const status = await getStatus(taskId);
  return status;
}

/**
 * Handles the 'update' method for updating task status and details
 * 
 * @param params - Parameters containing taskId, newStatus, and newDetails
 * @returns Promise that resolves to success confirmation
 * @throws {Error} When required parameters are missing or invalid
 */
async function handleUpdateMethod(params: Record<string, any>): Promise<MCPResponse> {
  const { taskId, newStatus, newDetails } = params;
  
  if (typeof taskId !== 'string' || !taskId.trim()) {
    throw new Error('Parameter "taskId" is required and must be a non-empty string');
  }
  
  if (typeof newStatus !== 'string') {
    throw new Error('Parameter "newStatus" is required and must be a string');
  }
  
  if (typeof newDetails !== 'string') {
    throw new Error('Parameter "newDetails" is required and must be a string');
  }
  
  await update(taskId, newStatus as any, newDetails);
  return { success: true };
}

/**
 * Processes MCP requests and routes them to appropriate handlers
 * 
 * @param mcpRequest - The parsed MCP request object
 * @returns Promise that resolves to the response data
 * @throws {Error} When method is not supported or handler fails
 */
async function processMCPRequest(mcpRequest: MCPRequest): Promise<MCPResponse> {
  const { method, params } = mcpRequest;
  
  switch (method) {
    case 'create':
      return await handleCreateMethod(params);
      
    case 'getStatus':
      return await handleGetStatusMethod(params);
      
    case 'update':
      return await handleUpdateMethod(params);
      
    default:
      throw new Error(`Unsupported method: ${method}. Supported methods are: create, getStatus, update`);
  }
}

/**
 * Maps application errors to appropriate HTTP status codes
 * 
 * @param error - The error object to map
 * @returns HTTP status code
 */
function getErrorStatusCode(error: Error): number {
  if (error instanceof TaskNotFoundError) {
    return 404;
  }
  
  if (error instanceof InvalidStatusError) {
    return 400;
  }
  
  // Default to 400 for validation and other client errors
  return 400;
}

/**
 * Handles HTTP requests to the MCP server
 * 
 * @param req - The incoming HTTP request
 * @param res - The HTTP response object
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const parsedUrl = parseUrl(req.url || '', true);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase();
    
    // Handle CORS preflight requests
    if (method === 'OPTIONS') {
      sendJSONResponse(res, 200, {});
      return;
    }
    
    // Check if request is for the MCP endpoint
    if (pathname !== MCP_ENDPOINT) {
      sendJSONResponse(res, 404, { error: `Not Found. Only ${MCP_ENDPOINT} endpoint is supported.` });
      return;
    }
    
    // Only allow POST and GET methods for MCP endpoint
    if (method !== 'POST' && method !== 'GET') {
      sendJSONResponse(res, 405, { error: `Method Not Allowed. Only POST and GET methods are supported for ${MCP_ENDPOINT}.` });
      return;
    }
    
    // Parse request body for POST requests
    if (method === 'POST') {
      try {
        const mcpRequest = await parseRequestBody(req);
        const response = await processMCPRequest(mcpRequest);
        sendJSONResponse(res, 200, response);
      } catch (error) {
        const statusCode = getErrorStatusCode(error as Error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendJSONResponse(res, statusCode, { error: errorMessage });
      }
    } else {
      // GET requests return server info
      sendJSONResponse(res, 200, {
        server: 'task-status-checker-mcp',
        version: '1.0.0',
        endpoint: MCP_ENDPOINT,
        methods: ['create', 'getStatus', 'update'],
        description: 'MCP server for task status management'
      });
    }
    
  } catch (error) {
    // Handle any unexpected errors
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    sendJSONResponse(res, 500, { error: errorMessage });
  }
}

/**
 * Starts the MCP server on the specified port
 * 
 * @param port - Port number to listen on (defaults to 3000)
 */
function startServer(port: number = DEFAULT_PORT): void {
  const server = createServer(handleRequest);
  
  server.listen(port, () => {
    console.log(`🚀 Task Status Checker MCP Server running on http://localhost:${port}`);
    console.log(`📡 MCP endpoint available at: http://localhost:${port}${MCP_ENDPOINT}`);
    console.log(`📋 Supported methods: create, getStatus, update`);
  });
  
  server.on('error', (error) => {
    console.error(`❌ Server error: ${error.message}`);
    process.exit(1);
  });
  
  // Graceful shutdown handling
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down MCP server...');
    server.close(() => {
      console.log('✅ Server closed successfully');
      process.exit(0);
    });
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down MCP server...');
    server.close(() => {
      console.log('✅ Server closed successfully');
      process.exit(0);
    });
  });
}

/**
 * MCP stdio protocol implementation
 */
class MCPStdioServer {
  private requestId = 0;

  constructor() {
    this.setupStdioHandlers();
  }

  private setupStdioHandlers(): void {
    process.stdin.setEncoding('utf8');
    
    let buffer = '';
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      
      // Process complete JSON-RPC messages
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        
        if (line) {
          this.handleMessage(line);
        }
      }
    });

    process.stdin.on('end', () => {
      process.exit(0);
    });
  }

  private async handleMessage(message: string): Promise<void> {
    try {
      const request = JSON.parse(message);
      
      if (request.method === 'initialize') {
        this.sendResponse(request.id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'task-status-checker',
            version: '1.0.0'
          }
        });
        return;
      }

      if (request.method === 'tools/list') {
        this.sendResponse(request.id, {
          tools: [
            {
              name: 'create_task',
              description: 'Create a new task with running status',
              inputSchema: {
                type: 'object',
                properties: {
                  owner: {
                    type: 'string',
                    description: 'The owner/creator of the task'
                  },
                  details: {
                    type: 'string',
                    description: 'Description of the task'
                  }
                },
                required: ['owner', 'details']
              }
            },
            {
              name: 'get_task_status',
              description: 'Get the status of an existing task',
              inputSchema: {
                type: 'object',
                properties: {
                  taskId: {
                    type: 'string',
                    description: 'The unique identifier of the task'
                  }
                },
                required: ['taskId']
              }
            },
            {
              name: 'update_task',
              description: 'Update the status and details of an existing task',
              inputSchema: {
                type: 'object',
                properties: {
                  taskId: {
                    type: 'string',
                    description: 'The unique identifier of the task'
                  },
                  newStatus: {
                    type: 'string',
                    enum: ['running', 'completed', 'failed', 'blocked'],
                    description: 'The new status for the task'
                  },
                  newDetails: {
                    type: 'string',
                    description: 'Updated description of the task'
                  }
                },
                required: ['taskId', 'newStatus', 'newDetails']
              }
            },
            {
              name: 'create_task_with_focus',
              description: 'Create a task with focus chain to prevent context poisoning',
              inputSchema: {
                type: 'object',
                properties: {
                  owner: {
                    type: 'string',
                    description: 'The owner/creator of the task'
                  },
                  details: {
                    type: 'string',
                    description: 'Description of the task'
                  },
                  objective: {
                    type: 'string',
                    description: 'Original objective to maintain focus'
                  }
                },
                required: ['owner', 'details', 'objective']
              }
            },
            {
              name: 'update_task_with_focus',
              description: 'Update task and check for focus reinject',
              inputSchema: {
                type: 'object',
                properties: {
                  taskId: {
                    type: 'string',
                    description: 'The unique identifier of the task'
                  },
                  newStatus: {
                    type: 'string',
                    enum: ['running', 'completed', 'failed', 'blocked'],
                    description: 'The new status for the task'
                  },
                  newDetails: {
                    type: 'string',
                    description: 'Updated description of the task'
                  }
                },
                required: ['taskId', 'newStatus', 'newDetails']
              }
            },
            {
              name: 'get_focus_status',
              description: 'Get focus chain status and checkpoint info',
              inputSchema: {
                type: 'object',
                properties: {
                  taskId: {
                    type: 'string',
                    description: 'The unique identifier of the task'
                  }
                },
                required: ['taskId']
              }
            }
          ]
        });
        return;
      }

      if (request.method === 'tools/call') {
        const { name, arguments: args } = request.params;
        
        try {
          let result;
          
          switch (name) {
            case 'create_task':
              const taskId = await create(args.owner, args.details);
              result = { taskId };
              break;
              
            case 'get_task_status':
              result = await getStatus(args.taskId);
              break;
              
            case 'update_task':
              await update(args.taskId, args.newStatus, args.newDetails);
              result = { success: true };
              break;
              
            case 'create_task_with_focus':
              const focusTaskId = await create(args.owner, args.details);
              await initializeFocusChain(focusTaskId, args.objective);
              result = { 
                taskId: focusTaskId,
                focusChainInitialized: true,
                objective: args.objective
              };
              break;
              
            case 'update_task_with_focus':
              await update(args.taskId, args.newStatus, args.newDetails);
              const focusReinject = await addFocusCheckpoint(
                args.taskId, 
                args.newDetails, 
                args.newStatus
              );
              result = { 
                success: true,
                focusReinject: focusReinject || null
              };
              break;
              
            case 'get_focus_status':
              const focusStatus = await getFocusStatus(args.taskId);
              result = focusStatus || { error: 'No focus chain found for this task' };
              break;
              
            default:
              throw new Error(`Unknown tool: ${name}`);
          }
          
          this.sendResponse(request.id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          });
          
        } catch (error) {
          this.sendError(request.id, -32000, error instanceof Error ? error.message : 'Unknown error');
        }
        return;
      }

      // Handle other methods
      this.sendError(request.id, -32601, `Method not found: ${request.method}`);
      
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  private sendResponse(id: number, result: any): void {
    const response = {
      jsonrpc: '2.0',
      id,
      result
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  private sendError(id: number, code: number, message: string): void {
    const response = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

// Determine if we should run as MCP stdio server or HTTP server
const isMCPMode = process.argv.includes('--mcp') || process.env.MCP_MODE === 'true' || !process.stdout.isTTY;

// Handle CLI arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Task Status Checker MCP Server

Usage:
  task-status-checker [options]

Options:
  --mcp         Run as MCP stdio server (default when piped)
  --http        Force HTTP server mode
  --port <port> HTTP server port (default: 3000)
  --help, -h    Show this help message

Examples:
  task-status-checker --mcp     # MCP stdio mode
  task-status-checker --http    # HTTP server mode
  task-status-checker --port 8080 --http  # HTTP on port 8080
`);
  process.exit(0);
}

// Force HTTP mode if --http is specified
const forceHTTP = process.argv.includes('--http');

if (isMCPMode && !forceHTTP) {
  // Run as MCP stdio server
  new MCPStdioServer();
} else {
  // Run as HTTP server
  const portArg = process.argv.indexOf('--port');
  const port = portArg !== -1 && process.argv[portArg + 1] 
    ? parseInt(process.argv[portArg + 1], 10)
    : (process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT);
  startServer(port);
}

export { startServer, MCPStdioServer };