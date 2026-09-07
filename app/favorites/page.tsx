"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function FavoritesRedirectPage() { const router = useRouter(); useEffect(() => { router.replace("/saved/"); }, [router]); return <main className="amd-app grid min-h-[100dvh] place-items-center text-[12px] text-[var(--amd-text-2)]">Redirecting to Saved…</main>; }
