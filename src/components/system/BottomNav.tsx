import { FileVideo, FilmReel } from "@phosphor-icons/react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    id: "clips",
    label: "Clips",
    icon: <FileVideo size={24} />,
  },
  {
    id: "edit",
    label: "Edit",
    icon: <FilmReel size={24} />,
  },
];

interface BottomNavProps {
  active: string;
  onNavigate: (id: string) => void;
}

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex h-20 items-start justify-center gap-8 border-t border-white/5 bg-[#0a0a0a] pt-3">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors ${
            active === item.id ? "text-white" : "text-[#555] hover:text-[#888]"
          }`}
        >
          {item.icon}
          <span className="text-[10px]">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
