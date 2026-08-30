"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    const payload = await response.json() as { error?: string };
    if (response.ok) router.push("/dashboard");
    else { setMessage(payload.error ?? "Authentication failed."); setPending(false); }
  };

  return <main className="auth-shell grid min-h-screen lg:grid-cols-2"><section className="flex items-center justify-center px-5 py-12 sm:px-8"><div className="auth-card w-full max-w-md"><Link href="/" className="flex items-center gap-2.5 font-serif text-xl font-semibold"><span className="auth-brand-mark flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black">P</span>Postify</Link><p className="auth-eyebrow mt-12 text-xs font-bold uppercase tracking-[0.16em]">Social publishing workspace</p><h1 className="mt-2 font-serif text-4xl font-semibold">{isRegister ? "Create your workspace" : "Welcome back"}</h1><p className="auth-muted mt-3 text-sm leading-6">{isRegister ? "Start organizing content, publishing schedules, and social performance in one place." : "Sign in to continue managing your publishing workspace."}</p><form onSubmit={submit} className="mt-8 space-y-4">{isRegister && <label className="block text-sm font-bold">Name<input name="name" required autoComplete="name" className="auth-input mt-1.5 min-h-11 w-full rounded-lg px-3 text-sm" /></label>}<label className="block text-sm font-bold">Email<input name="email" type="email" required autoComplete="email" className="auth-input mt-1.5 min-h-11 w-full rounded-lg px-3 text-sm" /></label><label className="block text-sm font-bold">Password<input name="password" type="password" required minLength={12} autoComplete={isRegister ? "new-password" : "current-password"} className="auth-input mt-1.5 min-h-11 w-full rounded-lg px-3 text-sm" />{isRegister && <span className="auth-muted mt-1 block text-xs font-normal">Use at least 12 characters.</span>}</label>{message && <p role="alert" className="auth-error rounded-md px-3 py-2 text-sm font-medium">{message}</p>}<button disabled={pending} className="auth-submit min-h-11 w-full rounded-lg px-4 text-sm font-bold disabled:opacity-60">{pending ? "Please wait..." : isRegister ? "Create account" : "Sign in"}</button></form><p className="auth-muted mt-6 text-sm">{isRegister ? "Already have an account?" : "New to Postify?"} <Link href={isRegister ? "/login" : "/register"} className="auth-link font-bold">{isRegister ? "Sign in" : "Create an account"}</Link></p></div></section><aside className="auth-aside hidden p-12 lg:flex lg:flex-col lg:justify-end"><p className="max-w-md font-serif text-5xl leading-tight">Plan the next post. See the bigger picture.</p><p className="mt-6 max-w-sm text-sm leading-6">One focused space for each personal profile and business team.</p></aside></main>;
}