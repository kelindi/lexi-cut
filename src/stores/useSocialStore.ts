import { create } from "zustand";
import { persist } from "zustand/middleware";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  getProfiles,
  getAccounts,
  connectPlatform,
  disconnectAccount,
  type Profile,
  type Account,
  type SupportedPlatform,
} from "../api/late";

interface SocialState {
  // Data
  profiles: Profile[];
  accounts: Account[];
  selectedProfileId: string | null;

  // Loading states
  isLoading: boolean;
  isConnecting: boolean;
  error: string | null;

  // Actions
  fetchProfiles: () => Promise<void>;
  fetchAccounts: () => Promise<void>;
  selectProfile: (profileId: string) => void;
  connect: (platform: SupportedPlatform) => Promise<void>;
  disconnect: (accountId: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useSocialStore = create<SocialState>()(
  persist(
    (set, get) => ({
      // Initial state
      profiles: [],
      accounts: [],
      selectedProfileId: null,
      isLoading: false,
      isConnecting: false,
      error: null,

      fetchProfiles: async () => {
        set({ isLoading: true, error: null });
        try {
          const profiles = await getProfiles();
          const state = get();
          set({
            profiles,
            // Auto-select first profile if none selected
            selectedProfileId:
              state.selectedProfileId ||
              profiles.find((p) => p.isDefault)?._id ||
              profiles[0]?._id ||
              null,
            isLoading: false,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Failed to fetch profiles",
            isLoading: false,
          });
        }
      },

      fetchAccounts: async () => {
        set({ isLoading: true, error: null });
        try {
          const accounts = await getAccounts();
          set({ accounts, isLoading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Failed to fetch accounts",
            isLoading: false,
          });
        }
      },

      selectProfile: (profileId: string) => {
        set({ selectedProfileId: profileId });
      },

      connect: async (platform: SupportedPlatform) => {
        const { selectedProfileId } = get();
        if (!selectedProfileId) {
          set({ error: "No profile selected" });
          return;
        }

        set({ isConnecting: true, error: null });
        try {
          const authUrl = await connectPlatform(platform, selectedProfileId);
          // Open in system browser using Tauri's opener plugin
          // This avoids issues with Tauri's internal webview for OAuth flows
          await openUrl(authUrl);
          set({ isConnecting: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : `Failed to connect ${platform}`,
            isConnecting: false,
          });
        }
      },

      disconnect: async (accountId: string) => {
        set({ isLoading: true, error: null });
        try {
          await disconnectAccount(accountId);
          // Refresh accounts list
          const accounts = await getAccounts();
          set({ accounts, isLoading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Failed to disconnect account",
            isLoading: false,
          });
        }
      },

      clearError: () => {
        set({ error: null });
      },

      reset: () => {
        set({
          profiles: [],
          accounts: [],
          selectedProfileId: null,
          isLoading: false,
          isConnecting: false,
          error: null,
        });
      },
    }),
    {
      name: "lexi-social-store",
      partialize: (state) => ({
        selectedProfileId: state.selectedProfileId,
      }),
    }
  )
);

// Selector helpers
export const useConnectedPlatforms = () =>
  useSocialStore((state) =>
    new Set(state.accounts.map((a) => a.platform))
  );

export const useAccountForPlatform = (platform: string) =>
  useSocialStore((state) =>
    state.accounts.find((a) => a.platform === platform)
  );
