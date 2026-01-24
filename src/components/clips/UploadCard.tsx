interface UploadCardProps {
  onClick: () => void;
  error?: string;
}

export function UploadCard({ onClick, error }: UploadCardProps) {
  return (
    <div
      className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center bg-[#111] hover:bg-[#151515]"
      onClick={onClick}
    >
      <div className="flex flex-1 items-center justify-center">
        <span className="text-3xl font-extralight text-[#444]">+</span>
      </div>
      {error && <div className="px-3 pb-3 text-xs text-red-400">{error}</div>}
    </div>
  );
}
