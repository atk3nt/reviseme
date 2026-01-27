"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function DevPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(1);
  const [autoReload, setAutoReload] = useState(true);
  const [isDev, setIsDev] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const TOTAL_SLIDES = 12;
  
  // Valid slide numbers after removal (gaps in numbering)
  const VALID_SLIDES = [1, 2, 4, 5, 9, 16, 16.5, 17, 19, 20, 21, 22];

  // Check if we're in dev mode only after component mounts (prevents hydration mismatch)
  useEffect(() => {
    setIsMounted(true);
    const hostname = window.location.hostname;
    // Explicitly exclude production domain (app.reviseme.co and any reviseme.co subdomain)
    const isProduction = hostname === 'reviseme.co' || hostname.endsWith('.reviseme.co');
    const dev = !isProduction && (
      hostname === 'localhost' || 
      hostname === '127.0.0.1' ||
      hostname.includes('.local')
    );
    setIsDev(dev);
  }, []);

  // Extract current slide number from pathname
  useEffect(() => {
    const match = pathname?.match(/slide-(\d+(?:-\d+)?)/);
    if (match) {
      // Handle slide-16-5 case
      if (match[1] === '16-5') {
        setCurrentSlide(16.5);
      } else {
        setCurrentSlide(parseInt(match[1]));
      }
    }
  }, [pathname]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isMounted || !isDev) return;

    const handleKeyPress = (e) => {
      // Only work when not typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      // Toggle panel with ` key
      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      
      // Arrow keys to navigate (skip to next/prev valid slide)
      if (e.key === 'ArrowLeft') {
        const currentIndex = VALID_SLIDES.indexOf(currentSlide);
        if (currentIndex > 0) {
          const prevSlide = VALID_SLIDES[currentIndex - 1];
          const slideUrl = prevSlide === 16.5 ? '/onboarding/slide-16-5' : `/onboarding/slide-${prevSlide}`;
          router.push(slideUrl);
        }
      }
      if (e.key === 'ArrowRight') {
        const currentIndex = VALID_SLIDES.indexOf(currentSlide);
        if (currentIndex < VALID_SLIDES.length - 1) {
          const nextSlide = VALID_SLIDES[currentIndex + 1];
          const slideUrl = nextSlide === 16.5 ? '/onboarding/slide-16-5' : `/onboarding/slide-${nextSlide}`;
          router.push(slideUrl);
        }
      }
      
      // Number keys 1-9 to jump to slides (if valid)
      if (e.key >= '1' && e.key <= '9') {
        const slideNum = parseInt(e.key);
        if (VALID_SLIDES.includes(slideNum)) {
          router.push(`/onboarding/slide-${slideNum}`);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentSlide, router, isMounted, isDev]);

  // Auto-reload on file changes (polling Next.js dev server)
  useEffect(() => {
    if (!autoReload || !isMounted || !isDev) return;

    let lastReload = Date.now();
    const checkForChanges = async () => {
      try {
        // Check if Next.js dev server has recompiled
        const response = await fetch(window.location.href, { 
          method: 'HEAD',
          cache: 'no-cache'
        });
        
        // If we get a new response, reload after a short delay
        const now = Date.now();
        if (now - lastReload > 2000) { // Only reload if 2+ seconds have passed
          // Next.js Fast Refresh should handle this, but we can force reload for API changes
          // This is a fallback for when Fast Refresh doesn't catch everything
        }
      } catch (error) {
        // Ignore errors
      }
    };

    const interval = setInterval(checkForChanges, 1000);
    return () => clearInterval(interval);
  }, [autoReload, isMounted, isDev]);

  const goToSlide = (num) => {
    const slideUrl = num === 16.5 ? '/onboarding/slide-16-5' : `/onboarding/slide-${num}`;
    router.push(slideUrl);
    setIsOpen(false);
  };

  const quickReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  // Don't render until after mount to prevent hydration mismatch
  if (!isMounted || !isDev) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 bg-gray-800 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-mono hover:bg-gray-700 transition-colors"
        title="Press ` to toggle"
      >
        🛠️ Dev
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="fixed bottom-16 right-4 z-50 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 w-80 max-h-96 overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm">Dev Panel</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          {/* Current slide */}
          <div className="mb-3 text-xs text-gray-600">
            Slide {currentSlide} of {TOTAL_SLIDES}
          </div>

          {/* Quick navigation */}
          <div className="mb-3">
            <div className="text-xs font-semibold mb-2">Quick Nav:</div>
            <div className="grid grid-cols-5 gap-1">
              {VALID_SLIDES.map((num) => (
                <button
                  key={num}
                  onClick={() => goToSlide(num)}
                  className={`px-2 py-1 text-xs rounded ${
                    num === currentSlide
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                  title={`Slide ${num}`}
                >
                  {num === 16.5 ? '16.5' : num}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 border-t pt-2">
            <button
              onClick={quickReload}
              className="w-full text-left px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
            >
              🔄 Quick Reload
            </button>
            <label className="flex items-center text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={autoReload}
                onChange={(e) => setAutoReload(e.target.checked)}
                className="mr-2"
              />
              Auto-reload on changes
            </label>
          </div>

          {/* Keyboard shortcuts hint */}
          <div className="mt-3 pt-2 border-t text-xs text-gray-500">
            <div>⌨️ Shortcuts:</div>
            <div>← → Navigate</div>
            <div>1-9 Jump to slide</div>
            <div>` Toggle panel</div>
          </div>
        </div>
      )}
    </>
  );
}


