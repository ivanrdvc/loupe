// Shared subscribe/notify plumbing for useSyncExternalStore-backed localStorage
// settings. Cross-tab changes arrive via the key-filtered 'storage' event;
// same-tab writers must call notify() (the event doesn't fire in the writing tab).
export function createLocalStorageStore(key: string) {
  const listeners = new Set<() => void>()
  return {
    subscribe(cb: () => void) {
      listeners.add(cb)
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) cb()
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(cb)
        window.removeEventListener('storage', onStorage)
      }
    },
    notify() {
      for (const listener of listeners) listener()
    },
  }
}
