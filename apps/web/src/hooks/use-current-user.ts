import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchCurrentUser, logout, takeAuthError } from "@/lib/auth";

const CURRENT_USER = ["currentUser"] as const;

/** The signed-in user: null when signed out, undefined while checking or on error. */
export function useCurrentUser() {
  return useQuery({ queryKey: CURRENT_USER, queryFn: fetchCurrentUser });
}

/** Ends the session and shows the signed-out state at once. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => queryClient.setQueryData(CURRENT_USER, null),
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
