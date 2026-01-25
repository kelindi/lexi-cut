import { Plus } from "@phosphor-icons/react";

interface UploadCardProps {
  onClick: () => void;
  error?: string;
}

export function UploadCard({ onClick, error }: UploadCardProps) {
  return (
    <button
      onClick={onClick}
      className="btn-press card-hover group flex aspect-[4/3] flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-[#111]"
    >
      <Plus
        size={32}
        weight="light"
        className="text-white/30 transition-all duration-300 group-hover:rotate-90 group-hover:text-white/50"
      />
      <span className="mt-2 text-xs text-white/30 transition-colors group-hover:text-white/50">
        Add Clips
      </span>
      {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
    </button>
  );
}
