let activeReads = 0;
let activeWrites = 0;
const listeners = new Set();
const MIN_VISIBLE_MS = 3000;

const INACTIVE_SNAPSHOT = {
  active: false,
  loading: false,
  saving: false,
};

let cachedSnapshot = INACTIVE_SNAPSHOT;
let visibleUntil = 0;
let hideTimer = null;

const getSnapshot = () => ({
  active: activeReads + activeWrites > 0 || Date.now() < visibleUntil,
  loading: activeReads > 0,
  saving: activeWrites > 0,
});

const notify = () => {
  listeners.forEach((listener) => listener());
};

const updateSnapshot = () => {
  const nextSnapshot = getSnapshot();
  if (
    nextSnapshot.active !== cachedSnapshot.active ||
    nextSnapshot.loading !== cachedSnapshot.loading ||
    nextSnapshot.saving !== cachedSnapshot.saving
  ) {
    cachedSnapshot = nextSnapshot.active ? nextSnapshot : INACTIVE_SNAPSHOT;
  }

  notify();
};

const scheduleHide = () => {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  if (activeReads + activeWrites > 0) {
    return;
  }

  const remaining = visibleUntil - Date.now();
  if (remaining > 0) {
    hideTimer = setTimeout(() => {
      hideTimer = null;
      updateSnapshot();
    }, remaining);
  }
};

const emit = () => {
  updateSnapshot();
  scheduleHide();
};

export function subscribeToSupabaseActivity(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSupabaseActivitySnapshot() {
  return cachedSnapshot;
}

export function getSupabaseActivityServerSnapshot() {
  return INACTIVE_SNAPSHOT;
}

function isWriteRequest(input, init) {
  const method =
    init?.method ||
    (typeof input === "object" && input !== null && "method" in input
      ? input.method
      : "GET");

  return !["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase());
}

export async function trackSupabaseFetch(input, init) {
  const isWrite = isWriteRequest(input, init);
  visibleUntil = Math.max(visibleUntil, Date.now() + MIN_VISIBLE_MS);

  if (isWrite) {
    activeWrites += 1;
  } else {
    activeReads += 1;
  }
  emit();

  try {
    return await fetch(input, init);
  } finally {
    if (isWrite) {
      activeWrites = Math.max(0, activeWrites - 1);
    } else {
      activeReads = Math.max(0, activeReads - 1);
    }
    emit();
  }
}
