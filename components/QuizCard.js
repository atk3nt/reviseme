"use client";

export default function QuizCard({ 
  options = [], 
  selected = null, 
  onSelect, 
  multiSelect = false,
  className = ""
}) {
  const handleSelect = (option) => {
    if (multiSelect) {
      // For multi-select, toggle the option
      const newSelected = selected?.includes(option) 
        ? selected.filter(item => item !== option)
        : [...(selected || []), option];
      onSelect(newSelected);
    } else {
      // For single select, just set the option
      onSelect(option);
    }
  };

  const isSelected = (option) => {
    if (multiSelect) {
      return selected?.includes(option) || false;
    }
    return selected === option;
  };

  return (
    <div className={`space-y-2 sm:space-y-3 ${className}`}>
      {options.map((option, index) => (
        <button
          key={index}
          onClick={() => handleSelect(option)}
          className={`w-full p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 text-left ${
            isSelected(option)
              ? 'border-[#0066FF] bg-[#E5F0FF] text-[#001433]'
              : 'border-[#0066FF]/20 bg-white text-[#003D99] hover:border-[#0066FF]/40 hover:bg-[#E5F0FF]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm md:text-base font-medium">{option}</span>
            {isSelected(option) && (
              <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#0066FF] flex items-center justify-center flex-shrink-0 ml-2">
                <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
