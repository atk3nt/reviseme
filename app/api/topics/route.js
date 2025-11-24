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

    // Query all topics (levels 1, 2, 3) via specs join to build hierarchy
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

    // Build a map of topic titles to find level-1 parents for level-3 topics
    const topicMap = new Map();
    (allTopics || []).forEach(topic => {
      topicMap.set(topic.title, topic);
    });
    
    // Helper function to find level-1 parent for any topic
    const findLevel1Parent = (topic) => {
      if (topic.level === 1) {
        return topic.title; // It's a level-1 topic itself
      }
      if (topic.level === 2 && topic.parent_title) {
        // Level-2 topic, parent_title should be level-1
        return topic.parent_title;
      }
      if (topic.level === 3 && topic.parent_title) {
        // Level-3 topic, need to find its level-2 parent, then level-1
        const level2Topic = topicMap.get(topic.parent_title);
        if (level2Topic && level2Topic.parent_title) {
          return level2Topic.parent_title; // This should be the level-1 topic
        }
        // Fallback: if parent_title is empty or not found, return as-is
        return topic.parent_title || 'Other';
      }
      return 'Other';
    };

    // Flatten the response and add level_1_parent field
    const flattenedTopics = (allTopics || []).map(topic => {
      const level1Parent = findLevel1Parent(topic);
      return {
        ...topic,
        subject: topic.specs.subject,
        exam_board: topic.specs.exam_board,
        level_1_parent: level1Parent, // Add level-1 parent for grouping
        specs: undefined // Remove nested specs to avoid duplication
      };
    });

    // Filter to only return level-3 topics (what students rate)
    // But keep level-1 info for grouping
    const level3Topics = flattenedTopics.filter(topic => topic.level === 3);

    return NextResponse.json({ topics: level3Topics });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
