import { fetch } from "@tauri-apps/plugin-http";

const LATE_BASE_URL = "https://getlate.dev/api/v1";

export interface Profile {
  _id: string;
  name: string;
  description?: string;
  color?: string;
  isDefault?: boolean;
}

export interface Account {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profileId?: string;
}

export interface MediaUpload {
  _id: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface PostResult {
  _id: string;
  status: string;
  platforms: Array<{
    platform: string;
    status: string;
    postId?: string;
    error?: string;
  }>;
}

export interface PostOptions {
  profileId: string;
  platforms: string[];
  mediaId: string;
  caption?: string;
  scheduledFor?: string;
}

function getApiKey(): string {
  const key = import.meta.env.VITE_LATE_API_KEY;
  if (!key) {
    throw new Error("Missing VITE_LATE_API_KEY in environment variables");
  }
  return key;
}

async function lateRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const apiKey = getApiKey();

  const response = await fetch(`${LATE_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || data.error || `Late API error: ${response.status}`
    );
  }

  return data as T;
}

export async function getProfiles(): Promise<Profile[]> {
  const data = await lateRequest<{ profiles: Profile[] }>("/profiles");
  return data.profiles || [];
}

export async function getAccounts(): Promise<Account[]> {
  const data = await lateRequest<{ accounts: Account[] }>("/accounts");
  return data.accounts || [];
}

export async function connectPlatform(
  platform: string,
  profileId: string,
  redirectUrl: string = "http://localhost:1420/oauth/success"
): Promise<string> {
  const data = await lateRequest<{ authUrl: string }>(
    `/connect/${platform}?profileId=${profileId}&redirect_url=${encodeURIComponent(redirectUrl)}`
  );
  return data.authUrl;
}

export async function disconnectAccount(accountId: string): Promise<void> {
  await lateRequest(`/accounts/${accountId}`, {
    method: "DELETE",
  });
}

export async function uploadMedia(file: File): Promise<MediaUpload> {
  const apiKey = getApiKey();

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${LATE_BASE_URL}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || data.error || `Media upload failed: ${response.status}`
    );
  }

  return data as MediaUpload;
}

export async function createPost(options: PostOptions): Promise<PostResult> {
  const data = await lateRequest<PostResult>("/posts", {
    method: "POST",
    body: JSON.stringify({
      profileId: options.profileId,
      platforms: options.platforms,
      media: [options.mediaId],
      caption: options.caption,
      scheduledFor: options.scheduledFor,
    }),
  });

  return data;
}

export function hasApiKey(): boolean {
  return !!import.meta.env.VITE_LATE_API_KEY;
}

export const SUPPORTED_PLATFORMS = [
  { id: "tiktok", name: "TikTok", icon: "tiktok" },
  { id: "youtube", name: "YouTube", icon: "youtube" },
  { id: "instagram", name: "Instagram", icon: "instagram" },
  { id: "twitter", name: "X (Twitter)", icon: "twitter" },
  { id: "facebook", name: "Facebook", icon: "facebook" },
  { id: "linkedin", name: "LinkedIn", icon: "linkedin" },
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number]["id"];
