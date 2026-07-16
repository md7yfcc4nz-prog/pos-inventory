import path from "path";

/** Persistent upload directory (use /data/uploads in cloud hosting). */
export function getUploadDir() {
  if (process.env.UPLOAD_DIR) {
    return process.env.UPLOAD_DIR;
  }
  return path.join(process.cwd(), "public", "uploads");
}

export function mediaUrl(filename: string) {
  return `/api/media/${filename}`;
}
