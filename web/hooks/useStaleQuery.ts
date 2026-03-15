import { useRef } from "react";
import { useFindMany } from "@gadgetinc/react";

type UseFindManyParams = Parameters<typeof useFindMany>;

/**
 * A wrapper around useFindMany that implements the stale-while-revalidate pattern.
 * The `data` field is never cleared to undefined when a new fetch starts — it always
 * holds the most recently loaded data.
 */
export function useStaleQuery(
  manager: UseFindManyParams[0],
  options?: UseFindManyParams[1]
) {
  const [{ data, fetching, error }, refetch] = useFindMany(manager, options);

  const staleDataRef = useRef<typeof data>(undefined);

  // Update the stale ref whenever fresh data arrives
  if (data !== undefined) {
    staleDataRef.current = data;
  }

  const isFirstLoad = fetching && staleDataRef.current === undefined;
  const isRefetching = fetching && staleDataRef.current !== undefined;

  return {
    data: staleDataRef.current,
    fetching,
    isFirstLoad,
    isRefetching,
    error,
    refetch,
  };
}