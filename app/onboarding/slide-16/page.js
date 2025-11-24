"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import QuizCard from "@/components/QuizCard";

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
    
    setTimeout(() => {
      router.push("/onboarding/slide-16-5");
    }, 300);
  };

  const handleSkip = () => {
    router.push("/onboarding/slide-16-5");
  };

  return (
    <div className="text-center space-y-8">
      <OnboardingProgress 
        currentSlide={16} 
        totalSlides={23} 
        showProgressBar={true}
      />

      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          Choose your subjects
        </h1>
        <p className="text-xl text-gray-600">
          Select 1-5 subjects you're taking for A-Levels
        </p>
      </div>

      <div className="space-y-6">
        {/* Subject Selection */}
        <div className="space-y-4">
          {subjects.map((subject) => (
            <div key={subject.id} className="space-y-3">
              <button
                onClick={() => handleSubjectToggle(subject.id)}
                className={`w-full p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                  selectedSubjects.includes(subject.id)
                    ? 'border-blue-500 bg-blue-50 text-gray-900'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-medium">{subject.name}</span>
                  {selectedSubjects.includes(subject.id) && (
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>

              {/* Board Selection (only show if subject is selected) */}
              {selectedSubjects.includes(subject.id) && (
                <div className="ml-4 space-y-3 text-center">
                  <p className="text-sm text-gray-600">Choose your exam board:</p>
                  <div className="flex justify-center space-x-2">
                    {subject.boards.map((board) => (
                      <button
                        key={board}
                        onClick={() => handleBoardSelect(subject.id, board)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          subjectBoards[subject.id] === board
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {board}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/onboarding/slide-15")}
          className="text-gray-500 hover:text-gray-700 text-sm underline"
        >
          ← Back
        </button>
        
        <div className="flex space-x-3">
          <button
            onClick={handleSkip}
            className="text-gray-500 hover:text-gray-700 text-sm underline"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            disabled={selectedSubjects.length === 0 || isLoading}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Next..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
