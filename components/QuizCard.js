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
    <div className={`space-y-3 ${className}`}>
      {options.map((option, index) => (
        <button
          key={index}
          onClick={() => handleSelect(option)}
          className={`w-full p-4 rounded-lg border-2 transition-all duration-200 text-left ${
            isSelected(option)
              ? 'border-blue-500 bg-blue-50 text-gray-900'
              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{option}</span>
            {isSelected(option) && (
              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
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
