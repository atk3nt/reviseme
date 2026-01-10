"use client";

export default function OnboardingProgress({ currentSlide, totalSlides, showProgressBar = false }) {
  const progressPercentage = (currentSlide / totalSlides) * 100;

  return (
    <div className="w-full">
      {/* Progress Bar (optional) */}
      {showProgressBar && (
        <div className="w-full bg-[#E5F0FF] rounded-full h-1.5 sm:h-2 mb-4 sm:mb-6 md:mb-8">
          <div 
            className="bg-[#0066FF] h-1.5 sm:h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      )}

      {/* Dot Indicators - Responsive sizing and wrapping */}
      <div className="flex justify-center items-center flex-wrap gap-1 sm:gap-x-1.5 sm:gap-y-0 max-w-full px-2 sm:px-0">
        {Array.from({ length: totalSlides }, (_, index) => (
          <div
            key={index}
            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-300 flex-shrink-0 ${
              index < currentSlide
                ? 'bg-[#0066FF]' // Completed slides
                : index === currentSlide - 1
                ? 'bg-[#0066FF]' // Current slide
                : 'bg-[#E5F0FF]' // Upcoming slides
            }`}
            title={`Step ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
