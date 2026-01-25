import { useEffect, useState } from "react";
import {
  CircleNotch,
  CheckCircle,
  Plus,
  Warning,
  ArrowsClockwise,
  PaperPlaneTilt,
  XCircle,
  ArrowLeft,
  X,
} from "@phosphor-icons/react";
import { useSocialStore } from "../../stores/useSocialStore";
import { usePublish, type PublishPhase } from "../../hooks/usePublish";
import { SUPPORTED_PLATFORMS, hasApiKey, type SupportedPlatform } from "../../api/late";
import type { ExportSettings } from "./LocalExportTab";

interface SocialExportTabProps {
  onClose: () => void;
  onBack?: () => void;
  exportSettings?: ExportSettings;
}

function PlatformIcon({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    tiktok: "bg-black",
    youtube: "bg-red-600",
    instagram: "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600",
    twitter: "bg-black",
    facebook: "bg-blue-600",
    linkedin: "bg-blue-700",
  };

  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white ${colors[platform] || "bg-neutral-700"}`}
    >
      {platform[0].toUpperCase()}
    </div>
  );
}

function SmallPlatformIcon({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    tiktok: "bg-black",
    youtube: "bg-red-600",
    instagram: "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600",
    twitter: "bg-black",
    facebook: "bg-blue-600",
    linkedin: "bg-blue-700",
  };

  return (
    <div
      className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${colors[platform] || "bg-neutral-700"}`}
    >
      {platform[0].toUpperCase()}
    </div>
  );
}

interface PlatformCardProps {
  platform: (typeof SUPPORTED_PLATFORMS)[number];
  isConnected: boolean;
  isSelected: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggle: () => void;
  disabled?: boolean;
}

function PlatformCard({
  platform,
  isConnected,
  isSelected,
  isConnecting,
  isDisconnecting,
  onConnect,
  onDisconnect,
  onToggle,
  disabled,
}: PlatformCardProps) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
        isConnected && isSelected
          ? "border-white/30 bg-white/10"
          : isConnected
            ? "border-green-500/30 bg-green-500/5"
            : "border-white/10"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-3">
        {isConnected && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            disabled={disabled}
            className="h-4 w-4 rounded border-white/20 bg-transparent accent-white"
          />
        )}
        <PlatformIcon platform={platform.id} />
        <div>
          <p className="text-sm font-medium text-white">{platform.name}</p>
          {isConnected ? (
            <p className="text-xs text-green-400">Connected</p>
          ) : (
            <p className="text-xs text-white/40">Not connected</p>
          )}
        </div>
      </div>

      {isConnected ? (
        <button
          onClick={onDisconnect}
          disabled={isDisconnecting || disabled}
          className="flex items-center gap-1 rounded-md p-1.5 text-white/40 transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
          title="Disconnect account"
        >
          {isDisconnecting ? (
            <CircleNotch size={16} className="animate-spin" />
          ) : (
            <X size={16} />
          )}
        </button>
      ) : (
        <button
          onClick={onConnect}
          disabled={isConnecting || disabled}
          className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          {isConnecting ? (
            <CircleNotch size={12} className="animate-spin" />
          ) : (
            <Plus size={12} />
          )}
          Connect
        </button>
      )}
    </div>
  );
}

function getPhaseMessage(phase: PublishPhase): string {
  switch (phase) {
    case "exporting":
      return "Exporting video...";
    case "uploading":
      return "Uploading to Late...";
    case "publishing":
      return "Publishing to platforms...";
    case "complete":
      return "Published!";
    case "error":
      return "Failed";
    default:
      return "";
  }
}

export function SocialExportTab({ onClose, onBack, exportSettings }: SocialExportTabProps) {
  const {
    profiles,
    accounts,
    selectedProfileId,
    isLoading,
    isConnecting,
    error: socialError,
    fetchProfiles,
    fetchAccounts,
    selectProfile,
    connect,
    disconnect,
    clearError,
  } = useSocialStore();

  const [disconnectingPlatform, setDisconnectingPlatform] = useState<string | null>(null);

  const {
    publish,
    isPublishing,
    progress,
    error: publishError,
    result,
    reset: resetPublish,
    canPublish,
  } = usePublish();

  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<SupportedPlatform>>(new Set());
  const [caption, setCaption] = useState("");

  const apiKeyConfigured = hasApiKey();
  const connectedPlatforms = new Set(accounts.map((a) => a.platform));
  const error = socialError || publishError;

  // Fetch data on mount
  useEffect(() => {
    if (apiKeyConfigured) {
      fetchProfiles();
      fetchAccounts();
    }
  }, [apiKeyConfigured, fetchProfiles, fetchAccounts]);

  // Listen for OAuth success messages from popup windows
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth-success") {
        // Refresh accounts to show the newly connected account
        fetchAccounts();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fetchAccounts]);

  // Auto-select all connected platforms initially
  useEffect(() => {
    if (accounts.length > 0 && selectedPlatforms.size === 0) {
      setSelectedPlatforms(new Set(accounts.map((a) => a.platform as SupportedPlatform)));
    }
  }, [accounts, selectedPlatforms.size]);

  const handleRefresh = () => {
    fetchProfiles();
    fetchAccounts();
  };

  const togglePlatform = (platform: SupportedPlatform) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  };

  const handleDisconnect = async (platform: string) => {
    const account = accounts.find((a) => a.platform === platform);
    if (!account) return;

    setDisconnectingPlatform(platform);
    try {
      await disconnect(account._id);
      // Remove from selected platforms
      setSelectedPlatforms((prev) => {
        const next = new Set(prev);
        next.delete(platform as SupportedPlatform);
        return next;
      });
    } finally {
      setDisconnectingPlatform(null);
    }
  };

  const handlePublish = async () => {
    if (accounts.length === 0) return;

    await publish({
      platforms: Array.from(selectedPlatforms),
      accounts,
      caption,
    });
  };

  const handleReset = () => {
    resetPublish();
    clearError();
  };

  // No API key configured
  if (!apiKeyConfigured) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
          <Warning size={20} className="mt-0.5 flex-shrink-0 text-yellow-500" />
          <div>
            <p className="text-sm font-medium text-white">API Key Required</p>
            <p className="mt-1 text-xs text-white/60">
              To publish to social media, you need a Late API key.
            </p>
            <ol className="mt-3 list-inside list-decimal space-y-1 text-xs text-white/50">
              <li>
                Sign up at{" "}
                <a
                  href="https://getlate.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  getlate.dev
                </a>{" "}
                (free tier: 10 posts/month)
              </li>
              <li>Get your API key from the dashboard</li>
              <li>
                Add <code className="text-white/60">VITE_LATE_API_KEY=sk_...</code>{" "}
                to your .env file
              </li>
              <li>Restart the app</li>
            </ol>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-full rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5"
        >
          Close
        </button>
      </div>
    );
  }

  // Publishing in progress or complete
  if (isPublishing || progress.phase === "complete" || progress.phase === "error") {
    return (
      <div className="flex flex-col gap-5">
        {/* Status Icon */}
        <div className="flex flex-col items-center gap-3 py-4">
          {progress.phase === "complete" && result?.success && (
            <CheckCircle size={48} weight="fill" className="text-green-500" />
          )}
          {progress.phase === "complete" && !result?.success && (
            <Warning size={48} weight="fill" className="text-yellow-500" />
          )}
          {progress.phase === "error" && (
            <XCircle size={48} weight="fill" className="text-red-500" />
          )}
          {isPublishing && (
            <CircleNotch size={48} className="animate-spin text-white" />
          )}
          <span className="text-sm font-medium text-white">
            {progress.message || getPhaseMessage(progress.phase)}
          </span>
        </div>

        {/* Progress Bar */}
        {isPublishing && (
          <div className="flex flex-col gap-2">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-white transition-all duration-300"
                style={{ width: `${Math.min(progress.percent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-white/50">
              <span>{getPhaseMessage(progress.phase)}</span>
              <span>{Math.round(progress.percent)}%</span>
            </div>
          </div>
        )}

        {/* Platform Results */}
        {result && (
          <div className="flex flex-col gap-2">
            {result.platforms.map((p) => (
              <div
                key={p.platform}
                className={`flex items-center gap-3 rounded-lg border p-3 ${
                  p.success
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-red-500/30 bg-red-500/5"
                }`}
              >
                <SmallPlatformIcon platform={p.platform} />
                <div className="flex-1">
                  <p className="text-sm font-medium capitalize text-white">
                    {p.platform}
                  </p>
                  {p.error && (
                    <p className="text-xs text-red-400">{p.error}</p>
                  )}
                </div>
                {p.success ? (
                  <CheckCircle size={16} weight="fill" className="text-green-500" />
                ) : (
                  <XCircle size={16} weight="fill" className="text-red-500" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error Message */}
        {error && progress.phase === "error" && (
          <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {(progress.phase === "complete" || progress.phase === "error") && (
            <button
              onClick={handleReset}
              className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5"
            >
              Publish Another
            </button>
          )}
          <button
            onClick={onClose}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              progress.phase === "complete" || progress.phase === "error"
                ? "flex-1 bg-white/10 text-white hover:bg-white/20"
                : "w-full border border-white/10 text-white/50 hover:bg-white/5 hover:text-white"
            }`}
          >
            {isPublishing ? "Cancel" : "Close"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-white/60">Select Platforms</p>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white"
        >
          <ArrowsClockwise
            size={12}
            className={isLoading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {/* Profile selector */}
      {profiles.length > 1 && (
        <div>
          <label className="mb-1.5 block text-xs text-white/50">Profile</label>
          <select
            value={selectedProfileId || ""}
            onChange={(e) => selectProfile(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-white/30"
          >
            {profiles.map((profile) => (
              <option key={profile._id} value={profile._id}>
                {profile.name} {profile.isDefault ? "(Default)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Platform cards */}
      <div className="flex flex-col gap-2">
        {SUPPORTED_PLATFORMS.map((platform) => (
          <PlatformCard
            key={platform.id}
            platform={platform}
            isConnected={connectedPlatforms.has(platform.id)}
            isSelected={selectedPlatforms.has(platform.id as SupportedPlatform)}
            isConnecting={isConnecting}
            isDisconnecting={disconnectingPlatform === platform.id}
            onConnect={() => connect(platform.id as SupportedPlatform)}
            onDisconnect={() => handleDisconnect(platform.id)}
            onToggle={() => togglePlatform(platform.id as SupportedPlatform)}
          />
        ))}
      </div>

      {/* Caption input */}
      {accounts.length > 0 && (
        <div>
          <label className="mb-1.5 block text-xs text-white/50">
            Caption / Description
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write a caption for your post..."
            rows={3}
            className="w-full resize-none rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-white/30"
          />
          <p className="mt-1 text-right text-xs text-white/30">
            {caption.length} characters
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2">
          <Warning size={14} className="mt-0.5 flex-shrink-0 text-red-400" />
          <div className="flex-1">
            <p className="text-xs text-red-400">{error}</p>
            <button
              onClick={() => {
                clearError();
                resetPublish();
              }}
              className="mt-1 text-xs text-white/40 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Publish button */}
      {accounts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button
            onClick={handlePublish}
            disabled={
              !canPublish ||
              selectedPlatforms.size === 0 ||
              !selectedProfileId ||
              isPublishing ||
              caption.trim().length === 0
            }
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PaperPlaneTilt size={16} weight="fill" />
            Publish to {selectedPlatforms.size} Platform
            {selectedPlatforms.size !== 1 ? "s" : ""}
          </button>
          {caption.trim().length === 0 && selectedPlatforms.size > 0 && (
            <p className="text-center text-xs text-yellow-400">
              Caption is required to publish
            </p>
          )}
        </div>
      )}

      {/* No connected accounts message */}
      {accounts.length === 0 && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-white/40">
          Connect at least one account above to start publishing.
        </div>
      )}

      {/* Back / Close buttons */}
      <div className="flex gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        )}
        <button
          onClick={onClose}
          className={`rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5 ${onBack ? "flex-1" : "w-full"}`}
        >
          Close
        </button>
      </div>
    </div>
  );
}
