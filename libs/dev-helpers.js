/**
 * Development Helper Functions
 * Available in browser console during development
 */

if (typeof window !== 'undefined') {
  // Quick localStorage viewer
  window.viewStorage = () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      try {
        data[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        data[key] = localStorage.getItem(key);
      }
    }
    console.table(data);
    console.log('Full data:', data);
    return data;
  };

  // Clear onboarding data
  window.clearOnboarding = () => {
    localStorage.removeItem('quizAnswers');
    console.log('✅ Onboarding data cleared');
    window.viewStorage();
  };

  // Clear all localStorage
  window.clearAll = () => {
    localStorage.clear();
    console.log('✅ All localStorage cleared');
  };

  // Navigate to any slide
  window.goToSlide = (num) => {
    window.location.href = `/onboarding/slide-${num}`;
  };

  // View current user session
  window.viewUser = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const session = await response.json();
      console.log('Current Session:', session);
      return session;
    } catch (error) {
      console.error('Error fetching session:', error);
    }
  };

  // View quiz answers
  window.viewQuizAnswers = () => {
    const answers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    console.log('Quiz Answers:', answers);
    console.table(answers);
    return answers;
  };

  // Set test subjects
  window.setTestSubjects = () => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    savedAnswers.selectedSubjects = ['maths', 'biology', 'chemistry'];
    savedAnswers.subjectBoards = {
      maths: 'aqa',
      biology: 'aqa',
      chemistry: 'aqa'
    };
    localStorage.setItem('quizAnswers', JSON.stringify(savedAnswers));
    console.log('✅ Test subjects set');
    window.viewQuizAnswers();
  };

  // Fill random ratings
  window.fillRandomRatings = () => {
    const savedAnswers = JSON.parse(localStorage.getItem('quizAnswers') || '{}');
    const topicRatings = savedAnswers.topicRatings || {};
    
    if (Object.keys(topicRatings).length === 0) {
      console.warn('⚠️ No topics found. Complete subject selection first.');
      return;
    }
    
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
    console.log(`✅ Generated ${topicIds.length} ratings: ${notCovered} not covered, ${rated} rated (1-5)`);
    return randomRatings;
  };

  // Log helper functions
  console.log('%c🛠️ Dev Helpers Loaded!', 'color: #10b981; font-weight: bold; font-size: 14px;');
  console.log('Available functions:');
  console.log('  - viewStorage() - View all localStorage');
  console.log('  - clearOnboarding() - Clear onboarding data');
  console.log('  - clearAll() - Clear all localStorage');
  console.log('  - goToSlide(num) - Navigate to slide');
  console.log('  - viewUser() - View current session');
  console.log('  - viewQuizAnswers() - View quiz answers');
  console.log('  - setTestSubjects() - Set test subjects');
  console.log('  - fillRandomRatings() - Fill random ratings');
}

