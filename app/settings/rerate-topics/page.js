"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import SupportModal from "@/components/SupportModal";
import FeedbackModal from "@/components/FeedbackModal";
import SidebarDevToolsLink from "@/components/SidebarDevToolsLink";
import toast from "react-hot-toast";
import config from "@/config";

function RerateTopicsPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [topics, setTopics] = useState([]);
  const [ratings, setRatings] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [subjectBoards, setSubjectBoards] = useState({});
  
  // Use ref to store timeouts per topic ID (fixes issue where changing one topic cancels another's save)
  const saveTimeoutsRef = useRef({});

  // Close sidebar when route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [searchParams, pathname]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimeoutsRef.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, []);

  useEffect(() => {
    // Check if dev mode (computed inline to avoid race conditions)
    const isDev = typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('.local')
    );

    // Wait for session to load
    if (status === 'loading') {
      return;
    }

    // In dev mode, always load (bypass authentication)
    if (isDev) {
      console.log('🔧 Dev mode: Loading topics without authentication check');
      loadUserSubjects();
      return;
    }

    // Check authentication
    if (status === 'unauthenticated') {
      console.log('⚠️ Not authenticated, redirecting to sign in');
      router.push('/api/auth/signin?callbackUrl=/settings/rerate-topics');
      return;
    }

    // Load topics if authenticated
    if (status === 'authenticated') {
      loadUserSubjects();
    }
  }, [status, router]);

  const loadUserSubjects = async () => {
    try {
      setIsLoading(true);
      
      // Get user data (subjects and boards)
      const userDataResponse = await fetch('/api/topics/get-user-data');
      if (!userDataResponse.ok) {
        console.error('Failed to load user data');
        setIsLoading(false);
        return;
      }
      
      const userData = await userDataResponse.json();
      if (!userData.success) {
        console.error('Failed to load user data:', userData.error);
        setIsLoading(false);
        return;
      }

      const subjects = userData.selectedSubjects || [];
      const boards = userData.subjectBoards || {};
      
      if (subjects.length === 0) {
        console.log('No subjects selected');
        setIsLoading(false);
        return;
      }

      setSelectedSubjects(subjects);
      setSubjectBoards(boards);

      // Load topics
      await loadTopics(subjects, boards);
      
      // Load existing ratings
      await loadRatings();
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading user subjects:', error);
      setIsLoading(false);
    }
  };

  const loadTopics = async (selectedSubjects, subjectBoards) => {
    try {
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
      const fetchPromises = selectedSubjects
        .filter(subject => subjectBoards[subject])
        .map(async (subject) => {
          const board = subjectBoards[subject];
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
    } catch (error) {
      console.error('Error loading topics:', error);
    }
  };

  const loadRatings = async () => {
    try {
      const response = await fetch('/api/topics/get-ratings');
      if (!response.ok) {
        console.error('Failed to load ratings');
        return;
      }
      
      const data = await response.json();
      if (data.success && data.ratings) {
        const initialRatings = {};
        data.ratings.forEach(rating => {
          initialRatings[rating.topic_id] = rating.rating;
        });
        setRatings(initialRatings);
      }
    } catch (error) {
      console.error('Error loading ratings:', error);
    }
  };

  const handleRatingChange = async (topicId, rating) => {
    setRatings(prev => ({
      ...prev,
      [topicId]: rating
    }));
    
    // Clear any existing timeout for this specific topic
    if (saveTimeoutsRef.current[topicId]) {
      clearTimeout(saveTimeoutsRef.current[topicId]);
      delete saveTimeoutsRef.current[topicId];
    }
    
    // Set a new timeout for this specific topic (auto-save after 1 second)
    saveTimeoutsRef.current[topicId] = setTimeout(() => {
      saveRating(topicId, rating);
      delete saveTimeoutsRef.current[topicId];
    }, 1000);
  };

  const saveRating = async (topicId, rating) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/topics/save-rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId, rating })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error saving rating:', errorData);
        toast.error('Failed to save rating');
        return;
      }
      
      const data = await response.json();
      if (data.success) {
        // Success - rating saved
      } else {
        toast.error(data.error || 'Failed to save rating');
      }
    } catch (error) {
      console.error('Error saving rating:', error);
      toast.error('Failed to save rating');
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
    
    // Save all ratings
    topics.forEach(item => {
      saveRating(item.topics.id, rating);
    });
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
        
        // Scroll to the subject card when opening
        if (!isCurrentlyOpen) {
          setTimeout(() => {
            const subjectElement = document.getElementById(`subject-${parentId}`);
            if (subjectElement) {
              const elementPosition = subjectElement.getBoundingClientRect().top + window.pageYOffset;
              const offsetPosition = elementPosition - 80; // 80px offset from top
              window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
              });
            }
          }, 100);
        }
        
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
        
        // Scroll to the main topic card when opening
        if (!isCurrentlyOpen) {
          setTimeout(() => {
            const mainTopicElement = document.getElementById(`main-topic-${parentId}`);
            if (mainTopicElement) {
              const elementPosition = mainTopicElement.getBoundingClientRect().top + window.pageYOffset;
              const offsetPosition = elementPosition - 80; // 80px offset from top
              window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
              });
            }
          }, 100);
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

  const groupedTopics = groupTopicsBySubject();
  const progress = getProgress();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <div className="text-center">
          <p className="text-lg text-brand-medium mb-4">No topics found. Please complete onboarding first.</p>
          <Link href="/onboarding/slide-1" className="btn btn-primary">
            Go to Onboarding
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100">
      {/* Menu Button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed top-6 left-6 z-50 inline-flex items-center justify-center rounded-md p-4 bg-base-200 hover:bg-base-300 transition shadow-lg"
        aria-label="Open menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="24px" height="24px" viewBox="0 0 24 24" className="w-8 h-8 text-base-content">
          <rect x="1" y="11" width="22" height="2" fill="currentColor" strokeWidth="0" data-color="color-2"></rect>
          <rect x="1" y="4" width="22" height="2" strokeWidth="0" fill="currentColor"></rect>
          <rect x="1" y="18" width="22" height="2" strokeWidth="0" fill="currentColor"></rect>
        </svg>
      </button>

      {/* Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-base-200 shadow-xl transform transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-5 border-b border-base-300">
            <h2 className="text-xl font-bold">Menu</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="btn btn-ghost btn-sm btn-circle"
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
          <nav className="flex-1 p-5">
            <ul className="space-y-2">
              <li>
                <Link
                  href="/plan"
                  className={`block px-4 py-3 rounded-lg transition ${
                    pathname === '/plan' 
                      ? 'text-white' 
                      : 'hover:bg-base-300'
                  }`}
                  style={pathname === '/plan' ? {
                    backgroundColor: config.colors.brand.primary
                  } : {}}
                  onClick={() => setSidebarOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📅</span>
                    <span className="font-medium">Revision Plan</span>
                  </div>
                </Link>
              </li>
              <li>
                <Link
                  href="/settings/rerate-topics"
                  className={`block px-4 py-3 rounded-lg transition ${
                    pathname === '/settings/rerate-topics' 
                      ? 'text-white' 
                      : 'hover:bg-base-300'
                  }`}
                  style={pathname === '/settings/rerate-topics' ? {
                    backgroundColor: config.colors.brand.primary
                  } : {}}
                  onClick={() => setSidebarOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">⭐</span>
                    <span className="font-medium">Rerate Topics</span>
                  </div>
                </Link>
              </li>
              <li>
                <Link
                  href="/insights"
                  className={`block px-4 py-3 rounded-lg transition ${
                    pathname === '/insights' 
                      ? 'text-white' 
                      : 'hover:bg-base-300'
                  }`}
                  style={pathname === '/insights' ? {
                    backgroundColor: config.colors.brand.primary
                  } : {}}
                  onClick={() => setSidebarOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📊</span>
                    <span className="font-medium">Study Stats</span>
                  </div>
                </Link>
              </li>
              <li>
                <Link
                  href="/settings/availability"
                  className={`block px-4 py-3 rounded-lg transition ${
                    pathname === '/settings/availability' 
                      ? 'text-white' 
                      : 'hover:bg-base-300'
                  }`}
                  style={pathname === '/settings/availability' ? {
                    backgroundColor: config.colors.brand.primary
                  } : {}}
                  onClick={() => setSidebarOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">⏰</span>
                    <span className="font-medium">Availability</span>
                  </div>
                </Link>
              </li>
              <SidebarDevToolsLink pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
              <li>
                <div>
                  <button
                    onClick={() => setSettingsDropdownOpen(!settingsDropdownOpen)}
                    className="w-full block px-4 py-3 rounded-lg transition hover:bg-base-300"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">⚙️</span>
                        <span className="font-medium">Settings</span>
                      </div>
                      <svg
                        className={`w-4 h-4 transition-transform ${settingsDropdownOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  
                  {settingsDropdownOpen && (
                    <ul className="ml-4 mt-2 space-y-1">
                      <li>
                        <button
                          onClick={() => {
                            setFeedbackModalOpen(true);
                            setSidebarOpen(false);
                          }}
                          className="block w-full text-left px-4 py-2 rounded-lg transition text-sm hover:bg-base-300"
                        >
                          Feedback
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            setSupportModalOpen(true);
                            setSidebarOpen(false);
                          }}
                          className="block w-full text-left px-4 py-2 rounded-lg transition text-sm hover:bg-base-300"
                        >
                          Support
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => {
                            setSidebarOpen(false);
                            signOut({ callbackUrl: '/' });
                          }}
                          className="w-full text-left block px-4 py-2 rounded-lg transition text-sm hover:bg-base-300 text-error"
                        >
                          Sign Out
                        </button>
                      </li>
                    </ul>
                  )}
                </div>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="text-center space-y-8 pt-10 pb-20 px-2 sm:px-6 pl-0 sm:pl-28">
        <div className="space-y-3 px-2 sm:px-0 pt-12 sm:pt-0 w-[92.5%] sm:w-auto mx-auto">
          <h1 className="text-5xl font-bold text-brand-dark">
            Re-Rate Your Confidence
          </h1>
          <p className="text-lg text-brand-medium max-w-2xl mx-auto">
            Update your confidence ratings for each topic. Your ratings help us adjust your revision plan and prioritize topics that need more practice.
          </p>
          
          <p className="text-sm text-brand-medium max-w-2xl mx-auto">
            Rate your confidence: <span className="font-semibold">1 (Very Weak)</span> to <span className="font-semibold">5 (Very Strong)</span>
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
                          <h2 className="text-xl font-bold text-brand-dark">
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
                      <div className="px-6 sm:px-8 py-6 sm:py-8 space-y-6">
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
                                <div className="p-6 sm:p-8">
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-7 gap-x-6 sm:gap-8">
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
                                              <h4 className={`font-semibold text-brand-dark flex-1 leading-tight text-xs sm:text-base break-words ${
                                                ratings[topic.id] === -2 ? 'line-through text-base-content/50' : ''
                                              }`}>
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
                                            
                                            {/* Content area - Standardized spacing, constrained within sub-topic card */}
                                            <div className="flex flex-col min-w-0">
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
                                                  {/* Rating Buttons - Grid layout, same block dimensions within each sub-topic */}
                                                  <div className="grid grid-cols-5 gap-2 sm:gap-2 mb-3 mt-1 w-full min-w-0">
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
                                                          onClick={() => handleRatingChange(topic.id, isSelected ? undefined : rating)}
                                                          className={`aspect-square w-full min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] rounded-lg sm:rounded-md font-bold text-lg sm:text-base flex items-center justify-center transition-colors ${
                                                            isSelected
                                                              ? 'scale-110 sm:scale-100 shadow-lg'
                                                              : 'hover:shadow-md'
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
      </div>

      {/* Support Modal */}
      <SupportModal
        isOpen={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
      />
      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
      />
    </div>
  );
}

export default function RerateTopicsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    }>
      <RerateTopicsPageContent />
    </Suspense>
  );
}
