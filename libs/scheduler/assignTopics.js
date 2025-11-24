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
 * @param {Array<{ day: string, start_time: string, duration_minutes: number, startDate: Date, endDate: Date }>} slots
 * @param {Array<{ id: string, title: string, subject: string, examBoard: string, orderIndex: number, rating: number }>} topics
 * @returns {Array}
 */
export function assignTopicsToSlots(slots = [], topics = []) {
      if (!Array.isArray(slots) || slots.length === 0 || !Array.isArray(topics) || topics.length === 0) {
        return [];
      }

  const sortedSlots = [...slots].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const topicStates = topics.map((topic, index) => {
    const config = getSessionConfig(topic.rating);

    return {
      ...topic,
      orderIndex: topic.orderIndex ?? index,
      priorityIndex: topic.priorityIndex ?? index,
      sessionsRequired: config.sessions,
      gapDays: config.gapDays,
      sessionType: config.type,
      sessionsScheduled: 0,
      nextAvailableDate: new Date(0) // epoch – available immediately
    };
  });

  // Group slots by day for clustering
  const slotsByDay = {};
  sortedSlots.forEach(slot => {
    const dayKey = slot.startDate.toISOString().split('T')[0];
    if (!slotsByDay[dayKey]) {
      slotsByDay[dayKey] = [];
    }
    slotsByDay[dayKey].push(slot);
  });

  // Calculate total blocks needed and available slots for proportional distribution
  const totalBlocksNeeded = topicStates.reduce((sum, topic) => sum + topic.sessionsRequired, 0);
  let totalAvailableSlots = 0;
  Object.values(slotsByDay).forEach(daySlots => {
    totalAvailableSlots += daySlots.length;
  });

  // Calculate proportional distribution per day
  const dayStats = {};
  Object.keys(slotsByDay).forEach(dayKey => {
    const daySlotCount = slotsByDay[dayKey].length;
    const proportion = totalAvailableSlots > 0 ? daySlotCount / totalAvailableSlots : 0;
    let targetBlocks = Math.round(totalBlocksNeeded * proportion);
    
    // Ensure minimum of 3 blocks if day has enough slots (for clustering)
    // But don't force it if day has very few slots
    if (targetBlocks > 0 && targetBlocks < 3 && daySlotCount >= 3) {
      // Day has slots but got less than 3 blocks - round up to 3 to ensure it gets used
      targetBlocks = 3;
    }
    
    // Only assign if we can maintain minimum 3-block clustering AND have enough slots
    dayStats[dayKey] = {
      slots: slotsByDay[dayKey],
      targetBlocks: (targetBlocks >= 3 && daySlotCount >= 3) ? targetBlocks : 0, // Skip if can't cluster
      scheduledBlocks: 0
    };
  });

  // Redistribute any blocks from skipped days
  const totalAssigned = Object.values(dayStats).reduce((sum, day) => sum + day.targetBlocks, 0);
  const remainingBlocks = totalBlocksNeeded - totalAssigned;
  
  if (remainingBlocks > 0 && totalAssigned > 0) {
    // Redistribute proportionally to days that can take more (need at least 3 for a cluster)
    const eligibleDays = Object.keys(dayStats).filter(dayKey => {
      const dayData = dayStats[dayKey];
      return dayData.targetBlocks >= 3 || (dayData.slots.length >= 3 && dayData.targetBlocks === 0);
    });
    
    if (eligibleDays.length > 0) {
      const redistributionPerDay = Math.floor(remainingBlocks / eligibleDays.length);
      eligibleDays.forEach(dayKey => {
        const dayData = dayStats[dayKey];
        // Can add more blocks if slots available
        const currentTarget = dayData.targetBlocks || 0;
        const maxPossible = Math.min(dayData.slots.length, currentTarget + redistributionPerDay);
        // Ensure at least 3 if we're assigning blocks
        dayData.targetBlocks = maxPossible >= 3 ? maxPossible : (maxPossible > 0 ? 3 : 0);
      });
    }
  }

  const weeklyPlan = [];
  // Process each day separately to create clusters
  const sortedDays = Object.keys(slotsByDay).sort();
  
  for (const dayKey of sortedDays) {
    const dayData = dayStats[dayKey];
    const daySlots = dayData.slots;
    const targetBlocks = dayData.targetBlocks;
    
    // Skip days with insufficient slots for clustering (need at least 3 for a cluster)
    if (targetBlocks < 3 || daySlots.length < 3) {
      continue;
    }
    
    let lastScheduledSlotIndex = -1; // Track the last scheduled block's slot index to verify consecutive slots
    
    // Track which topics have been scheduled on this day to prevent duplicates
    const topicsScheduledToday = new Set();
    
        // Determine cluster size for this day (always 3 blocks)
    const clusterSize = 3;
    let blocksInCurrentCluster = 0;
    let slotIndex = 0;
    let currentClusterBlocks = []; // Track blocks in the current cluster for this day
    
    while (slotIndex < daySlots.length && dayData.scheduledBlocks < targetBlocks) {
      const slot = daySlots[slotIndex];
      
      const availableTopics = topicStates
        .filter((topic) => (
          topic.sessionsScheduled < topic.sessionsRequired
          && (!topic.nextAvailableDate || slot.startDate >= topic.nextAvailableDate)
          && !topicsScheduledToday.has(topic.id) // Prevent scheduling same topic twice in one day
        ));

      const remainingTopics = topicStates
        .filter((topic) => topic.sessionsScheduled < topic.sessionsRequired);

      // If no topics available, skip this slot (leave blank for buffer) - don't insert break
      if (remainingTopics.length === 0) {
        // Skip this slot - it will remain blank and can be used as buffer later
        slotIndex += 1;
        continue;
      }

      // Check if we should start a new cluster (skip some slots)
      if (blocksInCurrentCluster >= clusterSize) {
        blocksInCurrentCluster = 0; // Reset for new cluster
        lastScheduledSlotIndex = -1; // Reset slot tracking
        currentClusterBlocks = []; // Reset cluster blocks
        // Skip 1-2 slots before next cluster (randomly)
        const skipCount = Math.random() < 0.5 ? 1 : 2;
        slotIndex += skipCount;
        continue;
      }

      // ENFORCE MINIMUM 3-BLOCK CLUSTERS
      // If we're starting a new cluster (blocksInCurrentCluster === 0), ensure we have at least 3 slots available
      if (blocksInCurrentCluster === 0) {
        // Check if we have at least 3 consecutive slots available (including current slot)
        const slotsRemaining = daySlots.length - slotIndex;
        if (slotsRemaining < 3) {
          // Not enough slots to create a minimum 3-block cluster, skip remaining slots
          break;
        }
        // Start tracking a new cluster
        currentClusterBlocks = [];
      }

      const candidates = (availableTopics.length > 0 ? availableTopics : remainingTopics)
        .sort((a, b) => {
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
      currentClusterBlocks.push({ block, topic }); // Track for potential removal if cluster incomplete

      // Mark this topic as scheduled today
      topicsScheduledToday.add(topic.id);
      
      topic.sessionsScheduled += 1;
      blocksInCurrentCluster += 1;
      lastScheduledSlotIndex = slotIndex; // Update last scheduled slot index
      dayData.scheduledBlocks += 1; // Track blocks scheduled for this day
      slotIndex += 1;

      if (topic.sessionsScheduled >= topic.sessionsRequired) {
        topic.nextAvailableDate = null;
      } else {
        // gapDays array: [gap_after_session_1, gap_after_session_2, ...]
        // After scheduling session N, sessionsScheduled = N, so use gapDays[N-1]
        const gapIndex = topic.sessionsScheduled - 1;
        const nextGap = (gapIndex >= 0 && gapIndex < topic.gapDays.length) 
          ? topic.gapDays[gapIndex] 
          : 1;
        topic.nextAvailableDate = addDays(slot.startDate, Math.max(1, nextGap));
      }
    }
    
    // At the end of the day, check if we have an incomplete cluster (only 1 block)
    // If so, remove it to avoid isolated single blocks
    if (blocksInCurrentCluster === 1 && currentClusterBlocks.length === 1) {
      const { block: incompleteBlock, topic } = currentClusterBlocks[0];
      
      // Revert the topic's session count
      if (topic) {
        topic.sessionsScheduled -= 1;
        // Remove from today's scheduled topics so it can be rescheduled later
        topicsScheduledToday.delete(topic.id);
        // Reset nextAvailableDate - will be rescheduled in a future day when we can create a proper cluster
        if (topic.sessionsScheduled < topic.sessionsRequired) {
          topic.nextAvailableDate = new Date(0); // Make available immediately for next day
        }
      }
      
      // Remove the incomplete block from the plan
      const blockIndex = weeklyPlan.findIndex(b => 
        b.topic_id === incompleteBlock.topic_id && 
        b.scheduled_at === incompleteBlock.scheduled_at
      );
      if (blockIndex >= 0) {
        weeklyPlan.splice(blockIndex, 1);
        dayData.scheduledBlocks -= 1; // Update count
      }
    }
  }

  // Sort final plan by scheduled_at to maintain chronological order
  return weeklyPlan.sort((a, b) => 
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );
}
