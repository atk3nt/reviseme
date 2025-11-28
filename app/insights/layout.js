import { getSEOTags } from "@/libs/seo";

export const metadata = getSEOTags({
  title: "Study Stats",
  description: "Track your revision progress, estimated grades, completion rates, and study insights. Monitor your A-Level revision performance.",
  canonicalUrlRelative: "/insights",
});

export default function InsightsLayout({ children }) {
  return children;
}

