/**
 * Integration tests for the input tools, called through the MCP server
 */

import { expect, assert } from 'vitest';
import { mcpTest } from '../../helpers/mcp.js';

mcpTest.override('mcpServerArgs', ['--tools', 'pages', 'snapshot', 'input', 'script']);

mcpTest.describe('type_text (MCP)', () => {
  mcpTest.beforeEach(async ({ mcp }) => {
    await mcp.callTool('navigate_page', {
      url: 'data:text/html,<input aria-label=Name><div contenteditable>x</div>',
    });
  });

  mcpTest('reports the focused element and its value', async ({ mcp }) => {
    const snapshot = await mcp.callTool('take_snapshot');
    const uid = /uid=(\S+) \S+ "Name"/.exec(snapshot.text)?.[1];
    assert(uid, 'snapshot contains the input uid');

    const result = await mcp.callTool('type_text', { text: 'b"c', uid });

    expect(result.isError).toBe(false);
    expect(result.text).toContain(`type_text 3 chars on ${uid}`);
    expect(result.text).toContain('Focused: input, value: "b\\"c"');
  });

  mcpTest('reports only the tag of an element without a value', async ({ mcp }) => {
    await mcp.callTool('evaluate_script', {
      function: '() => document.querySelector("div").focus()',
    });

    const result = await mcp.callTool('type_text', { text: 'y' });

    expect(result.isError).toBe(false);
    expect(result.text).toMatch(/Focused: div$/);
  });
});
