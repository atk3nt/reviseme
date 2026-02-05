"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function DevButton() {
  const router = useRouter();
  const [isDev, setIsDev] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Check if we're in dev mode only after component mounts (prevents hydration mismatch)
  useEffect(() => {
    setIsMounted(true);
    const hostname = window.location.hostname;
    // Explicitly exclude production domain (app.reviseme.co and any reviseme.co subdomain)
    const isProduction = hostname === 'reviseme.co' || hostname.endsWith('.reviseme.co');
    const dev = !isProduction && (
      hostname === 'localhost' || 
      hostname === '127.0.0.1' ||
      hostname.includes('.local')
    );
    setIsDev(dev);
  }, []);

  // Don't render until after mount to prevent hydration mismatch
  if (!isMounted || !isDev) return null;

  return (
    <button
      onClick={() => router.push('/dev-tools')}
      className="fixed bottom-4 right-4 z-50 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-semibold hover:from-purple-700 hover:to-blue-700 transition-all hover:scale-105"
      title="Open Dev Tools"
    >
      🛠️ Dev Tools
    </button>
  );
}
