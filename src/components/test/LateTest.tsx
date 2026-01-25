import { useState } from "react";
import { CircleNotch, Link, CheckCircle, Warning, Plus } from "@phosphor-icons/react";
import { fetch } from "@tauri-apps/plugin-http";

const LATE_API_KEY = import.meta.env.VITE_LATE_API_KEY || "";
const LATE_BASE_URL = "https://getlate.dev/api/v1";

interface Profile {
  _id: string;
  name: string;
  description?: string;
  color?: string;
  isDefault?: boolean;
}

interface Account {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
}

export function LateTest() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");

  async function lateRequest(endpoint: string, options?: RequestInit) {
    const response = await fetch(`${LATE_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${LATE_API_KEY}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `API error: ${response.status}`);
    }

    return data;
  }

  async function testConnection() {
    if (!LATE_API_KEY) {
      setError("Missing VITE_LATE_API_KEY in .env");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError(null);
    setResult(null);

    try {
      const data = await lateRequest("/profiles");
      setProfiles(data.profiles || []);
      if (data.profiles?.length > 0 && !selectedProfile) {
        setSelectedProfile(data.profiles[0]._id);
      }
      setResult(data);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setStatus("error");
    }
  }

  async function getAccounts() {
    if (!LATE_API_KEY) {
      setError("Missing VITE_LATE_API_KEY in .env");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      const data = await lateRequest("/accounts");
      setAccounts(data.accounts || []);
      setResult(data);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get accounts");
      setStatus("error");
    }
  }

  async function connectPlatform(platform: string) {
    if (!LATE_API_KEY || !selectedProfile) {
      setError("Missing API key or no profile selected");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      const data = await lateRequest(
        `/connect/${platform}?profileId=${selectedProfile}&redirect_url=${encodeURIComponent("http://localhost:1420/oauth/success")}`
      );

      if (data.authUrl) {
        // Open the OAuth URL in a new window
        window.open(data.authUrl, "_blank", "width=600,height=700");
        setResult({ message: `Opening ${platform} authorization...`, authUrl: data.authUrl });
        setStatus("success");
      } else {
        setResult(data);
        setStatus("success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to connect ${platform}`);
      setStatus("error");
    }
  }

  const platforms = [
    { id: "tiktok", name: "TikTok" },
    { id: "youtube", name: "YouTube" },
    { id: "instagram", name: "Instagram" },
    { id: "twitter", name: "X (Twitter)" },
    { id: "facebook", name: "Facebook" },
    { id: "linkedin", name: "LinkedIn" },
  ];

  return (
    <div className="space-y-4">
      {/* API Key Status */}
      <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
        <p className="text-xs text-neutral-500 mb-2">API Key Status</p>
        <p className="text-sm text-neutral-300">
          {LATE_API_KEY ? (
            <span className="text-green-400">Configured ({LATE_API_KEY.slice(0, 12)}...)</span>
          ) : (
            <span className="text-red-400">Not configured - add VITE_LATE_API_KEY to .env</span>
          )}
        </p>
      </div>

      {/* Connection Test Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={testConnection}
          disabled={status === "loading"}
          className="flex items-center gap-2 rounded bg-white px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40"
        >
          {status === "loading" ? (
            <CircleNotch size={14} className="animate-spin" />
          ) : (
            <Link size={14} />
          )}
          Test Connection
        </button>

        <button
          onClick={getAccounts}
          disabled={status === "loading"}
          className="flex items-center gap-2 rounded bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-neutral-700"
        >
          Get Connected Accounts
        </button>
      </div>

      {/* Profile Selection */}
      {profiles.length > 0 && (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-xs text-neutral-500 mb-2">Select Profile</p>
          <select
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
            className="w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-sm text-white"
          >
            {profiles.map((profile) => (
              <option key={profile._id} value={profile._id}>
                {profile.name} {profile.isDefault ? "(Default)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Connect Social Accounts */}
      {selectedProfile && (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-xs text-neutral-500 mb-3">Connect Social Accounts</p>
          <div className="flex flex-wrap gap-2">
            {platforms.map((platform) => (
              <button
                key={platform.id}
                onClick={() => connectPlatform(platform.id)}
                disabled={status === "loading"}
                className="flex items-center gap-1.5 rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 hover:bg-neutral-700"
              >
                <Plus size={12} />
                {platform.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Connected Accounts Display */}
      {accounts.length > 0 && (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-xs text-neutral-500 mb-2">Connected Accounts ({accounts.length})</p>
          <div className="space-y-1">
            {accounts.map((account) => (
              <div key={account._id} className="flex items-center gap-2 text-sm text-neutral-300">
                <span className="px-2 py-0.5 rounded bg-neutral-800 text-xs uppercase">
                  {account.platform}
                </span>
                <span>{account.displayName || account.username || account._id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success State */}
      {status === "success" && result && (
        <div className="flex items-start gap-2 rounded border border-green-800 bg-green-950/30 p-3">
          <CheckCircle size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-green-400 font-medium">Success</p>
            <pre className="text-xs text-neutral-400 mt-2 overflow-auto max-h-64">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Error State */}
      {status === "error" && error && (
        <div className="flex items-start gap-2 rounded border border-red-800 bg-red-950/30 p-3">
          <Warning size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-red-400 font-medium">Error</p>
            <p className="text-xs text-neutral-400 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Setup Instructions */}
      <div className="rounded border border-neutral-800 bg-neutral-900/50 p-3 text-xs text-neutral-500">
        <p className="font-medium mb-2">Setup Instructions:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Sign up at <a href="https://getlate.dev" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">getlate.dev</a> (free tier: 10 posts/month)</li>
          <li>Get your API key from the dashboard</li>
          <li>Add <code className="text-neutral-400">VITE_LATE_API_KEY=sk_...</code> to your .env file</li>
          <li>Restart the dev server</li>
        </ol>
        <p className="mt-3 font-medium">Redirect URL for Late:</p>
        <code className="text-neutral-400">http://localhost:1420/oauth/success</code>
      </div>
    </div>
  );
}
