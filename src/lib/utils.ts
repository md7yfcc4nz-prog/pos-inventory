import { Category, type Category as CategoryType } from "@/lib/constants";
import { format, isBefore, addDays, startOfDay } from "date-fns";

export const FCFA_PER_USD = 600;

export function formatMoney(value: number) {
  const fcfa = `${Math.round(value).toLocaleString("en-US")} FCFA`;
  const usd = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value / FCFA_PER_USD);
  return `${fcfa} (${usd} USD)`;
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return format(new Date(value), "MMM d, yyyy");
}

export function categoryLabel(category: CategoryType | string) {
  switch (category) {
    case Category.DRINKS:
      return "Drinks";
    case Category.MEDICINE:
      return "Medicine";
    default:
      return "Other";
  }
}

export function isExpired(expiryDate: Date | string | null | undefined) {
  if (!expiryDate) return false;
  return isBefore(startOfDay(new Date(expiryDate)), startOfDay(new Date()));
}

export function isNearExpiry(expiryDate: Date | string | null | undefined, days = 30) {
  if (!expiryDate) return false;
  const expiry = startOfDay(new Date(expiryDate));
  const today = startOfDay(new Date());
  const cutoff = addDays(today, days);
  return !isBefore(expiry, today) && !isBefore(cutoff, expiry);
}

export function isLowStock(quantity: number, threshold: number) {
  return quantity <= threshold;
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
