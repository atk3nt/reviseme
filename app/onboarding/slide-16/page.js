"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import QuizCard from "@/components/QuizCard";
import config from "@/config";
import { unlockSlide } from "@/libs/onboarding-progress";

export default function Slide16Page() {
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [subjectBoards, setSubjectBoards] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const subjects = [
    { id: "maths", name: "Mathematics", boards: ["AQA", "Edexcel", "OCR"] },
    { id: "psychology", name: "Psychology", boards: ["AQA", "Edexcel"] },
    { id: "biology", name: "Biology", boards: ["AQA", "Edexcel", "OCR"] },
    { id: "chemistry", name: "Chemistry", boards: ["AQA", "Edexcel", "OCR"] },
    { id: "business", name: "Business", boards: ["AQA", "Edexcel"] },
    { id: "sociology", name: "Sociology", boards: ["AQA"] },
    { id: "physics", name: "Physics", boards: ["AQA", "Edexcel", "OCR"] },
    { id: "economics", name: "Economics", boards: ["AQA", "Edexcel"] },
    { id: "history", name: "History", boards: ["AQA", "Edexcel"] },
    { id: "geography", name: "Geography", boards: ["AQA", "Edexcel"] },
    { id: "computerscience", name: "Computer Science", boards: ["AQA"] }
  ];

  useEffect(() => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    if (savedAnswers.selectedSubjects) {
      setSelectedSubjects(savedAnswers.selectedSubjects);
    }
    if (savedAnswers.subjectBoards) {
      setSubjectBoards(savedAnswers.subjectBoards);
    }
  }, []);

  const handleSubjectToggle = (subjectId) => {
    const newSelected = selectedSubjects.includes(subjectId)
      ? selectedSubjects.filter(id => id !== subjectId)
      : [...selectedSubjects, subjectId];
    
    setSelectedSubjects(newSelected);
    
    // Clear board selection if subject is deselected
    if (!newSelected.includes(subjectId)) {
      const newBoards = { ...subjectBoards };
      delete newBoards[subjectId];
      setSubjectBoards(newBoards);
    }
  };

  const handleBoardSelect = (subjectId, board) => {
    setSubjectBoards(prev => ({
      ...prev,
      [subjectId]: board
    }));
  };

  // Helper function to create a subtle/light version of a color
  const getSubtleColor = (hexColor) => {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    
    // Mix with white (90% white, 10% original color) for a very subtle tint
    const subtleR = Math.round(r * 0.1 + 255 * 0.9);
    const subtleG = Math.round(g * 0.1 + 255 * 0.9);
    const subtleB = Math.round(b * 0.1 + 255 * 0.9);
    
    return `rgb(${subtleR}, ${subtleG}, ${subtleB})`;
  };

  const handleNext = async () => {
    if (selectedSubjects.length === 0) return;
    
    // Check if all selected subjects have boards chosen
    const missingBoards = selectedSubjects.filter(subjectId => !subjectBoards[subjectId]);
    if (missingBoards.length > 0) return;
    
    setIsLoading(true);
    
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    savedAnswers.selectedSubjects = selectedSubjects;
    savedAnswers.subjectBoards = subjectBoards;
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    
    unlockSlide(9);
    
    setTimeout(() => {
      router.push("/onboarding/slide-9");
    }, 300);
  };


  return (
    <div className="text-center w-full h-full flex flex-col pt-12 sm:pt-20 md:pt-24 pb-12 sm:pb-20 md:pb-24 min-h-0">
      {/* Progress */}
      <div className="w-full flex-shrink-0 pb-3 sm:pb-6 md:pb-10">
        <OnboardingProgress 
          currentSlide={2} 
          totalSlides={4} 
          showProgressBar={true}
        />
      </div>

      {/* Title */}
      <div className="space-y-2 sm:space-y-4 flex-shrink-0 pb-3 sm:pb-6">
        <h1 data-fast-scroll="onboarding_subject_selection" className="text-xl sm:text-2xl md:text-3xl font-bold text-[#001433] leading-tight">
          What are you studying?
        </h1>
        <p className="text-sm sm:text-base md:text-lg text-[#003D99] leading-relaxed">
          Pick your A-Level subjects (1–5) and exam boards so we can tailor your plan.
        </p>
      </div>

      {/* Subject Selection - Grid layout with 3 columns, centered last row - Scrollable */}
      <div className="flex-1 overflow-y-auto w-full min-h-0 pt-2 pb-2 sm:pt-4 sm:pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 w-full">
          {subjects.slice(0, -2).map((subject) => {
            const subjectConfig = config.subjects[subject.id];
            const subjectColor = subjectConfig?.color || '#6b7280';
            const subjectIcon = subjectConfig?.icon || '📚';
            const isSelected = selectedSubjects.includes(subject.id);
            const subtleColor = getSubtleColor(subjectColor);
            
            return (
              <div key={subject.id} className="space-y-1.5 sm:space-y-2 w-full">
                <button
                  onClick={() => handleSubjectToggle(subject.id)}
                  className={`w-full h-20 sm:h-24 md:h-28 p-2 sm:p-3 rounded-xl border-2 transition-all duration-200 text-center relative overflow-hidden flex flex-col items-center justify-center ${
                    isSelected
                      ? 'border-white shadow-lg transform scale-[1.02]'
                      : 'hover:shadow-md hover:scale-[1.01]'
                  }`}
                  style={{
                    backgroundColor: isSelected ? subjectColor : subtleColor,
                    borderColor: isSelected ? subjectColor : `${subjectColor}40`,
                    color: isSelected ? 'white' : '#1f2937'
                  }}
                >
                  {/* Background pattern when selected */}
                  {isSelected && (
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '20px 20px' }}></div>
                  )}
                  
                  <div className="relative z-10 flex flex-col items-center justify-center space-y-1">
                    <span className="text-xl sm:text-2xl">{subjectIcon}</span>
                    <span className={`text-xs sm:text-sm font-semibold ${isSelected ? 'text-white' : 'text-[#001433]'}`}>
                      {subject.name}
                    </span>
                  </div>
                </button>

                {/* Board Selection (only show if subject is selected) */}
                {isSelected && (
                  <div className="space-y-1 text-center">
                    <p className="text-xs text-[#003D99] font-medium">Board:</p>
                    <div className="flex justify-center flex-wrap gap-1">
                      {subject.boards.map((board) => (
                        <button
                          key={board}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBoardSelect(subject.id, board);
                          }}
                          className={`px-2 py-0.5 sm:py-1 rounded-lg text-xs font-medium transition-colors ${
                            subjectBoards[subject.id] === board
                              ? 'text-white shadow-md'
                              : 'bg-[#E5F0FF] border border-[#0066FF]/20 text-[#003D99] hover:bg-[#0066FF]/10 hover:border-[#0066FF]/40'
                          }`}
                          style={subjectBoards[subject.id] === board ? { backgroundColor: subjectColor } : {}}
                        >
                          {board}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Last 2 subjects - centered on desktop, normal grid on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:flex md:justify-center gap-3 sm:gap-4 md:w-full mt-3 sm:mt-4 max-w-full">
          {subjects.slice(-2).map((subject) => {
            const subjectConfig = config.subjects[subject.id];
            const subjectColor = subjectConfig?.color || '#6b7280';
            const subjectIcon = subjectConfig?.icon || '📚';
            const isSelected = selectedSubjects.includes(subject.id);
            const subtleColor = getSubtleColor(subjectColor);
            
            return (
              <div key={`centered-${subject.id}`} className="space-y-1.5 sm:space-y-2 w-full md:w-[calc((100%-2rem)/3)]">
                <button
                  onClick={() => handleSubjectToggle(subject.id)}
                  className={`w-full h-20 sm:h-24 md:h-28 p-2 sm:p-3 rounded-xl border-2 transition-all duration-200 text-center relative overflow-hidden flex flex-col items-center justify-center ${
                    isSelected
                      ? 'border-white shadow-lg transform scale-[1.02]'
                      : 'hover:shadow-md hover:scale-[1.01]'
                  }`}
                  style={{
                    backgroundColor: isSelected ? subjectColor : subtleColor,
                    borderColor: isSelected ? subjectColor : `${subjectColor}40`,
                    color: isSelected ? 'white' : '#1f2937'
                  }}
                >
                  {/* Background pattern when selected */}
                  {isSelected && (
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '20px 20px' }}></div>
                  )}
                  
                  <div className="relative z-10 flex flex-col items-center justify-center space-y-1">
                    <span className="text-xl sm:text-2xl">{subjectIcon}</span>
                    <span className={`text-xs sm:text-sm font-semibold ${isSelected ? 'text-white' : 'text-[#001433]'}`}>
                      {subject.name}
                    </span>
                  </div>
                </button>

                {/* Board Selection (only show if subject is selected) */}
                {isSelected && (
                  <div className="space-y-1 text-center">
                    <p className="text-xs text-[#003D99] font-medium">Board:</p>
                    <div className="flex justify-center flex-wrap gap-1">
                      {subject.boards.map((board) => (
                        <button
                          key={board}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBoardSelect(subject.id, board);
                          }}
                          className={`px-2 py-0.5 sm:py-1 rounded-lg text-xs font-medium transition-colors ${
                            subjectBoards[subject.id] === board
                              ? 'text-white shadow-md'
                              : 'bg-[#E5F0FF] border border-[#0066FF]/20 text-[#003D99] hover:bg-[#0066FF]/10 hover:border-[#0066FF]/40'
                          }`}
                          style={subjectBoards[subject.id] === board ? { backgroundColor: subjectColor } : {}}
                        >
                          {board}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation - Fixed at bottom, centered, explicit space below for clickability */}
      <div className="flex flex-col justify-center items-center w-full flex-shrink-0 pt-3 sm:pt-6 md:pt-10 pb-adaptive-nav border-t border-[#0066FF]/10 bg-white">
        <div className="flex justify-center items-center gap-3 sm:gap-6">
          <button
            onClick={() => router.push("/onboarding/slide-1")}
            className="bg-white border-2 border-[#0066FF] text-[#0066FF] px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-[#0066FF] hover:text-white transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={selectedSubjects.length === 0 || isLoading}
            className="bg-[#0066FF] text-white px-5 sm:px-8 py-2 sm:py-2.5 rounded-lg text-sm sm:text-base font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Next..." : "Continue"}
          </button>
        </div>
        <div className="w-full min-h-[2.5rem] sm:min-h-[3rem] flex-shrink-0" style={{ minHeight: 'max(2.5rem, env(safe-area-inset-bottom))' }} aria-hidden />
      </div>
    </div>
  );
}
