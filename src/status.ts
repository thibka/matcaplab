import type { AssetKind } from './types';

// Short, user-facing reason for a failed asset request.
export function describeLoadError(error: unknown): string {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
        return 'request timed out';
    }
    if (!navigator.onLine) {
        return 'you appear to be offline';
    }
    if (error instanceof TypeError) {
        return 'network error';
    }
    return 'unexpected error, see console';
}

// Badge in the viewport corner reporting asset loading progress and failures, one row per asset kind.
export class AssetStatus {
    private container: HTMLElement;
    private rows = new Map<AssetKind, HTMLDivElement>();

    constructor(container: HTMLElement) {
        this.container = container;
    }

    loading(kind: AssetKind, label: string) {
        const row = this.createRow(kind, 'loading');
        const spinner = document.createElement('span');
        spinner.className = 'asset-status__spinner';
        spinner.setAttribute('aria-hidden', 'true');
        row.append(spinner, this.createText(`Loading ${label}…`));
    }

    error(kind: AssetKind, message: string, onRetry: () => void, onDismiss: () => void) {
        const row = this.createRow(kind, 'error');
        row.setAttribute('role', 'alert');

        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'asset-status__action';
        retry.textContent = 'Retry';
        retry.addEventListener('click', onRetry);

        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'asset-status__dismiss';
        dismiss.textContent = '×';
        dismiss.setAttribute('aria-label', 'Dismiss');
        dismiss.addEventListener('click', () => {
            this.clear(kind);
            onDismiss();
        });

        row.append(this.createText(message), retry, dismiss);
    }

    clear(kind: AssetKind) {
        this.rows.get(kind)?.remove();
        this.rows.delete(kind);
    }

    private createRow(kind: AssetKind, variant: 'loading' | 'error'): HTMLDivElement {
        this.clear(kind);
        const row = document.createElement('div');
        row.className = `asset-status__row asset-status__row--${variant}`;
        this.container.append(row);
        this.rows.set(kind, row);
        return row;
    }

    private createText(text: string): HTMLSpanElement {
        const span = document.createElement('span');
        span.className = 'asset-status__text';
        span.textContent = text;
        return span;
    }
}
