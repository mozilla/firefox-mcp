/**
 * Dialog events.
 */

import type { BrowsingContext } from 'webdriver-bidi-protocol';
import type { BiDiFacade } from '../bidi.js';
import { logDebug } from '../../utils/logger.js';

export class DialogEvents {
  private dialogs = new Map<
    BrowsingContext.BrowsingContext,
    BrowsingContext.UserPromptOpenedParameters
  >();
  // Firefox reports a dialog opened in a frame with the frame's context, but
  // tools only know the top-level context of the page.
  private topLevelContexts = new Map<
    BrowsingContext.BrowsingContext,
    BrowsingContext.BrowsingContext
  >();
  private subscribed = false;

  constructor(private bidi: BiDiFacade) {}

  /**
   * Subscribe to BiDi dialog events.
   */
  async subscribe(): Promise<void> {
    if (this.subscribed) {
      return;
    }

    await this.bidi.subscribe([
      'browsingContext.contextCreated',
      'browsingContext.contextDestroyed',
      'browsingContext.userPromptOpened',
      'browsingContext.userPromptClosed',
    ]);

    this.bidi.on('browsingContext.contextCreated', ({ context, parent }) => {
      if (parent) {
        this.topLevelContexts.set(context, this.getTopLevelContext(parent));
      }
    });

    this.bidi.on('browsingContext.contextDestroyed', (info) => {
      this.forgetContext(info);
    });

    this.bidi.on('browsingContext.userPromptOpened', (dialog) => {
      this.dialogs.set(this.getTopLevelContext(dialog.context), dialog);
    });

    this.bidi.on('browsingContext.userPromptClosed', ({ context }) => {
      this.dialogs.delete(this.getTopLevelContext(context));
    });

    this.subscribed = true;
    logDebug('Dialog listener ready');
  }

  private getTopLevelContext(context: BrowsingContext.BrowsingContext) {
    return this.topLevelContexts.get(context) ?? context;
  }

  private forgetContext({ context, children }: BrowsingContext.Info) {
    this.topLevelContexts.delete(context);
    children?.forEach((child) => this.forgetContext(child));
  }

  getDialog(context: BrowsingContext.BrowsingContext) {
    return this.dialogs.get(context);
  }

  hasDialogs() {
    return this.dialogs.size > 0;
  }

  async raceAgainstDialogOpened<T>(
    fn: () => Promise<T>,
    getCurrentContextId: () => BrowsingContext.BrowsingContext | null,
    dialogOpenedResult: (dialog: BrowsingContext.UserPromptOpenedParameters) => T
  ) {
    let removeListener!: () => void;
    const dialogOpened = new Promise<T>((resolve) => {
      const listener = (dialog: BrowsingContext.UserPromptOpenedParameters) => {
        if (this.getTopLevelContext(dialog.context) === getCurrentContextId()) {
          resolve(dialogOpenedResult(dialog));
        }
      };
      this.bidi.on('browsingContext.userPromptOpened', listener);
      removeListener = () => this.bidi.off('browsingContext.userPromptOpened', listener);
    });
    try {
      const promise = fn();
      void dialogOpened.then(() =>
        promise.catch((error) =>
          logDebug(
            `Tool call errored after its handler returned early due to a dialog opening: ${String(error)}`
          )
        )
      );
      return await Promise.race([promise, dialogOpened]);
    } finally {
      removeListener();
    }
  }
}
