"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/storage";
export default function Account() {
  const router = useRouter();
  const [signup, setSignup] = useState(true),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  return (
    <main className="social-page">
      <Link className="brand" href="/">
        NOIR · NEW AGE MUSIC
      </Link>
      <header className="social-hero">
        <span className="eyebrow">YOUR SOUND BELONGS HERE</span>
        <h1>
          {signup ? "Welcome to your next era." : "Good to have you back."}
        </h1>
        <p>
          Free recording, your own artist profile and a community to create
          with.
        </p>
      </header>
      <form
        className="social-card profile-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            if (!supabase) throw Error("Accounts are unavailable right now.");
            if (signup) {
              const { data, error } = await supabase.auth.signUp({
                email: email.trim(),
                password,
                options: {
                  data: { display_name: name.trim() },
                  emailRedirectTo: window.location.origin + "/profile",
                },
              });
              if (error) throw error;
              if (!data.session) {
                setMessage(
                  "Check your email to finish signing up. If you already have an account, choose Sign in.",
                );
                return;
              }
            } else {
              const { error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
              });
              if (error) throw error;
            }
            router.push("/profile?welcome=1");
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Could not open your account. Try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{signup ? "Create your free account" : "Sign in"}</h2>
        {signup && (
          <label>
            Artist name
            <input
              aria-label="Artist name"
              required
              maxLength={60}
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label>
          Email
          <input
            aria-label="Email"
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            aria-label="Password"
            required
            type={show ? "text" : "password"}
            minLength={8}
            maxLength={128}
            autoComplete={signup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
          />
          Show password
        </label>
        <p>
          Use at least 8 characters. Email addresses aren’t verified during
          early access.
        </p>
        <button disabled={busy} className="primary">
          {busy ? "Opening your space…" : signup ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setSignup(!signup);
            setError("");
            setMessage("");
          }}
        >
          {signup
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </form>
      <p>
        Your projects and source recordings stay private. You choose which
        finished songs to publish.
      </p>
    </main>
  );
}
