import { redirect } from "next/navigation";

export default function OnboardingPage() {
  // Redirect to new onboarding flow
  redirect("/onboarding/slide-1");
}


