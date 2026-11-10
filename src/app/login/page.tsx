"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
export default function Login() {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="auth">
      <section className="auth-story">
        <a className="brand" href="/">
          ◈ Pathwise
        </a>
        <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
        <h1>
          A little direction.
          <br />A lot of possibility.
        </h1>
        <p>
          Build on what you know. Discover what comes next. Make your learning
          journey your own.
        </p>
        <div className="orbit">
          ◈
        </div>
        <span>• PERSONALIZED LEARNING, CURATED FOR YOU •</span>
      </section>
      <section className="auth-form">
        <span className="eyebrow">LET’S MAKE PROGRESS</span>
        <h2>{register ? "Create your account" : "Welcome back."}</h2>
        <p>
          {register
            ? "Your goals deserve a plan."
            : "Pick up where your curiosity left off."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              if (register) {
                const r = await fetch("/api/platform", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "register",
                    name: f.get("name"),
                    email: f.get("email"),
                    password: f.get("password"),
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
              }
              const result = await signIn("credentials", {
                email: f.get("email"),
                password: f.get("password"),
                redirect: false,
              });
              if (result?.error) throw Error("Check your email and password.");
              window.location.href = "/";
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {register && (
            <label>
              Full name
              <input
                name="name"
                required
                minLength={2}
                maxLength={150}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email address
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : register
                ? "Create account →"
                : "Sign in →"}
          </button>
        </form>
        <p>
          {register ? "Already have an account?" : "New to Pathwise?"}{" "}
          <button
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "Sign in" : "Create an account"}
          </button>
        </p>
      </section>
    </main>
  );
}
