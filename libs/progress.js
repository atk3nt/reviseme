import { supabaseAdmin } from './supabase'

// Weighted progress calculation
export function calculateProgress(blocks) {
  const done = blocks.filter(b => b.status === 'done')
  const weights = done.map(b => {
    // Use user_topic_confidence.rating instead of topic.confidence
    const conf = b.user_topic_confidence?.rating || 3
    return conf <= 2 ? 1.3 : conf <= 3 ? 1.0 : 0.7
  })
  return weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / blocks.length * 100 : 0
}

// Grade prediction
export function predictGradeChange(weekBlocks) {
  let delta = 0
  weekBlocks.forEach(b => {
    if (b.status === 'done') {
      // Use user_topic_confidence.rating instead of topic.confidence
      const conf = b.user_topic_confidence?.rating || 3
      if (conf <= 2) delta += 0.12
      else if (conf === 3) delta += 0.08
      else delta += 0.05
    } else if (b.status === 'missed') {
      delta -= 0.10
    }
  })
  return Math.max(-0.5, Math.min(0.5, delta)) // cap at ±0.5
}

// Calculate streak
export function calculateStreak(blocks) {
  const sortedBlocks = blocks
    .filter(b => b.status === 'done')
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))

  if (sortedBlocks.length === 0) return 0

  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < sortedBlocks.length; i++) {
    const blockDate = new Date(sortedBlocks[i].completed_at)
    blockDate.setHours(0, 0, 0, 0)
    
    const daysDiff = Math.floor((today - blockDate) / (1000 * 60 * 60 * 24))
    
    if (i === 0) {
      if (daysDiff <= 1) {
        streak = 1
        today.setDate(today.getDate() - 1)
      } else {
        break
      }
    } else {
      const expectedDate = new Date(today)
      expectedDate.setDate(today.getDate() + 1)
      
      if (Math.abs(blockDate - expectedDate) < 24 * 60 * 60 * 1000) {
        streak++
        today.setDate(today.getDate() - 1)
      } else {
        break
      }
    }
  }

  return streak
}

// Get user stats
export async function getUserStats(userId) {
  const { data: stats } = await supabaseAdmin
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .single()

  return stats || {
    user_id: userId,
    blocks_done: 0,
    blocks_missed: 0,
    blocks_scheduled: 0,
    avg_confidence: 3,
    active_days: 0,
    last_activity: null
  }
}

// Update user stats after block completion
export async function updateUserStats(userId) {
  // This would typically be called after a block is marked as done/missed
  // The user_stats view should automatically update, but we can trigger a refresh
  const { data: blocks } = await supabaseAdmin
    .from('blocks')
    .select(`
      status,
      completed_at,
      user_topic_confidence!inner(rating)
    `)
    .eq('user_id', userId)

  if (blocks) {
    const stats = {
      blocks_done: blocks.filter(b => b.status === 'done').length,
      blocks_missed: blocks.filter(b => b.status === 'missed').length,
      blocks_scheduled: blocks.filter(b => b.status === 'scheduled').length,
      avg_confidence: blocks.reduce((sum, b) => sum + (b.user_topic_confidence?.rating || 3), 0) / blocks.length,
      active_days: new Set(blocks.filter(b => b.status === 'done').map(b => 
        new Date(b.completed_at).toDateString()
      )).size,
      last_activity: blocks
        .filter(b => b.completed_at)
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0]?.completed_at
    }

    return stats
  }

  return null
}


