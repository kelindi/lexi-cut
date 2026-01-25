import { useState } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { X } from "@phosphor-icons/react";
import { LocalExportTab } from "./LocalExportTab";
import { SocialExportTab } from "./SocialExportTab";

type Tab = "local" | "social";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>("local");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/70" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 w-[500px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-[#111] shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <Dialog.Title className="text-sm font-medium text-white">
              Export
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white">
              <X size={16} />
            </Dialog.Close>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab("local")}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "local"
                  ? "border-b-2 border-white text-white"
                  : "text-white/50 hover:text-white"
              }`}
            >
              Local
            </button>
            <button
              onClick={() => setActiveTab("social")}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "social"
                  ? "border-b-2 border-white text-white"
                  : "text-white/50 hover:text-white"
              }`}
            >
              Social Media
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-4">
            {activeTab === "local" ? (
              <LocalExportTab onClose={() => onOpenChange(false)} />
            ) : (
              <SocialExportTab onClose={() => onOpenChange(false)} />
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
