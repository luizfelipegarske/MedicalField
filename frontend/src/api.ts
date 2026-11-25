
const AUTH = '/api/auth';
const RECORDS = '/api/records';
const DOCS = '/api/docs';

export const getToken = () => {
  const mode = sessionStorage.getItem('mf_active_mode') || 'web';
  return localStorage.getItem(`mf_${mode}_token`) || '';
};

export async function request(
  base: string,
  path: string,
  options: RequestInit = {}
) {
  const r = await fetch(base + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken()
        ? { Authorization: 'Bearer ' + getToken() }
        : {}),
      ...(options.headers || {})
    }
  });

  if (!r.ok) {
    throw new Error((await r.text()) || `HTTP ${r.status}`);
  }

  return r;
}

export const authApi = {
  login: async (identifier: string, password: string) => {
    const r = await fetch(AUTH + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });

    if (!r.ok) throw new Error('Credenciais inválidas');

    return r.json();
  }
};

export const recordsApi = (path: string, opts?: RequestInit) =>
  request(RECORDS, path, opts);

export const docsApi = (path: string, opts?: RequestInit) =>
  request(DOCS, path, opts);

