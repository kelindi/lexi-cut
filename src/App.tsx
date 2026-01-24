import { useState } from "react";
import { AddClipsPage, EditPage } from "./pages";
import { BottomNav } from "./components";
import "./App.css";

function App() {
  const [activePage, setActivePage] = useState("clips");

  return (
    <div className="pb-20">
      {activePage === "clips" && <AddClipsPage />}
      {activePage === "edit" && <EditPage />}
      <BottomNav active={activePage} onNavigate={setActivePage} />
    </div>
  );
}

export default App;
