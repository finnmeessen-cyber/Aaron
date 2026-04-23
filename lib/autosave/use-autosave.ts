"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "error" | "idle" | "saved" | "saving";

type UseAutosaveOptions<TValue> = {
  debounceMs?: number;
  enabled?: boolean;
  isEqual?: (left: TValue, right: TValue) => boolean;
  onSave: (value: TValue) => Promise<void>;
  resetKey: string;
  value: TValue;
};

type UseAutosaveResult<TValue> = {
  errorMessage: string | null;
  flush: () => Promise<boolean>;
  isDirty: boolean;
  isSaving: boolean;
  markSaved: (value: TValue) => void;
  status: AutosaveStatus;
};

const DEFAULT_DEBOUNCE_MS = 900;
const SAVED_STATE_DURATION_MS = 1800;

function defaultIsEqual<TValue>(left: TValue, right: TValue) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Autosave failed.";
}

export function useAutosave<TValue>({
  debounceMs = DEFAULT_DEBOUNCE_MS,
  enabled = true,
  isEqual = defaultIsEqual,
  onSave,
  resetKey,
  value
}: UseAutosaveOptions<TValue>): UseAutosaveResult<TValue> {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const latestValueRef = useRef(value);
  const lastSavedValueRef = useRef(value);
  const generationRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightSaveRef = useRef<{ generation: number; promise: Promise<void> } | null>(null);

  const clearDebounceTimer = useCallback(() => {
    if (!debounceTimerRef.current) {
      return;
    }

    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
  }, []);

  const clearSavedStateTimer = useCallback(() => {
    if (!savedStateTimerRef.current) {
      return;
    }

    clearTimeout(savedStateTimerRef.current);
    savedStateTimerRef.current = null;
  }, []);

  const scheduleSavedStateReset = useCallback(() => {
    clearSavedStateTimer();
    savedStateTimerRef.current = setTimeout(() => {
      setStatus((current) => (current === "saved" ? "idle" : current));
    }, SAVED_STATE_DURATION_MS);
  }, [clearSavedStateTimer]);

  const commit = useCallback(
    async (snapshot: TValue, generation = generationRef.current) => {
      if (!enabled) {
        return;
      }

      if (generation !== generationRef.current) {
        return;
      }

      if (isEqual(snapshot, lastSavedValueRef.current)) {
        setIsDirty(false);
        setErrorMessage(null);
        setStatus("idle");
        return;
      }

      if (inFlightSaveRef.current?.generation === generation) {
        return inFlightSaveRef.current.promise;
      }

      clearSavedStateTimer();
      setStatus("saving");
      setErrorMessage(null);

      const savePromise = (async () => {
        let saveSucceeded = false;

        try {
          await onSave(snapshot);

          if (generation !== generationRef.current) {
            return;
          }

          saveSucceeded = true;
          lastSavedValueRef.current = snapshot;
          const hasPendingChanges = !isEqual(latestValueRef.current, lastSavedValueRef.current);

          setIsDirty(hasPendingChanges);
          setErrorMessage(null);

          if (hasPendingChanges) {
            setStatus("saving");
            return;
          }

          setStatus("saved");
          scheduleSavedStateReset();
        } catch (error) {
          if (generation !== generationRef.current) {
            return;
          }

          setIsDirty(!isEqual(latestValueRef.current, lastSavedValueRef.current));
          setErrorMessage(getErrorMessage(error));
          setStatus("error");
          throw error;
        } finally {
          if (inFlightSaveRef.current?.generation === generation) {
            inFlightSaveRef.current = null;
          }

          if (
            saveSucceeded &&
            generation === generationRef.current &&
            !isEqual(latestValueRef.current, lastSavedValueRef.current)
          ) {
            clearDebounceTimer();
            debounceTimerRef.current = setTimeout(() => {
              void commit(latestValueRef.current, generation);
            }, 0);
          }
        }
      })();

      inFlightSaveRef.current = {
        generation,
        promise: savePromise
      };
      return savePromise;
    },
    [
      clearDebounceTimer,
      clearSavedStateTimer,
      enabled,
      isEqual,
      onSave,
      scheduleSavedStateReset
    ]
  );

  const flush = useCallback(async () => {
    clearDebounceTimer();

    try {
      await commit(latestValueRef.current, generationRef.current);
      return true;
    } catch {
      return false;
    }
  }, [clearDebounceTimer, commit]);

  const markSaved = useCallback(
    (nextValue: TValue) => {
      clearDebounceTimer();
      clearSavedStateTimer();
      latestValueRef.current = nextValue;
      lastSavedValueRef.current = nextValue;
      setIsDirty(false);
      setErrorMessage(null);
      setStatus("saved");
      scheduleSavedStateReset();
    },
    [clearDebounceTimer, clearSavedStateTimer, scheduleSavedStateReset]
  );

  useEffect(() => {
    latestValueRef.current = value;

    if (!enabled) {
      clearDebounceTimer();
      setIsDirty(false);
      setStatus("idle");
      setErrorMessage(null);
      return;
    }

    const dirty = !isEqual(value, lastSavedValueRef.current);
    setIsDirty(dirty);

    if (!dirty) {
      clearDebounceTimer();
      return;
    }

    clearDebounceTimer();
    debounceTimerRef.current = setTimeout(() => {
      void commit(latestValueRef.current);
    }, debounceMs);

    return clearDebounceTimer;
  }, [clearDebounceTimer, commit, debounceMs, enabled, isEqual, value]);

  useEffect(() => {
    clearDebounceTimer();
    clearSavedStateTimer();
    generationRef.current += 1;
    lastSavedValueRef.current = latestValueRef.current;
    inFlightSaveRef.current = null;
    setIsDirty(false);
    setErrorMessage(null);
    setStatus("idle");
  }, [clearDebounceTimer, clearSavedStateTimer, resetKey]);

  useEffect(() => {
    return () => {
      clearDebounceTimer();
      clearSavedStateTimer();
    };
  }, [clearDebounceTimer, clearSavedStateTimer]);

  return {
    errorMessage,
    flush,
    isDirty,
    isSaving: status === "saving",
    markSaved,
    status
  };
}
