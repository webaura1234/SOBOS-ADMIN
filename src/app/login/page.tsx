"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SITE_NAME } from "@/lib/utils";
import { apiFetch, ToastProvider, useToast } from "@/lib/toast";
import { Shield, UserCog } from "lucide-react";

function LoginInner() {
  const router = useRouter();
  const { toast } = useToast();
  const [loadingRole, setLoadingRole] = useState<"owner" | "manager" | null>(null);

  const login = async (role: "owner" | "manager") => {
    try {
      setLoadingRole(role);
      await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ role }) });
      window.localStorage.setItem("demoUserRole", role);
      router.replace("/dashboard");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Login failed", "error");
    } finally {
      setLoadingRole(null);
    }
  };

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] bg-white border-2 border-border rounded-3xl overflow-hidden">
        <section className="p-8 lg:p-10 bg-primary/20 border-b-2 lg:border-b-0 lg:border-r-2 border-border">
          <div className="text-sm font-bold uppercase tracking-wide text-muted">{SITE_NAME}</div>
          <h1 className="text-3xl font-black text-black mt-3">Restaurant Admin Login</h1>
          <p className="text-base font-semibold text-muted mt-4">
            Choose a seeded demo user. Route middleware and API guards enforce the selected role.
          </p>
          <div className="mt-8 space-y-3 text-sm font-bold text-black">
            <p>Owner: full access to settings, payments, audit, roles, and integrations.</p>
            <p>Manager: operations access only, with restricted owner-only routes.</p>
          </div>
        </section>
        <section className="p-8 lg:p-10 space-y-4">
          <button
            type="button"
            onClick={() => login("owner")}
            disabled={!!loadingRole}
            className="w-full text-left p-5 rounded-2xl border-2 border-border bg-white hover:bg-cream focus-ring disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <Shield size={24} />
              <div>
                <div className="text-xl font-bold text-black">Continue as Owner</div>
                <div className="text-sm font-semibold text-muted">Rajesh Kumar · all permissions</div>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => login("manager")}
            disabled={!!loadingRole}
            className="w-full text-left p-5 rounded-2xl border-2 border-border bg-white hover:bg-cream focus-ring disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <UserCog size={24} />
              <div>
                <div className="text-xl font-bold text-black">Continue as Manager</div>
                <div className="text-sm font-semibold text-muted">Priya Sharma · location-scoped operations</div>
              </div>
            </div>
          </button>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <ToastProvider>
      <LoginInner />
    </ToastProvider>
  );
}
