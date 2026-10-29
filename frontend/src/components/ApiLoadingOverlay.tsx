import { LoaderCircle } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { isApiLoading, subscribeToApiLoading } from '../services/api';

export const ApiLoadingOverlay = () => {
  const isLoading = useSyncExternalStore(subscribeToApiLoading, isApiLoading, () => false);

  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Loading data"
    >
      <div className="flex min-w-52 flex-col items-center rounded-2xl border border-white/60 bg-white/95 px-7 py-6 shadow-2xl shadow-slate-950/20">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
          <LoaderCircle className="h-6 w-6 animate-spin" />
        </div>
        <p className="mt-3 text-sm font-bold text-slate-800">Loading data</p>
        <p className="mt-1 text-xs text-slate-500">Please wait a moment...</p>
      </div>
    </div>
  );
};
