import { useEffect } from "react";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchCurrentUser, logout, takeAuthError } from "@/lib/auth";

const currentUserOptions = queryOptions({
  queryKey: ["currentUser"],
  queryFn: ({ signal }) => fetchCurrentUser(signal),
});

/** The signed-in user: null when signed out, undefined while checking or on error. */
export function useCurrentUser() {
  return useQuery(currentUserOptions);
}

/** Ends the session and shows the signed-out state at once. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () =>
      queryClient.setQueryData(currentUserOptions.queryKey, null),
    onError: (error) => toast.error(error.message),
  });
}

/** Shows the error the backend sent back after a failed sign-in, once. */
export function useAuthErrorToast(): void {
  useEffect(() => {
    const error = takeAuthError();
    if (error) toast.error(error);
  }, []);
}
