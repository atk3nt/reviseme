/**
 * Prioritise topics. Lower confidence rating first, then curriculum order.
 */

/**
 * @param {Array<{id: string, title: string, subject: string, examBoard: string, orderIndex: number}>} topics
 * @param {{ [topicId: string]: number }} ratings
 * @param {Array<string>} missedTopicIds - Topic IDs that were missed/incomplete from previous weeks (same-week catch-up)
 * @param {Array<string>} reratedTopicIds - Topic IDs that were rerated (prioritized within rating buckets)
 * @returns {Array<{id: string, title: string, subject: string, examBoard: string, orderIndex: number, rating: number, priorityIndex: number, isMissed: boolean, isRerated: boolean}>}
 */
export function prioritizeTopics(topics = [], ratings = {}, missedTopicIds = [], reratedTopicIds = []) {
  if (!Array.isArray(topics) || topics.length === 0) {
    return [];
  }

  const missedSet = new Set(missedTopicIds || []);
  const reratedSet = new Set(reratedTopicIds || []);

  const withRatings = topics.map((topic, idx) => {
    const rating = ratings[topic.id] ?? 3;
    const orderIndex = topic.orderIndex ?? idx;
    const isMissed = missedSet.has(topic.id);
    const isRerated = reratedSet.has(topic.id);
    const bucket =
      isMissed ? 'missed' // Missed topics (highest priority - same-week catch-up)
        : rating <= 1 ? 'r1'
          : rating === 2 ? 'r2'
            : rating === 3 ? 'r3'
              : 'exam';

    return {
      ...topic,
      rating,
      orderIndex,
      bucket,
      isMissed,
      isRerated
    };
  });

  const buckets = {
    missed: [], // Missed topics (highest priority - same-week catch-up)
    r1: [],
    r2: [],
    r3: [],
    exam: []
  };

  withRatings.forEach((topic) => {
    buckets[topic.bucket].push(topic);
  });

  // Sort each bucket: rerated topics first, then by orderIndex
  Object.values(buckets).forEach((list) => {
    list.sort((a, b) => {
      // Rerated topics come first within their bucket
      if (a.isRerated && !b.isRerated) return -1;
      if (!a.isRerated && b.isRerated) return 1;
      // Then sort by curriculum order
      return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
    });
  });

  const totalTopics = withRatings.length;

  // Ratios are for TOPICS, but we think in terms of BLOCKS (study time)
  // Rating 1 = 3 sessions, Rating 2 = 2 sessions, Rating 3-5 = 1 session
  // Optimized to prioritize Rating 2-3 (closer to mastery) for faster path to exam practice
  // So 25% r1 topics × 3 sessions ≈ 40% of blocks
  //    35% r2 topics × 2 sessions ≈ 38% of blocks
  //    30% r3 topics × 1 session  ≈ 16% of blocks
  //    10% exam topics × 1 session ≈ 6% of blocks
  // Result: ~78% of study time on weak topics (Rating 1-2), with more focus on Rating 2-3
  const ratioDefs = [
    { key: 'missed', percent: 1.0 }, // Missed topics get 100% priority (all of them first)
    { key: 'r1', percent: 0.25 },    // 25% of topics → ~40% of blocks
    { key: 'r2', percent: 0.35 },    // 35% of topics → ~38% of blocks
    { key: 'r3', percent: 0.30 },    // 30% of topics → ~16% of blocks
    { key: 'exam', percent: 0.10 }   // 10% of topics → ~6% of blocks
  ];

  const targets = {};
  const remainders = [];
  let baseTotal = 0;

  ratioDefs.forEach((def) => {
    const raw = def.percent * totalTopics;
    const base = Math.floor(raw);
    const remainder = raw - base;
    targets[def.key] = base;
    remainders.push({ key: def.key, remainder });
    baseTotal += base;
  });

  let remaining = totalTopics - baseTotal;
  remainders
    .sort((a, b) => b.remainder - a.remainder)
    .forEach(({ key }) => {
      if (remaining > 0) {
        targets[key] += 1;
        remaining -= 1;
      }
    });

  const capacity = {};
  let deficits = 0;
  ratioDefs.forEach((def) => {
    const bucketSize = buckets[def.key].length;
    capacity[def.key] = bucketSize;
    if (targets[def.key] > bucketSize) {
      deficits += targets[def.key] - bucketSize;
      targets[def.key] = bucketSize;
    }
  });

  if (deficits > 0) {
    ratioDefs.forEach((def) => {
      if (deficits <= 0) return;
      const availableCapacity = capacity[def.key] - targets[def.key];
      if (availableCapacity <= 0) return;

      const allocation = Math.min(availableCapacity, deficits);
      targets[def.key] += allocation;
      deficits -= allocation;
    });
  }

  let totalAllocated = 0;
  ratioDefs.forEach((def) => { totalAllocated += targets[def.key]; });
  if (totalAllocated < totalTopics) {
    ratioDefs.forEach((def) => {
      if (totalAllocated >= totalTopics) return;
      const available = capacity[def.key] - targets[def.key];
      if (available <= 0) return;
      const allocation = Math.min(available, totalTopics - totalAllocated);
      targets[def.key] += allocation;
      totalAllocated += allocation;
    });
  }

  const bucketQueues = {
    missed: [...buckets.missed],
    r1: [...buckets.r1],
    r2: [...buckets.r2],
    r3: [...buckets.r3],
    exam: [...buckets.exam]
  };

  const selectedTopics = [];
  const remainingTargets = {
    missed: targets.missed ?? 0,
    r1: targets.r1 ?? 0,
    r2: targets.r2 ?? 0,
    r3: targets.r3 ?? 0,
    exam: targets.exam ?? 0
  };
  const targetTotal = Math.min(totalTopics,
    (remainingTargets.missed + remainingTargets.r1 + remainingTargets.r2 + remainingTargets.r3 + remainingTargets.exam)
  );

  while (selectedTopics.length < targetTotal) {
    let progressed = false;
    for (const def of ratioDefs) {
      const key = def.key;
      if (remainingTargets[key] > 0 && bucketQueues[key].length > 0) {
        selectedTopics.push(bucketQueues[key].shift());
        remainingTargets[key] -= 1;
        progressed = true;
        if (selectedTopics.length >= targetTotal) {
          break;
        }
      }
    }
    if (!progressed) {
      break;
    }
  }

  Object.values(bucketQueues).forEach((queue) => {
    if (queue.length > 0) {
      selectedTopics.push(...queue);
    }
  });

  const uniqueSubjects = Array.from(new Set(selectedTopics.map((topic) => topic.subject)));
  if (uniqueSubjects.length > 0) {
    const subjectQueues = {};
    uniqueSubjects.forEach((subject) => {
      subjectQueues[subject] = selectedTopics.filter((topic) => topic.subject === subject);
    });

    const subjectTargets = {};
    const subjectRemainders = [];
    let subjectBaseTotal = 0;
    const subjectShare = 1 / uniqueSubjects.length;
    const totalSelected = selectedTopics.length;

    uniqueSubjects.forEach((subject, index) => {
      const raw = subjectShare * totalSelected;
      const base = Math.floor(raw);
      const remainder = raw - base;
      subjectTargets[subject] = base;
      subjectRemainders.push({ subject, remainder, order: index });
      subjectBaseTotal += base;
    });

    let subjectRemaining = totalSelected - subjectBaseTotal;
    subjectRemainders
      .sort((a, b) => {
        if (b.remainder === a.remainder) {
          return a.order - b.order;
        }
        return b.remainder - a.remainder;
      })
      .forEach(({ subject }) => {
        if (subjectRemaining > 0) {
          subjectTargets[subject] += 1;
          subjectRemaining -= 1;
        }
      });

    let subjectDeficits = 0;
    const subjectCapacity = {};
    uniqueSubjects.forEach((subject) => {
      const capacityCount = subjectQueues[subject].length;
      subjectCapacity[subject] = capacityCount;
      if (subjectTargets[subject] > capacityCount) {
        subjectDeficits += subjectTargets[subject] - capacityCount;
        subjectTargets[subject] = capacityCount;
      }
    });

    if (subjectDeficits > 0) {
      subjectRemainders.forEach(({ subject }) => {
        if (subjectDeficits <= 0) return;
        const availableCapacity = subjectCapacity[subject] - subjectTargets[subject];
        if (availableCapacity <= 0) return;
        const allocation = Math.min(availableCapacity, subjectDeficits);
        subjectTargets[subject] += allocation;
        subjectDeficits -= allocation;
      });
    }

    let allocatedTotal = 0;
    uniqueSubjects.forEach((subject) => { allocatedTotal += subjectTargets[subject]; });
    if (allocatedTotal < totalSelected) {
      subjectRemainders.forEach(({ subject }) => {
        if (allocatedTotal >= totalSelected) return;
        const availableCapacity = subjectCapacity[subject] - subjectTargets[subject];
        if (availableCapacity <= 0) return;
        const allocation = Math.min(availableCapacity, totalSelected - allocatedTotal);
        subjectTargets[subject] += allocation;
        allocatedTotal += allocation;
      });
    }

    const subjectOrdered = [];
    const subjectRemainingTargets = {};
    uniqueSubjects.forEach((subject) => {
      subjectRemainingTargets[subject] = subjectTargets[subject] ?? 0;
    });
    const subjectTargetSum = uniqueSubjects.reduce(
      (sum, subject) => sum + (subjectRemainingTargets[subject] ?? 0),
      0
    );

    while (subjectOrdered.length < subjectTargetSum) {
      let progressed = false;
      for (const { subject } of subjectRemainders) {
        if (subjectOrdered.length >= subjectTargetSum) break;
        if (
          subjectRemainingTargets[subject] > 0
          && subjectQueues[subject]
          && subjectQueues[subject].length > 0
        ) {
          subjectOrdered.push(subjectQueues[subject].shift());
            subjectRemainingTargets[subject] -= 1;
            progressed = true;
        }
      }
      if (!progressed) {
        break;
      }
    }

    uniqueSubjects.forEach((subject) => {
      if (subjectQueues[subject] && subjectQueues[subject].length > 0) {
        subjectOrdered.push(...subjectQueues[subject]);
      }
    });

    selectedTopics.splice(0, selectedTopics.length, ...subjectOrdered);
  }

  // Assign priorityIndex: missed topics get -1 (highest priority), others get their index
  return selectedTopics.map((topic, index) => ({
    ...topic,
    priorityIndex: topic.isMissed ? -1 : index
  }));
}
