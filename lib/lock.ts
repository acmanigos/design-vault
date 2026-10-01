// Serialize sync and local edits, including two tabs in the same browser.
let pending: Promise<unknown> = Promise.resolve();
export function withVaultLock<T>(action: () => Promise<T>): Promise<T> {
  const execute = async (): Promise<T> => typeof navigator !== 'undefined' && navigator.locks
    ? await navigator.locks.request('design-vault-write', action) : await action();
  const next = pending.then(execute, execute);
  pending = next.catch(() => {});
  return next;
}
