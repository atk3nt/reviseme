import { getSEOTags } from "@/libs/seo";

export const metadata = getSEOTags({
  title: "Settings",
  description: "Manage your account settings, study preferences, availability, and account information for your revision plan.",
  canonicalUrlRelative: "/settings",
});

export default function SettingsLayout({ children }) {
  return children;
}

