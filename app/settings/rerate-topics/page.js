"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import SupportModal from "@/components/SupportModal";
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
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [subjectBoards, setSubjectBoards] = useState({});
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
      router.push('/api/auth/signin');
      return;
    }

    // Load topics if authenticated
    if (status === 'authenticated') {
      loadUserSubjects();
    }
  }, [status, isDev, router]);

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
            boards: [board]
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
    
    // Auto-save after a delay
    clearTimeout(window.autoSaveTimeout);
    window.autoSaveTimeout = setTimeout(() => {
      saveRating(topicId, rating);
    }, 1000);
  };

  const saveRating = async (topicId, rating) => {
    if (isSaving) return;
    
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
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <div className="text-center">
          <p className="text-lg text-gray-600 mb-4">No topics found. Please complete onboarding first.</p>
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
        className="fixed top-4 left-4 z-50 btn btn-ghost btn-circle"
        aria-label="Open menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="24px" height="24px" viewBox="0 0 24 24">
          <rect x="1" y="11" width="22" height="2" fill="#1c1f21" strokeWidth="0" data-color="color-2"></rect>
          <rect x="1" y="4" width="22" height="2" strokeWidth="0" fill="#1c1f21"></rect>
          <rect x="1" y="18" width="22" height="2" strokeWidth="0" fill="#1c1f21"></rect>
        </svg>
      </button>

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-base-200 shadow-xl transform transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-base-300">
            <h2 className="text-xl font-bold">Menu</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="btn btn-ghost btn-sm btn-circle"
            >
              ✕
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            <Link
              href="/plan"
              className={`block px-4 py-3 rounded-lg transition ${
                pathname === '/plan' 
                  ? 'bg-primary text-primary-content' 
                  : 'hover:bg-base-300'
              }`}
              onClick={() => setSidebarOpen(false)}
            >
              Revision Plan
            </Link>
            <Link
              href="/settings/rerate-topics"
              className={`block px-4 py-3 rounded-lg transition ${
                pathname === '/settings/rerate-topics' 
                  ? 'bg-primary text-primary-content' 
                  : 'hover:bg-base-300'
              }`}
              onClick={() => setSidebarOpen(false)}
            >
              Rerate Topics
            </Link>
            <Link
              href="/insights"
              className={`block px-4 py-3 rounded-lg transition ${
                pathname === '/insights' 
                  ? 'bg-primary text-primary-content' 
                  : 'hover:bg-base-300'
              }`}
              onClick={() => setSidebarOpen(false)}
            >
              Study Stats
            </Link>
            <Link
              href="/settings/availability"
              className={`block px-4 py-3 rounded-lg transition ${
                pathname === '/settings/availability' 
                  ? 'bg-primary text-primary-content' 
                  : 'hover:bg-base-300'
              }`}
              onClick={() => setSidebarOpen(false)}
            >
              Availability
            </Link>
            <div className="pt-4 border-t border-base-300">
              <button
                onClick={() => setSettingsDropdownOpen(!settingsDropdownOpen)}
                className={`w-full block px-4 py-3 rounded-lg transition ${
                  pathname?.startsWith('/settings') 
                    ? 'bg-primary text-primary-content' 
                    : 'hover:bg-base-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Settings</span>
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
                <div className="mt-2 space-y-1 pl-4">
                  <Link
                    href="/settings?section=preferences"
                    className={`block px-4 py-2 rounded-lg transition text-sm hover:bg-base-300 ${
                      pathname === '/settings' && searchParams?.get('section') === 'preferences' ? 'bg-primary/20' : ''
                    }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    Study Preferences
                  </Link>
                  <Link
                    href="/settings?section=account"
                    className={`block px-4 py-2 rounded-lg transition text-sm hover:bg-base-300 ${
                      pathname === '/settings' && searchParams?.get('section') === 'account' ? 'bg-primary/20' : ''
                    }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    Account Information
                  </Link>
                  <button
                    onClick={() => {
                      signOut({ callbackUrl: '/' });
                      setSidebarOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 rounded-lg transition text-sm hover:bg-base-300"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
            <div className="pt-4 border-t border-base-300">
              <button
                onClick={() => {
                  setSupportModalOpen(true);
                  setSidebarOpen(false);
                }}
                className="block w-full text-left px-4 py-3 rounded-lg transition hover:bg-base-300"
              >
                Support
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="text-center space-y-8 pt-8 pb-16">
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
                                      <>
                                        <div className="flex justify-center space-x-1 mb-2">
                                          {[1, 2, 3, 4, 5].map(rating => (
                                            <button
                                              key={rating}
                                              type="button"
                                              className={`btn btn-sm w-8 h-8 p-0 ${
                                                ratings[topic.id] === rating
                                                  ? rating <= 2 ? 'btn-error' : rating === 3 ? 'btn-info' : 'btn-success'
                                                  : ratings[topic.id] === undefined 
                                                    ? 'btn-outline btn-ghost'
                                                    : 'btn-outline'
                                              }`}
                                              onClick={() => handleRatingChange(topic.id, rating)}
                                            >
                                              {rating}
                                            </button>
                                          ))}
                                        </div>
                                        
                                        <div className="flex justify-center space-x-2">
                                          <button
                                            type="button"
                                            className={`btn btn-sm ${
                                              ratings[topic.id] === 0 
                                                ? 'btn-primary' 
                                                : ratings[topic.id] === undefined 
                                                  ? 'btn-outline btn-ghost'
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
                                                  ? 'btn-outline btn-ghost'
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

        {isSaving && (
          <div className="fixed bottom-4 right-4 bg-base-200 px-4 py-2 rounded-lg shadow-lg">
            <span className="text-sm text-gray-600">
              <span className="loading loading-spinner loading-xs"></span>
              Saving...
            </span>
          </div>
        )}
      </div>

      {/* Support Modal */}
      <SupportModal
        isOpen={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
      />
    </div>
  );
}

export default function RerateTopicsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    }>
      <RerateTopicsPageContent />
    </Suspense>
  );
}

