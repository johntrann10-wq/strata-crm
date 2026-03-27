/**
 * Client-side API hooks for talking to the Express backend under `/api/*`.
 * Use these instead of useFindOne, useFindMany, useAction, useGlobalAction.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import { setAuthToken } from "../lib/auth";
import { recordRuntimeError } from "../lib/runtimeErrors";

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
  /** Passed as query param to the API (server-side search/filter). */
  search?: string;
  /** Invoice / quote status tab (e.g. draft, sent). Omit or "all" for no filter. */
  status?: string;
  /** Quotes: lost follow-up queue. */
  lost?: boolean;
  /** Quotes: draft + sent only (dashboard). */
  pending?: boolean;
  /** Invoices: sent + partial (unpaid balance). */
  unpaid?: boolean;
  /** Jobs: completed work without an invoice. */
  unbilled?: boolean;
  /** Appointments: ISO bounds on `startTime`. */
  startGte?: string;
  startLte?: string;
  /** Appointments: filter by client. */
  clientId?: string;
  /** Workflow records: filter by vehicle. */
  vehicleId?: string;
  /** Workflow records: filter by location. */
  locationId?: string;
  pause?: boolean;
  live?: boolean;
};

type FindOneOpts = { select?: Record<string, unknown>; pause?: boolean; live?: boolean };

function stableKey(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

export function useFindOne(
  model: { findOne: (id: string, opts?: FindOneOpts) => Promise<any> },
  id: string | null | undefined,
  opts?: FindOneOpts
) {
  const [data, setData] = useState<any>(undefined);
  const [fetching, setFetching] = useState(!!id);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Ensure we don't keep stale data when switching between "signed in" and "signed out".
  useEffect(() => {
    if (id == null || id === "") {
      requestIdRef.current += 1;
      setData(undefined);
      setError(null);
      setFetching(false);
    }
  }, [id]);

  const optsKey = useMemo(
    () => `${stableKey(opts?.select)}|${opts?.pause ? "1" : "0"}|${opts?.live ? "1" : "0"}`,
    [opts?.select, opts?.pause, opts?.live]
  );
  const stableOpts = useMemo(() => opts, [optsKey]);

  const refetch = useCallback(async () => {
    if (id == null || id === "") {
      setData(undefined);
      setFetching(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setFetching(true);
    setError(null);
    try {
      const result = await model.findOne(id, stableOpts);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setData(result ?? null);
    } catch (e) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setFetching(false);
    }
  }, [id, model, stableOpts]);

  useEffect(() => {
    if (opts?.pause) return;
    refetch();
  }, [refetch, opts?.pause]);

  return [{ data, fetching, error }, refetch] as const;
}

export function useFindMany(
  model: { findMany: (opts?: FindManyOpts) => Promise<any[]> },
  opts?: FindManyOpts
) {
  const [data, setData] = useState<any[] | undefined>(undefined);
  const [fetching, setFetching] = useState(!opts?.pause);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const optsKey = useMemo(
    () =>
      [
        stableKey(opts?.filter),
        stableKey(opts?.sort),
        String(opts?.first ?? ""),
        stableKey(opts?.select),
        String(opts?.search ?? ""),
        String(opts?.status ?? ""),
        opts?.lost ? "1" : "0",
        opts?.pending ? "1" : "0",
        opts?.unpaid ? "1" : "0",
        opts?.unbilled ? "1" : "0",
        String(opts?.startGte ?? ""),
        String(opts?.startLte ?? ""),
        String(opts?.clientId ?? ""),
        String(opts?.vehicleId ?? ""),
        String(opts?.locationId ?? ""),
        opts?.pause ? "1" : "0",
        opts?.live ? "1" : "0",
      ].join("|"),
    [
      opts?.filter,
      opts?.sort,
      opts?.first,
      opts?.select,
      opts?.search,
      opts?.status,
      opts?.lost,
      opts?.pending,
      opts?.unpaid,
      opts?.unbilled,
      opts?.startGte,
      opts?.startLte,
      opts?.clientId,
      opts?.vehicleId,
      opts?.locationId,
      opts?.pause,
      opts?.live,
    ]
  );
  const stableOpts = useMemo(() => opts, [optsKey]);

  useEffect(() => {
    if (stableOpts?.pause) {
      requestIdRef.current += 1;
      setData(undefined);
      setFetching(false);
      setError(null);
      return;
    }
    setData(undefined);
    setError(null);
  }, [optsKey, stableOpts?.pause]);

  const refetch = useCallback(async () => {
    if (stableOpts?.pause) {
      setFetching(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setFetching(true);
    setError(null);
    try {
      const result = await model.findMany(stableOpts);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setData(Array.isArray(result) ? result : []);
    } catch (e) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setFetching(false);
    }
  }, [model, stableOpts]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return [{ data, fetching, error }, refetch] as const;
}

export function useFindFirst(
  model: { findFirst: (opts?: FindManyOpts) => Promise<any> },
  opts?: FindManyOpts
) {
  const [data, setData] = useState<any>(undefined);
  const [fetching, setFetching] = useState(!opts?.pause);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Clear data when paused so we don't keep stale business/user records around.
  useEffect(() => {
    if (opts?.pause) {
      requestIdRef.current += 1;
      setData(undefined);
      setError(null);
      setFetching(false);
    }
  }, [opts?.pause]);

  const optsKey = useMemo(
    () =>
      [
        stableKey(opts?.filter),
        stableKey(opts?.sort),
        String(opts?.first ?? ""),
        stableKey(opts?.select),
        String(opts?.search ?? ""),
        String(opts?.status ?? ""),
        opts?.lost ? "1" : "0",
        opts?.pending ? "1" : "0",
        opts?.unpaid ? "1" : "0",
        opts?.unbilled ? "1" : "0",
        String(opts?.startGte ?? ""),
        String(opts?.startLte ?? ""),
        String(opts?.clientId ?? ""),
        String(opts?.vehicleId ?? ""),
        String(opts?.locationId ?? ""),
        opts?.pause ? "1" : "0",
        opts?.live ? "1" : "0",
      ].join("|"),
    [
      opts?.filter,
      opts?.sort,
      opts?.first,
      opts?.select,
      opts?.search,
      opts?.status,
      opts?.lost,
      opts?.pending,
      opts?.unpaid,
      opts?.unbilled,
      opts?.startGte,
      opts?.startLte,
      opts?.clientId,
      opts?.vehicleId,
      opts?.locationId,
      opts?.pause,
      opts?.live,
    ]
  );
  const stableOpts = useMemo(() => opts, [optsKey]);

  useEffect(() => {
    if (stableOpts?.pause) return;
    setData(undefined);
    setError(null);
  }, [optsKey, stableOpts?.pause]);

  const refetch = useCallback(async () => {
    if (stableOpts?.pause) {
      setFetching(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setFetching(true);
    setError(null);
    try {
      const result = await model.findFirst(stableOpts);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setData(result ?? null);
    } catch (e) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setFetching(false);
    }
  }, [model, stableOpts]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return [{ data, fetching, error }, refetch] as const;
}

type ActionFn = (...args: any[]) => Promise<any>;

export function useAction(actionFn: ActionFn) {
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<unknown>(undefined);
  const actionIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (params?: Record<string, unknown>) => {
      const actionId = actionIdRef.current + 1;
      actionIdRef.current = actionId;
      setFetching(true);
      setError(null);
      setData(undefined);
      try {
        const result = await actionFn(params);
        const data = result ?? null;
        if (!mountedRef.current || actionId !== actionIdRef.current) {
          return { data, error: undefined };
        }
        setData(data);
        return { data, error: undefined };
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (mountedRef.current && actionId === actionIdRef.current) {
          setError(err);
        }
        let detail = "Action failed";
        if (params) {
          try {
            detail = `Action failed with params ${JSON.stringify(params)}`;
          } catch {
            detail = "Action failed with unserializable params";
          }
        }
        recordRuntimeError({
          source: "window.unhandledrejection",
          message: err.message,
          detail,
        });
        return { data: null, error: { message: err.message } };
      } finally {
        if (mountedRef.current && actionId === actionIdRef.current) {
          setFetching(false);
        }
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
  actionFn: (params: Record<string, unknown>) => Promise<any>,
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
              "Cannot reach the API. Locally: run the backend and ensure Vite proxies /api to it. Production: set STRATA_API_ORIGIN on Vercel/Netlify (same-origin /api proxy) or VITE_API_URL / NEXT_PUBLIC_API_URL at build time; see DEPLOY.md.";
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
