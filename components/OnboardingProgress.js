"use client";

export default function OnboardingProgress({ currentSlide, totalSlides, showProgressBar = false }) {
  // Map actual slide numbers to sequential positions (handles gaps in numbering)
  const SLIDE_SEQUENCE = [1, 2, 4, 5, 9, 16, 16.5, 17, 18, 19, 20, 21, 22];
  
  // Find the position of the current slide in the sequence (1-based)
  const currentPosition = SLIDE_SEQUENCE.indexOf(currentSlide) + 1;
  
  // Calculate progress based on position in sequence, not slide number
  const progressPercentage = currentPosition > 0 
    ? (currentPosition / totalSlides) * 100 
    : (currentSlide / totalSlides) * 100; // Fallback for unknown slides

  return (
    <div className="w-full">
      {/* Progress Bar (optional) */}
      {showProgressBar && (
        <div className="w-full bg-[#E5F0FF] rounded-full h-1.5 sm:h-2 mb-4 sm:mb-5">
          <div 
            className="bg-[#0066FF] h-1.5 sm:h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      )}

      {/* Dot Indicators - Responsive sizing and wrapping with fixed height */}
      <div className="flex justify-center items-center flex-wrap gap-1 sm:gap-x-1.5 sm:gap-y-0 max-w-full px-2 sm:px-0 h-4 sm:h-5">
        {Array.from({ length: totalSlides }, (_, index) => (
          <div
            key={index}
            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-300 flex-shrink-0 ${
              index < currentPosition - 1
                ? 'bg-[#0066FF]' // Completed slides
                : index === currentPosition - 1
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
