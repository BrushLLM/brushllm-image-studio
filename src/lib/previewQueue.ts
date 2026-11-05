// Native codecs cannot all be interrupted mid-encode. Never run two UI
// previews together, and discard superseded work before it reaches Rust.
let running = false;
let pending: { run: () => Promise<void>; cancelled: boolean } | null = null;

function drain() {
  if (running || pending === null) return;
  const task = pending;
  pending = null;
  if (task.cancelled) return;
  running = true;
  void Promise.resolve().then(() => { if (!task.cancelled) return task.run(); }).catch(() => {}).finally(() => {
    running = false;
    drain();
  });
}

export function enqueuePreview(run: () => Promise<void>): () => void {
  const task = { run, cancelled: false };
  pending = task;
  drain();
  return () => {
    task.cancelled = true;
    if (pending === task) pending = null;
  };
}
