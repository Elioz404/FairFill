"use client";

import { useCallback, useEffect, useState } from "react";
import type { EIP1193Provider } from "viem";

export interface InjectedWallet {
  id: string;
  name: string;
  icon: string | null;
  provider: EIP1193Provider;
}

interface AnnounceEvent extends Event {
  detail: { info: { uuid: string; name: string; icon: string; rdns: string }; provider: EIP1193Provider };
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

/** EIP-6963 discovery with a window.ethereum fallback. */
export function useWallet() {
  const [wallets, setWallets] = useState<InjectedWallet[]>([]);
  const [active, setActive] = useState<InjectedWallet | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const found = new Map<string, InjectedWallet>();
    const onAnnounce = (event: Event) => {
      const { info, provider } = (event as AnnounceEvent).detail;
      found.set(info.rdns || info.uuid, { id: info.rdns || info.uuid, name: info.name, icon: info.icon, provider });
      setWallets([...found.values()]);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const fallback = setTimeout(() => {
      if (found.size === 0 && window.ethereum) {
        setWallets([{ id: "injected", name: "Browser wallet", icon: null, provider: window.ethereum }]);
      }
    }, 300);
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      setAddress(list[0] ?? null);
    };
    active.provider.on?.("accountsChanged", onAccounts);
    return () => active.provider.removeListener?.("accountsChanged", onAccounts);
  }, [active]);

  const connect = useCallback(async (wallet: InjectedWallet) => {
    setError(null);
    try {
      const accounts = (await wallet.provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("No account returned");
      setActive(wallet);
      setAddress(accounts[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const disconnect = useCallback(() => {
    setActive(null);
    setAddress(null);
  }, []);

  return { wallets, active, address, error, connect, disconnect };
}
