import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/libs/supabase";

export async function POST(req) {
  try {
    const { subjects, boards } = await req.json();
    
    if (!subjects || !Array.isArray(subjects)) {
      return NextResponse.json(
        { error: "Subjects array is required" },
        { status: 400 }
      );
    }

    // Query all topics (we'll build parent relationships in code)
    let query = supabaseAdmin
      .from('topics')
      .select(`
        *,
        specs!inner(subject, exam_board)
      `);
    
    // Filter by subject through specs join
    if (subjects && subjects.length > 0) {
      query = query.in('specs.subject', subjects);
    }
    
    // Filter by exam board through specs join
    if (boards && boards.length > 0) {
      // Convert boards to lowercase to match database format (aqa, edexcel, ocr)
      const lowerBoards = boards.map(b => b.toLowerCase());
      query = query.in('specs.exam_board', lowerBoards);
    }
    
    const { data: allTopics, error } = await query
      .order('specs(subject)', { ascending: true })
      .order('level', { ascending: true })
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: "Failed to fetch topics" },
        { status: 500 }
      );
    }

    // Build topic map for quick lookups
    const topicMap = new Map();
    (allTopics || []).forEach(topic => {
      topicMap.set(topic.id, topic);
    });
    
    // Recursive helper to find level-1 parent using parent_id
    const findLevel1Parent = (topic) => {
      if (topic.level === 1) {
        return topic.title;
      }
      
      // Use parent_id if available (preferred method)
      if (topic.parent_id) {
        const parentTopic = topicMap.get(topic.parent_id);
        if (parentTopic) {
          return findLevel1Parent(parentTopic);
        }
      }
      
      // Fallback to parent_title for backward compatibility
      if (topic.parent_title) {
        // Try to find parent by title lookup
        const parentTopic = Array.from(topicMap.values()).find(t => 
          t.spec_id === topic.spec_id && 
          t.title === topic.parent_title &&
          t.level === topic.level - 1
        );
        if (parentTopic) {
          return findLevel1Parent(parentTopic);
        }
        // If level 2, parent_title should be level 1
        if (topic.level === 2) {
          return topic.parent_title;
      }
      }
      
      return 'Other';
    };
    
    // Helper to find level-2 parent
    const findLevel2Parent = (topic) => {
      if (topic.level === 3) {
        // Use parent_id if available (preferred method)
        if (topic.parent_id) {
          const parentTopic = topicMap.get(topic.parent_id);
          if (parentTopic && parentTopic.level === 2) {
            return parentTopic.title;
          }
        }
        
        // Fallback to parent_title
        if (topic.parent_title) {
          const parentTopic = Array.from(topicMap.values()).find(t => 
            t.spec_id === topic.spec_id && 
            t.title === topic.parent_title &&
            t.level === 2
          );
          if (parentTopic) {
            return parentTopic.title;
          }
          return topic.parent_title;
        }
      }
      return null;
    };

    // Build maps to store level 1 and level 2 topics with their order_index
    const level1Map = new Map(); // level1 name -> { title, order_index }
    const level2Map = new Map(); // level2 name -> { title, order_index, level1_parent }
    
    // First pass: collect level 1 and level 2 topics
    (allTopics || []).forEach(topic => {
      if (topic.level === 1) {
        level1Map.set(topic.title, {
          title: topic.title,
          order_index: topic.order_index || 999
        });
      } else if (topic.level === 2) {
        const level1Parent = findLevel1Parent(topic);
        level2Map.set(topic.title, {
          title: topic.title,
          order_index: topic.order_index || 999,
          level_1_parent: level1Parent
        });
      }
    });

    // Flatten the response and add level_1_parent and level_2_parent fields
    const flattenedTopics = (allTopics || []).map(topic => {
      const level1Parent = findLevel1Parent(topic);
      const level2Parent = findLevel2Parent(topic);
      return {
        ...topic,
        subject: topic.specs.subject,
        exam_board: topic.specs.exam_board,
        level_1_parent: level1Parent,
        level_2_parent: level2Parent,
        specs: undefined // Remove nested specs to avoid duplication
      };
    });

    // Filter to only return level-3 topics (what students rate)
    const level3Topics = flattenedTopics.filter(topic => topic.level === 3);

    // Convert maps to arrays for the response
    const level1Topics = Array.from(level1Map.values());
    const level2Topics = Array.from(level2Map.values());

    return NextResponse.json({ 
      topics: level3Topics,
      level1Topics: level1Topics,
      level2Topics: level2Topics
    }, {
      headers: {
        // Cache for 1 hour (3600s) on CDN/edge, revalidate in background for 24 hours
        // This significantly improves performance for frequently requested topic combinations
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
      }
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
