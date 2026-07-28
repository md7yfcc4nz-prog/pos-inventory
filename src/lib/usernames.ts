export function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 40);
}

export function usernameFromEmail(email: string) {
  const local = email.split("@")[0] || email;
  return normalizeUsername(local) || "user";
}

export function isValidUsername(value: string) {
  if (value.length < 2 || value.length > 40) return false;
  return /^[a-z0-9]+(?:[._-]?[a-z0-9]+)*$/.test(value);
}
