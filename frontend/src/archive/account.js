import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getMe } from "./memberApi";

export const RANKS = { contributor: 0, moderator: 1, admin: 2, sysadmin: 3 };

export const STORED_ROLES = ["contributor", "moderator", "admin"];

export const ROLE_LABELS = { contributor: "Contributor", moderator: "Moderator", admin: "Admin", sysadmin: "Sysadmin" };

const rank = (role) => (Object.prototype.hasOwnProperty.call(RANKS, role) ? RANKS[role] : 0);

export const atLeast = (role, min) => rank(role) >= rank(min);

export const safeNext = (next) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

const TOKEN_KEY = "token";

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const AccountContext = createContext({
  account: null,
  loading: false,
  signIn: async () => {},
  signOut: () => {},
  refresh: async () => {}
});

export function AccountProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(Boolean(readToken()));

  const refresh = useCallback(async () => {
    if (!readToken()) {
      setAccount(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setAccount(await getMe());
    } catch (err) {
      if (err.status === 401 || err.status === 403) localStorage.removeItem(TOKEN_KEY);
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (token) => {
      localStorage.setItem(TOKEN_KEY, token);
      await refresh();
    },
    [refresh]
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAccount(null);
  }, []);

  const value = useMemo(
    () => ({ account, loading, signIn, signOut, refresh }),
    [account, loading, signIn, signOut, refresh]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export const useAccount = () => useContext(AccountContext);
