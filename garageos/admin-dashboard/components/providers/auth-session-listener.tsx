"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AuthSessionListener() {
  const router = useRouter();

  useEffect(() => {
    const onExpired = () => {
      const from = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?from=${encodeURIComponent(from)}`);
    };
    window.addEventListener("garageos:auth-expired", onExpired);
    return () => window.removeEventListener("garageos:auth-expired", onExpired);
  }, [router]);

  return null;
}
