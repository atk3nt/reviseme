"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DevToolsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [isDev, setIsDev] = useState(false);
  const [storageData, setStorageData] = useState({});

  useEffect(() => {
    // Check if dev mode
    const dev = 
      typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('.local')
      );
    setIsDev(dev);
    updateStorageData();
  }, []);

  const updateStorageData = () => {
    if (typeof window === 'undefined') return;
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      try {
        data[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        data[key] = localStorage.getItem(key);
      }
    }
    setStorageData(data);
  };

  const showStatus = (message) => {
    setStatus(message);
    setTimeout(() => setStatus(""), 3000);
    updateStorageData();
  };

  // Clear all localStorage
  const clearLocalStorage = () => {
    localStorage.clear();
    showStatus("✅ localStorage cleared");
  };

  // Clear specific onboarding data
  const clearOnboarding = () => {
    localStorage.removeItem('quizAnswers');
    showStatus("✅ Onboarding data cleared");
  };

  // View current localStorage data
  const viewLocalStorage = () => {
    console.log('LocalStorage Data:', storageData);
    console.table(storageData);
    showStatus("✅ Check console for localStorage data");
  };

  // Fill random topic ratings
  const fillRandomRatings = () => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    
    // If no topics exist, need to load them first
    if (!savedAnswers.topicRatings || Object.keys(savedAnswers.topicRatings).length === 0) {
      showStatus("⚠️ No topics found. Complete subject selection first.");
      return;
    }
    
    const topicRatings = savedAnswers.topicRatings || {};
    const randomRatings = {};
    const topicIds = Object.keys(topicRatings);
    
    // Generate random ratings: 20% not covered (0), 80% rated with numbers (1-5)
    topicIds.forEach(topicId => {
      const rand = Math.random();
      if (rand < 0.2) {
        randomRatings[topicId] = 0; // Not covered / Haven't Learned (20%)
      } else {
        randomRatings[topicId] = Math.floor(Math.random() * 5) + 1; // 1-5 (80%)
      }
    });
    
    savedAnswers.topicRatings = randomRatings;
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    
    const notCovered = Object.values(randomRatings).filter(r => r === 0).length;
    const rated = Object.values(randomRatings).filter(r => r > 0).length;
    showStatus(`✅ Generated ${topicIds.length} ratings: ${notCovered} not covered, ${rated} rated (1-5)`);
  };

  // Set test subjects
  const setTestSubjects = () => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    savedAnswers.selectedSubjects = ['maths', 'biology', 'chemistry'];
    savedAnswers.subjectBoards = {
      maths: 'aqa',
      biology: 'aqa',
      chemistry: 'aqa'
    };
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    showStatus("✅ Test subjects set (Maths, Biology, Chemistry - AQA)");
  };

  // Set test time preferences
  const setTestTimePrefs = () => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    savedAnswers.timePreferences = {
      weekdayEarliest: '8:00',
      weekdayLatest: '22:00',
      useSameWeekendTimes: true,
      weekendEarliest: '9:00',
      weekendLatest: '21:00'
    };
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    showStatus("✅ Test time preferences set");
  };

  // Set test blocked times (some example blocks)
  const setTestBlockedTimes = () => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    
    // Get next week's Monday
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const thisMonday = new Date(today.setDate(diff));
    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(thisMonday.getDate() + 7);
    
    // Block Tuesday 14:00-16:00 and Thursday 16:00-18:00
    const blockedTimes = [
      {
        start: new Date(nextMonday.getTime() + 24 * 60 * 60 * 1000 + 14 * 60 * 60 * 1000).toISOString(),
        end: new Date(nextMonday.getTime() + 24 * 60 * 60 * 1000 + 16 * 60 * 60 * 1000).toISOString()
      },
      {
        start: new Date(nextMonday.getTime() + 3 * 24 * 60 * 60 * 1000 + 16 * 60 * 60 * 1000).toISOString(),
        end: new Date(nextMonday.getTime() + 3 * 24 * 60 * 60 * 1000 + 18 * 60 * 60 * 1000).toISOString()
      }
    ];
    
    savedAnswers.blockedTimes = blockedTimes;
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    showStatus("✅ Test blocked times set (Tue 2-4pm, Thu 4-6pm)");
  };

  // Quick navigation
  const quickNav = [
    { label: "Onboarding Start", path: "/onboarding/slide-1" },
    { label: "Subject Selection", path: "/onboarding/slide-16" },
    { label: "Payment", path: "/onboarding/slide-17" },
    { label: "Topic Rating", path: "/onboarding/slide-19" },
    { label: "Time Preferences", path: "/onboarding/slide-20" },
    { label: "Block Times", path: "/onboarding/slide-21" },
    { label: "Summary", path: "/onboarding/slide-22" },
    { label: "Plan Page", path: "/plan" },
    { label: "Settings", path: "/settings/availability" },
  ];

  if (!isDev) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Dev Tools</h1>
          <p className="text-gray-600">Only available in development mode</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">🛠️ Dev Tools</h1>
        <p className="text-gray-600 mb-8">Development utilities and shortcuts</p>

        {status && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            {status}
          </div>
        )}

        {/* Quick Navigation */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Quick Navigation</h2>
          <div className="grid grid-cols-3 gap-2">
            {quickNav.map(item => (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* LocalStorage Management */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">LocalStorage Management</h2>
          <div className="space-y-2">
            <button
              onClick={viewLocalStorage}
              className="w-full px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-left transition-colors"
            >
              📋 View localStorage (console)
            </button>
            <button
              onClick={clearOnboarding}
              className="w-full px-4 py-2 bg-yellow-200 rounded hover:bg-yellow-300 text-left transition-colors"
            >
              🗑️ Clear Onboarding Data
            </button>
            <button
              onClick={clearLocalStorage}
              className="w-full px-4 py-2 bg-red-200 rounded hover:bg-red-300 text-left transition-colors"
            >
              ⚠️ Clear All localStorage
            </button>
          </div>
        </div>

        {/* Test Data Generation */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Data Generation</h2>
          <div className="space-y-2">
            <button
              onClick={setTestSubjects}
              className="w-full px-4 py-2 bg-purple-200 rounded hover:bg-purple-300 text-left transition-colors"
            >
              🎯 Set Test Subjects (Maths, Biology, Chemistry - AQA)
            </button>
            <button
              onClick={setTestTimePrefs}
              className="w-full px-4 py-2 bg-purple-200 rounded hover:bg-purple-300 text-left transition-colors"
            >
              ⏰ Set Test Time Preferences
            </button>
            <button
              onClick={setTestBlockedTimes}
              className="w-full px-4 py-2 bg-purple-200 rounded hover:bg-purple-300 text-left transition-colors"
            >
              🚫 Set Test Blocked Times
            </button>
            <button
              onClick={fillRandomRatings}
              className="w-full px-4 py-2 bg-purple-200 rounded hover:bg-purple-300 text-left transition-colors"
            >
              🎲 Fill Random Topic Ratings
            </button>
          </div>
        </div>

        {/* Current State */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Current State</h2>
          <div className="text-sm space-y-1 font-mono bg-gray-50 p-4 rounded overflow-auto max-h-64">
            <div><strong>Hostname:</strong> {typeof window !== 'undefined' ? window.location.hostname : 'N/A'}</div>
            <div><strong>Path:</strong> {typeof window !== 'undefined' ? window.location.pathname : 'N/A'}</div>
            <div><strong>LocalStorage Keys:</strong> {Object.keys(storageData).join(', ') || 'None'}</div>
            {storageData.quizAnswers && (
              <div className="mt-2 pt-2 border-t border-gray-300">
                <strong>Quiz Answers:</strong>
                <pre className="text-xs mt-1 overflow-auto">
                  {JSON.stringify(storageData.quizAnswers, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Helper Functions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Browser Console Helpers</h2>
          <p className="text-sm text-gray-600 mb-2">These functions are available in the browser console:</p>
          <div className="text-xs font-mono bg-gray-50 p-4 rounded space-y-1">
            <div><code>viewStorage()</code> - View all localStorage data</div>
            <div><code>clearOnboarding()</code> - Clear onboarding data</div>
            <div><code>goToSlide(19)</code> - Navigate to any slide</div>
            <div><code>viewUser()</code> - View current session</div>
          </div>
        </div>
      </div>
    </div>
  );
}

