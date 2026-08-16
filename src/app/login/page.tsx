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
    <main className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6 text-text-primary">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] bg-surface-1 border border-border rounded-3xl overflow-hidden shadow-2xl">
        <section className="p-8 lg:p-10 bg-surface-2 border-b lg:border-b-0 lg:border-r border-border">
          <div className="text-xs font-bold uppercase tracking-wide text-yellow">{SITE_NAME}</div>
          <h1 className="text-3xl font-black text-text-primary mt-3">Restaurant Admin Login</h1>
          <p className="text-sm font-semibold text-text-muted mt-4">
            Choose a seeded demo user. Route middleware and API guards enforce the selected role.
          </p>
          <div className="mt-8 space-y-3 text-xs font-bold text-text-secondary">
            <p>Owner: full access to settings, payments, audit, roles, and integrations.</p>
            <p>Manager: operations access only, with restricted owner-only routes.</p>
          </div>
        </section>
        <section className="p-8 lg:p-10 space-y-4">
          <button
            type="button"
            onClick={() => login("owner")}
            disabled={!!loadingRole}
            className="w-full text-left p-5 rounded-2xl border border-border bg-surface-2 hover:bg-surface-3 hover:border-yellow focus-ring disabled:opacity-60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Shield size={24} className="text-yellow" />
              <div>
                <div className="text-lg font-bold text-text-primary">Continue as Owner</div>
                <div className="text-xs font-semibold text-text-muted">Rajesh Kumar · all permissions</div>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => login("manager")}
            disabled={!!loadingRole}
            className="w-full text-left p-5 rounded-2xl border border-border bg-surface-2 hover:bg-surface-3 hover:border-yellow focus-ring disabled:opacity-60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <UserCog size={24} className="text-yellow" />
              <div>
                <div className="text-lg font-bold text-text-primary">Continue as Manager</div>
                <div className="text-xs font-semibold text-text-muted">Priya Sharma · location-scoped operations</div>
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
