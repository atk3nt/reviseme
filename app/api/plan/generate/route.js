import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";
import { generateStudyPlan } from "@/libs/scheduler";

const DEV_USER_EMAIL = 'dev-test@markr.local';

async function ensureDevUser() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', DEV_USER_EMAIL)
    .maybeSingle();

  if (!data && (!error || error.code === 'PGRST116')) {
    const { data: created, error: createError } = await supabaseAdmin
      .from('users')
      .insert({
        email: DEV_USER_EMAIL,
        name: 'Dev Tester',
        has_completed_onboarding: false
      })
      .select('id')
      .single();

    if (createError) {
      console.error('Failed to auto-create dev user:', createError);
      return null;
    }
    return created?.id ?? null;
  }

  if (error) {
    console.error('Failed to find dev user:', error);
    return null;
  }

  return data?.id ?? null;
}

async function resolveUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId || process.env.NODE_ENV !== 'development') {
    return userId;
  }

  return await ensureDevUser();
}

function getMonday(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function resolveTargetWeek({ targetWeek, signupDate }) {
  if (targetWeek) {
    return targetWeek;
  }
  const base = signupDate ? new Date(signupDate) : new Date();
  base.setDate(base.getDate() + 1); // day after signup/current day
  base.setHours(0, 0, 0, 0);
  return getMonday(base).toISOString().split('T')[0];
}

function sanitizeBlockedTimes(blockedTimes = []) {
  return blockedTimes.map((range) => ({
    start: range.start,
    end: range.end,
    label: range.label || null,
    source: range.source || null,
    metadata: range.metadata || null,
    event_id: range.event_id || null
  }));
}

function dedupeBlockedTimes(blockedTimes = []) {
  const seen = new Set();
  return blockedTimes.filter((range) => {
    const key = `${range.start}|${range.end}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function toDatabaseRows(blocks, userId) {
  return blocks
    .filter((block) => block.topic_id !== null) // Skip break blocks (they don't have topic_id)
    .map((block) => ({
      user_id: userId,
      topic_id: block.topic_id,
      scheduled_at: block.scheduled_at,
      duration_minutes: block.duration_minutes,
      status: 'scheduled',
      ai_rationale: block.ai_rationale ?? null
    }));
}

async function loadBlockedTimes(userId, startDate, endDate) {
  try {
    const { data, error } = await supabaseAdmin
      .from('unavailable_times')
      .select('start_datetime, end_datetime')
      .eq('user_id', userId)
      .lt('start_datetime', endDate.toISOString())
      .gt('end_datetime', startDate.toISOString());

    if (error) {
      console.error('Failed to load unavailable times:', error);
      return [];
    }

    return (data || []).map((row) => ({
      start: row.start_datetime,
      end: row.end_datetime
    }));
  } catch (error) {
    console.error('Unavailable times fetch exception:', error);
    return [];
  }
}

function combineDateAndTime(baseDate, timeString) {
  const [hourStr = '0', minuteStr = '0', secondStr = '0'] = timeString.split(':');
  const hours = Number(hourStr) || 0;
  const minutes = Number(minuteStr) || 0;
  const seconds = Number(secondStr) || 0;
  const combined = new Date(baseDate);
  combined.setUTCHours(hours, minutes, seconds, 0);
  return combined;
}

async function loadRepeatableEvents(userId, weekStartDate, weekEndDate) {
  try {
    const { data, error } = await supabaseAdmin
      .from('repeatable_events')
      .select('id, label, start_time, end_time, days_of_week, start_date, end_date, metadata')
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to load repeatable events:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const events = [];
    const weekStart = new Date(weekStartDate);
    weekStart.setUTCHours(0, 0, 0, 0);

    for (let offset = 0; offset < 7; offset += 1) {
      const dayDate = new Date(weekStart);
      dayDate.setUTCDate(weekStart.getUTCDate() + offset);
      const utcDay = dayDate.getUTCDay();

      data.forEach((event) => {
        if (!Array.isArray(event.days_of_week) || !event.days_of_week.includes(utcDay)) {
          return;
        }

        if (event.start_date) {
          const eventStart = new Date(event.start_date);
          eventStart.setUTCHours(0, 0, 0, 0);
          if (dayDate < eventStart) {
            return;
          }
        }

        if (event.end_date) {
          const eventEnd = new Date(event.end_date);
          eventEnd.setUTCHours(23, 59, 59, 999);
          if (dayDate > eventEnd) {
            return;
          }
        }

        const startDateTime = combineDateAndTime(dayDate, event.start_time);
        const endDateTime = combineDateAndTime(dayDate, event.end_time);

        if (endDateTime <= startDateTime) {
          return;
        }

        if (endDateTime <= weekStartDate || startDateTime >= weekEndDate) {
          return;
        }

        events.push({
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          label: event.label,
          source: 'repeatable_event',
          metadata: event.metadata || null,
          event_id: event.id
        });
      });
    }

    return events;
  } catch (error) {
    console.error('Repeatable events processing error:', error);
    return [];
  }
}

export async function POST(req) {
  try {
    const userId = await resolveUserId();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      subjects = [],
      ratings = {},
      topicStatus = {},
      availability = {},
      timePreferences = {},
      blockedTimes: rawBlockedTimes = [],
      unavailableTimes = [],
      studyBlockDuration = 0.5,
      targetWeek,
      signupDate = null
    } = body || {};

    const incomingBlockedTimes = Array.isArray(rawBlockedTimes) && rawBlockedTimes.length > 0
      ? rawBlockedTimes
      : Array.isArray(unavailableTimes)
        ? unavailableTimes
        : [];

    if (!Array.isArray(subjects) || subjects.length === 0) {
      return NextResponse.json({ error: 'At least one subject is required' }, { status: 400 });
    }

    const targetWeekStart = resolveTargetWeek({ targetWeek, signupDate });
    const weekStartDate = getMonday(new Date(`${targetWeekStart}T00:00:00Z`));
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 7);

    // Load time preferences from database if not provided
    let effectiveTimePreferences = timePreferences;
    if (!timePreferences.weekdayEarliest || !timePreferences.weekdayLatest) {
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('weekday_earliest_time, weekday_latest_time, weekend_earliest_time, weekend_latest_time, use_same_weekend_times')
        .eq('id', userId)
        .single();
      
      if (userData) {
        // Format time from database (HH:MM:SS) to HH:MM for frontend
        const formatTime = (timeStr) => {
          if (!timeStr) return null;
          return timeStr.substring(0, 5); // Extract HH:MM from HH:MM:SS
        };
        
        effectiveTimePreferences = {
          weekdayEarliest: timePreferences.weekdayEarliest || formatTime(userData.weekday_earliest_time) || '09:00',
          weekdayLatest: timePreferences.weekdayLatest || formatTime(userData.weekday_latest_time) || '20:00',
          weekendEarliest: timePreferences.weekendEarliest || formatTime(userData.weekend_earliest_time) || '09:00',
          weekendLatest: timePreferences.weekendLatest || formatTime(userData.weekend_latest_time) || '20:00',
          useSameWeekendTimes: timePreferences.useSameWeekendTimes !== undefined 
            ? timePreferences.useSameWeekendTimes 
            : (userData.use_same_weekend_times !== null ? userData.use_same_weekend_times : true)
        };
      }
    }

    console.log('API plan generate payload', {
      userId,
      subjectsCount: subjects.length,
      timePreferences: effectiveTimePreferences,
      blockedSample: incomingBlockedTimes.slice ? incomingBlockedTimes.slice(0, 5) : []
    });

    let effectiveBlockedTimes = incomingBlockedTimes;
    if (!effectiveBlockedTimes || effectiveBlockedTimes.length === 0) {
      effectiveBlockedTimes = await loadBlockedTimes(userId, weekStartDate, weekEndDate);
    }

    const repeatableEvents = await loadRepeatableEvents(userId, weekStartDate, weekEndDate);
    const combinedBlockedTimes = dedupeBlockedTimes(
      sanitizeBlockedTimes([
        ...(effectiveBlockedTimes || []),
        ...repeatableEvents
      ])
    );

    const plan = await generateStudyPlan({
      subjects,
      ratings,
      topicStatus,
      availability,
      timePreferences: effectiveTimePreferences,
      blockedTimes: combinedBlockedTimes,
      studyBlockDuration,
      targetWeekStart
    });

    console.log('Generated plan:', {
      planLength: plan.length,
      planSample: plan.slice(0, 3).map(b => ({
        topic_id: b.topic_id,
        scheduled_at: b.scheduled_at,
        isBreak: b.topic_id === null
      })),
      subjectsCount: subjects.length,
      topicsCount: Object.keys(ratings).length,
      availability
    });

    // Validate that we have blocks to insert before deleting existing ones
    const records = toDatabaseRows(plan, userId);
    
    if (records.length === 0) {
      console.error('⚠️ Generated plan is empty - NOT deleting existing blocks to prevent data loss');
      return NextResponse.json({ 
        error: 'No blocks were generated. This might be because:\n- No topics are available to schedule\n- No available time slots match your preferences\n- There was an error during generation',
        success: false
      }, { status: 400 });
    }

    // Only delete existing blocks AFTER confirming we have new ones to insert
    console.log(`🗑️ Deleting existing blocks for week ${targetWeekStart} (${records.length} new blocks ready to insert)...`);
    const deleteStart = new Date(weekStartDate);
    deleteStart.setDate(deleteStart.getDate() - 1); // Day before to catch timezone edge cases
    const deleteEnd = new Date(weekEndDate);
    deleteEnd.setDate(deleteEnd.getDate() + 1); // Day after to catch timezone edge cases
    
    const { error: deleteError } = await supabaseAdmin
      .from('blocks')
      .delete()
      .eq('user_id', userId)
      .gte('scheduled_at', deleteStart.toISOString())
      .lt('scheduled_at', deleteEnd.toISOString());
    
    if (deleteError) {
      console.error('Error deleting existing blocks:', deleteError);
      return NextResponse.json({ 
        error: 'Failed to clear existing blocks',
        success: false
      }, { status: 500 });
    }
    
    console.log('✅ Existing blocks deleted, inserting new ones...');
    let insertedBlocks = [];
    if (records.length > 0) {
      // Insert and get back the IDs
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('blocks')
        .insert(records)
        .select('id, topic_id, scheduled_at, duration_minutes, status, ai_rationale');
      
      if (insertError) {
        console.error('Failed to insert blocks:', insertError);
        throw new Error('Failed to save blocks to database');
      }
      
      insertedBlocks = inserted || [];
    }

    // Map database IDs back to plan blocks
    // Create a map of topic_id + scheduled_at to database ID
    // Use normalized ISO strings for matching
    const idMap = new Map();
    insertedBlocks.forEach(dbBlock => {
      const normalizedTime = new Date(dbBlock.scheduled_at).toISOString();
      const key = `${dbBlock.topic_id}-${normalizedTime}`;
      idMap.set(key, dbBlock.id);
    });

    // Merge plan blocks with database IDs
    const allBlocks = plan.map(block => {
      if (block.topic_id === null) {
        // Break block - no database ID, return as-is
        return block;
      }
      // Normalize the scheduled_at time for matching
      const normalizedTime = new Date(block.scheduled_at).toISOString();
      const key = `${block.topic_id}-${normalizedTime}`;
      const dbId = idMap.get(key);
      if (!dbId) {
        console.warn('No database ID found for block:', {
          key,
          topic_id: block.topic_id,
          scheduled_at: block.scheduled_at,
          normalizedTime,
          availableKeys: Array.from(idMap.keys()).slice(0, 5)
        });
      }
      return {
        ...block,
        id: dbId || null
      };
    });

    const blockedTimesResponse = combinedBlockedTimes;
    const debugInfo = process.env.NODE_ENV === 'development' ? {
      blockedSample: combinedBlockedTimes.slice ? combinedBlockedTimes.slice(0, 5) : [],
      insertedCount: insertedBlocks.length,
      planCount: plan.length
    } : undefined;

    if (allBlocks.length === 0) {
      console.warn('⚠️ Generated plan is empty:', {
        planLength: plan.length,
        insertedCount: insertedBlocks.length,
        subjectsCount: subjects.length,
        topicsCount: Object.keys(ratings).length,
        slotsCount: plan.length > 0 ? 'N/A (plan exists)' : 'Need to check scheduler',
        availability,
        timePreferences: effectiveTimePreferences
      });
    }
    
    return NextResponse.json({
      success: true,
      blocks: allBlocks,
      weekStart: targetWeekStart,
      blockedTimes: blockedTimesResponse,
      debug: debugInfo
    });
  } catch (error) {
    console.error('Plan generation error:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json({ 
      error: error.message || 'Failed to generate study plan',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const userId = await resolveUserId();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetWeek = searchParams.get('weekStart');
    const blockId = searchParams.get('blockId'); // Optional: fetch specific block
    
    // If requesting a specific block, return just that block
    if (blockId) {
      const { data: block, error: blockError } = await supabaseAdmin
        .from('blocks')
        .select(
          `id, topic_id, scheduled_at, duration_minutes, status, ai_rationale,
           topics!left(id, title, level, parent_id, spec_id, specs(subject, exam_board))`
        )
        .eq('id', blockId)
        .eq('user_id', userId)
        .single();
      
      if (blockError || !block) {
        return NextResponse.json({ error: 'Block not found' }, { status: 404 });
      }
      
      const topic = block.topics;
      
      // Build hierarchy if topic exists
      let hierarchy = [];
      if (topic && topic.spec_id) {
        // Fetch all topics in the same spec to build the map
        const { data: allTopics } = await supabaseAdmin
          .from('topics')
          .select('id, title, level, parent_id, spec_id')
          .eq('spec_id', topic.spec_id);
        
        const topicMap = new Map();
        (allTopics || []).forEach(t => topicMap.set(t.id, t));
        
        const topicWithId = topicMap.get(topic.id) || topic;
        // Helper function to build topic hierarchy (local to this block)
        const buildTopicHierarchyLocal = (topicMap, topic) => {
          if (!topic || !topic.id) return [];
          
          const hierarchy = [];
          let currentTopic = topicMap.get(topic.id) || topic;
          
          // Start with the current topic (Level 3 - subtopic)
          hierarchy.push(currentTopic.title);
          
          // Traverse up the hierarchy using parent_id
          while (currentTopic.parent_id) {
            const parent = topicMap.get(currentTopic.parent_id);
            if (!parent) break;
            
            hierarchy.unshift(parent.title); // Add parent to the beginning
            currentTopic = parent;
          }
          
          return hierarchy;
        };
        hierarchy = buildTopicHierarchyLocal(topicMap, topicWithId);
      } else if (topic) {
        // Fallback: just use the topic title
        hierarchy = [topic.title || 'Topic'];
      }
      
      const formattedBlock = {
        id: block.id,
        topic_id: block.topic_id,
        scheduled_at: block.scheduled_at,
        duration_minutes: block.duration_minutes,
        status: block.status,
        ai_rationale: block.ai_rationale,
        topic_name: topic?.title || 'Topic',
        parent_topic_name: null,
        subject: topic?.specs?.subject || 'Unknown subject',
        exam_board: topic?.specs?.exam_board || 'Unknown board',
        hierarchy: hierarchy.length > 0 ? hierarchy : [topic?.title || 'Topic']
      };
      
      return NextResponse.json({
        success: true,
        blocks: [formattedBlock]
      });
    }
    
    // Try to find blocks for the current week, but also check a much wider range
    // to catch blocks that might be slightly outside the current week
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStartDate = getMonday(today);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 7);
    
    console.log('🔍 Fetching ALL blocks for user (no date filter):', {
      userId,
      weekStart: weekStartDate.toISOString(),
      weekEnd: weekEndDate.toISOString()
    });

      // Fetch ALL blocks for the user (no date filter) to ensure we don't miss any
      // The frontend can filter by date if needed
      // First, try the simplest query that we know works (like check-blocks)
      // Simple query: just get blocks with topic info
      // Match the working check-blocks route exactly
      // First, check total count
      const { count: totalBlockCount } = await supabaseAdmin
        .from('blocks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      
      console.log('🔍 Total blocks in database for user:', totalBlockCount);
      
      // Fetch blocks with topic info including parent_id for hierarchy building
      const { data, error } = await supabaseAdmin
        .from('blocks')
        .select(
          `id, topic_id, scheduled_at, duration_minutes, status, ai_rationale,
           topics(id, title, level, parent_id, spec_id, specs(subject, exam_board))`
        )
        .eq('user_id', userId)
        .order('scheduled_at', { ascending: true });
    
    console.log('📊 Blocks query result:', {
      found: data?.length || 0,
      error: error?.message,
      errorCode: error?.code,
      blocksWithTopics: data?.filter(b => b.topics).length || 0,
      blocksWithoutTopics: data?.filter(b => !b.topics).length || 0,
      sample: data?.slice(0, 5).map(b => ({
        id: b.id,
        scheduled_at: b.scheduled_at,
        topicTitle: b.topics?.title,
        topicId: b.topic_id,
        hasTopics: !!b.topics,
        topicLevel: b.topics?.level
      }))
    });

    if (error) {
      console.error('Plan fetch error:', error);
      return NextResponse.json({ 
        error: 'Failed to load study plan',
        details: error.message 
      }, { status: 500 });
    }

    if (!data || data.length === 0) {
      console.log('⚠️ No blocks found for user:', userId);
      return NextResponse.json({
        success: true,
        blocks: [],
        weekStart: weekStartDate.toISOString().split('T')[0],
        blockedTimes: []
      });
    }

    // Helper function to build topic hierarchy
    const buildTopicHierarchy = (topicMap, topic) => {
      if (!topic || !topic.id) return [];
      
      const hierarchy = [];
      let currentTopic = topicMap.get(topic.id) || topic;
      
      // Start with the current topic (Level 3 - subtopic)
      hierarchy.push(currentTopic.title);
      
      // Traverse up the hierarchy using parent_id
      while (currentTopic.parent_id) {
        const parent = topicMap.get(currentTopic.parent_id);
        if (!parent) break;
        
        hierarchy.unshift(parent.title); // Add parent to the beginning
        currentTopic = parent;
      }
      
      return hierarchy;
    };

    // Build topic map for hierarchy traversal
    // First, collect all unique spec_ids from blocks
    const specIds = new Set();
    (data || []).forEach(row => {
      if (row.topics?.spec_id) {
        specIds.add(row.topics.spec_id);
      }
    });
    
    // Fetch all topics for these specs to build the map
    const topicMap = new Map();
    if (specIds.size > 0) {
      const { data: allTopics, error: topicsError } = await supabaseAdmin
        .from('topics')
        .select('id, title, level, parent_id, spec_id')
        .in('spec_id', Array.from(specIds));
      
      if (!topicsError && allTopics) {
        allTopics.forEach(t => topicMap.set(t.id, t));
      }
    }
    
    // Build blocks with hierarchy
    const blocks = (data || []).map((row) => {
      const topic = row.topics;
      
      // Handle null topics gracefully
      if (!topic) {
        return {
          id: row.id,
          topic_id: row.topic_id,
          scheduled_at: row.scheduled_at,
          duration_minutes: row.duration_minutes,
          status: row.status,
          ai_rationale: row.ai_rationale,
          topic_name: 'Unknown Topic',
          parent_topic_name: null,
          subject: 'Unknown subject',
          exam_board: 'Unknown board',
          hierarchy: ['Unknown Topic']
        };
      }
      
      // Build hierarchy for this topic
      const hierarchy = buildTopicHierarchy(topicMap, topic);
      
      return {
        id: row.id,
        topic_id: row.topic_id,
        scheduled_at: row.scheduled_at,
        duration_minutes: row.duration_minutes,
        status: row.status,
        ai_rationale: row.ai_rationale,
        topic_name: topic.title || 'Topic',
        parent_topic_name: null, // Deprecated - use hierarchy instead
        subject: topic.specs?.subject || 'Unknown subject',
        exam_board: topic.specs?.exam_board || 'Unknown board',
        hierarchy: hierarchy.length > 0 ? hierarchy : [topic.title || 'Topic']
      };
    });
    
    console.log('✅ Returning blocks:', {
      totalBlocks: blocks.length,
      blocksWithTopics: blocks.filter(b => b.topic_name !== 'Unknown Topic').length,
      blocksWithoutTopics: blocks.filter(b => b.topic_name === 'Unknown Topic').length
    });

    // Determine the actual week start from the blocks (use the earliest block's week)
    let actualWeekStart = weekStartDate.toISOString().split('T')[0];
    if (blocks.length > 0) {
      const earliestBlock = new Date(blocks[0].scheduled_at);
      const earliestWeekStart = getMonday(earliestBlock);
      actualWeekStart = earliestWeekStart.toISOString().split('T')[0];
    }

    const unavailableTimes = await loadBlockedTimes(userId, weekStartDate, weekEndDate);
    const repeatableEvents = await loadRepeatableEvents(userId, weekStartDate, weekEndDate);
    const blockedTimes = dedupeBlockedTimes(
      sanitizeBlockedTimes([
        ...unavailableTimes,
        ...repeatableEvents
      ])
    );

    console.log('✅ Final response:', {
      blocksCount: blocks.length,
      weekStart: actualWeekStart,
      blockedTimesCount: blockedTimes.length
    });

    return NextResponse.json({
      success: true,
      blocks,
      weekStart: actualWeekStart,
      blockedTimes
    });
  } catch (error) {
    console.error('Plan fetch exception:', error);
    return NextResponse.json({ error: 'Failed to load study plan' }, { status: 500 });
  }
}