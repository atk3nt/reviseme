/**
 * Filters the topics based on ratings and optional status map.
 * Removes any topic with rating <= 0 (uncovered/unrated) or status === 'skip'.
 */

/**
 * @param {Array<{id: string, title: string, subject: string, examBoard: string, orderIndex: number}>} topics
 * @param {{ [topicId: string]: number }} ratings
 * @param {{ [topicId: string]: string }} [topicStatus]
 * @returns {Array<{id: string, title: string, subject: string, examBoard: string, orderIndex: number}>}
 */
export function filterTopics(topics = [], ratings = {}, topicStatus = {}) {
  if (!Array.isArray(topics) || topics.length === 0) {
    return [];
  }

  return topics.filter((topic) => {
    const rating = ratings[topic.id] ?? 0;
    if (rating <= 0) {
      return false;
    }
    if (topicStatus && topicStatus[topic.id] === 'skip') {
      return false;
    }
    return true;
  });
}

