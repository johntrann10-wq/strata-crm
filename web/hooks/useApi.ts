/**
 * Client-side API hooks for talking to the Express backend under `/api/*`.
 * Use these instead of useFindOne, useFindMany, useAction, useGlobalAction.
 */

import { useState, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import { setAuthToken } from "../lib/auth";

function persistAuthTokenFromResponse(res: unknown): void {
  if (typeof window === "undefined") return;
  const r = res as { data?: { token?: string }; token?: string } | null | undefined;
  const token = r?.data?.token ?? (typeof r?.token === "string" ? r.token : undefined);
  if (token) setAuthToken(token);
}

type FindManyOpts = {
  filter?: Record<string, unknown>;
  sort?: Record<string, string>;
  first?: number;
  select?: Record<string, unknown>;
  pause?: boolean;
};

type FindOneOpts = { select?: Record<string, unknown> };

export function useFindOne(
  model: { findOne: (id: string, opts?: FindOneOpts) => Promise<unknown> },
  id: string | null | undefined,
  opts?: FindOneOpts
) {
  const [data, setData] = useState<unknown>(undefined);
  const [fetching, setFetching] = useState(!!id);
  const [error, setError] = useState<Error | null>(null);

  // Ensure we don't keep stale data when switching between "signed in" and "signed out".
  useEffect(() => {
    if (id == null || id === "") {
      setData(undefined);
      setError(null);
      setFetching(false);
    }
  }, [id]);

  const refetch = useCallback(async () => {
    if (id == null || id === "") {
      setData(undefined);
      setFetching(false);
      return;
    }
    setFetching(true);
    setError(null);
    try {
      const result = await model.findOne(id, opts);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setFetching(false);
    }
  }, [id, opts?.select, model]);

  useEffect(() => {
    if (opts?.pause) return;
    refetch();
  }, [refetch, opts?.pause]);

  return [{ data, fetching, error }, refetch] as const;
}

export function useFindMany(
  model: { findMany: (opts?: FindManyOpts) => Promise<unknown[]> },
  opts?: FindManyOpts
) {
  const [data, setData] = useState<unknown[] | undefined>(undefined);
  const [fetching, setFetching] = useState(!opts?.pause);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (opts?.pause) {
      setFetching(false);
      return;
    }
    setFetching(true);
    setError(null);
    try {
      const result = await model.findMany(opts);
      setData(Array.isArray(result) ? result : []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setFetching(false);
    }
  }, [opts?.pause, opts?.filter, opts?.sort, opts?.first, opts?.select, model]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return [{ data, fetching, error }, refetch] as const;
}

export function useFindFirst(
  model: { findFirst: (opts?: FindManyOpts) => Promise<unknown> },
  opts?: FindManyOpts
) {
  const [data, setData] = useState<unknown>(undefined);
  const [fetching, setFetching] = useState(!opts?.pause);
  const [error, setError] = useState<Error | null>(null);

  // Clear data when paused so we don't keep stale business/user records around.
  useEffect(() => {
    if (opts?.pause) {
      setData(undefined);
      setError(null);
      setFetching(false);
    }
  }, [opts?.pause]);

  const refetch = useCallback(async () => {
    if (opts?.pause) {
      setFetching(false);
      return;
    }
    setFetching(true);
    setError(null);
    try {
      const result = await model.findFirst(opts);
      setData(result ?? null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setFetching(false);
    }
  }, [opts?.pause, opts?.filter, opts?.select, model]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return [{ data, fetching, error }, refetch] as const;
}

type ActionFn = (params?: Record<string, unknown>) => Promise<unknown>;

export function useAction(actionFn: ActionFn) {
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<unknown>(undefined);

  const run = useCallback(
    async (params?: Record<string, unknown>) => {
      setFetching(true);
      setError(null);
      try {
        const result = await actionFn(params);
        setData(result);
        return { data: result, error: undefined };
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        return { data: undefined, error: { message: err.message } };
      } finally {
        setFetching(false);
      }
    },
    [actionFn]
  );

  return [{ data, fetching, error }, run] as const;
}

export function useGlobalAction(actionFn: ActionFn) {
  return useAction(actionFn);
}

/** Minimal useActionForm replacement: returns register, submit, formState for use with api.user.signIn/signUp/update/changePassword */
type ActionFormOptions = {
  defaultValues?: Record<string, unknown>;
  onSuccess?: () => void;
  send?: string[];
};

export function useActionForm(
  actionFn: (params: Record<string, unknown>) => Promise<{ data?: unknown; error?: { message?: string } }>,
  options?: ActionFormOptions
) {
  const [values, setValues] = useState<Record<string, unknown>>(options?.defaultValues ?? {});
  useEffect(() => {
    if (options?.defaultValues != null) setValues(options.defaultValues);
  }, [options?.defaultValues]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitSuccessful, setIsSubmitSuccessful] = useState(false);
  const [errors, setErrors] = useState<Record<string, { message?: string }>>({});

  const register = useCallback((name: string) => ({
    name,
    onChange: (e: { target: { value: unknown } }) =>
      setValues((v) => ({ ...v, [name]: e.target.value })),
    onBlur: () => {},
    ref: () => {},
  }), []);

  const submit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      setIsSubmitting(true);
      setErrors({});
      // Prefer live form values so submit never sends stale React state (fixes empty payload / failed login).
      let payload: Record<string, unknown>;
      const form = e?.currentTarget;
      if (form instanceof HTMLFormElement) {
        const fd = new FormData(form);
        payload = Object.fromEntries(fd.entries()) as Record<string, unknown>;
        if (options?.send?.length) {
          payload = Object.fromEntries(options.send.map((k) => [k, payload[k]]));
        }
      } else {
        payload = options?.send
          ? Object.fromEntries(options.send.map((k) => [k, values[k]]))
          : { ...values };
      }
      return actionFn(payload)
        .then((res) => {
          if (res && typeof res === "object" && "error" in res && (res as { error?: { message?: string } }).error) {
            const msg = (res as { error?: { message?: string } }).error?.message;
            setErrors({ root: { message: msg ?? "Request failed" } });
            return;
          }
          persistAuthTokenFromResponse(res);
          setIsSubmitSuccessful(true);
          options?.onSuccess?.();
        })
        .catch((err: Error) => {
          let msg = err.message;
          if (msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("Load failed")) {
            msg =
              "Cannot reach the API. Locally: run the backend and ensure Vite proxies /api to it. Production: set VITE_API_URL to your API origin and redeploy.";
          }
          setErrors({ root: { message: msg } });
        })
        .finally(() => setIsSubmitting(false));
    },
    [actionFn, values, options?.onSuccess, options?.send]
  );

  const reset = useCallback((nextValues?: Record<string, unknown>) => {
    setValues(nextValues ?? options?.defaultValues ?? {});
    setErrors({});
  }, [options?.defaultValues]);

  return {
    register,
    submit,
    reset,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  };
}
