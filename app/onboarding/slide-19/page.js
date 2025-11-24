"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OnboardingProgress from "@/components/OnboardingProgress";
import config from "@/config";

export default function Slide19Page() {
  const router = useRouter();
  const [topics, setTopics] = useState([]);
  const [ratings, setRatings] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    // Check if dev mode
    setIsDev(
      typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('.local')
      )
    );
  }, []);

  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    try {
      const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
      const selectedSubjects = savedAnswers.selectedSubjects || [];
      const subjectBoards = savedAnswers.subjectBoards || {};
      
      if (selectedSubjects.length === 0) {
        console.log('No subjects selected');
        return;
      }

      console.log('Selected subjects:', selectedSubjects);
      
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
      
      const allTopics = [];
      
      // Make separate API calls for each subject with its specific exam board
      for (const subject of selectedSubjects) {
        const board = subjectBoards[subject];
        if (!board) continue;
        
        const dbSubject = subjectMapping[subject];
        console.log(`Fetching topics for ${dbSubject} (${board.toUpperCase()})`);
        
        const response = await fetch('/api/topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            subjects: [dbSubject],
            boards: [board] // Keep lowercase to match database format
          })
        });
        
        if (!response.ok) {
          console.error(`Failed to load topics for ${dbSubject}`);
          continue;
        }
        
        const data = await response.json();
        console.log(`Loaded ${data.topics.length} topics for ${dbSubject}`);
        allTopics.push(...data.topics);
      }
      
      console.log(`Total topics loaded: ${allTopics.length}`);
      
      // Convert database format to UI format
      const topics = allTopics.map(topic => ({
        rating: undefined, // No default rating - students must choose
        topics: {
          id: topic.id,
          name: topic.title, // Use title for topic name
          level: topic.level_1_parent || topic.parent_title || 'Other', // Use level_1_parent for grouping
          parent_id: null,
          specs: { 
            subject: topic.subject, 
            exam_board: topic.exam_board 
          }
        }
      }));
      
      setTopics(topics);
      
      // Initialize ratings
      const initialRatings = {};
      topics.forEach(item => {
        initialRatings[item.topics.id] = undefined; // No default rating
      });
      setRatings(initialRatings);
    } catch (error) {
      console.error('Error loading topics:', error);
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
      
      // Check if it's a subject (no dash) or a main topic (has dash)
      const isSubject = !parentId.includes('-');
      
      if (isSubject) {
        // For subjects: close all other subjects and their main topics, toggle this one
        const newState = { ...prev };
        
        // Close all other subjects (keys without dashes)
        Object.keys(prev).forEach(key => {
          if (!key.includes('-') && key !== parentId) {
            newState[key] = false;
            // Also close all main topics in closed subjects
            Object.keys(prev).forEach(mainTopicKey => {
              if (mainTopicKey.startsWith(`${key}-`)) {
                newState[mainTopicKey] = false;
              }
            });
          }
        });
        
        // Toggle the clicked subject
        newState[parentId] = !isCurrentlyOpen;
        
        // If closing the subject, also close all its main topics
        if (isCurrentlyOpen) {
          Object.keys(prev).forEach(key => {
            if (key.startsWith(`${parentId}-`)) {
              newState[key] = false;
            }
          });
        }
        
        return newState;
      } else {
        // For main topics: close all other main topics in the same subject, toggle this one
        const [subject] = parentId.split('-');
        const newState = { ...prev };
        
        // Close all main topics in this subject
        Object.keys(prev).forEach(key => {
          if (key.startsWith(`${subject}-`) && key !== parentId) {
            newState[key] = false;
          }
        });
        
        // Toggle the clicked main topic
        newState[parentId] = !isCurrentlyOpen;
        return newState;
      }
    });
  };

  const getProgress = () => {
    const total = topics.length;
    const rated = Object.values(ratings).filter(r => 
      r !== undefined && 
      r !== null &&
      r !== -2  // Exclude "not doing" topics from progress
    ).length;
    return total > 0 ? (rated / total) * 100 : 0;
  };

  const groupTopicsBySubject = () => {
    const grouped = {};
    topics.forEach(item => {
      const topic = item.topics;
      const subject = topic.specs?.subject || topic.subject;
      // parent_title contains the level-1 topic name for grouping
      // For level-3 topics, we need to find their level-1 parent by looking up parent_title
      // Since we're only showing level-3 topics, parent_title should give us the level-1 topic
      const mainTopic = topic.level || 'Other'; // topic.level contains parent_title from our mapping
      
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
    router.push('/onboarding/slide-20');
  };

  const groupedTopics = groupTopicsBySubject();
  const progress = getProgress();

  return (
    <div className="text-center space-y-8">
      <OnboardingProgress 
        currentSlide={19} 
        totalSlides={23} 
        showProgressBar={true}
      />

      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          Rate Your Confidence
        </h1>
        <p className="text-xl text-gray-600">
          Rate your confidence in each topic from 1 (very weak) to 5 (very strong).
          This helps us prioritize your revision.
        </p>
        
        <div className="flex items-center justify-center space-x-4">
          <div className="text-sm text-gray-600">
            Progress: {Math.round(progress)}% complete
          </div>
          <div className="w-64 bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          onClick={() => handleBulkRating(0)}
          className="btn btn-sm btn-outline"
        >
          Mark All as Haven't Learned
        </button>
        <button
          onClick={() => handleBulkRating(3)}
          className="btn btn-sm btn-outline"
        >
          Rate All as 3 (Medium)
        </button>
        <button
          onClick={() => handleBulkRating(1)}
          className="btn btn-sm btn-outline btn-error"
        >
          Mark All as Weak
        </button>
        <button
          onClick={() => handleBulkRating(5)}
          className="btn btn-sm btn-outline btn-success"
        >
          Mark All as Strong
        </button>
        <button
          onClick={() => handleBulkRating(-1)}
          className="btn btn-sm btn-outline btn-neutral"
        >
          Skip All Topics
        </button>
        {isDev && (
          <button
            onClick={fillRandomRatings}
            className="btn btn-sm bg-yellow-500 text-white hover:bg-yellow-600 border-0"
          >
            [DEV] Fill Random Ratings
          </button>
        )}
      </div>

      {/* Topics by subject */}
      <div className="max-w-6xl mx-auto">
        <div className="space-y-6">
          {Object.entries(groupedTopics)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([subject, subjectData]) => (
            <div key={subject} className="collapse collapse-arrow bg-white border border-gray-200">
              <input
                type="checkbox"
                checked={expandedSections[subject] || false}
                onChange={() => toggleSection(subject)}
              />
              <div className="collapse-title text-xl font-medium">
                {subject} ({Object.values(subjectData).flat().length} topics)
              </div>
              <div className="collapse-content">
                <div className="space-y-4 pt-4">
                  {Object.entries(subjectData)
                    .sort(([a], [b]) => {
                      // Extract numeric prefix for proper ordering (1-17)
                      const getNumericPrefix = (topic) => {
                        const match = topic.match(/^(\d+)/);
                        return match ? parseInt(match[1], 10) : 999;
                      };
                      return getNumericPrefix(a) - getNumericPrefix(b);
                    })
                    .map(([mainTopic, mainTopicItems]) => (
                    <div key={mainTopic} className={`collapse collapse-arrow border relative ${
                      mainTopicItems.every(item => ratings[item.topics.id] === -2) 
                        ? 'bg-gray-200 opacity-60' 
                        : 'bg-white'
                    }`}>
                      <input
                        type="checkbox"
                        checked={expandedSections[`${subject}-${mainTopic}`] || false}
                        onChange={() => toggleSection(`${subject}-${mainTopic}`)}
                      />
                      <div className={`collapse-title text-lg font-medium ${
                        mainTopicItems.every(item => ratings[item.topics.id] === -2) ? 'line-through text-gray-500' : ''
                      }`}>
                        {mainTopic} ({mainTopicItems.length} topics)
                      </div>
                      {mainTopic.toLowerCase().includes('optional:') && (
                        <button
                          onClick={() => {
                            const allMarked = mainTopicItems.every(item => ratings[item.topics.id] === -2);
                            mainTopicItems.forEach(item => handleRatingChange(item.topics.id, allMarked ? 0 : -2));
                          }}
                          className={`absolute right-8 top-1/2 transform -translate-y-1/2 btn btn-ghost btn-xs z-10 ${
                            mainTopicItems.every(item => ratings[item.topics.id] === -2) 
                              ? 'text-red-500 bg-red-100' 
                              : 'text-gray-400 hover:text-red-500 hover:bg-red-100'
                          }`}
                          title={mainTopicItems.every(item => ratings[item.topics.id] === -2) ? "Mark as covering (will study)" : "Mark as not covering (optional topic)"}
                        >
                          ✕
                        </button>
                      )}
                      <div className="collapse-content">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                          {mainTopicItems.map(item => {
                            const topic = item.topics;
                            const spec = topic.specs;
                            // Helper to convert full subject names (from database) to config keys
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
                            const subjectKey = getSubjectKey(spec.subject);
                            const subjectConfig = config.subjects[subjectKey];
                            
                            return (
                              <div key={topic.id} className={`card shadow-sm border ${
                                ratings[topic.id] === -2 
                                  ? 'bg-gray-200 opacity-60' 
                                  : 'bg-gray-50'
                              }`}>
                                <div className="card-body p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center space-x-2">
                                      <h4 className={`font-medium text-sm ${ratings[topic.id] === -2 ? 'line-through text-gray-500' : ''}`}>
                                        {topic.name}
                                      </h4>
                                      {(topic.name.toLowerCase().includes('optional') || 
                                        topic.name.toLowerCase().includes('choice') ||
                                        topic.name.toLowerCase().includes('option')) && (
                                        <button
                                          onClick={() => handleRatingChange(topic.id, -2)}
                                          className={`btn btn-ghost btn-xs ${
                                            ratings[topic.id] === -2 
                                              ? 'text-red-500 bg-red-100' 
                                              : 'text-red-500 hover:bg-red-100'
                                          }`}
                                          title={ratings[topic.id] === -2 ? "Mark as doing" : "Mark as not doing (optional topic)"}
                                        >
                                          {ratings[topic.id] === -2 ? '↶' : '✕'}
                                        </button>
                                      )}
                                    </div>
                                    <span className="text-xs text-gray-500">
                                      {subjectConfig?.icon} {spec.subject}
                                    </span>
                                  </div>
                                  
                                  {ratings[topic.id] === -2 ? (
                                    // Show "Not Doing" status for skipped topics
                                    <div className="text-center py-2">
                                      <span className="badge badge-error badge-outline">Not Doing (Optional)</span>
                                      <button
                                        onClick={() => handleRatingChange(topic.id, 3)}
                                        className="btn btn-ghost btn-xs ml-2"
                                      >
                                        Change Mind
                                      </button>
                                    </div>
                                  ) : (
                                    // Show normal rating options
                                    <>
                                      {/* Number ratings 1-5 on same line */}
                                      <div className="flex justify-center space-x-1 mb-2">
                                        {[1, 2, 3, 4, 5].map(rating => (
                                          <button
                                            key={rating}
                                            type="button"
                                            className={`btn btn-sm w-8 h-8 p-0 ${
                                              ratings[topic.id] === rating
                                                ? rating <= 2 ? 'btn-error' : rating === 3 ? 'btn-info' : 'btn-success'
                                                : ratings[topic.id] === undefined 
                                                  ? 'btn-outline btn-ghost' // Unrated state
                                                  : 'btn-outline'
                                            }`}
                                            onClick={() => handleRatingChange(topic.id, rating)}
                                          >
                                            {rating}
                                          </button>
                                        ))}
                                      </div>
                                      
                                      {/* Haven't Learned and Skip Topic below */}
                                      <div className="flex justify-center space-x-2">
                                        <button
                                          type="button"
                                          className={`btn btn-sm ${
                                            ratings[topic.id] === 0 
                                              ? 'btn-primary' 
                                              : ratings[topic.id] === undefined 
                                                ? 'btn-outline btn-ghost' // Unrated state
                                                : 'btn-outline'
                                          }`}
                                          onClick={() => handleRatingChange(topic.id, 0)}
                                        >
                                          Haven't Learned
                                        </button>
                                        <button
                                          type="button"
                                          className={`btn btn-sm ${
                                            ratings[topic.id] === -1 
                                              ? 'btn-neutral' 
                                              : ratings[topic.id] === undefined 
                                                ? 'btn-outline btn-ghost' // Unrated state
                                                : 'btn-outline'
                                          }`}
                                          onClick={() => handleRatingChange(topic.id, -1)}
                                        >
                                          Skip Topic
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/onboarding/slide-18")}
          className="text-gray-500 hover:text-gray-700 text-sm underline"
        >
          ← Back
        </button>
        
        <div className="flex items-center space-x-4">
          {isSaving && (
            <span className="text-sm text-gray-600">
              <span className="loading loading-spinner loading-xs"></span>
              Saving...
            </span>
          )}
          
          <button
            onClick={handleContinue}
            disabled={isLoading}
            className="bg-blue-500 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
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
