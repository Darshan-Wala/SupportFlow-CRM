import type { User, Workspace } from "@shared/domain";
import { useQuery } from "@tanstack/react-query";
import { api, getToken, setToken } from "./api";
import { meQuery, qk } from "./queries";
import { queryClient } from "./query-client";

interface AuthResult {
  token: string;
  user: User;
  workspace: Workspace;
}

function onAuthenticated(r: AuthResult) {
  queryClient.clear();
  setToken(r.token);
  queryClient.setQueryData(qk.me, { user: r.user, workspace: r.workspace });
  return r;
}

export async function login(email: string, password: string) {
  return onAuthenticated(await api.post<AuthResult>("/auth/login", { email, password }));
}

export async function register(input: { name: string; email: string; password: string; workspaceName: string }) {
  return onAuthenticated(await api.post<AuthResult>("/auth/register", input));
}

export function logout() {
  setToken(null);
  queryClient.clear();
}

export const isAuthenticated = () => !!getToken();

/** Current user + workspace. Only use inside the authenticated layout. */
export function useMe() {
  const { data } = useQuery(meQuery);
  return data!;
}
