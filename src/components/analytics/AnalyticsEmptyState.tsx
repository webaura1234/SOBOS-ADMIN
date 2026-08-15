"use client";

import React from "react";
import { FolderOpen } from "lucide-react";

interface AnalyticsEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function AnalyticsEmptyState({
  icon = <FolderOpen size={36} className="text-muted/60" />,
  title,
  description,
  actionLabel,
  onAction,
  className = "",
}: AnalyticsEmptyStateProps) {
  return (
    <div
      className={`py-12 px-6 rounded-2xl border-2 border-dashed border-border/80 bg-cream/20 flex flex-col items-center justify-center text-center max-w-md mx-auto my-6 ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-cream flex items-center justify-center mb-3 shadow-xs">
        {icon}
      </div>
      <h3 className="text-base font-bold text-black mb-1">{title}</h3>
      <p className="text-xs text-muted font-medium leading-relaxed mb-4 max-w-xs">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="btn-primary text-xs py-2 px-4 rounded-xl shadow-xs hover:shadow-md"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
