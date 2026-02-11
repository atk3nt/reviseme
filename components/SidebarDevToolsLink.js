"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import config from "@/config";

/**
 * Dev Tools link for sidebar navigation.
 * Only visible in development (localhost, 127.0.0.1, .local).
 * Makes dev tools accessible on mobile/tablet via the hamburger menu.
 */
export default function SidebarDevToolsLink({ pathname, onNavigate }) {
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hostname = window.location.hostname;
    const isProduction =
      hostname === "reviseme.co" || hostname.endsWith(".reviseme.co");
    const dev =
      !isProduction &&
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.includes(".local"));
    setIsDev(dev);
  }, []);

  if (!isDev) return null;

  const isActive = pathname === "/dev-tools";

  return (
    <li>
      <Link
        href="/dev-tools"
        className={`block px-4 py-3 rounded-lg transition ${
          isActive ? "text-white" : "hover:bg-base-300"
        }`}
        style={
          isActive
            ? { backgroundColor: config.colors.brand.primary }
            : {}
        }
        onClick={onNavigate}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🛠️</span>
          <span className="font-medium">Dev Tools</span>
        </div>
      </Link>
    </li>
  );
}
