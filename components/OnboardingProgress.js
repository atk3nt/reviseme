"use client";

export default function OnboardingProgress({ currentSlide, totalSlides, showProgressBar = false }) {
  const progressPercentage = (currentSlide / totalSlides) * 100;

  return (
    <div className="w-full">
      {/* Progress Bar (optional) */}
      {showProgressBar && (
        <div className="w-full bg-gray-200 rounded-full h-2 mb-8">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      )}

      {/* Dot Indicators */}
      <div className="flex justify-center space-x-2">
        {Array.from({ length: totalSlides }, (_, index) => (
          <div
            key={index}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              index < currentSlide
                ? 'bg-blue-500' // Completed slides
                : index === currentSlide - 1
                ? 'bg-blue-500' // Current slide
                : 'bg-gray-300' // Upcoming slides
            }`}
          />
        ))}
      </div>
    </div>
  );
}
