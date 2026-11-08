import { useEffect, useRef } from 'react';
import { addPluginListener, PluginListener } from '@tauri-apps/api/core';
import { AppService } from '@/types/system';
import {
  FILE_SELECTION_PRESETS,
  SelectedFile,
  hasAllowedExtension,
  resolveTauriFileName,
} from '@/hooks/useFileSelector';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';

interface FilePickerResultPayload {
  uris: string[];
}

/**
 * Consume book files picked through the native-bridge file picker on Android.
 *
 * The native-bridge picker delivers results as a `file-picker-result` plugin
 * event routed through the pending-event queue, so results emitted before this
 * listener registers are replayed once the listener lands.
 *
 * Mount this wherever picked books can be imported (the library page). The
 * picker is opened via `showFilePicker()` in `utils/bridge`; cancellation
 * simply emits nothing.
 */
export function useAndroidPickedBooks(
  appService: AppService | null,
  onPickedBooks: (files: SelectedFile[]) => void,
) {
  // Keep the native listener registered once per appService while always
  // dispatching to the latest callback: re-registering on every render would
  // thrash the native listener map and can drop queued events between the
  // unregister/register pair.
  const onPickedBooksRef = useRef(onPickedBooks);
  onPickedBooksRef.current = onPickedBooks;
  const _ = useTranslation();
  const _ref = useRef(_);
  _ref.current = _;

  useEffect(() => {
    if (!appService?.isAndroidApp) return;

    const listener: Promise<PluginListener> = addPluginListener(
      'native-bridge',
      'file-picker-result',
      async (payload: FilePickerResultPayload) => {
        const uris = payload.uris || [];
        if (uris.length === 0) return;
        // The picker runs unfiltered (SAF cannot match book MIME types — see
        // useFileSelector), so resolve real display names first and re-apply
        // the book extension whitelist here, like the dialog-plugin path did.
        const files: SelectedFile[] = await Promise.all(
          uris.map(async (path) => ({ path, name: await resolveTauriFileName(path, appService) })),
        );
        const extensions = FILE_SELECTION_PRESETS.books.extensions;
        const books = files.filter(({ name }) => hasAllowedExtension(name, extensions));
        if (books.length > 0) {
          onPickedBooksRef.current(books);
        }
        // Files the whitelist drops used to vanish without a trace, so an
        // unsupported (or oddly named) pick looked like the import button doing
        // nothing at all (issue #5959). Name them, whether or not anything else
        // in the same pick made it through.
        if (books.length < files.length) {
          const skipped = files.filter((file) => !books.includes(file));
          eventDispatcher.dispatch('toast', {
            type: 'error',
            message: _ref.current('Failed to import book(s): {{filenames}}', {
              filenames: skipped.map(({ name, path }) => name || path).join(', '),
            }),
            timeout: 5000,
          });
        }
      },
    );

    return () => {
      listener.then((l) => l.unregister());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService]);
}
