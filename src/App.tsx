import { useState } from "react";
import { AddClipsPage } from "./pages/AddClipsPage";
import { EditPage } from "./pages/EditPage";
import { TestPage } from "./pages/TestPage";
import { BottomNav } from "./components/system/BottomNav";
import "./App.css";

function App() {
  const [activePage, setActivePage] = useState("clips");

  return (
    <div className="pb-20">
      {activePage === "clips" && <AddClipsPage />}
      {activePage === "edit" && <EditPage />}
      {activePage === "test" && <TestPage />}
      <BottomNav active={activePage} onNavigate={setActivePage} />
    </div>
  );
}

export default App;
