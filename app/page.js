import { redirect } from "next/navigation";

export default function Page() {
  // Redirect directly to onboarding signup page
  // CTAs from Framer site will redirect here, then users go straight to signup
  redirect("/onboarding/slide-1");
}
