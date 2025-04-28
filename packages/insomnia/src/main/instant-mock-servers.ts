import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type ChildProcess, spawn } from 'child_process';
import electron from 'electron';

import { isWindows } from '../common/constants';
import { database } from '../common/database';
import * as models from '../models';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const generatePrompt = `
Here is an OpenAPI spec.

I'd like you to generate a custom server using pure NodeJS v22 code in a single .js file with no external dependencies that includes:

- validation of request body and query parameters, with as much adherence to the descriptions in the spec as possible
- attempt to use a random free port above 10000 up to 10 times before giving up, and only output the status in structured JSON when giving up
- in-memory storage, no value mocking
- make sure the endpoints behave as they should given the descriptions in the spec
- output the port number used to the console in structured JSON when the server starts
- make this as simple as possible, do not use this spec in the code directly
- make sure the path used to call the endpoints is preserved in any reference links, and include the used hostname and base url in those links
- consider any server urls to make sure calling with the base path will also work in addition to the naked paths in the spec

Please only send code, no other text.

`;

const getMockServersPath = () => {
  return path.join(process.env['INSOMNIA_DATA_PATH'] || electron.app.getPath('userData'), 'mock-oas-servers');
};

const getMockServerFile = (id: string) => {
  return path.join(getMockServersPath(), `${id}.js`);
};

const PROMPT_ANTHROPIC = true;

const getAnthropicPromptResponse = async (spec: string, prompt: string) => {
  if (!process.env['ANTHROPIC_API_KEY']) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env['ANTHROPIC_API_KEY'] || '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 64_000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt + '\n\n```yaml\n' + spec + '\n```',
            },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  console.log('[instant-mocks] Anthropic response:', JSON.stringify(json, null, 2));

  if (json.content && json.content.length === 1) {
    const content = json.content[0];
    if (content.type === 'text') {
      return content.text.replace(/^```\w+\n/, '').replace(/\n```$/, '');
    }
  }

  return null;
};

export const generateMockServer = async ({ id, workspaceId }: { id: string; workspaceId: string }) => {
  console.log(`[instant-mocks] Generating mock server file for server ${id}`);

  const mockServersDir = getMockServersPath();
  await mkdir(mockServersDir, { recursive: true });

  const mockServerFile = getMockServerFile(id);

  const spec = await models.apiSpec.getByParentId(workspaceId);
  if (!spec) {
    throw new Error('No spec found for workspace');
  }

  // todo: request a generated server file from the server
  // that, in turn, calls an LLM to generate the server file
  // and download it.

  if (PROMPT_ANTHROPIC) {
    const serverCode = await getAnthropicPromptResponse(spec.contents, generatePrompt);
    if (!serverCode) {
      throw new Error('Failed to generate server code from Anthropic');
    }

    await writeFile(mockServerFile, serverCode);
  }

  return true;
};

// Map to store active mock server processes
const activeMockServers = new Map<string, ChildProcess>();

export function startMockServer({ id, workspaceId }: { id: string; workspaceId: string }): Promise<string> {
  // TODO: cloud mock servers by calling the API, so we don't run the code locally
  const mockServerFile = getMockServerFile(id);

  return new Promise((resolve, reject) => {
    if (activeMockServers.has(id)) {
      console.warn(`[instant-mocks] Server ${id} is already running.`);
      // Optionally, resolve with a specific message or reject
      return reject(new Error(`Server ${id} is already running.`));
    }

    const args = ['--no-deprecation', escape(mockServerFile)];

    const childProcess = spawn(escape(process.execPath), args, {
      cwd: process.env['INSOMNIA_DATA_PATH'] || electron.app.getPath('userData'),
      detached: false, // Detach to allow parent to exit independently if needed
      shell: true,
      env: { NODE_ENV: 'production', ELECTRON_RUN_AS_NODE: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, pipe stdout and stderr
    });

    activeMockServers.set(id, childProcess);
    console.log(`[instant-mocks] Spawned server ${id} with PID ${childProcess.pid}`);

    let outputBuffer = '';
    let lineResolved = false;

    const onStdoutData = (data: Buffer) => {
      if (lineResolved) return; // Already got the first line

      outputBuffer += data.toString();
      const newlineIndex = outputBuffer.indexOf('\n');

      if (newlineIndex !== -1) {
        const firstLine = outputBuffer.substring(0, newlineIndex).trim();
        try {
          const startupInfo = JSON.parse(firstLine);
          if (startupInfo.port) {
            // find the oas server environment
            models.environment
              .findByParentId(workspaceId)
              .then(async baseEnvironments => {
                let found = false;
                for (const baseEnv of baseEnvironments) {
                  const subEnvironments = await models.environment.findByParentId(baseEnv._id);
                  for (const subEnv of subEnvironments) {
                    console.log(`[instant-mocks] Found sub environment: ${subEnv.name}`);
                    if (subEnv.name.toLowerCase() === 'server 1') {
                      const data = subEnv.data;
                      console.log(`[instant-mocks] Updating sub environment: ${subEnv.name}`);
                      console.log(`[instant-mocks] New data: ${JSON.stringify(data)}`);
                      data['host'] = `localhost:${startupInfo.port}`;
                      await models.environment.update(subEnv, { data });
                      found = true;
                      break;
                    }
                    if (found) {
                      break;
                    }
                  }
                }
                await database.flushChanges(); // notify the UI to reload some loader data
              })
              .catch(error => {
                console.error(`[instant-mocks] Failed to find OAS server environment: ${error}`);
              });
          }
        } catch (error) {
          console.error(`[instant-mocks] Failed to parse server ${id} output: ${error}`);
        }
        console.log(`[instant-mocks] Server ${id} first output line: ${firstLine}`);
        lineResolved = true;
        childProcess.stdout?.removeListener('data', onStdoutData); // Clean up listener
        resolve(firstLine);
      }
    };

    const onStderrData = (data: Buffer) => {
      console.error(`[instant-mocks] Server ${id} stderr: ${data.toString()}`);
      // Optionally log stderr, but don't reject the promise for stderr output alone
    };

    const onError = (error: Error) => {
      console.error(`[instant-mocks] Failed to start server ${id}:`, error);
      activeMockServers.delete(id); // Clean up map
      removeListeners();
      reject(error);
    };

    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      console.log(`[instant-mocks] Server ${id} process exited with code ${code}, signal ${signal}`);
      activeMockServers.delete(id); // Clean up map
      removeListeners();
      if (!lineResolved) {
        // Reject if closed before the first line was received
        reject(new Error(`Server ${id} exited before sending output. Code: ${code}, Signal: ${signal}`));
      }
    };

    const removeListeners = () => {
      childProcess.stdout?.removeListener('data', onStdoutData);
      childProcess.stderr?.removeListener('data', onStderrData);
      childProcess.removeListener('error', onError);
      childProcess.removeListener('close', onClose);
    };

    childProcess.stdout?.on('data', onStdoutData);
    childProcess.stderr?.on('data', onStderrData);
    childProcess.on('error', onError);
    childProcess.on('close', onClose);
  });
}

// Reinstated local escape function
function escape(p: string) {
  if (isWindows()) {
    // Quote for Windows paths
    return `"${p}"`;
  }
  // Escape whitespace and parenthesis with backslashes for Unix paths
  return p.replace(/([\s()])/g, '\\$1');
}

// Function to stop a specific mock server (needs to be exported or available where stop is called)
export function stopMockServer({ id }: { id: string }): boolean {
  const child = activeMockServers.get(id);
  if (child) {
    console.log(`[instant-mocks] Stopping server ${id} with PID ${child.pid}`);
    child.kill(); // Send SIGTERM
    activeMockServers.delete(id);
    return true;
  }
  console.warn(`[instant-mocks] Attempted to stop server ${id}, but it was not found.`);
  return false;
}

// Optional: Function to stop all running mock servers on app quit
export function stopAllMockServers() {
  console.log('[instant-mocks] Stopping all active mock servers.');
  for (const id of activeMockServers.keys()) {
    if (!stopMockServer({ id })) {
      console.warn(`[instant-mocks] Failed to stop server ${id}`);
      return false;
    }
  }
  return true;
}
