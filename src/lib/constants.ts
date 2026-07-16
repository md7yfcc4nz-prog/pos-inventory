export const Role = {
  ADMIN: "ADMIN",
  STAFF: "STAFF",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const Category = {
  DRINKS: "DRINKS",
  MEDICINE: "MEDICINE",
  OTHER: "OTHER",
} as const;

export type Category = (typeof Category)[keyof typeof Category];

export const PaymentMethod = {
  CASH: "CASH",
  CARD: "CARD",
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
