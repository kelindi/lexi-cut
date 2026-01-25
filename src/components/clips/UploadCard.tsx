import { UploadSimple } from "@phosphor-icons/react";

interface UploadCardProps {
  onClick: () => void;
  error?: string;
}

export function UploadCard({ onClick, error }: UploadCardProps) {
  return (
    <div
      className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 bg-[#111] transition-colors hover:bg-[#1a1a1a]"
      onClick={onClick}
    >
      <UploadSimple size={32} className="text-neutral-500" />
      <span className="text-sm text-neutral-500">Add your clips</span>
      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}
