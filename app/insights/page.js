"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/libs/supabase";

export default function InsightsPage() {
  const [insights, setInsights] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadInsights();
    loadStats();
  }, []);

  const loadInsights = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: insightsData } = await supabase
        .from('user_insights')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (insightsData) {
        setInsights(insightsData);
      }
    } catch (error) {
      console.error('Error loading insights:', error);
    }
  };

  const loadStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: statsData } = await supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (statsData) {
        setStats(statsData);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getInsightTypeLabel = (type) => {
    switch (type) {
      case 'setup_summary': return 'Initial Assessment';
      case 'weekly_feedback': return 'Weekly Summary';
      case 'block_rationale': return 'Study Tip';
      default: return type;
    }
  };

  const getInsightTypeIcon = (type) => {
    switch (type) {
      case 'setup_summary': return '🎯';
      case 'weekly_feedback': return '📊';
      case 'block_rationale': return '💡';
      default: return '📝';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="mt-4">Loading your insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <div className="bg-base-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">Your Insights</h1>
          <p className="text-base-content/70">
            AI-powered feedback and progress tracking
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="stat bg-base-100 shadow-sm rounded-lg">
              <div className="stat-figure text-primary">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div className="stat-title">Blocks Completed</div>
              <div className="stat-value text-primary">{stats.blocks_done || 0}</div>
              <div className="stat-desc">Total revision sessions</div>
            </div>

            <div className="stat bg-base-100 shadow-sm rounded-lg">
              <div className="stat-figure text-secondary">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"></path>
                </svg>
              </div>
              <div className="stat-title">Active Days</div>
              <div className="stat-value text-secondary">{stats.active_days || 0}</div>
              <div className="stat-desc">Days with completed blocks</div>
            </div>

            <div className="stat bg-base-100 shadow-sm rounded-lg">
              <div className="stat-figure text-accent">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
              </div>
              <div className="stat-title">Avg Confidence</div>
              <div className="stat-value text-accent">{stats.avg_confidence ? stats.avg_confidence.toFixed(1) : 'N/A'}</div>
              <div className="stat-desc">Out of 5.0</div>
            </div>

            <div className="stat bg-base-100 shadow-sm rounded-lg">
              <div className="stat-figure text-info">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div className="stat-title">Last Activity</div>
              <div className="stat-value text-info text-sm">
                {stats.last_activity ? 
                  new Date(stats.last_activity).toLocaleDateString() : 
                  'Never'
                }
              </div>
              <div className="stat-desc">Most recent session</div>
            </div>
          </div>
        )}

        {/* AI Insights */}
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-6">AI Insights & Feedback</h2>
            
            {insights.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🤖</div>
                <h3 className="text-xl font-bold mb-2">No insights yet</h3>
                <p className="text-base-content/70">
                  Complete some revision blocks to start receiving AI-powered feedback and insights.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {insights.map(insight => (
                  <div key={insight.id} className="card bg-base-200 shadow-sm">
                    <div className="card-body">
                      <div className="flex items-start space-x-4">
                        <div className="text-2xl">
                          {getInsightTypeIcon(insight.insight_type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold">
                              {getInsightTypeLabel(insight.insight_type)}
                            </h3>
                            <span className="text-sm text-base-content/50">
                              {new Date(insight.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="prose prose-sm max-w-none">
                            <p className="whitespace-pre-wrap">{insight.content}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


