import { useState } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { X, Check } from "@phosphor-icons/react";
import { LocalExportTab, type ExportSettings } from "./LocalExportTab";
import { SocialExportTab } from "./SocialExportTab";

type Step = "encoding" | "social";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const [step, setStep] = useState<Step>("encoding");
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    preset: "fast",
    resolution: "original",
  });

  const handleClose = () => {
    onOpenChange(false);
    // Reset to first step when closing
    setTimeout(() => setStep("encoding"), 200);
  };

  const handleProceedToSocial = (settings: ExportSettings) => {
    setExportSettings(settings);
    setStep("social");
  };

  const handleBack = () => {
    setStep("encoding");
  };

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

          {/* Step Indicator */}
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  step === "encoding"
                    ? "bg-white text-black"
                    : "bg-green-500 text-white"
                }`}
              >
                {step === "encoding" ? "1" : <Check size={12} weight="bold" />}
              </div>
              <span
                className={`text-sm ${
                  step === "encoding" ? "font-medium text-white" : "text-white/50"
                }`}
              >
                Encoding
              </span>
            </div>
            <div className="h-px flex-1 bg-white/10" />
            <div className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  step === "social"
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/50"
                }`}
              >
                2
              </div>
              <span
                className={`text-sm ${
                  step === "social" ? "font-medium text-white" : "text-white/50"
                }`}
              >
                Social Media
              </span>
            </div>
          </div>

          {/* Step Content */}
          <div className="p-4">
            {step === "encoding" ? (
              <LocalExportTab
                onClose={handleClose}
                onProceedToSocial={handleProceedToSocial}
                initialPreset={exportSettings.preset}
                initialResolution={exportSettings.resolution}
              />
            ) : (
              <SocialExportTab
                onClose={handleClose}
                onBack={handleBack}
                exportSettings={exportSettings}
              />
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
