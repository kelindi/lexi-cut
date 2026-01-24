import { Menu } from "@base-ui-components/react/menu";
import type { Source } from "../../types";

interface SourceCardProps {
  source: Source;
  onRemove: (id: string) => void;
}

export function SourceCard({ source, onRemove }: SourceCardProps) {
  return (
    <div className="cursor-pointer">
      <div className="group relative aspect-[4/3] overflow-hidden bg-[#111]">
        {source.thumbnail ? (
          <img
            src={source.thumbnail}
            alt={source.name}
            className="h-full w-full object-cover transition-opacity duration-150 group-hover:opacity-80"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[#333]">
            No preview
          </div>
        )}
        <Menu.Root modal={false}>
          <Menu.Trigger
            className="absolute top-1.5 right-1.5 flex h-5 items-center justify-center rounded bg-black/60 px-1.5 text-[8px] text-white/60 opacity-0 transition-opacity hover:bg-black/80 hover:text-white group-hover:opacity-100 data-[popup-open]:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            •••
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="z-50" sideOffset={2} align="end">
              <Menu.Popup className="rounded bg-black/90 px-2 py-1">
                <Menu.Item
                  className="cursor-pointer text-[10px] text-[#aaa] outline-none hover:text-white data-[highlighted]:text-white"
                  onClick={() => onRemove(source.id)}
                >
                  Remove
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <div className="overflow-hidden text-ellipsis whitespace-nowrap px-0.5 py-2.5 text-xs text-[#555]">
        {source.name}
      </div>
    </div>
  );
}
