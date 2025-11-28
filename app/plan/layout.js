import { getSEOTags } from "@/libs/seo";

export const metadata = getSEOTags({
  title: "Revision Plan",
  description: "View and manage your personalized A-Level revision schedule. Track your study blocks and stay on top of your revision goals.",
  canonicalUrlRelative: "/plan",
});

export default function PlanLayout({ children }) {
  return children;
}

