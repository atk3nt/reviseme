"use client";

import { useState } from "react";
import OnboardingProgress from "@/components/OnboardingProgress";
import QuizCard from "@/components/QuizCard";

export default function TestOnboardingPage() {
  const [currentSlide, setCurrentSlide] = useState(1);
  const [selectedOption, setSelectedOption] = useState(null);
  const [selectedMulti, setSelectedMulti] = useState([]);

  const singleOptions = [
    "Very confident",
    "Somewhat confident", 
    "Not confident yet"
  ];

  const multiOptions = [
    "Staying consistent",
    "Knowing what to revise",
    "Procrastination",
    "Distractions"
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl mx-auto space-y-8">
            
            {/* Test Progress Bar + Dots */}
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                Phase 1 Component Test
              </h1>
              <OnboardingProgress 
                currentSlide={currentSlide} 
                totalSlides={5} 
                showProgressBar={true}
              />
            </div>

            {/* Test Single Select Quiz Card */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Single Select Test
              </h2>
              <QuizCard
                options={singleOptions}
                selected={selectedOption}
                onSelect={setSelectedOption}
              />
              <p className="text-sm text-gray-600">
                Selected: {selectedOption || "None"}
              </p>
            </div>

            {/* Test Multi Select Quiz Card */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Multi Select Test
              </h2>
              <QuizCard
                options={multiOptions}
                selected={selectedMulti}
                onSelect={setSelectedMulti}
                multiSelect={true}
              />
              <p className="text-sm text-gray-600">
                Selected: {selectedMulti.length > 0 ? selectedMulti.join(", ") : "None"}
              </p>
            </div>

            {/* Navigation Test */}
            <div className="flex justify-between">
              <button
                onClick={() => setCurrentSlide(Math.max(1, currentSlide - 1))}
                className="btn btn-outline btn-sm"
                disabled={currentSlide === 1}
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentSlide(Math.min(5, currentSlide + 1))}
                className="btn btn-primary btn-sm"
                disabled={currentSlide === 5}
              >
                Next
              </button>
            </div>

            {/* Current Slide Info */}
            <div className="text-center text-sm text-gray-500">
              Slide {currentSlide} of 5
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
