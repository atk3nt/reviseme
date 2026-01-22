"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import config from "@/config";
import { unlockSlide } from "@/libs/onboarding-progress";

export default function Slide19Page() {
  const router = useRouter();
  const [topics, setTopics] = useState([]);
  const [ratings, setRatings] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [subjectBoards, setSubjectBoards] = useState({});

  useEffect(() => {
    // Check if dev mode
    setIsDev(
      typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('.local')
      )
    );
    
    // Unlock this slide when user arrives (important for resume onboarding flow)
    unlockSlide(19);
  }, []);

  useEffect(() => {
    // Scroll to top when component mounts (matching rerating page behavior)
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadTopics();
  }, []);

  const loadTopics = async () => {
    try {
      setIsLoading(true);
      const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
      const subjects = savedAnswers.selectedSubjects || [];
      const boards = savedAnswers.subjectBoards || {};
      
      if (subjects.length === 0) {
        console.log('No subjects selected');
        setIsLoading(false);
        return;
      }

      setSelectedSubjects(subjects);
      setSubjectBoards(boards);
      
      // Convert subject names to match database format
      const subjectMapping = {
        'maths': 'Mathematics',
        'psychology': 'Psychology',
        'biology': 'Biology',
        'chemistry': 'Chemistry',
        'business': 'Business',
        'sociology': 'Sociology',
        'physics': 'Physics',
        'economics': 'Economics',
        'history': 'History',
        'geography': 'Geography',
        'computerscience': 'Computer Science'
      };
      
      // Create all fetch promises in parallel with individual error handling
      const fetchPromises = subjects
        .filter(subject => boards[subject])
        .map(async (subject) => {
          const board = boards[subject];
          const dbSubject = subjectMapping[subject];
          console.log(`Fetching topics for ${dbSubject} (${board.toUpperCase()})`);
          
          try {
            const response = await fetch('/api/topics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                subjects: [dbSubject],
                boards: [board]
              })
            });
            
            if (!response.ok) {
              console.error(`Failed to load topics for ${dbSubject}`);
              return { topics: [], subject: dbSubject };
            }
            
            const data = await response.json();
            console.log(`Loaded ${data.topics.length} topics for ${dbSubject}`);
            return { topics: data.topics || [], subject: dbSubject };
          } catch (error) {
            console.error(`Error loading topics for ${dbSubject}:`, error);
            return { topics: [], subject: dbSubject };
          }
        });
      
      // Wait for all requests in parallel
      const results = await Promise.all(fetchPromises);
      
      // Combine all topics
      const allTopics = results.flatMap(result => result.topics);
      
      console.log(`Total topics loaded: ${allTopics.length}`);
      
      // Convert database format to UI format
      const topics = allTopics.map(topic => ({
        rating: undefined,
        topics: {
          id: topic.id,
          name: topic.title,
          level: topic.level_1_parent || topic.parent_title || 'Other',
          parent_id: null,
          specs: { 
            subject: topic.subject, 
            exam_board: topic.exam_board 
          }
        }
      }));
      
      setTopics(topics);
      
      // Initialize ratings - load from localStorage if available
      const savedRatings = savedAnswers.topicRatings || {};
      const initialRatings = {};
      topics.forEach(item => {
        // Use saved rating if exists, otherwise undefined
        initialRatings[item.topics.id] = savedRatings[item.topics.id] ?? undefined;
      });
      setRatings(initialRatings);
      
      // Log restoration info for debugging
      const restoredCount = Object.values(initialRatings).filter(r => r !== undefined).length;
      if (restoredCount > 0) {
        console.log(`✅ Restored ${restoredCount} ratings from localStorage`);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading topics:', error);
      setIsLoading(false);
    }
  };

  const handleRatingChange = (topicId, rating) => {
    setRatings(prev => ({
      ...prev,
      [topicId]: rating
    }));
    
    // Auto-save after a delay
    clearTimeout(window.autoSaveTimeout);
    window.autoSaveTimeout = setTimeout(() => {
      saveRatings();
    }, 1000);
  };

  const saveRatings = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      // Save ratings to localStorage
      const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
      savedAnswers.topicRatings = ratings;
      localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error('Error saving ratings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkRating = (rating) => {
    const newRatings = { ...ratings };
    topics.forEach(item => {
      newRatings[item.topics.id] = rating;
    });
    setRatings(newRatings);
    saveRatings();
  };

  const fillRandomRatings = () => {
    if (topics.length === 0) {
      alert('No topics loaded. Please wait for topics to load first.');
      return;
    }

    const newRatings = { ...ratings };
    topics.forEach(item => {
      const topicId = item.topics.id;
      const rand = Math.random();
      if (rand < 0.2) {
        newRatings[topicId] = 0; // Not covered / Haven't Learned (20%)
      } else {
        newRatings[topicId] = Math.floor(Math.random() * 5) + 1; // 1-5 (80%)
      }
    });
    
    setRatings(newRatings);
    saveRatings();
  };

  const toggleSection = (parentId) => {
    setExpandedSections(prev => {
      const isCurrentlyOpen = prev[parentId];
      const isSubject = !parentId.includes('-');
      
      if (isSubject) {
        const newState = { ...prev };
        Object.keys(prev).forEach(key => {
          if (!key.includes('-') && key !== parentId) {
            newState[key] = false;
            Object.keys(prev).forEach(mainTopicKey => {
              if (mainTopicKey.startsWith(`${key}-`)) {
                newState[mainTopicKey] = false;
              }
            });
          }
        });
        newState[parentId] = !isCurrentlyOpen;
        if (isCurrentlyOpen) {
          Object.keys(prev).forEach(key => {
            if (key.startsWith(`${parentId}-`)) {
              newState[key] = false;
            }
          });
        }
        
        // No scroll when opening subject sections - scroll happens when opening main topics instead
        
        return newState;
      } else {
        const [subject] = parentId.split('-');
        const newState = { ...prev };
        
        Object.keys(prev).forEach(key => {
          if (key.startsWith(`${subject}-`) && key !== parentId) {
            newState[key] = false;
          }
        });
        newState[parentId] = !isCurrentlyOpen;
        
        // Scroll to show the subject header at top when opening a main topic,
        // but ONLY if another main topic in this subject was already open
        if (!isCurrentlyOpen) {
          // Check if there are other main topics open in this subject
          const hasOtherMainTopicsOpen = Object.keys(prev).some(key => 
            key.startsWith(`${subject}-`) && key !== parentId && prev[key]
          );
          
          // Only scroll if another main topic was already open in this subject
          if (hasOtherMainTopicsOpen) {
            // Wait for DOM to update, then scroll smoothly to show subject header
            setTimeout(() => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  // Find the main topic element first to get its parent subject
                  const mainTopicElement = document.getElementById(`main-topic-${parentId}`);
                  if (mainTopicElement) {
                    // Find the parent subject card by traversing up the DOM
                    let subjectCard = mainTopicElement.closest('[id^="subject-"]');
                    
                    // If not found via closest, try finding by the subject from parentId
                    if (!subjectCard) {
                      // Extract full subject from parentId - handle cases with multiple dashes
                      // parentId format is like "Business-Decisions and strategy" or "Mathematics-Algebra"
                      const subjectFromId = parentId.split('-')[0]; // Gets first part before dash
                      subjectCard = document.getElementById(`subject-${subjectFromId}`);
                    }
                    
                    if (subjectCard) {
                      // Use scrollIntoView first to position element, then adjust for spacing
                      subjectCard.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
                      
                      // Then adjust to show space above subject header
                      setTimeout(() => {
                        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
                        const headerOffset = 250; // Increased offset to show more space above subject header
                        const adjustedScroll = currentScroll - headerOffset;
                        
                        window.scrollTo({
                          top: Math.max(0, adjustedScroll),
                          behavior: 'smooth'
                        });
                      }, 10);
                    }
                  }
                });
              });
            }, 200); // Increased timeout to let React update DOM and content expand
          }
        }
        
        return newState;
      }
    });
  };

  const getProgress = () => {
    const total = topics.length;
    const rated = Object.values(ratings).filter(r => 
      r !== undefined && 
      r !== null &&
      r !== -2
    ).length;
    return total > 0 ? (rated / total) * 100 : 0;
  };

  const groupTopicsBySubject = () => {
    const grouped = {};
    topics.forEach(item => {
      const topic = item.topics;
      const subject = topic.specs?.subject || topic.subject;
      const mainTopic = topic.level || 'Other';
      
      if (!grouped[subject]) {
        grouped[subject] = {};
      }
      if (!grouped[subject][mainTopic]) {
        grouped[subject][mainTopic] = [];
      }
      grouped[subject][mainTopic].push(item);
    });
    return grouped;
  };

  const handleContinue = async () => {
    setIsLoading(true);
    await saveRatings();
    unlockSlide(20);
    router.push('/onboarding/slide-20');
  };

  const groupedTopics = groupTopicsBySubject();
  const progress = getProgress();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <div className="text-center space-y-4">
          <OnboardingProgress 
            currentSlide={19} 
            totalSlides={12} 
            showProgressBar={true}
          />
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-brand-medium">Loading topics...</p>
        </div>
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="text-center space-y-8">
        <OnboardingProgress 
          currentSlide={19} 
          totalSlides={12} 
          showProgressBar={true}
        />
        <div className="text-center">
          <p className="text-lg text-brand-medium mb-4">No topics found. Please complete previous steps first.</p>
          <button
            onClick={() => router.push("/onboarding/slide-17")}
            className="bg-white border-2 border-[#0066FF] text-[#0066FF] px-4 py-2 rounded-lg font-medium hover:bg-[#0066FF] hover:text-white transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4 sm:space-y-8 pt-adaptive pb-20">
      <OnboardingProgress 
        currentSlide={19} 
        totalSlides={12} 
        showProgressBar={true}
      />

      <div className="space-y-2 sm:space-y-3 px-2 sm:px-0 pt-6 sm:pt-0 w-[92.5%] sm:w-auto mx-auto">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-dark">
          Rate your topics.
        </h1>
        <p className="text-sm sm:text-base md:text-lg text-brand-medium max-w-2xl mx-auto">
          Rate each topic so we can focus your time where it matters most.
        </p>
        
        <p className="text-xs sm:text-sm text-brand-medium max-w-2xl mx-auto">
          <span className="font-semibold">1</span> = Weak | <span className="font-semibold">3</span> = OK | <span className="font-semibold">5</span> = Strong
        </p>
        
        {/* Progress Bar */}
        <div className="flex items-center justify-center space-x-4 max-w-md mx-auto">
          <div className="text-sm font-medium text-brand-medium">
            {Math.round(progress)}% complete
          </div>
          <div className="flex-1 bg-base-200 rounded-full h-3 overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ 
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #0066FF 0%, #0052CC 100%)'
              }}
            />
          </div>
        </div>
      </div>

      {/* Bulk actions - Temporarily enabled in prod */}
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          onClick={fillRandomRatings}
          className="btn btn-sm bg-yellow-500 text-white hover:bg-yellow-600 border-0"
        >
          [DEV] Fill Random Ratings
        </button>
      </div>

      {/* Topics by subject */}
      <div className="w-[92.5%] sm:max-w-7xl mx-auto px-0 sm:px-0">
        <div className="space-y-6">
          {Object.entries(groupedTopics)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([subject, subjectData]) => {
              const getSubjectKey = (subjectName) => {
                const mapping = {
                  'Mathematics': 'maths',
                  'Psychology': 'psychology',
                  'Biology': 'biology',
                  'Chemistry': 'chemistry',
                  'Business': 'business',
                  'Sociology': 'sociology',
                  'Physics': 'physics',
                  'Economics': 'economics',
                  'History': 'history',
                  'Geography': 'geography',
                  'Computer Science': 'computerscience'
                };
                return mapping[subjectName] || subjectName.toLowerCase().replace(/\s+/g, '');
              };
              const subjectKey = getSubjectKey(subject);
              const subjectConfig = config.subjects[subjectKey];
              const subjectColor = subjectConfig?.color || '#0066FF';
              
              // Get exam board for this subject
              const examBoard = subjectBoards[subjectKey] || 
                (Object.values(subjectData).flat()[0]?.topics?.specs?.exam_board);
              const examBoardDisplay = examBoard ? examBoard.toUpperCase() : '';
              const topicCount = Object.values(subjectData).flat().length;
              
              return (
                <div 
                  id={`subject-${subject}`}
                  key={subject} 
                  className="card bg-base-100 shadow-lg border-2 overflow-hidden"
                  style={{ borderColor: subjectColor + '40' }}
                >
                  {/* Subject Header */}
                  <div 
                    className="px-8 py-5 cursor-pointer"
                    onClick={() => toggleSection(subject)}
                    style={{ 
                      background: `linear-gradient(135deg, ${subjectColor}15 0%, ${subjectColor}08 100%)`
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{subjectConfig?.icon || '📚'}</span>
                        <h2 className="text-base font-bold text-brand-dark">
                          {subject}{examBoardDisplay ? ` - ${examBoardDisplay}` : ''} - {topicCount} {topicCount === 1 ? 'topic' : 'topics'}
                        </h2>
                      </div>
                      <svg
                        className={`w-5 h-5 transition-transform text-brand-medium ${
                          expandedSections[subject] ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Subject Content */}
                  {expandedSections[subject] && (
                    <div className="px-8 py-6 space-y-4">
                      {Object.entries(subjectData)
                        .sort(([a], [b]) => {
                          const getNumericPrefix = (topic) => {
                            const match = topic.match(/^(\d+)/);
                            return match ? parseInt(match[1], 10) : 999;
                          };
                          return getNumericPrefix(a) - getNumericPrefix(b);
                        })
                        .map(([mainTopic, mainTopicItems]) => (
                          <div 
                            id={`main-topic-${subject}-${mainTopic}`}
                            key={mainTopic} 
                            className={`card bg-base-100 border transition-all ${
                              mainTopicItems.every(item => ratings[item.topics.id] === -2) 
                                ? 'opacity-60 border-base-300' 
                                : 'border-base-300 shadow-sm hover:shadow-md'
                            }`}
                          >
                            {/* Main Topic Header */}
                            <div 
                              className="px-6 py-4 cursor-pointer"
                              onClick={() => toggleSection(`${subject}-${mainTopic}`)}
                              style={{ 
                                background: mainTopicItems.every(item => ratings[item.topics.id] === -2)
                                  ? '#f3f4f6'
                                  : `linear-gradient(135deg, ${subjectColor}08 0%, ${subjectColor}04 100%)`
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <h3 className={`font-semibold text-brand-dark text-sm sm:text-base truncate ${
                                  mainTopicItems.every(item => ratings[item.topics.id] === -2) 
                                    ? 'line-through text-base-content/50' 
                                    : ''
                                }`}>
                                  {mainTopic} - <span className="text-xs sm:text-sm font-normal text-brand-medium">{mainTopicItems.length} {mainTopicItems.length === 1 ? 'topic' : 'topics'}</span>
                                </h3>
                                <div className="flex items-center gap-2">
                                  {mainTopic.toLowerCase().includes('optional:') && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const allMarked = mainTopicItems.every(item => ratings[item.topics.id] === -2);
                                        mainTopicItems.forEach(item => handleRatingChange(item.topics.id, allMarked ? 0 : -2));
                                      }}
                                      className={`btn btn-ghost btn-xs ${
                                        mainTopicItems.every(item => ratings[item.topics.id] === -2) 
                                          ? 'text-error bg-error/10' 
                                          : 'text-base-content/40 hover:text-error hover:bg-error/10'
                                      }`}
                                      title={mainTopicItems.every(item => ratings[item.topics.id] === -2) ? "Mark as covering" : "Mark as not covering"}
                                    >
                                      ✕
                                    </button>
                                  )}
                                  <svg
                                    className={`w-4 h-4 transition-transform text-brand-medium ${
                                      expandedSections[`${subject}-${mainTopic}`] ? 'rotate-180' : ''
                                    }`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                              </div>
                            </div>

                            {/* Main Topic Content */}
                            {expandedSections[`${subject}-${mainTopic}`] && (
                              <div className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {mainTopicItems.map(item => {
                                    const topic = item.topics;
                                    const spec = topic.specs;
                                    
                                    return (
                                      <div 
                                        key={topic.id} 
                                        className={`card bg-base-100 border-2 transition-all flex flex-col ${
                                          ratings[topic.id] === -2 
                                            ? 'opacity-60 border-base-300 bg-base-200' 
                                            : 'border-base-300 shadow-sm hover:shadow-md hover:border-[#0066FF]/40'
                                        }`}
                                      >
                                        <div className="card-body px-6 pt-6 pb-6 flex flex-col">
                                          {/* Topic Header - Fixed height container */}
                                          <div className="flex items-start justify-between mb-3">
                                            <h4 
                                              className={`font-semibold text-brand-dark flex-1 leading-tight text-xs sm:text-base break-words ${
                                                ratings[topic.id] === -2 ? 'line-through text-base-content/50' : ''
                                              }`}
                                            >
                                              {topic.name}
                                            </h4>
                                            {(topic.name.toLowerCase().includes('optional') || 
                                              topic.name.toLowerCase().includes('choice') ||
                                              topic.name.toLowerCase().includes('option')) && (
                                              <button
                                                onClick={() => handleRatingChange(topic.id, ratings[topic.id] === -2 ? 3 : -2)}
                                                className={`btn btn-ghost btn-xs ml-2 shrink-0 self-start ${
                                                  ratings[topic.id] === -2 
                                                    ? 'text-error bg-error/10' 
                                                    : 'text-base-content/40 hover:text-error hover:bg-error/10'
                                                }`}
                                                title={ratings[topic.id] === -2 ? "Mark as doing" : "Mark as not doing"}
                                              >
                                                {ratings[topic.id] === -2 ? '↶' : '✕'}
                                              </button>
                                            )}
                                          </div>
                                          
                                          {/* Content area - Standardized spacing */}
                                          <div className="flex flex-col">
                                            {ratings[topic.id] === -2 ? (
                                              <div className="text-center py-3">
                                                <span className="badge badge-error badge-outline mb-2">Not Doing (Optional)</span>
                                                <button
                                                  onClick={() => handleRatingChange(topic.id, 3)}
                                                  className="btn btn-ghost btn-xs"
                                                >
                                                  Change Mind
                                                </button>
                                              </div>
                                            ) : (
                                              <>
                                                {/* Rating Buttons - Consistent spacing */}
                                                <div className="flex justify-center gap-3 mb-3 mt-1">
                                                  {[1, 2, 3, 4, 5].map(rating => {
                                                    const isSelected = ratings[topic.id] === rating;
                                                    const getRatingColor = (r) => {
                                                      if (r <= 2) return '#ef4444'; // red
                                                      if (r === 3) return '#f59e0b'; // amber
                                                      return '#10b981'; // green
                                                    };
                                                    
                                                    return (
                                                      <button
                                                        key={rating}
                                                        type="button"
                                                        onClick={() => handleRatingChange(topic.id, rating)}
                                                        className={`w-12 h-12 rounded-lg font-bold text-base transition-all ${
                                                          isSelected
                                                            ? 'scale-110 shadow-lg'
                                                            : 'hover:scale-105 hover:shadow-md'
                                                        }`}
                                                        style={{
                                                          backgroundColor: isSelected ? getRatingColor(rating) : 'transparent',
                                                          color: isSelected ? 'white' : '#003D99',
                                                          border: `2px solid ${isSelected ? getRatingColor(rating) : '#E5F0FF'}`,
                                                          borderColor: isSelected ? getRatingColor(rating) : '#0066FF40'
                                                        }}
                                                      >
                                                        {rating}
                                                      </button>
                                                    );
                                                  })}
                                                </div>
                                                
                                                {/* Quick Actions - Consistent spacing */}
                                                <div className="flex justify-center gap-3">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleRatingChange(topic.id, 0)}
                                                    className="btn btn-sm btn-ghost text-sm"
                                                    style={ratings[topic.id] === 0 ? {
                                                      backgroundColor: '#0066FF',
                                                      color: 'white',
                                                      border: '2px solid #0066FF'
                                                    } : {
                                                      border: '2px solid #E5F0FF',
                                                      borderColor: '#0066FF40',
                                                      color: '#003D99'
                                                    }}
                                                  >
                                                    Haven't Learned
                                                  </button>
                                                </div>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {isSaving && (
        <div className="fixed bottom-4 right-4 bg-base-100 px-4 py-3 rounded-lg shadow-lg border border-primary/20">
          <div className="flex items-center gap-2">
            <span className="loading loading-spinner loading-xs text-primary"></span>
            <span className="text-sm text-brand-medium">Saving...</span>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pt-8">
        <button
          onClick={() => router.push("/onboarding/slide-17")}
          className="bg-white border-2 border-[#0066FF] text-[#0066FF] px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg text-sm sm:text-base font-medium hover:bg-[#0066FF] hover:text-white transition-colors"
        >
          Back
        </button>
        
        <div className="flex items-center space-x-4">
          {isSaving && (
            <span className="text-sm text-[#003D99]">
              <span className="loading loading-spinner loading-xs"></span>
              Saving...
            </span>
          )}
          
          <button
            onClick={handleContinue}
            disabled={isLoading}
            className="bg-[#0066FF] text-white px-8 py-3 rounded-lg font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isLoading ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Continue...
              </>
            ) : (
              'Continue to Availability'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
