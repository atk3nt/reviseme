"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import ButtonSignin from "@/components/ButtonSignin";
import config from "@/config";

export default function Page() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const handleGetStarted = () => {
    if (status === "authenticated") {
      router.push(config.auth.callbackUrl);
    } else {
      // Go directly to onboarding slide-1 which has its own sign-in form
      router.push("/onboarding/slide-1");
    }
  };

  return (
    <>
      <header className="p-4 flex justify-end max-w-7xl mx-auto">
        <ButtonSignin text="Login" />
      </header>
      <main>
        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center text-center gap-8 px-8 py-32">
          <h1 className="text-6xl font-extrabold text-gray-900">
            Stop procrastinating. Start revising.
          </h1>

          <p className="text-2xl text-gray-600 max-w-2xl">
            Your personalized A-Level revision plan built around your schedule. No more guessing what to study.
          </p>

          <button 
            onClick={handleGetStarted}
            className="bg-blue-600 text-white px-10 py-4 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors"
          >
            Get Started
          </button>
        </section>

        {/* Benefits Section */}
        <section className="max-w-5xl mx-auto px-8 py-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-3">Smart scheduling</h3>
              <p className="text-gray-600">
                AI prioritizes your weakest topics and balances revision across all subjects
              </p>
            </div>
            
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-3">No planning needed</h3>
              <p className="text-gray-600">
                We decide what to study, when, and how often — you just focus on learning
              </p>
            </div>
            
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-3">Built for you</h3>
              <p className="text-gray-600">
                Personalized to your confidence levels, availability, and exam dates
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
