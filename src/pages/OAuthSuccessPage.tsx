import { useEffect, useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";

export function OAuthSuccessPage() {
  const [params, setParams] = useState<Record<string, string>>({});
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // Parse URL params from the OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const parsed: Record<string, string> = {};
    urlParams.forEach((value, key) => {
      parsed[key] = value;
    });
    setParams(parsed);

    // Log for debugging
    console.log("OAuth callback params:", parsed);

    // Notify the parent window that OAuth completed successfully
    // The parent can then refresh accounts and close this popup
    if (window.opener) {
      window.opener.postMessage({ type: "oauth-success", params: parsed }, "*");
    }
  }, []);

  const handleClose = () => {
    setClosing(true);
    // Try to close the window
    window.close();
    // If window.close() didn't work (common in browsers), show a message
    setTimeout(() => {
      setClosing(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-center p-8 max-w-md">
        <CheckCircle size={64} weight="fill" className="text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">
          Account Connected!
        </h1>
        <p className="text-neutral-400 mb-6">
          Your social media account has been successfully linked. You can close this tab and return to Lexi Cut.
        </p>

        {Object.keys(params).length > 0 && (
          <div className="bg-neutral-900 rounded-lg p-4 text-left">
            <p className="text-xs text-neutral-500 mb-2">Callback parameters:</p>
            <pre className="text-xs text-neutral-300 overflow-auto">
              {JSON.stringify(params, null, 2)}
            </pre>
          </div>
        )}

        <button
          onClick={handleClose}
          disabled={closing}
          className="mt-6 px-6 py-2 bg-white text-black rounded-lg font-medium hover:bg-neutral-200 transition-colors disabled:opacity-50"
        >
          {closing ? "Closing..." : "Close Window"}
        </button>
      </div>
    </div>
  );
}
