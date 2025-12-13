/**
 * Assign prioritized topics into available slots using a spaced repetition rule set.
 * Topics with lower confidence ratings receive more sessions spaced across different days.
 */

const SESSION_CONFIG = {
  1: { sessions: 3, gapDays: [2, 3], type: 'revision' }, // After session 1: +2 days (day 2), after session 2: +3 days (day 5)
  2: { sessions: 2, gapDays: [2], type: 'revision' }, // After session 1: +2 days (day 2)
  3: { sessions: 1, gapDays: [0], type: 'revision' },
  4: { sessions: 1, gapDays: [0], type: 'exam' },
  5: { sessions: 1, gapDays: [0], type: 'exam' }
};

const BREAK_CONFIG = {
  // Proportional breaks based on study duration
  breakAfterShortStudy: 1,          // 1 slot (30 min) after 1-1.5 hours (2-3 blocks)
  breakAfterMediumStudy: 2,         // 2 slots (1 hour) after 2-3 hours (4-6 blocks)
  breakAfterLongStudy: 3,           // 3 slots (1.5 hours) after 4.5+ hours (9+ blocks)
  
  // Breaks between clusters (based on number of clusters placed)
  breakAfterFirstCluster: 1,        // 1 slot (30 min) after first cluster
  breakAfterSecondCluster: 2,       // 2 slots (1 hour) after second cluster
  breakAfterThirdCluster: 3,        // 3 slots (1.5 hours) after third+ cluster
  
  // Special breaks
  lunchBreakDuration: 2,            // 2 slots (1 hour) for lunch around 12-1pm
  lunchBreakStartSlot: 12,          // Around slot 12 (12:00 PM) - adjust based on your slot timing
  
  // Limits
  maxConsecutiveStudySlots: 9,      // Max 9 slots (4.5 hours) before requiring 1.5 hour break
  maxTotalStudySlotsPerDay: 16,     // Max 16 slots (8 hours) total study per day
};

function getSessionConfig(rating = 3) {
  const bucket = Math.max(1, Math.min(5, Number(rating) || 3));
  return SESSION_CONFIG[bucket];
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function formatMinutesToTime(totalMinutes = 0) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function buildMetadata({ topic, sessionNumber, sessionTotal, sessionType }) {
  const label = sessionType === 'exam'
    ? 'Exam Practice'
    : `Revision Block ${sessionNumber}/${sessionTotal}`;

  const explanation = sessionType === 'exam'
    ? `High confidence rating (${topic.rating}). Scheduled exam-practice session to keep knowledge sharp.`
    : `Confidence rating ${topic.rating}. This is spaced repetition block ${sessionNumber} of ${sessionTotal} to reinforce learning.`;

  return {
    version: 'spaced_repetition_v1',
    topicId: topic.id,
    topicTitle: topic.title,
    rating: topic.rating,
    sessionNumber,
    sessionTotal,
    sessionType,
    label,
    explanation
  };
}

/**
 * Calculate optimal cluster configuration for a given number of blocks.
 * Prefers clusters of 3, uses clusters of 2 when needed, allows singles.
 * 
 * @param {number} totalBlocks - Total number of blocks to schedule
 * @returns {Array<number>} Array of cluster sizes, e.g., [3, 3, 2] for 8 blocks
 */
function calculateOptimalClusters(totalBlocks) {
  if (totalBlocks <= 0) return [];
  
  // Priority: 3s > 2s > 1s
  if (totalBlocks === 1) return [1];
  if (totalBlocks === 2) return [2];
  if (totalBlocks === 3) return [3];
  if (totalBlocks === 4) return [3, 1]; // Allow [3, 1] instead of [2, 2]
  
  // For 5+: use as many 3s as possible, then 2s, then 1s
  const clustersOf3 = Math.floor(totalBlocks / 3);
  const remainder = totalBlocks % 3;
  
  if (remainder === 0) {
    // Divisible by 3: all clusters of 3
    return Array(clustersOf3).fill(3);
  } else if (remainder === 1) {
    // One extra: allow single block
    // e.g., 7 blocks: [3, 3, 1]
    // e.g., 10 blocks: [3, 3, 3, 1]
    return Array(clustersOf3).fill(3).concat([1]);
  } else {
    // Two extra: add one cluster of 2
    // e.g., 8 blocks: [3, 3, 2]
    return Array(clustersOf3).fill(3).concat([2]);
  }
}

/**
 * Calculate the required break duration before placing the next cluster.
 * Simplified: always use 1 slot (30 min) break between clusters.
 * 
 * @param {number} clusterSize - Size of the cluster about to be placed
 * @param {number} clustersPlaced - Number of clusters already placed today
 * @param {number} totalBlocksScheduled - Total blocks scheduled so far today
 * @param {Date|null} nextSlotStartTime - Start time of the slot we're considering (null if not available)
 * @returns {number} Number of slots to use as break (0 = no break needed)
 */
function calculateBreakDuration(clusterSize, clustersPlaced, totalBlocksScheduled, nextSlotStartTime) {
  // No break before first cluster
  if (clustersPlaced === 0) return 0;
  
  // Simple: always 1 slot (30 min) break between clusters
  return 1;
}

/**
 * Find consecutive available slots starting from a given index, respecting break requirements.
 * 
 * @param {Array} daySlots - All slots for the day
 * @param {number} clusterSize - Number of consecutive slots needed
 * @param {number} startFromIndex - Index to start searching from
 * @param {Set} usedSlotIndices - Set of slot indices already used
 * @param {number|null} lastClusterEndIndex - Index of the last slot in the previous cluster (null if first cluster)
 * @param {number} minBreakSlots - Minimum number of slots to leave as break
 * @returns {{index: number|null, slotStartTime: Date|null}} Starting index and slot time if found, null otherwise
 */
function findConsecutiveSlotsWithBreak(daySlots, clusterSize, startFromIndex, usedSlotIndices, lastClusterEndIndex, minBreakSlots) {
  // Try with exact break first, then progressively relax if needed
  // This ensures we still place blocks even if perfect breaks aren't possible
  for (let breakAttempt = minBreakSlots; breakAttempt >= 0; breakAttempt--) {
    const searchStart = lastClusterEndIndex !== null 
      ? Math.max(startFromIndex, lastClusterEndIndex + breakAttempt + 1)
      : startFromIndex;
    
    for (let i = searchStart; i <= daySlots.length - clusterSize; i++) {
      // Check if we have clusterSize consecutive unused slots
      let allAvailable = true;
      for (let j = 0; j < clusterSize; j++) {
        if (usedSlotIndices.has(i + j)) {
          allAvailable = false;
          break;
        }
      }
      if (allAvailable && daySlots[i] && daySlots[i].startDate) {
        return { index: i, slotStartTime: daySlots[i].startDate };
      }
    }
  }
  return { index: null, slotStartTime: null };
}

/**
 * Find consecutive available slots starting from a given index.
 * 
 * @param {Array} daySlots - All slots for the day
 * @param {number} clusterSize - Number of consecutive slots needed
 * @param {number} startFromIndex - Index to start searching from
 * @param {Set} usedSlotIndices - Set of slot indices already used
 * @returns {number|null} Starting index if found, null otherwise
 */
function findConsecutiveSlots(daySlots, clusterSize, startFromIndex, usedSlotIndices) {
  for (let i = startFromIndex; i <= daySlots.length - clusterSize; i++) {
    // Check if we have clusterSize consecutive unused slots
    let allAvailable = true;
    for (let j = 0; j < clusterSize; j++) {
      if (usedSlotIndices.has(i + j)) {
        allAvailable = false;
        break;
      }
    }
    if (allAvailable) {
      return i;
    }
  }
  return null;
}

/**
 * @param {Array<{ day: string, start_time: string, duration_minutes: number, startDate: Date, endDate: Date }>} slots
 * @param {Array<{ id: string, title: string, subject: string, examBoard: string, orderIndex: number, rating: number, priorityIndex: number, isMissed: boolean }>} topics
 * @param {Object} ongoingTopics - { topicId: { sessionsScheduled: number, sessionsRequired: number, lastSessionDate: Date } }
 * @returns {Array}
 */
export function assignTopicsToSlots(slots = [], topics = [], ongoingTopics = {}) {
  try {
    if (!Array.isArray(slots) || slots.length === 0 || !Array.isArray(topics) || topics.length === 0) {
      return [];
    }
    
    // Log input for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 assignTopicsToSlots called with:', {
        slotsCount: slots.length,
        topicsCount: topics.length,
        firstSlot: slots[0] ? {
          hasStartDate: !!slots[0].startDate,
          startDateType: typeof slots[0].startDate,
          startDateIsDate: slots[0].startDate instanceof Date,
          slot: slots[0]
        } : 'no slots'
      });
    }

  // Additional validation - slots should already be validated, but double-check
  const validSlots = slots.filter(slot => {
    if (!slot || typeof slot !== 'object') return false;
    if (!slot.startDate || !(slot.startDate instanceof Date) || isNaN(slot.startDate.getTime())) {
      console.warn('⚠️ assignTopicsToSlots: Invalid slot (missing/invalid startDate):', slot);
      return false;
    }
    if (!slot.endDate || !(slot.endDate instanceof Date) || isNaN(slot.endDate.getTime())) {
      console.warn('⚠️ assignTopicsToSlots: Invalid slot (missing/invalid endDate):', slot);
      return false;
    }
    return true;
  });
  
  if (validSlots.length === 0) {
    console.warn('⚠️ assignTopicsToSlots: No valid slots found after validation');
    return [];
  }

  if (validSlots.length !== slots.length) {
    console.warn(`⚠️ assignTopicsToSlots: Filtered out ${slots.length - validSlots.length} invalid slots`);
  }

  const sortedSlots = [...validSlots].sort((a, b) => {
    try {
      return a.startDate.getTime() - b.startDate.getTime();
    } catch (error) {
      console.error('❌ Error sorting slots:', error, { slotA: a, slotB: b });
      return 0;
    }
  });

  // Calculate week boundaries from slots
  const weekStartDate = sortedSlots[0]?.startDate;
  const lastSlot = sortedSlots[sortedSlots.length - 1];
  const weekEndDate = lastSlot?.endDate || lastSlot?.startDate;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('📅 Week boundaries:', {
      weekStart: weekStartDate?.toISOString()?.split('T')[0],
      weekEnd: weekEndDate?.toISOString()?.split('T')[0]
    });
  }

  // Helper: Check if a topic's all sessions can fit within the week
  // given a potential first session date, respecting gap days between sessions
  //
  // Example for Rating 1 (3 sessions, gaps [2, 3]):
  // - Session 1 on Monday (day 0)
  // - Session 2 on Wednesday (day 0 + 2 = day 2)
  // - Session 3 on Saturday (day 2 + 3 = day 5)
  // Total span = 5 days, so first session must be Mon or Tue to fit in Mon-Sun week
  const canFitAllSessionsInWeek = (config, firstSessionDate, topicTitle = '') => {
    if (!weekEndDate || !firstSessionDate) return true; // Safety fallback
    
    const sessionsNeeded = config.sessions;
    const gapDays = config.gapDays || [];
    
    // If only 1 session needed, it always fits
    if (sessionsNeeded <= 1) return true;
    
    // Calculate total days needed from first to last session
    // by summing all gap days
    let totalDaysNeeded = 0;
    for (let i = 0; i < sessionsNeeded - 1; i++) {
      totalDaysNeeded += gapDays[i] || 1; // Default to 1 day gap if not specified
    }
    
    // Calculate when the last session would be
    const lastSessionDate = addDays(firstSessionDate, totalDaysNeeded);
    
    // Check if last session would be within the week (before or on Sunday end of day)
    const weekEndOfDay = new Date(weekEndDate);
    weekEndOfDay.setUTCHours(23, 59, 59, 999);
    
    const fits = lastSessionDate <= weekEndOfDay;
    
    if (!fits && process.env.NODE_ENV === 'development') {
      console.log(`⏭️ Skipping topic "${topicTitle?.substring(0, 30)}..." - sessions would overflow week (first: ${firstSessionDate.toISOString().split('T')[0]}, last would be: ${lastSessionDate.toISOString().split('T')[0]}, week ends: ${weekEndOfDay.toISOString().split('T')[0]}, needs ${totalDaysNeeded} days span)`);
    }
    
    return fits;
  };

  const topicStates = topics.map((topic, index) => {
    const config = getSessionConfig(topic.rating);
    
    // Check if this topic is ongoing (continuing from previous week)
    const ongoing = ongoingTopics[topic.id];
    
    let sessionsScheduled = 0;
    let sessionsRequired = config.sessions;
    let nextAvailableDate = new Date(0); // epoch – available immediately
    
    if (ongoing) {
      // Continue from where we left off
      sessionsScheduled = ongoing.sessionsScheduled || 0;
      sessionsRequired = ongoing.sessionsRequired || config.sessions;
      
      // Calculate next available date based on last session and gap days
      if (ongoing.lastSessionDate) {
        const lastSessionDate = new Date(ongoing.lastSessionDate);
        const gapIndex = sessionsScheduled - 1; // Gap after the last scheduled session
        const nextGap = (gapIndex >= 0 && gapIndex < config.gapDays.length) 
          ? config.gapDays[gapIndex] 
          : 1;
        nextAvailableDate = addDays(lastSessionDate, Math.max(1, nextGap));
      }
    }

    return {
      ...topic,
      orderIndex: topic.orderIndex ?? index,
      priorityIndex: topic.priorityIndex ?? index,
      sessionsRequired,
      gapDays: config.gapDays,
      sessionType: config.type,
      sessionsScheduled,
      nextAvailableDate
    };
  });

  // Group slots by day for clustering
  const slotsByDay = {};
  sortedSlots.forEach(slot => {
    try {
      if (!slot || !slot.startDate) {
        console.warn('⚠️ Skipping slot with missing startDate in grouping:', slot);
        return;
      }
      if (!(slot.startDate instanceof Date) || isNaN(slot.startDate.getTime())) {
        console.warn('⚠️ Skipping slot with invalid startDate in grouping:', slot);
        return;
      }
      const dayKey = slot.startDate.toISOString().split('T')[0];
      if (!slotsByDay[dayKey]) {
        slotsByDay[dayKey] = [];
      }
      slotsByDay[dayKey].push(slot);
    } catch (error) {
      console.error('❌ Error grouping slot by day:', error, { slot });
    }
  });

  // Calculate total blocks needed and available slots for proportional distribution
  const totalBlocksNeeded = topicStates.reduce((sum, topic) => sum + topic.sessionsRequired, 0);
  let totalAvailableSlots = 0;
  Object.values(slotsByDay).forEach(daySlots => {
    totalAvailableSlots += daySlots.length;
  });
  
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 assignTopicsToSlots:', {
      totalTopics: topicStates.length,
      totalBlocksNeeded,
      totalAvailableSlots,
      daysWithSlots: Object.keys(slotsByDay).length,
      topicsBreakdown: topicStates.map(t => ({
        id: t.id,
        title: t.title,
        rating: t.rating,
        sessionsRequired: t.sessionsRequired,
        sessionsScheduled: t.sessionsScheduled
      }))
    });
  }

  // Calculate proportional distribution per day
  const dayStats = {};
  Object.keys(slotsByDay).forEach(dayKey => {
    const daySlotCount = slotsByDay[dayKey].length;
    const proportion = totalAvailableSlots > 0 ? daySlotCount / totalAvailableSlots : 0;
    let targetBlocks = Math.round(totalBlocksNeeded * proportion);
    
    // Prefer clustering (3+ blocks) but allow smaller groups if needed
    // Don't skip days entirely - allow at least 1 block if there are slots available
    if (targetBlocks === 0 && daySlotCount > 0) {
      // If proportional distribution gives 0 but day has slots, assign at least 1
      targetBlocks = Math.min(1, daySlotCount);
    }
    
    // Allow any number of blocks (not just 3+) - clustering is preferred but not required
    dayStats[dayKey] = {
      slots: slotsByDay[dayKey],
      targetBlocks: targetBlocks > 0 ? Math.min(targetBlocks, daySlotCount) : 0,
      scheduledBlocks: 0
    };
  });

  // Redistribute any blocks from skipped days
  const totalAssigned = Object.values(dayStats).reduce((sum, day) => sum + day.targetBlocks, 0);
  const remainingBlocks = totalBlocksNeeded - totalAssigned;
  
  if (remainingBlocks > 0 && totalAssigned > 0) {
    // Redistribute to any days that have available slots (not just those with 3+)
    const eligibleDays = Object.keys(dayStats).filter(dayKey => {
      const dayData = dayStats[dayKey];
      return dayData.slots.length > dayData.targetBlocks; // Has available slots
    });
    
    if (eligibleDays.length > 0) {
      const redistributionPerDay = Math.floor(remainingBlocks / eligibleDays.length);
      eligibleDays.forEach(dayKey => {
        const dayData = dayStats[dayKey];
        // Can add more blocks if slots available
        const currentTarget = dayData.targetBlocks || 0;
        const maxPossible = Math.min(dayData.slots.length, currentTarget + redistributionPerDay);
        dayData.targetBlocks = maxPossible > 0 ? maxPossible : 0;
      });
    }
  }
  
  // Note: We allow single blocks as last resort, but they'll be filtered if first/last
  // No need to redistribute single blocks - they'll be handled during cluster assignment

  const weeklyPlan = [];
  // Process each day separately to create clusters
  const sortedDays = Object.keys(slotsByDay).sort();
  
  if (process.env.NODE_ENV === 'development') {
    console.log('📅 Day distribution:', Object.keys(dayStats).map(dayKey => ({
      day: dayKey,
      targetBlocks: dayStats[dayKey].targetBlocks,
      availableSlots: dayStats[dayKey].slots.length
    })));
  }
  
  for (const dayKey of sortedDays) {
    const dayData = dayStats[dayKey];
    const daySlots = dayData.slots;
    let targetBlocks = dayData.targetBlocks;
    
    // Skip days with no target blocks or no slots
    if (targetBlocks === 0 || daySlots.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`⏭️ Skipping ${dayKey}: targetBlocks=${targetBlocks}, slots=${daySlots.length}`);
      }
      continue;
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`📆 Processing ${dayKey}: targetBlocks=${targetBlocks}, availableSlots=${daySlots.length}`);
    }
    
    // Track which topics have been scheduled on this day to prevent duplicates
    const topicsScheduledToday = new Set();
    const usedSlotIndices = new Set(); // Track which slot indices have been used
    
    // Calculate cluster configuration for this day
    let clusterConfig = calculateOptimalClusters(targetBlocks);
    
    // Track cluster placement for break management
    let lastClusterEndIndex = null;
    let clustersPlaced = 0;
    let searchStartIndex = 0;
    
    for (const clusterSize of clusterConfig) {
      // Try to find a slot to check lunch time - use first available slot from searchStartIndex
      let nextSlotStartTime = null;
      for (let checkIdx = searchStartIndex; checkIdx < daySlots.length && checkIdx < searchStartIndex + 5; checkIdx++) {
        if (!usedSlotIndices.has(checkIdx) && daySlots[checkIdx] && daySlots[checkIdx].startDate) {
          nextSlotStartTime = daySlots[checkIdx].startDate;
          break;
        }
      }
      
      // Calculate required break duration before this cluster
      const minBreakSlots = calculateBreakDuration(
        clusterSize, 
        clustersPlaced, 
        dayData.scheduledBlocks, 
        nextSlotStartTime
      );
      
      // Find consecutive slots for this cluster with break enforcement
      const slotResult = findConsecutiveSlotsWithBreak(
        daySlots, 
        clusterSize, 
        searchStartIndex, 
        usedSlotIndices,
        lastClusterEndIndex,
        minBreakSlots
      );
      
      let clusterStartIndex = slotResult.index;
      
      // If couldn't find with breaks, try without breaks
      if (clusterStartIndex === null) {
        const noBreakSearchStart = lastClusterEndIndex !== null 
          ? Math.max(searchStartIndex, lastClusterEndIndex + 1)
          : searchStartIndex;
        const noBreakResult = findConsecutiveSlots(daySlots, clusterSize, noBreakSearchStart, usedSlotIndices);
        
        if (noBreakResult !== null) {
          clusterStartIndex = noBreakResult;
        } else {
          // Couldn't find cluster - skip to next cluster
          continue;
        }
      }
      
      // Assign clusterSize blocks consecutively starting at clusterStartIndex
      // Track blocks actually placed to ensure we never exceed clusterSize
      let blocksPlacedInCluster = 0;
      for (let i = 0; i < daySlots.length && blocksPlacedInCluster < clusterSize && dayData.scheduledBlocks < targetBlocks; i++) {
        const slotIndex = clusterStartIndex + i;
        
        // Don't go beyond the cluster boundary
        if (slotIndex >= clusterStartIndex + clusterSize) {
          break; // We've checked all slots in this cluster
        }
        
        const slot = daySlots[slotIndex];
        
        // Validate slot exists before using it
        if (!slot || !slot.startDate) {
          console.warn(`⚠️ Slot at index ${slotIndex} is undefined or missing startDate. Skipping.`);
          continue; // Skip this slot but keep looking for more slots in this cluster
        }
        
        const availableTopics = topicStates
          .filter((topic) => {
            // Basic checks
            if (topic.sessionsScheduled >= topic.sessionsRequired) return false;
            if (topic.nextAvailableDate && slot.startDate < topic.nextAvailableDate) return false;
            if (topicsScheduledToday.has(topic.id)) return false;
            
            // NEW: For topics that haven't started yet (session 0), check if ALL sessions can fit in the week
            if (topic.sessionsScheduled === 0) {
              const config = getSessionConfig(topic.rating);
              if (!canFitAllSessionsInWeek(config, slot.startDate, topic.title)) {
                // This topic's sessions would overflow into next week - skip it
                return false;
              }
            }
            
            return true;
          });

        // If no available topics, skip this slot - DO NOT fall back to topics that would overflow
        if (availableTopics.length === 0) {
          continue; // Skip this slot but keep looking for more slots in this cluster
        }

        const candidates = availableTopics
          .sort((a, b) => {
            // Missed topics (priorityIndex = -1) always come first
            if (a.priorityIndex === -1 && b.priorityIndex !== -1) return -1;
            if (a.priorityIndex !== -1 && b.priorityIndex === -1) return 1;
            
            if (a.priorityIndex !== b.priorityIndex) {
              return a.priorityIndex - b.priorityIndex;
            }
            if (a.sessionsScheduled !== b.sessionsScheduled) {
              return a.sessionsScheduled - b.sessionsScheduled;
            }
            return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
          });

        const topic = candidates[0];
        const sessionNumber = topic.sessionsScheduled + 1;
        const sessionTotal = topic.sessionsRequired;
        const metadata = buildMetadata({
          topic,
          sessionNumber,
          sessionTotal,
          sessionType: topic.sessionType
        });

        const block = {
          day: slot.day,
          start_time: slot.start_time,
          duration_minutes: slot.duration_minutes,
          subject: topic.subject,
          topic_id: topic.id,
          topic_name: topic.title,
          exam_board: topic.examBoard,
          rating: topic.rating,
          scheduled_at: slot.startDate.toISOString(),
          end_at: slot.endDate.toISOString(),
          slotIndex: slot.slotIndex,
          session_number: sessionNumber,
          session_total: sessionTotal,
          session_type: topic.sessionType,
          session_label: metadata.label,
          ai_rationale: JSON.stringify(metadata)
        };
        
        weeklyPlan.push(block);
        topicsScheduledToday.add(topic.id);
        usedSlotIndices.add(slotIndex);
        topic.sessionsScheduled += 1;
        dayData.scheduledBlocks += 1;
        blocksPlacedInCluster += 1; // Track blocks actually placed in this cluster

        if (topic.sessionsScheduled >= topic.sessionsRequired) {
          topic.nextAvailableDate = null;
        } else {
          const gapIndex = topic.sessionsScheduled - 1;
          const nextGap = (gapIndex >= 0 && gapIndex < topic.gapDays.length) 
            ? topic.gapDays[gapIndex] 
            : 1;
          topic.nextAvailableDate = addDays(slot.startDate, Math.max(1, nextGap));
        }
      }
      
      // Calculate break needed AFTER this cluster
      // Break is based on total blocks scheduled AFTER this cluster is placed
      const breakDuration = calculateBreakDuration(
        clusterSize,
        clustersPlaced + 1, // +1 because we just placed this cluster
        dayData.scheduledBlocks, // Total blocks after this cluster
        null // We'll calculate next slot time below
      );
      
      // Find the next slot after the cluster to check if it's lunch time
      const clusterEndIndex = clusterStartIndex + clusterSize - 1;
      let nextSlotAfterCluster = null;
      for (let checkIdx = clusterEndIndex + 1; checkIdx < daySlots.length && checkIdx < clusterEndIndex + 5; checkIdx++) {
        if (!usedSlotIndices.has(checkIdx) && daySlots[checkIdx] && daySlots[checkIdx].startDate) {
          nextSlotAfterCluster = daySlots[checkIdx].startDate;
          break;
        }
      }
      
      // Recalculate break with actual next slot time (for lunch detection)
      const actualBreakDuration = nextSlotAfterCluster 
        ? calculateBreakDuration(
            clusterSize,
            clustersPlaced + 1,
            dayData.scheduledBlocks,
            nextSlotAfterCluster
          )
        : breakDuration;
      
      // Insert break blocks if needed (and if there are more clusters coming)
      if (actualBreakDuration > 0 && clusterConfig.length > clustersPlaced + 1) {
        // There are more clusters coming, so we need a break
        for (let i = 0; i < actualBreakDuration; i++) {
          const breakSlotIndex = clusterEndIndex + 1 + i;
          
          // Check if we have enough slots for the break
          if (breakSlotIndex >= daySlots.length) {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`⚠️ Not enough slots for full break. Need ${actualBreakDuration}, only have ${daySlots.length - clusterEndIndex - 1} slots remaining.`);
            }
            break; // Can't insert full break, but continue
          }
          
          const breakSlot = daySlots[breakSlotIndex];
          
          if (!breakSlot || !breakSlot.startDate) {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`⚠️ Break slot at index ${breakSlotIndex} is invalid. Skipping break block.`);
            }
            continue;
          }
          
          // Create break block
          const breakBlock = {
            day: breakSlot.day,
            start_time: breakSlot.start_time,
            duration_minutes: breakSlot.duration_minutes,
            subject: null,
            topic_id: null, // Break blocks have null topic_id
            topic_name: 'Break',
            exam_board: null,
            rating: 0,
            scheduled_at: breakSlot.startDate.toISOString(),
            end_at: breakSlot.endDate.toISOString(),
            slotIndex: breakSlot.slotIndex,
            session_number: 0,
            session_total: 0,
            session_type: 'break',
            session_label: 'Break',
            ai_rationale: JSON.stringify({
              version: 'spaced_repetition_v1',
              topicId: null,
              topicTitle: 'Break',
              rating: 0,
              sessionNumber: 0,
              sessionTotal: 0,
              sessionType: 'break',
              label: 'Break',
              explanation: 'Break between study sessions'
            })
          };
          
          weeklyPlan.push(breakBlock);
          usedSlotIndices.add(breakSlotIndex);
          // Note: break blocks don't count toward scheduledBlocks (they're breaks, not study)
        }
        
        // Update lastClusterEndIndex to account for cluster + break
        lastClusterEndIndex = clusterEndIndex + actualBreakDuration;
        searchStartIndex = clusterEndIndex + actualBreakDuration + 1;
      } else {
        // No break needed (first cluster) or no more clusters coming
        lastClusterEndIndex = clusterEndIndex;
        searchStartIndex = clusterEndIndex + 1;
      }
      
      // Update tracking variables after successfully placing cluster
      clustersPlaced += 1;
    }

    // After the cluster loop, ensure we've scheduled all target blocks
    // If we still have blocks to schedule, fill them but respect cluster boundaries (max 3 consecutive)
    if (dayData.scheduledBlocks < targetBlocks) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`⚠️ ${dayKey}: Only scheduled ${dayData.scheduledBlocks}/${targetBlocks} blocks. Filling remaining...`);
      }
      
      // Track consecutive blocks to ensure we never exceed 3 in a cluster
      let consecutiveBlocksPlaced = 0;
      let lastPlacedIndex = -1;
      
      // Fill remaining blocks - but respect cluster boundaries (max 3 consecutive)
      for (let i = searchStartIndex; i < daySlots.length && dayData.scheduledBlocks < targetBlocks; i++) {
        if (usedSlotIndices.has(i)) {
          // Reset consecutive counter if we hit a used slot (gap/break/break block)
          // This means there's already something there, so our consecutive chain is broken
          if (lastPlacedIndex !== -1) {
            consecutiveBlocksPlaced = 0;
          }
          continue;
        }
        
        // Don't place more than 3 consecutive blocks - skip this slot to create a break
        if (consecutiveBlocksPlaced >= 3) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`⚠️ ${dayKey}: Reached max cluster size (3 blocks). Skipping slot ${i} to create break.`);
          }
          consecutiveBlocksPlaced = 0; // Reset counter for next cluster
          continue;
        }
        
        const slot = daySlots[i];
        
        // Validate slot exists before using it
        if (!slot || !slot.startDate) {
          console.warn(`⚠️ Slot at index ${i} is undefined or missing startDate. Skipping.`);
          continue;
        }
        
        const availableTopics = topicStates
          .filter((topic) => (
            topic.sessionsScheduled < topic.sessionsRequired
            && (!topic.nextAvailableDate || slot.startDate >= topic.nextAvailableDate)
            && !topicsScheduledToday.has(topic.id)
          ));

        const remainingTopics = topicStates
          .filter((topic) => topic.sessionsScheduled < topic.sessionsRequired);

        if (availableTopics.length === 0 && remainingTopics.length === 0) {
          if (process.env.NODE_ENV === 'development' && i === searchStartIndex) {
            console.log(`⚠️ ${dayKey}: No available topics for final safety check`);
          }
          continue;
        }

        const candidates = (availableTopics.length > 0 ? availableTopics : remainingTopics)
          .sort((a, b) => {
            if (a.priorityIndex === -1 && b.priorityIndex !== -1) return -1;
            if (a.priorityIndex !== -1 && b.priorityIndex === -1) return 1;
            if (a.priorityIndex !== b.priorityIndex) {
              return a.priorityIndex - b.priorityIndex;
            }
            if (a.sessionsScheduled !== b.sessionsScheduled) {
              return a.sessionsScheduled - b.sessionsScheduled;
            }
            return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
          });

        const topic = candidates[0];
        const sessionNumber = topic.sessionsScheduled + 1;
        const sessionTotal = topic.sessionsRequired;
        const metadata = buildMetadata({
          topic,
          sessionNumber,
          sessionTotal,
          sessionType: topic.sessionType
        });

        const block = {
          day: slot.day,
          start_time: slot.start_time,
          duration_minutes: slot.duration_minutes,
          subject: topic.subject,
          topic_id: topic.id,
          topic_name: topic.title,
          exam_board: topic.examBoard,
          rating: topic.rating,
          scheduled_at: slot.startDate.toISOString(),
          end_at: slot.endDate.toISOString(),
          slotIndex: slot.slotIndex,
          session_number: sessionNumber,
          session_total: sessionTotal,
          session_type: topic.sessionType,
          session_label: metadata.label,
          ai_rationale: JSON.stringify(metadata)
        };
        
        weeklyPlan.push(block);
        topicsScheduledToday.add(topic.id);
        usedSlotIndices.add(i);
        topic.sessionsScheduled += 1;
        dayData.scheduledBlocks += 1;
        consecutiveBlocksPlaced += 1; // Track consecutive blocks
        lastPlacedIndex = i; // Track last placed index

        if (topic.sessionsScheduled >= topic.sessionsRequired) {
          topic.nextAvailableDate = null;
        } else {
          const gapIndex = topic.sessionsScheduled - 1;
          const nextGap = (gapIndex >= 0 && gapIndex < topic.gapDays.length) 
            ? topic.gapDays[gapIndex] 
            : 1;
          topic.nextAvailableDate = addDays(slot.startDate, Math.max(1, nextGap));
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ ${dayKey}: Final safety check complete. Scheduled ${dayData.scheduledBlocks}/${targetBlocks} blocks.`);
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ ${dayKey}: All ${targetBlocks} blocks scheduled successfully.`);
      }
    }
  }

  // Sort final plan by scheduled_at to maintain chronological order
  const sortedPlan = weeklyPlan.sort((a, b) => 
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );
  
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ assignTopicsToSlots complete:', {
      totalBlocksGenerated: sortedPlan.length,
      totalBlocksNeeded,
      blocksByDay: Object.keys(slotsByDay).reduce((acc, dayKey) => {
        acc[dayKey] = sortedPlan.filter(b => b.day === dayKey).length;
        return acc;
      }, {}),
      topicsScheduled: topicStates.filter(t => t.sessionsScheduled > 0).length,
      topicsFullyScheduled: topicStates.filter(t => t.sessionsScheduled >= t.sessionsRequired).length,
      topicsPartiallyScheduled: topicStates.filter(t => t.sessionsScheduled > 0 && t.sessionsScheduled < t.sessionsRequired).length,
      topicsNotScheduled: topicStates.filter(t => t.sessionsScheduled === 0).length
    });
  }
  
  return sortedPlan;
  } catch (error) {
    console.error('❌ Error in assignTopicsToSlots:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      slotsCount: slots?.length,
      topicsCount: topics?.length,
      slotsSample: slots?.slice(0, 3),
      errorMessage: error.message,
      errorName: error.name
    });
    throw error; // Re-throw to be caught by caller
  }
}
