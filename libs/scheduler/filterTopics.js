/**
 * Filters the topics based on ratings and optional status map.
 * Removes any topic with rating <= 0 (uncovered/unrated) or status === 'skip'.
 * When allowUnratedTopics is true (e.g. generate current week when empty), keep topics with no rating so they get default priority.
 */

/**
 * @param {Array<{id: string, title: string, subject: string, examBoard: string, orderIndex: number}>} topics
 * @param {{ [topicId: string]: number }} ratings
 * @param {{ [topicId: string]: string }} [topicStatus]
 * @param {{ allowUnratedTopics?: boolean }} [options]
 * @returns {Array<{id: string, title: string, subject: string, examBoard: string, orderIndex: number}>}
 */
export function filterTopics(topics = [], ratings = {}, topicStatus = {}, options = {}) {
  if (!Array.isArray(topics) || topics.length === 0) {
    return [];
  }

  const allowUnrated = options.allowUnratedTopics === true;

  return topics.filter((topic) => {
    const rating = ratings[topic.id] ?? 0;
    if (!allowUnrated && rating <= 0) {
      return false;
    }
    if (topicStatus && topicStatus[topic.id] === 'skip') {
      return false;
    }
    return true;
  });
}

