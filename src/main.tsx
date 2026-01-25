import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OAuthSuccessPage } from "./pages/OAuthSuccessPage";

// Simple URL-based routing for OAuth callback
const isOAuthCallback = window.location.pathname === "/oauth/success";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isOAuthCallback ? <OAuthSuccessPage /> : <App />}
  </React.StrictMode>,
);
