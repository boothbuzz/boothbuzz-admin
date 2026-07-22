import { apiFetch, setAuthToken } from './api';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
  organizationName: string | null;
  mustChangePassword?: boolean;
};

type LoginResponse = {
  mustChangePassword: boolean;
  user: AuthUser;
  token?: string;
  accessToken?: string;
  access_token?: string;
};

function pickAuthToken(data: LoginResponse | null | undefined): string | null {
  if (!data) return null;
  return data.token ?? data.accessToken ?? data.access_token ?? null;
}

export async function login(email: string, password: string) {
  const result = await apiFetch<LoginResponse>('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (result.error) return result;

  const token = pickAuthToken(result.data);
  if (token) setAuthToken(token);
  return result;
}

export async function getMe() {
  return apiFetch<AuthUser>('/admin/auth/me');
}

export async function logout() {
  const result = await apiFetch('/admin/auth/logout', { method: 'POST' });
  setAuthToken(null);
  return result;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const result = await apiFetch<{ ok: boolean; user: AuthUser; token?: string; accessToken?: string }>(
    '/admin/auth/change-password',
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    },
  );
  const token = result.data?.token ?? result.data?.accessToken ?? null;
  if (token) setAuthToken(token);
  return result;
}
