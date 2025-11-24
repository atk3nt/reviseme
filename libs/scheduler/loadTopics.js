/**
 * Load level-3 topics for the given subject slugs.
 * Returns a simplified array ready for the scheduler pipeline.
 */

import { supabaseAdmin } from '../supabase';

const SUBJECT_LABELS = {
  maths: 'Mathematics',
  psychology: 'Psychology',
  biology: 'Biology',
  chemistry: 'Chemistry',
  business: 'Business',
  sociology: 'Sociology',
  physics: 'Physics',
  economics: 'Economics',
  history: 'History',
  geography: 'Geography',
  computerscience: 'Computer Science'
};

/**
 * Fetches level-3 topics for the selected subjects.
 * @param {string[]} subjectSlugs
 * @returns {Promise<Array<{id: string, title: string, subject: string, examBoard: string, orderIndex: number}>>}
 */
export async function loadTopicsForSubjects(subjectSlugs = []) {
  if (!Array.isArray(subjectSlugs) || subjectSlugs.length === 0) {
    return [];
  }

  const dbSubjects = subjectSlugs.map((slug) => SUBJECT_LABELS[slug] || slug);

  const { data, error } = await supabaseAdmin
    .from('topics')
    .select(`
      id,
      title,
      order_index,
      specs!inner(subject, exam_board)
    `)
    .in('specs.subject', dbSubjects)
    .eq('level', 3)
    .order('subject', { referencedTable: 'specs', ascending: true })
    .order('order_index', { ascending: true });

  if (error) {
    console.error('loadTopicsForSubjects error:', error);
    throw new Error('Failed to load topics for selected subjects');
  }

  return (data || []).map((topic) => ({
    id: topic.id,
    title: topic.title,
    subject: topic.specs?.subject ?? 'Unknown',
    examBoard: topic.specs?.exam_board ?? 'unknown',
    orderIndex: topic.order_index ?? 0
  }));
}
