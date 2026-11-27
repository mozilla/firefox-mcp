/**
 * Integration tests for type_text
 * Tests with real Firefox browser in headless mode
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFirefox,
  closeFirefox,
  fixtureUrl,
  waitForElementInSnapshot,
} from '../../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';

const PAGE =
  'data:text/html,<h1 id=h>Title</h1><input id=a><input id=b>' +
  '<form id=f onsubmit="document.title=\'submitted\';return false"><input id=c></form>';

describe('type_text Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
  });

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  async function openPage(): Promise<void> {
    await firefox.navigate(PAGE);
    await firefox.evaluate(`
      window.__keys = [];
      document.addEventListener('keydown', (e) => {
        window.__keys.push({ target: e.target.id, key: e.key });
      }, true);
    `);
  }

  async function recordedKeys(): Promise<Array<{ target: string; key: string }>> {
    return JSON.parse(String(await firefox.evaluate('JSON.stringify(window.__keys)')));
  }

  async function valueOf(id: string): Promise<string> {
    return String(await firefox.evaluate(`document.getElementById('${id}').value`));
  }

  async function uidOf(id: string): Promise<string> {
    const node = await waitForElementInSnapshot(firefox, (n) => n.id === id, 10000);
    return node.uid;
  }

  it('should type into the given uid one keydown per character', async () => {
    await openPage();

    await firefox.typeText('hi!', { uid: await uidOf('a') });

    expect(await valueOf('a')).toBe('hi!');
    expect((await recordedKeys()).map((k) => `${k.target}:${k.key}`)).toEqual([
      'a:h',
      'a:i',
      'a:!',
    ]);
  }, 20000);

  it('should append to the already focused element when no uid is given', async () => {
    await openPage();

    await firefox.typeText('ab', { uid: await uidOf('b') });
    await firefox.typeText('cd');

    expect(await valueOf('b')).toBe('abcd');
  }, 20000);

  it('should press the submit key on the same element after the text', async () => {
    await openPage();

    await firefox.typeText('query', { uid: await uidOf('c'), submitKey: 'Enter' });

    expect(await valueOf('c')).toBe('query');
    expect((await recordedKeys()).map((k) => k.key)).toEqual(['q', 'u', 'e', 'r', 'y', 'Enter']);
    expect(await firefox.evaluate('document.title')).toBe('submitted');
  }, 20000);

  it('should move focus with Tab as the submit key', async () => {
    await openPage();

    await firefox.typeText('first', { uid: await uidOf('a'), submitKey: 'Tab' });

    expect(await valueOf('a')).toBe('first');
    expect(await firefox.evaluate('document.activeElement.id')).toBe('b');
  }, 20000);

  it('should reject a uid that cannot take keyboard focus without typing', async () => {
    await openPage();
    const uid = await uidOf('h');

    await expect(firefox.typeText('nope', { uid })).rejects.toThrow(
      /^uid \S+ cannot receive keyboard focus/
    );
    expect(await recordedKeys()).toEqual([]);
  }, 20000);
  describe('focused element', () => {
    it('should return the focused input and its value', async () => {
      await openPage();

      const focused = await firefox.typeText('hi', { uid: await uidOf('a') });

      expect(focused).toEqual({ tag: 'input', value: 'hi' });
    }, 20000);

    it('should return the element that has focus after the submit key', async () => {
      await openPage();
      await firefox.evaluate(`document.getElementById('b').value = 'next'`);

      const focused = await firefox.typeText('first', { uid: await uidOf('a'), submitKey: 'Tab' });

      expect(focused).toEqual({ tag: 'input', value: 'next' });
    }, 20000);

    it('should return no value for an element without one', async () => {
      await firefox.navigate('data:text/html,<div id=e contenteditable></div>');

      const focused = await firefox.typeText('hi', { uid: await uidOf('e') });

      expect(focused).toEqual({ tag: 'div' });
    }, 20000);

    it('should look into open shadow roots', async () => {
      await firefox.navigate(fixtureUrl('shadow-dom.html'));
      const focused = await firefox.typeText('deep', { uid: await uidOf('deep') });

      expect(focused).toEqual({ tag: 'input', value: 'deep' });
    }, 20000);

    it('should look into same-origin iframes when no uid is given', async () => {
      await firefox.navigate('data:text/html,<iframe srcdoc="<input id=inner>"></iframe>');
      await firefox.typeText('ab', { uid: await uidOf('inner') });

      const focused = await firefox.typeText('cd');

      expect(focused).toEqual({ tag: 'input', value: 'abcd' });
    }, 20000);
  });
});
