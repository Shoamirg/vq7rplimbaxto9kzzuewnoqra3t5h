import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

export function getHealthColor(score: number): string {
  if (score >= 90) return "text-success";
  if (score >= 70) return "text-primary";
  if (score >= 50) return "text-warning";
  return "text-danger";
}

export function getHealthBg(score: number): string {
  if (score >= 90) return "bg-success";
  if (score >= 70) return "bg-primary";
  if (score >= 50) return "bg-warning";
  return "bg-danger";
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: "bg-warning-light text-warning-dark",
    confirmed: "bg-primary-100 text-primary-700",
    in_progress: "bg-blue-100 text-blue-700",
    completed: "bg-success-light text-success-dark",
    cancelled: "bg-danger-light text-danger-dark",
  };
  return colors[status] || "bg-gray-100 text-gray-700";
}
